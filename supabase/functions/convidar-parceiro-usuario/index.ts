// Edge Function — convidar-parceiro-usuario
//
// Por que existe: o convite de novos usuários do portal exige criar uma conta
// em `auth.users`, e isso só é possível com a `service_role` key — que NÃO
// pode ir pro frontend. Esta função vive no Edge Runtime, faz a autorização
// (caller é interno OU admin_parceiro) e usa o cliente admin do supabase-js
// para emitir o convite + popular `parceiro_usuarios`.
//
// Fluxo:
//   1. Caller faz POST com { email, nome_completo, perfil, parceiro_id? }
//      e o header Authorization: Bearer <JWT do supabase-js>.
//   2. A função extrai o JWT, identifica o usuário e checa se é interno
//      (perfis_usuarios) OU admin_parceiro (parceiro_usuarios).
//   3. Determina parceiro_id alvo:
//        - admin_parceiro → o próprio parceiro_id do caller (ignora body)
//        - interno        → exige `parceiro_id` no body
//   4. Valida que o email ainda não está em parceiro_usuarios.
//   5. `auth.admin.inviteUserByEmail(email, { redirectTo })` — Supabase manda
//      e-mail de convite com link mágico. O redirectTo é derivado do header
//      Origin do request + `/aceitar-convite`.
//   6. Insere a linha em `parceiro_usuarios` usando o `user_id` retornado.
//      Se o INSERT falhar, faz cleanup do auth.users (`deleteUser`) para não
//      deixar conta órfã.
//   7. Registra um evento `portal_usuario_convidado` em `eventos_portal`.

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

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const PERFIS_VALIDOS = ['admin_parceiro', 'operador_parceiro'] as const
type Perfil = (typeof PERFIS_VALIDOS)[number]

interface InviteBody {
  email?: string
  nome_completo?: string
  perfil?: string
  parceiro_id?: string
}

// (helper json definido por requisicao dentro do handler — ver Deno.serve)

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

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

  let body: InviteBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const email = body.email?.trim().toLowerCase()
  const nome_completo = body.nome_completo?.trim()
  const perfilInput = body.perfil
  const parceiroIdBody = body.parceiro_id?.trim() || null

  if (!email || !isValidEmail(email)) {
    return json({ error: 'email_invalido' }, 400)
  }
  if (!nome_completo || nome_completo.length < 2) {
    return json({ error: 'nome_invalido' }, 400)
  }
  if (!perfilInput || !PERFIS_VALIDOS.includes(perfilInput as Perfil)) {
    return json({ error: 'perfil_invalido', detalhe: `valores aceitos: ${PERFIS_VALIDOS.join(', ')}` }, 400)
  }
  const perfil = perfilInput as Perfil

  // Cliente "do caller" — usa o JWT do header para identificar quem está convidando.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'sessao_invalida' }, 401)
  }
  const callerId = userData.user.id

  // Cliente service-role — para checagens privilegiadas e inviteUserByEmail.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Quem é o caller? (1) interno via perfis_usuarios, (2) admin_parceiro via parceiro_usuarios
  const [{ data: interno }, { data: pu }] = await Promise.all([
    admin
      .from('perfis_usuarios')
      .select('id, ativo')
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

  const isInterno = !!interno
  const isAdminParceiro = !!pu && pu.perfil === 'admin_parceiro'

  if (!isInterno && !isAdminParceiro) {
    return json({ error: 'forbidden', detalhe: 'caller nao tem permissao para convidar' }, 403)
  }

  // Determina parceiro_id alvo
  let parceiroId: string
  if (isAdminParceiro) {
    parceiroId = pu!.parceiro_id
    // se interno-só, não tenta forçar; se ambos, prioriza o vínculo de parceiro
  } else {
    if (!parceiroIdBody) {
      return json({ error: 'parceiro_id_obrigatorio', detalhe: 'interno precisa indicar parceiro_id' }, 400)
    }
    parceiroId = parceiroIdBody
  }

  // Confirma que o parceiro existe e está ativo
  const { data: parceiro, error: parceiroErr } = await admin
    .from('parceiros')
    .select('id, razao_social, ativo')
    .eq('id', parceiroId)
    .maybeSingle()
  if (parceiroErr || !parceiro) {
    return json({ error: 'parceiro_nao_encontrado' }, 404)
  }
  if (!parceiro.ativo) {
    return json({ error: 'parceiro_inativo' }, 400)
  }

  // E-mail já vinculado a um parceiro_usuario?
  const { data: existing } = await admin
    .from('parceiro_usuarios')
    .select('id, ativo')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    return json({
      error: existing.ativo ? 'email_ja_cadastrado' : 'email_inativo_existente',
      detalhe: existing.ativo
        ? 'este e-mail já está vinculado a um usuário do portal'
        : 'este e-mail pertence a um usuário desativado — reative-o em vez de convidar de novo',
    }, 409)
  }

  // redirectTo precisa apontar pro PORTAL, não pro interno (que também invoca
  // esta função). Usamos o secret PORTAL_URL (ex.: https://oc-sislog-portal.vercel.app);
  // se não estiver setado, caímos no header `Origin` da request — útil em
  // testes locais com o portal rodando.
  // A URL final precisa estar na allowlist do Supabase Auth → Redirect URLs.
  const portalBase = Deno.env.get('PORTAL_URL') || req.headers.get('origin') || ''
  const redirectTo = portalBase ? `${portalBase.replace(/\/$/, '')}/aceitar-convite` : undefined

  // Convida via Auth Admin (cria auth.users + envia e-mail de magic link)
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { nome_completo, parceiro_id: parceiroId, perfil },
  })
  if (inviteErr || !invite?.user) {
    return json({ error: 'falha_no_convite', detalhe: inviteErr?.message ?? 'sem usuario retornado' }, 500)
  }

  // Insere parceiro_usuarios
  const { error: insertErr } = await admin.from('parceiro_usuarios').insert({
    user_id: invite.user.id,
    parceiro_id: parceiroId,
    nome_completo,
    email,
    perfil,
    ativo: true,
    created_by: callerId,
  })

  if (insertErr) {
    // Cleanup: remove o auth.users criado pra não deixar conta orfã que poderia
    // logar mas não teria vínculo. Se o delete falhar, registramos o id no
    // detalhe pra que o admin possa investigar manualmente.
    const { error: delErr } = await admin.auth.admin.deleteUser(invite.user.id)
    return json({
      error: 'falha_no_insert',
      detalhe: insertErr.message,
      orfao_auth_user_id: delErr ? invite.user.id : undefined,
    }, 500)
  }

  // Evento de auditoria — best-effort, não bloqueia o sucesso.
  // IMPORTANTE: chamar com o `userClient` (JWT do caller), não com o admin —
  // a função SECURITY DEFINER deriva o `parceiro_*` do auth.uid() e usa o
  // `parceiro_id` do payload só quando o caller é interno.
  try {
    await userClient.rpc('registrar_evento_portal', {
      p_tipo_evento: 'portal_usuario_convidado',
      p_payload: {
        parceiro_id: parceiroId,
        email_convidado: email,
        perfil,
        user_agent: req.headers.get('user-agent') ?? null,
      },
    })
  } catch {
    /* ignora — função deve ter sucesso mesmo se a auditoria falhar */
  }

  return json({
    ok: true,
    user_id: invite.user.id,
    parceiro_id: parceiroId,
    parceiro_razao_social: parceiro.razao_social,
    email,
    perfil,
  }, 201)
})
