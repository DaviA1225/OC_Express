import { cn } from '@/lib/utils'
import { horaCurta } from './agendamento'
import type { SlotOcupacao } from './useAgendamentos'

interface Props {
  slots: SlotOcupacao[]
  /** `HH:MM:SS`, como o banco devolve. `null` = qualquer horário. */
  value: string | null
  onChange: (hora: string | null) => void
  isLoading?: boolean
}

/**
 * Grade de horários do terminal: você toca no horário, não digita. Só aparecem
 * os horários que o terminal realmente atende — nove no TCI, três na A.B.
 *
 * A contagem embaixo de cada botão é honesta de propósito: são os veículos da
 * LHG já agendados ali, não a vaga do terminal, que o SisLog não enxerga.
 */
export function GradeSlots({ slots, value, onChange, isLoading = false }: Props) {
  if (isLoading) {
    return <p className="py-2 text-[12px] text-muted-foreground">Carregando horários…</p>
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
        Este terminal não tem horários fixos cadastrados. Deixe a data e a equipe escolhe o
        horário disponível.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <SlotButton selecionado={value === null} onClick={() => onChange(null)} titulo="Qualquer" />
        {slots.map((s) => (
          <SlotButton
            key={s.hora}
            selecionado={value === s.hora}
            onClick={() => onChange(s.hora)}
            titulo={horaCurta(s.hora)}
            rodape={s.capacidade != null ? `${s.ocupados}/${s.capacidade}` : String(s.ocupados)}
            cheio={s.capacidade != null && s.ocupados >= s.capacidade}
          />
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {legenda(slots)} A vaga final depende do terminal, que também atende outras
        transportadoras.
      </p>
    </div>
  )
}

function legenda(slots: SlotOcupacao[]): string {
  const total = slots.reduce((soma, s) => soma + s.ocupados, 0)
  if (total === 0) return 'Nenhum veículo nosso agendado nesta data.'
  if (total === 1) return '1 veículo nosso já agendado nesta data.'
  return `${total} veículos nossos já agendados nesta data.`
}

function SlotButton({
  selecionado,
  onClick,
  titulo,
  rodape,
  cheio = false,
}: {
  selecionado: boolean
  onClick: () => void
  titulo: string
  rodape?: string
  cheio?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionado}
      className={cn(
        'flex min-w-[64px] flex-col items-center rounded-md border px-3 py-2 text-[13px] font-medium tabular-nums transition-colors',
        selecionado
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
      )}
    >
      <span>{titulo}</span>
      {rodape && (
        <span
          className={cn(
            'text-[10px] font-normal',
            selecionado
              ? 'text-primary-foreground/80'
              : cheio
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground',
          )}
        >
          {rodape}
        </span>
      )}
    </button>
  )
}
