/**
 * Sessão medida por ATIVIDADE, não por tempo de vida do token.
 *
 * O padrão do Supabase é sessão eterna: o access token expira em 1 h, mas o
 * `autoRefreshToken` troca o refresh token sozinho, para sempre. Numa sala de
 * operação com computador compartilhado, isso quer dizer que a estação que
 * ficou aberta continua valendo — o que é o risco real deste sistema, muito
 * mais do que uma senha fraca.
 *
 * Aqui a conta é outra: 50 minutos SEM INTERAÇÃO derrubam a sessão. O logout
 * chama `supabase.auth.signOut()`, que revoga o refresh token no servidor —
 * então não é só a tela que fecha: o token que ficou no disco daquela máquina
 * deixa de valer.
 *
 * ## Decisões que valem registro
 *
 * **A conta é um carimbo, não um contador.** Guardamos o instante da última
 * interação e comparamos com `Date.now()` a cada tick. Um contador regressivo
 * não sobreviveria ao notebook fechado: `setInterval` não roda com a máquina
 * suspensa, e a sessão continuaria de pé ao reabrir. Com carimbo, voltar de
 * três horas de sono expira na primeira checagem.
 *
 * **O carimbo vive no `localStorage`, compartilhado entre as abas.** Quem
 * trabalha com o painel numa aba e o relatório em outra está ativo no sistema
 * inteiro, não em cada aba. Como o Supabase também sincroniza o logout entre
 * abas, cair numa cai em todas.
 *
 * **Voltar para a aba não é atividade — é hora de conferir.** `visibilitychange`
 * dispara a checagem, nunca o carimbo: quem deixou o sistema aberto em segundo
 * plano por uma hora ficou uma hora inativo, e descobre isso ao voltar.
 *
 * **Mover o mouse não conta; clicar e digitar contam.** Sem `mousemove` de
 * propósito — mesa esbarrada, mouse em superfície trêmula e ponteiro que anda
 * sozinho renovariam a sessão de uma estação vazia, que é exatamente o caso
 * que este módulo existe para fechar.
 *
 * Sem React aqui de propósito: os dois apps consomem isto, e cada um monta o
 * aviso com o próprio kit de UI.
 */

/** Minutos de inatividade que encerram a sessão. */
export const INATIVIDADE_MINUTOS = 50

/** Quantos minutos antes do fim o usuário é avisado, para não perder trabalho
 *  em silêncio no meio de um formulário. */
export const AVISO_MINUTOS = 2

export const INATIVIDADE_MS = INATIVIDADE_MINUTOS * 60_000
export const AVISO_MS = AVISO_MINUTOS * 60_000

const CHAVE_ATIVIDADE = 'sislog.sessao.ultima_atividade'
const CHAVE_MOTIVO = 'sislog.sessao.motivo_saida'

/** Um tick por segundo: a contagem regressiva do aviso precisa correr lisa, e o
 *  custo é uma leitura de `localStorage` — irrelevante ao lado de qualquer
 *  render. */
const INTERVALO_TICK_MS = 1_000

/** Teto de gravação. Sem isso, cada tecla digitada escreveria no `localStorage`
 *  e acordaria as outras abas pelo evento `storage`. Atrasar o carimbo em até
 *  20 s não muda nada num limite de 50 min. */
const THROTTLE_GRAVACAO_MS = 20_000

/** Eventos que contam como interação. Ver a nota sobre `mousemove` acima. */
const EVENTOS_ATIVIDADE = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export type MotivoSaida = 'inatividade'

// Espelho em memória: em aba anônima ou com armazenamento bloqueado o
// `localStorage` lança em vez de devolver null, e o vigia não pode simplesmente
// parar de funcionar por isso — degrada para "por aba" em vez de sumir.
let carimboEmMemoria = Date.now()
let ultimaGravacao = 0

function agora(): number {
  return Date.now()
}

/** Instante da última interação, em epoch ms. */
export function lerUltimaAtividade(): number {
  try {
    const bruto = window.localStorage.getItem(CHAVE_ATIVIDADE)
    const valor = bruto ? Number(bruto) : NaN
    // Valor corrompido (mão humana no DevTools, extensão) não pode virar uma
    // sessão eterna nem um logout imediato: cai no espelho em memória.
    if (!Number.isFinite(valor) || valor <= 0) return carimboEmMemoria
    return valor
  } catch {
    return carimboEmMemoria
  }
}

/** Carimba "o usuário interagiu agora". Idempotente e barata: o throttle segura
 *  a gravação, mas o espelho em memória avança sempre. */
export function marcarAtividade(): void {
  const t = agora()
  carimboEmMemoria = t
  if (t - ultimaGravacao < THROTTLE_GRAVACAO_MS) return
  ultimaGravacao = t
  try {
    window.localStorage.setItem(CHAVE_ATIVIDADE, String(t))
  } catch {
    // Sem armazenamento: o espelho em memória já foi atualizado.
  }
}

