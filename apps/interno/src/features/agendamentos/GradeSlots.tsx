import { cn } from '@/lib/utils'
import { horaCurta, TIPO_VEICULO_LABELS } from './agendamento'
import type { SlotOcupacao } from './useTerminais'
import type { TipoVeiculo } from '@/types/database.types'

interface Props {
  slots: SlotOcupacao[]
  /** `HH:MM:SS`, como o Postgres devolve. `null` = qualquer horário. */
  value: string | null
  onChange: (hora: string | null) => void
  /** Tipo de veículo do pedido. Filtra a grade onde o terminal separa horários
   *  por tipo (A.B/CSN). `null` mostra a grade inteira, com o tipo etiquetado
   *  em cada botão — é o caso do pedido que veio sem tipo informado. */
  tipo?: TipoVeiculo | null
  /** Oferece o botão "qualquer horário" (pedido do parceiro, não confirmação). */
  permitirQualquer?: boolean
  /** Mostra a contagem da própria LHG no slot. Nunca é disponibilidade. */
  mostrarOcupacao?: boolean
  isLoading?: boolean
  disabled?: boolean
}

/**
 * Grade de slots do terminal: nove botões para o TCI, cinco para a caçamba da
 * A.B. Quem escolhe toca no horário — não digita. Horário que não existe na
 * grade não aparece, e é assim que pedidos impossíveis (07:30 no TCI, ou 19:00
 * de graneleiro na A.B) somem na origem.
 */
export function GradeSlots({
  slots: todos,
  value,
  onChange,
  tipo = null,
  permitirQualquer = false,
  mostrarOcupacao = false,
  isLoading = false,
  disabled = false,
}: Props) {
  // Sem tipo definido a grade aparece inteira: o pedido registrado pela equipe
  // pode não ter tipo, e esconder metade dos horários seria pior do que
  // mostrá-los etiquetados.
  const slots = tipo == null ? todos : todos.filter((s) => s.tipo_veiculo === 'todos' || s.tipo_veiculo === tipo)
  const etiquetar = tipo == null && todos.some((s) => s.tipo_veiculo !== 'todos')

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
            key={`${s.hora}-${s.tipo_veiculo}`}
            selecionado={value === s.hora}
            onClick={() => onChange(s.hora)}
            disabled={disabled}
            titulo={horaCurta(s.hora)}
            rodape={rodapeDoSlot(s, { mostrarOcupacao, etiquetar })}
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

/** Linha de baixo do botão: a ocupação da LHG e, quando a grade inteira está à
 *  vista, de que tipo de veículo é aquele horário — sem isso os dois 13:00 da
 *  A.B ficariam indistinguíveis. */
function rodapeDoSlot(
  s: SlotOcupacao,
  { mostrarOcupacao, etiquetar }: { mostrarOcupacao: boolean; etiquetar: boolean },
): string | undefined {
  const partes: string[] = []
  if (etiquetar && s.tipo_veiculo !== 'todos') partes.push(TIPO_VEICULO_LABELS[s.tipo_veiculo])
  if (mostrarOcupacao) {
    partes.push(s.capacidade != null ? `${s.ocupados}/${s.capacidade}` : String(s.ocupados))
  }
  return partes.length > 0 ? partes.join(' · ') : undefined
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
