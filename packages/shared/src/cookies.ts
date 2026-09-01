/**
 * Cookies de conveniência do login.
 *
 * ## O que fica gravado, e o que NÃO fica
 *
 * Fica: o **e-mail** de quem entrou por último naquele navegador, e só quando a
 * pessoa marcou "lembrar". Serve para a tela de login já vir preenchida e o
 * usuário só digitar a senha — ou deixar o gerenciador de senhas do navegador
 * preencher, que é para isso que os campos têm `autocomplete="email"` e
 * `autocomplete="current-password"`.
 *
 * NÃO fica: a senha, nem o token de sessão. Guardar a senha aqui desfaria a
 * própria regra dos 50 minutos — a estação abandonada voltaria a entrar sozinha,
 * e qualquer XSS levaria a credencial junto com o cookie. Quem guarda senha com
 * segurança é o gerenciador do navegador/sistema, protegido pelo login da
 * máquina; o SisLog não tem como competir com isso, e não deveria tentar.
 *
 * ## Por que cookie e não localStorage
 *
 * Foi o pedido, e o comportamento combina: o cookie tem prazo de validade
 * próprio (`Max-Age`), então o "lembrar" caduca sozinho em 60 dias sem
 * nenhum código de limpeza. `SameSite=Lax` mantém o valor fora de requisição
 * de terceiro, e `Secure` (em HTTPS) impede que ele trafegue em claro.
 *
 * Não dá para marcar `HttpOnly` daqui — cookie criado por JavaScript nunca é
 * HttpOnly. Isso é aceitável exatamente porque o conteúdo é um e-mail que o
 * próprio usuário digitou nesta tela, e não um segredo.
 */

/** Nome curto e com prefixo do produto: o portal e o interno vivem em domínios
 *  diferentes, mas convém que um cookie do SisLog se identifique como tal. */
export const COOKIE_EMAIL_LEMBRADO = 'sislog_email'

/** 60 dias. Prazo de conveniência, não de sessão — a sessão morre em 50 min de
 *  inatividade (ver `sessao.ts`), e são coisas independentes. */
const DIAS_LEMBRAR = 60

export function lerCookie(nome: string): string | null {
  try {
    const alvo = `${encodeURIComponent(nome)}=`
    for (const parte of document.cookie.split(';')) {
      const item = parte.trim()
      if (item.startsWith(alvo)) return decodeURIComponent(item.slice(alvo.length))
    }
    return null
  } catch {
    return null
  }
}

export function gravarCookie(nome: string, valor: string, dias: number): void {
  try {
    // `Secure` só em HTTPS: o navegador descarta cookie Secure vindo de
    // http://localhost, e o dev server ficaria sem o "lembrar" sem motivo.
    const seguro = window.location.protocol === 'https:' ? '; Secure' : ''
    const maxAge = Math.max(0, Math.round(dias * 86_400))
    document.cookie =
      `${encodeURIComponent(nome)}=${encodeURIComponent(valor)}` +
      `; Max-Age=${maxAge}; Path=/; SameSite=Lax${seguro}`
  } catch {
    // Cookies bloqueados: o login segue funcionando, só não lembra.
  }
}

export function apagarCookie(nome: string): void {
  gravarCookie(nome, '', 0)
}

/** Guarda o e-mail para a próxima visita. Chamada só quando o usuário marcou a
 *  caixa — lembrar por conta própria entregaria, a quem senta na mesma estação,
 *  a informação de quem trabalha ali. */
export function lembrarEmail(email: string): void {
  const limpo = email.trim().toLowerCase()
  if (!limpo) return
  gravarCookie(COOKIE_EMAIL_LEMBRADO, limpo, DIAS_LEMBRAR)
}

export function emailLembrado(): string | null {
  const valor = lerCookie(COOKIE_EMAIL_LEMBRADO)
  return valor && valor.includes('@') ? valor : null
}

export function esquecerEmail(): void {
  apagarCookie(COOKIE_EMAIL_LEMBRADO)
}
