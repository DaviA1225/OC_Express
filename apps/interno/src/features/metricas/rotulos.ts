import type { FaixaIdade, MetasOperacao, PainelHoje } from './tipos'

export const FAIXA_LABEL: Record<FaixaIdade, string> = {
  lt1h: '< 1 h',
  '1a4h': '1–4 h',
  '4a8h': '4–8 h',
  '8a24h': '8–24 h',
  gt24h: '> 24 h',
}

export const ORIGEM_LABEL: Record<string, string> = {
  interno: 'Interno',
  parceiro: 'Parceiro',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
}

export function rotuloOrigem(o: string): string {
  return ORIGEM_LABEL[o] ?? o
}

/** "14:37" no relógio do navegador. */
export function fmtHoraMin(d: Date | number | string): string {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** `HH:MM` → minutos desde 00:00. */
function minutosDoDia(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** "18h" ou "17h30" a partir de `HH:MM`. */
export function rotuloHorario(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return m && m !== '00' ? `${Number(h)}h${m}` : `${Number(h)}h`
}

/**
 * P5 — ritmo: projeção até o fim do expediente no ritmo das últimas 2 h:
 * `P4 + (fin_2h / 2) × horas_restantes`. Fora do expediente não projeta nada
 * além do realizado.
 */
export function projetarRitmo(
  hoje: Pick<PainelHoje, 'finalizadas' | 'finalizadas_2h'>,
  metas: Pick<MetasOperacao, 'expediente_inicio' | 'expediente_fim'>,
  agora: Date,
): number {
  const ini = minutosDoDia(metas.expediente_inicio)
  const fim = minutosDoDia(metas.expediente_fim)
  const atual = agora.getHours() * 60 + agora.getMinutes()
  if (atual < ini || atual >= fim) return hoje.finalizadas
  const horasRestantes = (fim - atual) / 60
  return Math.round(hoje.finalizadas + (hoje.finalizadas_2h / 2) * horasRestantes)
}
