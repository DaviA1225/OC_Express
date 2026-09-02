import * as React from 'react'
import {
  Menu,
  ShieldCheck,
  RefreshCw,
  Bell,
  Moon,
  User,
  LogOut,
  Truck,
  Route,
  UsersRound,
  Container,
  Building2,
  TriangleAlert,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Prévia do sistema para a página pública.
 *
 * É uma MAQUETE: nada aqui consulta o banco, e os números são fictícios, de uma
 * "Total Transportes" que não existe. Numa página que qualquer pessoa abre, o
 * painel real exporia carteira de clientes, placas e volume de operação da LHG —
 * o mesmo motivo pelo qual `clientes_publicos` deixou de responder ao anon
 * (migration 0072).
 *
 * `aria-hidden` no bloco inteiro: para quem usa leitor de tela, ler 6 cartões de
 * números falsos e um calendário decorativo é ruído. A legenda ao lado da
 * prévia, essa sim, é texto de verdade.
 */
export function PreviaPainel() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border border-[#E1E4EA] bg-[#F5F7F9] shadow-[0_20px_60px_-24px_rgba(26,31,40,0.35)] dark:border-[var(--border-dark)] dark:bg-[var(--canvas-dark)]"
    >
      <CabecalhoPrevia />

      {/* 75 / 25 — o painel de trabalho ocupa a área principal e o calendário
          fica na coluna estreita. Empilha no celular. */}
      <div className="grid gap-4 p-4 lg:grid-cols-[3fr_1fr]">
        <div className="space-y-4">
          <TopoMetricas />
          <GradeMetricas />
          <Atividades />
        </div>
        <Calendario />
      </div>
    </div>
  )
}

function CabecalhoPrevia() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[#E1E4EA] bg-white px-4 py-2.5 dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <Menu className="h-4 w-4 shrink-0 text-[#6B7280]" />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FF5100]/10 text-[#FF5100]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[13px] font-semibold leading-tight text-[#1A1F28] dark:text-white">
            Total Transportes
          </p>
          <p className="truncate text-[11px] leading-tight text-[#6B7280]">Resumo de atividades</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <BotaoIcone icone={RefreshCw} />
        <BotaoIcone icone={Bell} badge="1" />
        <BotaoIcone icone={Moon} />
        <BotaoIcone icone={User} />
        <BotaoIcone icone={LogOut} />
      </div>
    </header>
  )
}

function BotaoIcone({
  icone: Icone,
  badge,
}: {
  icone: React.ComponentType<{ className?: string }>
  badge?: string
}) {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center rounded-full border border-[#E1E4EA] bg-white text-[#6B7280] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]">
      <Icone className="h-3.5 w-3.5" />
      {badge && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#FF5100] text-[9px] font-semibold text-white">
          {badge}
        </span>
      )}
    </span>
  )
}

function TopoMetricas() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
        Métricas em tempo real
      </h3>
      {/* Elevação no hover: é a única coisa "viva" da maquete, e sinaliza que
          isto é um sistema de verdade, não uma imagem. */}
      <span className="inline-flex cursor-default items-center gap-2 rounded-full bg-[#FF5100] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(255,81,0,0.7)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_26px_-10px_rgba(255,81,0,0.75)]">
        Agendar viagem
        <Truck className="h-4 w-4" />
      </span>
    </div>
  )
}

const METRICAS = [
  { rotulo: 'Viagens hoje', valor: '0', icone: Truck },
  { rotulo: 'Viagens ativas', valor: '0', icone: Route },
  { rotulo: 'Motoristas ativos', valor: '2', icone: UsersRound },
  { rotulo: 'Veículos disponíveis', valor: '3', icone: Container },
  { rotulo: 'Empresas clientes', valor: '5', icone: Building2 },
  { rotulo: 'Novos alertas', valor: '0', icone: TriangleAlert },
] as const

function GradeMetricas() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {METRICAS.map((m) => (
        <div
          key={m.rotulo}
          className="rounded-xl border border-[#E1E4EA] bg-white p-3 shadow-[0_1px_2px_rgba(26,31,40,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_-16px_rgba(26,31,40,0.35)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EDEFF2] text-[#6B7280] dark:bg-white/5">
            <m.icone className="h-4 w-4" />
          </span>
          <p className="mt-2.5 text-[11px] leading-tight text-[#6B7280]">{m.rotulo}</p>
          <p className="mt-1 text-right font-display text-[26px] font-semibold leading-none tabular-nums text-[#1A1F28] dark:text-white">
            {m.valor}
          </p>
        </div>
      ))}
    </div>
  )
}

