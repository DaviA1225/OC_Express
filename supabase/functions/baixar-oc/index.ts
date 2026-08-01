// Edge Function — baixar-oc
//
// Por que existe: o PDF da OC vive no bucket privado `ocs-pdf`, cujas policies
// (migration 0026) só permitem `is_interno()`. O parceiro do portal NÃO tem
// acesso direto ao bucket. Esta função roda no Edge Runtime, confere que a
// solicitação pertence ao parceiro logado (e que a OC já está pronta) e devolve
// um signed URL curto para download — sem nunca expor o bucket ao frontend.
//
// Fluxo:
//   1. Caller faz POST { solicitacao_id } com Authorization: Bearer <JWT>.
//   2. Identifica o usuário pelo JWT (interno via perfis_usuarios OU parceiro
//      via parceiro_usuarios).
//   3. Com a service_role, lê a solicitação e autoriza:
//        - interno  → libera qualquer OC;
//        - parceiro → só se origem='parceiro' e o parceiro_id do caller bate.
//   4. Exige status de OC pronta (oc_gerada/oc_enviada/finalizada) e pdf_url.
//   5. Gera signed URL (5 min) com download forçado e devolve { url, filename }.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const OCS_PDF_BUCKET = 'ocs-pdf'
const SIGNED_URL_TTL = 300 // 5 minutos
const STATUS_OC_PRONTA = ['oc_gerada', 'oc_enviada', 'finalizada']

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

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

interface BaixarBody {
  solicitacao_id?: string
}

// (helper json definido por requisicao dentro do handler — ver Deno.serve)

// Normaliza o valor de `solicitacoes.pdf_url`: registros novos guardam só o
// path (ex.: "OC_0287_20260522.pdf"); registros antigos (bucket público)
// guardam a URL completa (.../object/public/ocs-pdf/OC_0287.pdf). Espelha
// `ocPdfStoragePath` do app interno.
function ocPdfStoragePath(stored: string): string {
  const marker = '/ocs-pdf/'
  const i = stored.indexOf(marker)
  const path = i >= 0 ? stored.slice(i + marker.length) : stored
  return decodeURIComponent(path.split('?')[0])
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

  let body: BaixarBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const solicitacaoId = body.solicitacao_id?.trim()
  if (!solicitacaoId) {
    return json({ error: 'solicitacao_id_obrigatorio' }, 400)
  }

  // Cliente "do caller" — usa o JWT do header para identificar quem está pedindo.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'sessao_invalida' }, 401)
  }
  const callerId = userData.user.id

  // Cliente service-role — leitura privilegiada da solicitação e assinatura do PDF.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Quem é o caller? interno (perfis_usuarios) ou parceiro (parceiro_usuarios).
  const [{ data: interno }, { data: pu }] = await Promise.all([
    admin
      .from('perfis_usuarios')
      .select('id, ativo')
      .eq('user_id', callerId)
      .eq('ativo', true)
      .maybeSingle(),
    admin
      .from('parceiro_usuarios')
      .select('id, parceiro_id, ativo')
      .eq('user_id', callerId)
      .eq('ativo', true)
      .maybeSingle(),
  ])

  const isInterno = !!interno
  if (!isInterno && !pu) {
    return json({ error: 'forbidden' }, 403)
  }

  // Lê a solicitação com privilégio elevado.
  const { data: sol, error: solErr } = await admin
    .from('solicitacoes')
    .select('id, origem, parceiro_id, status, pdf_url, numero_interno')
    .eq('id', solicitacaoId)
    .maybeSingle()
  if (solErr) {
    return json({ error: 'erro_consulta', detalhe: solErr.message }, 500)
  }
  if (!sol) {
    return json({ error: 'solicitacao_nao_encontrada' }, 404)
  }

  // Autorização: o parceiro só baixa a OC da própria solicitação.
  if (!isInterno) {
    if (sol.origem !== 'parceiro' || sol.parceiro_id !== pu!.parceiro_id) {
      return json({ error: 'forbidden' }, 403)
    }
  }

  // A OC precisa estar pronta e ter arquivo.
  if (!STATUS_OC_PRONTA.includes(sol.status) || !sol.pdf_url) {
    return json({ error: 'oc_indisponivel' }, 409)
  }

  const path = ocPdfStoragePath(sol.pdf_url)
  const numero = String(sol.numero_interno ?? '').padStart(4, '0')
  const filename = `OC_${numero}.pdf`

  const { data: signed, error: signErr } = await admin.storage
    .from(OCS_PDF_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL, { download: filename })
  if (signErr || !signed?.signedUrl) {
    return json({ error: 'falha_assinatura', detalhe: signErr?.message }, 500)
  }

  return json({ url: signed.signedUrl, filename })
})