/** Zera o carimbo ao encerrar a sessão, para o próximo login não herdar a
 *  inatividade de quem saiu. */
export function limparAtividade(): void {
  carimboEmMemoria = agora()
  ultimaGravacao = 0
  try {
    window.localStorage.removeItem(CHAVE_ATIVIDADE)
  } catch {
    // nada a fazer
  }
}

/** Por que a sessão terminou. Guardado em `sessionStorage` (morre com a aba)
 *  para a tela de login explicar o que aconteceu em vez de aparecer do nada. */
export function registrarMotivoSaida(motivo: MotivoSaida): void {
  try {
    window.sessionStorage.setItem(CHAVE_MOTIVO, motivo)
  } catch {
    // nada a fazer
  }
}

/**
 * Leitura PURA do motivo — não apaga nada.
 *
 * Ler e apagar na mesma função era o desenho óbvio, e está errado para React:
 * a tela de login precisa dessa informação no primeiro render, e tanto o
 * inicializador de `useState` quanto o corpo de um efeito podem rodar duas
 * vezes no StrictMode. Na segunda passada o valor já teria sumido, e o aviso
 * apareceria e desapareceria sozinho.
 *
 * Quem apaga é `limparMotivoSaida`, no login bem-sucedido — que é quando o
 * aviso deixa de fazer sentido. Enquanto a pessoa não entrar de novo, recarregar
 * a página mostra o aviso outra vez, o que é o comportamento certo: ela continua
 * do lado de fora pelo mesmo motivo.
 */
export function lerMotivoSaida(): MotivoSaida | null {
  try {
    return window.sessionStorage.getItem(CHAVE_MOTIVO) === 'inatividade' ? 'inatividade' : null
  } catch {
    return null
  }
}

export function limparMotivoSaida(): void {
  try {
    window.sessionStorage.removeItem(CHAVE_MOTIVO)
  } catch {
    // nada a fazer
  }
}

export interface OpcoesVigia {
  /** Padrão: `INATIVIDADE_MS`. */
  ttlMs?: number
  /** Padrão: `AVISO_MS`. */
  avisoMs?: number
  /** Chamada a cada tick dentro da faixa de aviso, com o tempo restante. */
  aoAvisar: (restanteMs: number) => void
  /** O usuário voltou a interagir (aqui ou em outra aba) antes de expirar. */
  aoRetomar: () => void
  /** Estourou o limite. Chamada UMA vez: quem observa faz o signOut. */
  aoExpirar: () => void
}

/**
 * Liga o vigia. Devolve a função de desligar (chamar ao deslogar/desmontar).
 *
 * Carimba a atividade na largada: quem acabou de entrar não pode herdar o
 * relógio de uma sessão anterior daquela máquina.
 */
export function observarInatividade(opcoes: OpcoesVigia): () => void {
  const ttlMs = opcoes.ttlMs ?? INATIVIDADE_MS
  const avisoMs = opcoes.avisoMs ?? AVISO_MS

  let expirado = false
  let avisando = false

  // `limparAtividade` também zera o throttle, então o `marcarAtividade` logo
  // abaixo grava de fato em vez de cair no teto de 20 s.
  limparAtividade()
  marcarAtividade()

  const aoInteragir = () => {
    if (expirado) return
    marcarAtividade()
    if (avisando) {
      avisando = false
      opcoes.aoRetomar()
    }
  }

  const conferir = () => {
    if (expirado) return
    const inativoMs = agora() - lerUltimaAtividade()

    if (inativoMs >= ttlMs) {
      expirado = true
      desligar()
      opcoes.aoExpirar()
      return
    }

    const restanteMs = ttlMs - inativoMs
    if (restanteMs <= avisoMs) {
      avisando = true
      opcoes.aoAvisar(restanteMs)
    } else if (avisando) {
      // Outra aba renovou a sessão: o aviso desta perde o sentido.
      avisando = false
      opcoes.aoRetomar()
    }
  }

  const aoMudarVisibilidade = () => {
    if (document.visibilityState === 'visible') conferir()
  }

  for (const evento of EVENTOS_ATIVIDADE) {
    window.addEventListener(evento, aoInteragir, { passive: true })
  }
  document.addEventListener('visibilitychange', aoMudarVisibilidade)
  const timer = window.setInterval(conferir, INTERVALO_TICK_MS)

  function desligar() {
    window.clearInterval(timer)
    for (const evento of EVENTOS_ATIVIDADE) {
      window.removeEventListener(evento, aoInteragir)
    }
    document.removeEventListener('visibilitychange', aoMudarVisibilidade)
  }

  return desligar
}