function Atividades() {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6B7280]">
          Atividades
        </h3>
        <span className="rounded-full bg-[#EDEFF2] px-2 py-0.5 text-[10px] font-medium text-[#475569] dark:bg-white/5 dark:text-slate-300">
          0 importantes
        </span>
      </div>

      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#E1E4EA] bg-white px-4 py-8 text-center shadow-[0_1px_2px_rgba(26,31,40,0.06)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]">
        <CheckCheck className="h-6 w-6 text-[#059669]" />
        <p className="text-[13px] font-medium text-[#1A1F28] dark:text-white">
          Todas as atividades foram lidas
        </p>
        <p className="text-[12px] text-[#6B7280]">Não há atividades novas no momento.</p>
      </div>
    </section>
  )
}

/** Cores da legenda saem da paleta de status do DESIGN.md, não de pastéis
 *  novos: o mesmo verde de "finalizada" e o mesmo vermelho de "cancelada" que a
 *  operação já lê no sistema. */
const LEGENDA = [
  { rotulo: 'Agendadas', cor: '#475569' },
  { rotulo: 'Atribuídas', cor: '#C44612' },
  { rotulo: 'Em rota', cor: '#92400E' },
  { rotulo: 'Finalizadas', cor: '#065F46' },
  { rotulo: 'Canceladas', cor: '#991B1B' },
] as const

/** Dias com barra indicadora, e de que status. Fixos: é maquete. */
const MARCADOS: Record<number, string[]> = {
  2: ['#475569'],
  7: ['#C44612', '#065F46'],
  9: ['#92400E'],
  15: ['#065F46', '#C44612'],
  16: ['#475569'],
  21: ['#991B1B'],
  23: ['#065F46'],
  28: ['#C44612'],
}

const DIA_SELECIONADO = 15

function Calendario() {
  // Julho/2026 montado a partir da data, e não digitado à mão: calendário com
  // o dia na coluna errada é o tipo de detalhe que denuncia uma maquete.
  const semanas = React.useMemo(() => montarMes(2026, 6), [])

  return (
    <aside className="flex flex-col rounded-xl border border-[#E1E4EA] bg-white p-3 shadow-[0_1px_2px_rgba(26,31,40,0.06)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6B7280]">
        Calendário de viagens
      </h3>

      <div className="mt-2.5 flex items-center justify-between">
        <ChevronLeft className="h-4 w-4 text-[#6B7280]" />
        <span className="font-display text-[13px] font-semibold text-[#1A1F28] dark:text-white">
          Julho 2026
        </span>
        <ChevronRight className="h-4 w-4 text-[#6B7280]" />
      </div>

      <table className="mt-2 w-full border-separate border-spacing-y-1 text-center">
        <thead>
          <tr>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <th key={d} className="pb-1 text-[10px] font-medium text-[#6B7280]">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana, i) => (
            <tr key={i}>
              {semana.map((dia, j) => (
                <td key={j} className="align-top">
                  {dia === null ? (
                    <span className="block h-7" />
                  ) : (
                    <span
                      className={cn(
                        'mx-auto flex h-7 w-7 flex-col items-center justify-center rounded-lg text-[11px] tabular-nums',
                        dia === DIA_SELECIONADO
                          ? 'bg-[#FF5100] font-semibold text-white'
                          : 'text-[#1A1F28] dark:text-slate-200',
                      )}
                    >
                      {dia}
                      <span className="mt-0.5 flex gap-0.5">
                        {(MARCADOS[dia] ?? []).map((cor, k) => (
                          <span
                            key={k}
                            className="h-[3px] w-[6px] rounded-full"
                            style={{
                              backgroundColor: dia === DIA_SELECIONADO ? 'rgba(255,255,255,0.85)' : cor,
                            }}
                          />
                        ))}
                      </span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-3 space-y-1 border-t border-[#E1E4EA] pt-2.5 dark:border-[var(--border-dark)]">
        {LEGENDA.map((l) => (
          <li key={l.rotulo} className="flex items-center gap-2 text-[11px] text-[#6B7280]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.cor }} />
            {l.rotulo}
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Semanas do mês começando na SEGUNDA (a semana da operação, não a do
 *  domingo). `null` preenche os dias fora do mês. */
function montarMes(ano: number, mes: number): (number | null)[][] {
  const primeiro = new Date(ano, mes, 1)
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  // getDay(): 0 = domingo. Segunda vira 0, domingo vira 6.
  const deslocamento = (primeiro.getDay() + 6) % 7

  const celulas: (number | null)[] = [
    ...Array.from({ length: deslocamento }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ]
  while (celulas.length % 7 !== 0) celulas.push(null)

  const semanas: (number | null)[][] = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
  return semanas
}
