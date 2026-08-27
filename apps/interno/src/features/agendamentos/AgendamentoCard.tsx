import * as React from 'react'
import { toast } from 'sonner'
import { CalendarClock, Loader2, FileText, AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { GradeSlots } from './GradeSlots'
import { PainelAgendamento } from './PainelAgendamento'
import { ReagendarDialog } from './ReagendarDialog'
import { useOcupacaoSlots, useTerminais } from './useTerminais'
import {
  getDocumentoSignedUrl,
  useAgendamentosDaSolicitacao,
  useAssumirAgendamento,
  useCriarAgendamentoInterno,
  type AgendamentoRow,
} from './useAgendamentos'
import {
  AGENDAMENTO_STATUS_CLASSES,
  AGENDAMENTO_STATUS_LABELS,
  dataCompleta,
  dataMinima,
  horaCurta,
  numeroAgendamento,
} from './agendamento'
import type { SolicitacaoStatus } from '@/types/database.types'

/** A NF nasce no carregamento, então o agendamento é evento POSTERIOR à saída
 *  da carga. Antes da OC enviada não há nota para levar ao terminal. */
const STATUS_COM_CARGA_NA_RUA: SolicitacaoStatus[] = ['oc_enviada', 'finalizada']

interface Props {
  solicitacaoId: string
  clienteId: string | null
  status: SolicitacaoStatus
}

/**
 * Card de agendamento na solicitação, lado interno. Aparece só para cliente que
 * exige agendamento — nos demais não haveria o que mostrar.
 *
 * A criação por aqui atende o caso do motorista que manda WhatsApp direto para
 * a equipe, sem passar pelo portal (SPEC-AGENDAMENTOS, questão 6).
 */
export function AgendamentoCard({ solicitacaoId, clienteId, status }: Props) {
  const terminais = useTerminais()
  const terminal = (terminais.data ?? []).find((t) => t.id === clienteId)
  const lista = useAgendamentosDaSolicitacao(terminal ? solicitacaoId : null)
  const assumir = useAssumirAgendamento()

  const [novo, setNovo] = React.useState(false)
  const [painelId, setPainelId] = React.useState<string | null>(null)
  const [reagendar, setReagendar] = React.useState<AgendamentoRow | null>(null)

  if (!terminal) return null

  const itens = lista.data ?? []
  const ativo = itens.find((a) => ['solicitado', 'em_andamento', 'agendado'].includes(a.status))
  const cargaNaRua = STATUS_COM_CARGA_NA_RUA.includes(status)

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Agendamento
        </h2>
        {!ativo && cargaNaRua && (
          <Button size="sm" variant="outline" onClick={() => setNovo(true)}>
            Registrar pedido
          </Button>
        )}
      </div>

      <div className="space-y-2 p-4">
        <p className="text-[12px] text-muted-foreground">
          {terminal.terminal_nome?.trim() || terminal.razao_social}
          {terminal.antecedencia_minima_horas != null && (
            <> · exige {terminal.antecedencia_minima_horas}h de antecedência</>
          )}
        </p>

        {lista.isLoading ? (
          <p className="text-[12px] text-muted-foreground">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {cargaNaRua
              ? 'Nenhum agendamento pedido ainda. O parceiro pode pedir pelo portal, ou a equipe registra aqui o que chegou por WhatsApp.'
              : 'O pedido de agendamento só é liberado depois que a OC é enviada — a nota fiscal nasce no carregamento.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {itens.map((a) => (
              <li key={a.id} className="rounded-md border bg-background p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {numeroAgendamento(a.numero_interno)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      AGENDAMENTO_STATUS_CLASSES[a.status],
                    )}
                  >
                    {AGENDAMENTO_STATUS_LABELS[a.status]}
                  </span>
                </div>

                <dl className="mt-1.5 space-y-0.5 text-[12px]">
                  <div className="flex gap-2">
                    <dt className="w-[64px] shrink-0 text-muted-foreground">Pediu</dt>
                    <dd className="tabular-nums text-foreground">
                      {dataCompleta(a.data_preferida)}
                      {a.hora_preferida ? ` · ${horaCurta(a.hora_preferida)}` : ' · qualquer horário'}
                    </dd>
                  </div>
                  {a.status === 'agendado' && (
                    <div className="flex gap-2">
                      <dt className="w-[64px] shrink-0 text-muted-foreground">Agendado</dt>
                      <dd className="tabular-nums text-foreground">
                        {dataCompleta(a.data_agendada)} · {horaCurta(a.hora_agendada)}
                        {a.hora_fora_da_grade && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            fora da grade
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                  {a.motivo_reagendamento && (
                    <div className="flex gap-2">
                      <dt className="w-[64px] shrink-0 text-muted-foreground">Motivo</dt>
                      <dd className="text-foreground">{a.motivo_reagendamento}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {a.comprovante_path && <LinkDocumento path={a.comprovante_path} rotulo="Comprovante" />}
                  {a.contrato_frete_path && (
                    <LinkDocumento path={a.contrato_frete_path} rotulo="Contrato de frete" />
                  )}
                  {a.nf_pdf_path && <LinkDocumento path={a.nf_pdf_path} rotulo="PDF da NF" />}
                  {/* Assumir antes de abrir: concluir exige o agendamento em
                      'em_andamento', e é a trava que evita duas pessoas
                      agendando a mesma nota no sistema do terminal. */}
                  {a.status === 'solicitado' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={assumir.isPending}
                      onClick={async () => {
                        await assumir.mutateAsync(a.id)
                        setPainelId(a.id)
                      }}
                    >
                      Assumir e agendar
                    </Button>
                  )}
                  {a.status === 'em_andamento' && (
                    <Button size="sm" variant="outline" onClick={() => setPainelId(a.id)}>
                      Abrir painel
                    </Button>
                  )}
                  {a.status === 'agendado' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPainelId(a.id)}>
                        Documentos
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReagendar(a)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reagendar
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NovoAgendamentoDialog
        open={novo}
        onOpenChange={setNovo}
        solicitacaoId={solicitacaoId}
        clienteId={clienteId}
        antecedencia={terminal.antecedencia_minima_horas}
      />
      <PainelAgendamento agendamentoId={painelId} onOpenChange={(o) => !o && setPainelId(null)} />
      <ReagendarDialog agendamento={reagendar} onOpenChange={(o) => !o && setReagendar(null)} />
    </section>
  )
}

function LinkDocumento({ path, rotulo }: { path: string; rotulo: string }) {
  const [abrindo, setAbrindo] = React.useState(false)
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-primary-strong underline-offset-2 hover:underline"
      onClick={async () => {
        setAbrindo(true)
        try {
          const url = await getDocumentoSignedUrl(path)
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch {
          toast.error('Não foi possível abrir o arquivo.')
        } finally {
          setAbrindo(false)
        }
      }}
    >
      {abrindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
      {rotulo}
    </button>
  )
}

function NovoAgendamentoDialog({
  open,
  onOpenChange,
  solicitacaoId,
  clienteId,
  antecedencia,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  solicitacaoId: string
  clienteId: string | null
  antecedencia: number | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        {/* Só monta quando abre: o formulário nasce em branco a cada abertura,
            sem efeito de reset. */}
        {open && (
          <NovoAgendamentoForm
            onOpenChange={onOpenChange}
            solicitacaoId={solicitacaoId}
            clienteId={clienteId}
            antecedencia={antecedencia}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function NovoAgendamentoForm({
  onOpenChange,
  solicitacaoId,
  clienteId,
  antecedencia,
}: {
  onOpenChange: (o: boolean) => void
  solicitacaoId: string
  clienteId: string | null
  antecedencia: number | null
}) {
  const criar = useCriarAgendamentoInterno()
  const minimo = dataMinima(antecedencia)
  const [data, setData] = React.useState(minimo)
  const [hora, setHora] = React.useState<string | null>(null)
  const [observacoes, setObservacoes] = React.useState('')

  const ocupacao = useOcupacaoSlots(clienteId, data || null)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar pedido de agendamento</DialogTitle>
        <DialogDescription>
          Para o motorista que pediu por WhatsApp. O card entra na fila como qualquer
          outro pedido.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="data_preferida">Data desejada *</Label>
          <Input
            id="data_preferida"
            type="date"
            className="w-[180px]"
            min={minimo}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Horário desejado</Label>
          <GradeSlots
            slots={ocupacao.data ?? []}
            value={hora}
            onChange={setHora}
            permitirQualquer
            mostrarOcupacao
            isLoading={ocupacao.isLoading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="obs_pedido">Observações</Label>
          <Textarea
            id="obs_pedido"
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="O que o motorista informou."
          />
        </div>
      </DialogBody>

      <DialogFooter>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!data || criar.isPending}
            onClick={async () => {
              await criar.mutateAsync({
                solicitacaoId,
                dataPreferida: data,
                horaPreferida: hora,
                observacoes: observacoes.trim() || null,
              })
              onOpenChange(false)
            }}
          >
            {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
