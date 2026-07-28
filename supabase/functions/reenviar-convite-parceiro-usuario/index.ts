// Edge Function — reenviar-convite-parceiro-usuario
//
// Por que existe: quando o link de convite (magic link) expira ou se perde,
// o admin do parceiro precisava antes desativar o usuário e convidar de novo.
// Esta função gera um novo link válido SEM mexer no auth.users (a FK
// parceiro_usuarios.user_id -> auth.users tem ON DELETE CASCADE, então
// "deletar e recriar" perderia a linha em parceiro_usuarios). Em vez disso,
// usamos `admin.auth.admin.generateLink({ type: 'recovery' })`, que aceita
// usuário existente e gera um link válido para definir senha — o mesmo
// fluxo que /aceitar-convite já trata (não diferencia invite vs recovery).
//
// Fluxo:
//   1. Caller faz POST com { parceiro_usuario_id } e o header
//      Authorization: Bearer <JWT do supabase-js>.
//   2. Identifica o caller (interno OU admin_parceiro).
//   3. Busca o alvo em parceiro_usuarios. Valida:
//        - existe
//        - ativo = true
//        - convite_aceito_em IS NULL (se já aceitou, não é reenvio de convite
//          — quem esqueceu a senha deve usar "recuperar senha")
//        - admin_parceiro só reenvia para o próprio parceiro_id
//   4. Gera o link com `generateLink({ type: 'recovery', email, options: { redirectTo } })`.
//   5. Registra evento `portal_usuario_convidado` com metadata { reenvio: true }
//      para a tela /seguranca.
//   6. Retorna { ok: true, action_link, email, nome_completo }.
//
// Importante: a função NÃO envia e-mail. O cliente (UsuariosPage) exibe o link
// num dialog com botão Copiar — admin do parceiro manda manualmente até o SMTP
// estar configurado. Quando o SMTP custom estiver ativo, o próprio Supabase
// envia automaticamente o template "Reset password" no mesmo fluxo.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// CORS endurecido: substitui o curinga '*' por allowlist. Origens extras
// podem ser adicionadas via secret ALLOWED_ORIGINS (separadas por virgula).
const ALLOWED_ORIGINS = [
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

interface ReenvioBody {
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

  let body: ReenvioBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const parceiroUsuarioId = body.parceiro_usuario_id?.trim()
  if (!parceiroUsuarioId) {
    return json({ error: 'parceiro_usuario_id_obrigatorio' }, 400)
  }

  // Cliente "do caller" — identifica quem está reenviando.
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

  // Quem é o caller? (1) interno via perfis_usuarios, (2) admin_parceiro via parceiro_usuarios
  const [{ data: interno }, { data: pu }] = await Promise.all([
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
  const isAdminParceiro = !!pu && pu.perfil === 'admin_parceiro'

  if (!isInterno && !isAdminParceiro) {
    return json({ error: 'forbidden', detalhe: 'caller nao tem permissao para reenviar convite' }, 403)
  }

  // Busca o alvo
  const { data: alvo, error: alvoErr } = await admin
    .from('parceiro_usuarios')
    .select('id, parceiro_id, email, nome_completo, ativo, convite_aceito_em')
    .eq('id', parceiroUsuarioId)
    .maybeSingle()

  if (alvoErr || !alvo) {
    return json({ error: 'usuario_nao_encontrado' }, 404)
  }

  // Admin do parceiro só pode reenviar para o próprio parceiro
  if (!isInterno && pu!.parceiro_id !== alvo.parceiro_id) {
    return json({ error: 'forbidden', detalhe: 'usuario alvo pertence a outro parceiro' }, 403)
  }

  if (!alvo.ativo) {
    return json({ error: 'usuario_inativo', detalhe: 'reative o usuario antes de reenviar o convite' }, 400)
  }

  if (alvo.convite_aceito_em) {
    return json({
      error: 'convite_ja_aceito',
      detalhe: 'este usuario ja definiu a senha e usou o portal — pe-o para usar "Esqueci minha senha" no login',
    }, 400)
  }

  // redirectTo precisa apontar pro PORTAL (interno também invoca esta função).
  // Usa o secret PORTAL_URL; fallback pro Origin em dev local.
  const portalBase = Deno.env.get('PORTAL_URL') || req.headers.get('origin') || ''
  const redirectTo = portalBase ? `${portalBase.replace(/\/$/, '')}/aceitar-convite` : undefined

  // Gera novo link de recovery — aceita usuário existente que nunca logou.
  // A AceitarConvitePage trata o fluxo (define senha + chama RPC marcar_meu_convite_aceito).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: alvo.email,
    options: redirectTo ? { redirectTo } : undefined,
  })

  if (linkErr || !link?.properties?.action_link) {
    return json({
      error: 'falha_ao_gerar_link',
      detalhe: linkErr?.message ?? 'sem action_link retornado',
    }, 500)
  }

  // Auditoria — best-effort. Marca como reenvio no metadata.
  // O parceiro_id é derivado do auth.uid() do caller pela função SECURITY DEFINER
  // (quando caller é interno, lê do payload).
  try {
    await userClient.rpc('registrar_evento_portal', {
      p_tipo_evento: 'portal_usuario_convidado',
      p_payload: {
        parceiro_id: alvo.parceiro_id,
        email_convidado: alvo.email,
        reenvio: true,
        parceiro_usuario_id_alvo: alvo.id,
        user_agent: req.headers.get('user-agent') ?? null,
      },
    })
  } catch {
    /* ignora — sucesso da funcao nao depende da auditoria */
  }

  return json({
    ok: true,
    action_link: link.properties.action_link,
    email: alvo.email,
    nome_completo: alvo.nome_completo,
  })
})
