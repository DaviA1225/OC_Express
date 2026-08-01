// Edge Function — excluir-parceiro-usuario
//
// Por que existe: a operação "Desativar" só seta `parceiro_usuarios.ativo=false`,
// mas o e-mail continua preso em `auth.users` — então não dá pra reaproveitar
// o mesmo e-mail se o usuário sai de um parceiro e vai pra outro.
//
// Abordagem (decisão): NÃO deletar a linha em `auth.users`. Esse caminho
// falharia por FK porque várias tabelas tem colunas `created_by` (e similares)
// que apontam pra `auth.users.id` SEM `ON DELETE`. Em vez disso:
//   1. Deletar a linha de `parceiro_usuarios` (o vínculo com o parceiro).
//      A migration 0031 trocou `solicitacoes.parceiro_usuario_id` pra
//      ON DELETE SET NULL — solicitações antigas ficam no histórico.
//      `eventos_portal.parceiro_usuario_id` já era ON DELETE SET NULL (0021).
//   2. Renomear `auth.users.email` para um placeholder único
//      (`deleted-<uuid>@deleted.invalid`). Isso libera o e-mail ORIGINAL para
//      ser reutilizado num próximo convite. A conta em `auth.users` continua
//      existindo (sem nenhuma FK quebrada) mas com um e-mail "morto".
//   3. Sem `parceiro_usuarios`, o gate de login do portal não acha vínculo
//      e nega acesso mesmo que alguém saiba a senha — efetivamente "morta".
//
// A ORDEM importa: os dois passos batem em APIs diferentes, então não existe
// transação cobrindo os dois. A primeira versão renomeava e depois deletava,
// com rollback best-effort do rename se o delete falhasse — e o delete falhava
// de verdade (o CHECK `solicitacoes_origem_integridade` proibia o SET NULL que
// a própria 0031 dispara; corrigido na 0054). Deletar primeiro elimina o
// rollback: se o passo 1 falha, nada foi tocado. Se o passo 2 falha, o vínculo
// já caiu — o acesso, que é a parte de segurança, está revogado; sobra o e-mail
// ocupado, que é inconveniência e vem descrito na resposta.
//
// Quem pode chamar:
//   - interno (perfis_usuarios.ativo=true) — pode apagar de qualquer parceiro
//   - admin_parceiro do MESMO parceiro_id do alvo
//
// Bloqueios:
//   - não pode apagar a si mesmo
//   - alvo precisa existir
//   - admin_parceiro de outro parceiro tenta apagar → 403

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// CORS endurecido: substitui o curinga '*' por allowlist. Origens extras
// podem ser adicionadas via secret ALLOWED_ORIGINS (separadas por virgula).
const ALLOWED_ORIGINS = [
  // Interno: 'sislog' e o alias vivo; 'oc-express' virou 308 -> sislog, mas fica
  // na lista porque o projeto Vercel ainda responde por ele.
  'https://sislog.vercel.app',
  'https://oc-express.vercel.app',
  'https://oc-sislog-portal.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
]

// Perfis internos autorizados a mexer nos usuarios de um parceiro. Espelha o
// guard da rota /cadastros/parceiros/:id/usuarios no app interno
// (PerfilRoute allowed={['admin','gerente','supervisor']}) e o canEditParceiros.
//
// Antes bastava ser interno ATIVO: qualquer analista ou assistente podia, com o
// proprio JWT, convidar ou EXCLUIR usuarios de QUALQUER parceiro chamando esta
// funcao direto — a restricao existia so na tela. Autorizacao de front nao e
// autorizacao.
const PERFIS_INTERNOS_AUTORIZADOS = ['admin', 'gerente', 'supervisor']

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

interface ExcluirBody {
  parceiro_usuario_id?: string
}

