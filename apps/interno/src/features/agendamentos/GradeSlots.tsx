import { cn } from '@/lib/utils'
import { horaCurta } from './agendamento'
import type { SlotOcupacao } from './useTerminais'

interface Props {
  slots: SlotOcupacao[]
  /** `HH:MM:SS`, como o Postgres devolve. `null` = qualquer horário. */
  value: string | null
  onChange: (hora: string | null) => void
  /** Oferece o botão "qualquer horário" (pedido do parceiro, não confirmação). */
  permitirQualquer?: boolean
  /** Mostra a contagem da própria LHG no slot. Nunca é disponibilidade. */
  mostrarOcupacao?: boolean
  isLoading?: boolean
  disabled?: boolean
}

/**
 * Grade de slots do terminal: nove botões para o TCI, três para a A.B. Quem
 * escolhe toca no horário — não digita. Horário que não existe na grade não
 * aparece, e é assim que pedidos impossíveis (07:30 no TCI) somem na origem.
 */
export function GradeSlots({
  slots,
  value,
  onChange,
  permitirQualquer = false,
  mostrarOcupacao = false,
  isLoading = false,
  disabled = false,
}: Props) {
  if (isLoading) {
    return <p className="py-2 text-[12px] text-muted-foreground">Carregando horários…</p>
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
        Este terminal ainda não tem grade cadastrada. Qualquer horário é aceito até que
        a grade seja preenchida em Cadastros → Clientes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {permitirQualquer && (
          <SlotButton
            selecionado={value === null}
            onClick={() => onChange(null)}
            disabled={disabled}
            titulo="Qualquer"
          />
        )}
        {slots.map((s) => (
          <SlotButton
            key={s.hora}
            selecionado={value === s.hora}
            onClick={() => onChange(s.hora)}
            disabled={disabled}
            titulo={horaCurta(s.hora)}
            rodape={
              mostrarOcupacao
                ? s.capacidade != null
                  ? `${s.ocupados}/${s.capacidade}`
                  : String(s.ocupados)
                : undefined
            }
            cheio={mostrarOcupacao && s.capacidade != null && s.ocupados >= s.capacidade}
          />
        ))}
      </div>

      {mostrarOcupacao && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Os números são veículos <strong className="font-medium">nossos</strong> já
          agendados no horário. A vaga final depende do terminal, que também atende
          outras transportadoras.
        </p>
      )}
    </div>
  )
}

function SlotButton({
  selecionado,
  onClick,
  disabled,
  titulo,
  rodape,
  cheio = false,
}: {
  selecionado: boolean
  onClick: () => void
  disabled?: boolean
  titulo: string
  rodape?: string
  cheio?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selecionado}
      className={cn(
        'flex min-w-[62px] flex-col items-center rounded-md border px-2.5 py-1.5 text-[12px] font-medium tabular-nums transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        selecionado
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent',
      )}
    >
      <span>{titulo}</span>
      {rodape && (
        <span
          className={cn(
            'text-[10px] font-normal',
            selecionado ? 'text-primary-foreground/80' : cheio ? 'text-amber-700' : 'text-muted-foreground',
          )}
        >
          {rodape}
        </span>
      )}
    </button>
  )
}
