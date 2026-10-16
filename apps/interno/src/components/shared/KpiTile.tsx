import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useContagem } from '@/hooks/useMovimento'

interface KpiDelta {
  /** Texto já formatado (use fmtDelta/fmtPct de @/lib/format): "+12,0%". */
  valor: string
  /** Contra o quê se compara: "vs. ontem no mesmo horário". Obrigatório — delta sem comparador não se lê. */
  comparador: string
  /** Direção numérica (sobe/desce/estável). */
  direcao: 'up' | 'down' | 'flat'
  /** Se subir é bom (padrão) ou ruim (ex.: atrasadas). Define ok/bad. */
  subirEhBom?: boolean
}

interface KpiTileProps {
  /** Rótulo curto; vira 11px maiúsculo (único uso aceito de uppercase). */
  label: string
  /** Valor já formatado (fmtInt/fmtPct/fmtDur). */
  value: React.ReactNode
  /** Unidade/sufixo discreto ao lado do valor ("OCs", "h"). */
  unit?: string
  /** Ícone lucide 16px solto, em texto 3 — sem caixa colorida. */
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  delta?: KpiDelta
  /** Linha de apoio abaixo (ex.: "Meta 30/dia"). */
  hint?: React.ReactNode
  /** Estado de alerta por regra de negócio: só a borda muda (sem glow). */
  tone?: 'default' | 'alert'
  /** Drill-down por rota: renderiza <Link> (Ctrl/clique do meio abrem em nova aba). Prefira a onClick. */
  to?: string
  /** Torna o tile clicável (ação sem rota). */
  onClick?: () => void
  /** Dica nativa no tile inteiro (ex.: por que o drill-down está desligado). */
  title?: string
  className?: string
}

/**
 * KPI único do sistema (substitui KpiCard de Dashboard/Relatórios/Relatórios
 * Internos e ResumoCard da Atividade). Superfície plana com hairline; número
 * em Kanit 500 tabular; nada de gradiente, glow ou caixa de ícone.
 */
export function KpiTile({ label, value, unit, icon: Icon, delta, hint, tone = 'default', to, onClick, title, className }: KpiTileProps) {
  const interativo = !!to || !!onClick
  const classes = cn(
    'flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 text-left',
    tone === 'alert' && 'border-danger-border',
    interativo &&
      'transition-[transform,background-color,border-color] duration-fast ease-out hover:-translate-y-0.5 hover:border-input hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    className,
  )
  const conteudo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="label-uppercase truncate">{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-tertiary" strokeWidth={1.75} aria-hidden />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <div
          className={cn(
            'font-display text-kpi font-medium tabular-nums text-foreground',
            tone === 'alert' && 'text-danger',
          )}
        >
          <ValorKpi value={value} />
        </div>
        {unit && <span className="text-body-sm text-muted-foreground">{unit}</span>}
      </div>
      {delta && <Delta {...delta} />}
      {hint && <div className="text-body-sm text-muted-foreground">{hint}</div>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={classes} title={title}>
        {conteudo}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} title={title}>
        {conteudo}
      </button>
    )
  }
  return <div className={classes} title={title}>{conteudo}</div>
}

// Número pt-BR já formatado: "1.234", "93,4%", "12,5". Qualquer outra coisa
// ("3 h 40 min", "—", "45 min") não conta — só faz fade.
const NUMERO_BR = /^(-?\d{1,3}(?:\.\d{3})*|-?\d+)(?:,(\d+))?(\s?%)?$/

function lerNumeroBR(v: string): { n: number; casas: number; sufixo: string } | null {
  const m = NUMERO_BR.exec(v)
  if (!m) return null
  const casas = m[2]?.length ?? 0
  const n = Number(`${m[1].replace(/\./g, '')}.${m[2] ?? '0'}`)
  return Number.isFinite(n) ? { n, casas, sufixo: m[3] ?? '' } : null
}

/**
 * Valor do KPI com movimento: número conta do 0 (ou do valor anterior) até o
 * alvo em 600ms; texto não numérico entra com fade quando muda; elemento
 * (skeleton) passa direto. Refetch com o mesmo valor não anima.
 */
function ValorKpi({ value }: { value: React.ReactNode }) {
  const num = typeof value === 'string' ? lerNumeroBR(value) : null
  if (num) return <NumeroContado alvo={num.n} casas={num.casas} sufixo={num.sufixo} final={value as string} />
  if (typeof value === 'string' || typeof value === 'number') {
    return <span key={String(value)} className="surgir">{value}</span>
  }
  return <>{value}</>
}

function NumeroContado({ alvo, casas, sufixo, final }: { alvo: number; casas: number; sufixo: string; final: string }) {
  const atual = useContagem(alvo)
  // No fim mostra o texto original (idêntico ao formatador de origem).
  if (atual === alvo) return <>{final}</>
  // `+ 0` normaliza o zero negativo ("-0") ao contar até um alvo negativo.
  const txt = (atual + 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, signDisplay: 'negative' })
  // Leitor de tela ouve só o valor final, nunca os intermediários.
  return (
    <>
      <span aria-hidden>{txt}{sufixo}</span>
      <span className="sr-only">{final}</span>
    </>
  )
}

function Delta({ valor, comparador, direcao, subirEhBom = true }: KpiDelta) {
  const bom = direcao === 'flat' ? null : (direcao === 'up') === subirEhBom
  const Seta = direcao === 'up' ? ArrowUpRight : direcao === 'down' ? ArrowDownRight : ArrowRight
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 text-body-sm">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium tabular-nums',
          bom === null ? 'text-muted-foreground' : bom ? 'text-success' : 'text-danger',
        )}
      >
        <Seta className="h-3.5 w-3.5" aria-hidden />
        {valor}
      </span>
      <span className="text-muted-foreground">{comparador}</span>
    </div>
  )
}