// (helper json definido por requisicao dentro do handler — ver Deno.serve)

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing_authorization' }, 401)
  }

  let body: ExcluirBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const targetId = body.parceiro_usuario_id?.trim()
  if (!targetId) {
    return json({ error: 'parceiro_usuario_id_obrigatorio' }, 400)
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'sessao_invalida' }, 401)
  }
  const callerId = userData.user.id

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Caller: interno OU admin_parceiro
  const [{ data: interno }, { data: callerPu }] = await Promise.all([
    admin
      .from('perfis_usuarios')
      .select('id, ativo, perfil')
      .eq('user_id', callerId)
      .eq('ativo', true)
      .maybeSingle(),
    admin
      .from('parceiro_usuarios')
      .select('id, parceiro_id, perfil, ativo')
      .eq('user_id', callerId)
      .eq('ativo', true)
      .maybeSingle(),
  ])

  const isInterno = !!interno && PERFIS_INTERNOS_AUTORIZADOS.includes(interno.perfil)
  const isAdminParceiro = !!callerPu && callerPu.perfil === 'admin_parceiro'

  if (!isInterno && !isAdminParceiro) {
    return json({ error: 'forbidden', detalhe: 'caller nao tem permissao para excluir usuario' }, 403)
  }

  // Alvo
  const { data: alvo, error: alvoErr } = await admin
    .from('parceiro_usuarios')
    .select('id, user_id, parceiro_id, email, nome_completo')
    .eq('id', targetId)
    .maybeSingle()

  if (alvoErr || !alvo) {
    return json({ error: 'usuario_nao_encontrado' }, 404)
  }

  // admin_parceiro só pode apagar do próprio parceiro
  if (!isInterno && callerPu!.parceiro_id !== alvo.parceiro_id) {
    return json({ error: 'forbidden', detalhe: 'usuario alvo pertence a outro parceiro' }, 403)
  }

  // Não pode apagar a si mesmo (sempre — interno também)
  if (alvo.user_id === callerId) {
    return json({ error: 'nao_pode_apagar_a_si_mesmo' }, 400)
  }

  // Passo 1: deleta a linha em parceiro_usuarios. FKs em solicitacoes/
  // eventos_portal são ON DELETE SET NULL — histórico preservado. Vem primeiro
  // porque é o passo que pode falhar por regra de banco; falhando aqui, nada
  // foi mutado e não há rollback a fazer.
  const { error: delErr } = await admin
    .from('parceiro_usuarios')
    .delete()
    .eq('id', alvo.id)
  if (delErr) {
    return json({ error: 'falha_no_delete', detalhe: delErr.message }, 500)
  }

  // Passo 2: renomeia o e-mail no auth.users para liberar o original.
  // Placeholder usa o `parceiro_usuarios.id` (já deletado acima) + a TLD
  // reservada `.invalid` (RFC 2606) para nunca colidir com domínio real.
  const placeholderEmail = `deleted-${alvo.id}@deleted.invalid`
  const { error: renameErr } = await admin.auth.admin.updateUserById(alvo.user_id, {
    email: placeholderEmail,
    email_confirm: true,
  })
  if (renameErr) {
    // O vínculo já caiu: o acesso ao portal está revogado (é o que importa) e a
    // exclusão NÃO deve ser desfeita. O que sobrou é o e-mail ainda preso em
    // auth.users, que só atrapalha se essa mesma pessoa for reconvidada.
    return json({
      error: 'falha_ao_liberar_email',
      detalhe: renameErr.message,
      vinculo_removido: true,
    }, 500)
  }

  // Auditoria — best-effort. parceiro_id derivado pela função SECURITY DEFINER
  // a partir do auth.uid() do caller (quando admin_parceiro) ou do payload
  // (quando interno). parceiro_usuario_id_alvo no metadata é só referência —
  // a linha já foi deletada, então fica como dado histórico.
  try {
    await userClient.rpc('registrar_evento_portal', {
      p_tipo_evento: 'portal_usuario_excluido',
      p_payload: {
        parceiro_id: alvo.parceiro_id,
        email_excluido: alvo.email,
        nome_excluido: alvo.nome_completo,
        parceiro_usuario_id_alvo: alvo.id,
        user_agent: req.headers.get('user-agent') ?? null,
      },
    })
  } catch {
    /* ignora — sucesso nao depende da auditoria */
  }

  return json({ ok: true, email: alvo.email, nome_completo: alvo.nome_completo })
})
