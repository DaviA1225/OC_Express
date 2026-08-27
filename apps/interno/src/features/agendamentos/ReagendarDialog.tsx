import * as React from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GradeSlots } from '@/features/agendamentos/GradeSlots'
import { useOcupacaoSlots } from '@/features/agendamentos/useTerminais'
import { useReagendarAgendamento, type AgendamentoRow } from '@/features/agendamentos/useAgendamentos'
import {
  dataCompleta,
  dataMinima,
  horaCurta,
  numeroAgendamento,
} from '@/features/agendamentos/agendamento'

interface Props {
  agendamento: AgendamentoRow | null
  onOpenChange: (o: boolean) => void
}

/**
 * Reagendar não sobrescreve: o agendamento atual vira `substituido` e nasce um
 * novo pedido em `solicitado`, encadeado pelo anterior. O histórico fica
 * visível nos dois lados — quem olhar amanhã vê que houve troca e por quê.
 */
export function ReagendarDialog({ agendamento, onOpenChange }: Props) {
  return (
    <Dialog open={!!agendamento} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        {/* Remonta a cada agendamento: o estado nasce da linha, sem efeito que
            copie prop para estado. */}
        {agendamento && (
          <Conteudo key={agendamento.id} agendamento={agendamento} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Conteudo({
  agendamento,
  onOpenChange,
}: {
  agendamento: AgendamentoRow
  onOpenChange: (o: boolean) => void
}) {
  const reagendar = useReagendarAgendamento()
  const clienteId = agendamento.solicitacao?.cliente_id ?? null
  const antecedencia = agendamento.solicitacao?.cliente?.antecedencia_minima_horas ?? null

  const [novaData, setNovaData] = React.useState(
    agendamento.data_agendada ?? agendamento.data_preferida,
  )
  const [novaHora, setNovaHora] = React.useState<string | null>(
    agendamento.hora_agendada ?? agendamento.hora_preferida ?? null,
  )
  const [motivo, setMotivo] = React.useState('')

  const ocupacao = useOcupacaoSlots(clienteId, novaData || null)
  const minimo = dataMinima(antecedencia)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reagendar</DialogTitle>
        <DialogDescription>
          {`${numeroAgendamento(agendamento.numero_interno)} · hoje em ${dataCompleta(agendamento.data_agendada)} às ${horaCurta(agendamento.hora_agendada)}`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="motivo_reagendamento">Motivo</Label>
          <Textarea
            id="motivo_reagendamento"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: terminal cancelou a janela; veículo quebrou na estrada."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nova_data">Nova data desejada *</Label>
          <Input
            id="nova_data"
            type="date"
            className="w-[180px]"
            min={minimo}
            value={novaData}
            onChange={(e) => setNovaData(e.target.value)}
          />
          {antecedencia != null && (
            <p className="text-[11px] text-muted-foreground">
              Este terminal exige {antecedencia}h de antecedência.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Horário desejado</Label>
          <GradeSlots
            slots={ocupacao.data ?? []}
            value={novaHora}
            onChange={setNovaHora}
            permitirQualquer
            mostrarOcupacao
            isLoading={ocupacao.isLoading}
          />
        </div>

        <p className="rounded-md border bg-card px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          O agendamento atual passa a constar como reagendado e o novo pedido entra na fila
          para ser confirmado no sistema do terminal.
        </p>
      </DialogBody>

      <DialogFooter>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!novaData || reagendar.isPending}
            onClick={async () => {
              await reagendar.mutateAsync({
                id: agendamento.id,
                motivo: motivo.trim(),
                novaData,
                novaHora,
              })
              onOpenChange(false)
            }}
          >
            {reagendar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reagendar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
