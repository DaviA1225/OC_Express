import * as React from 'react'
import { toast } from 'sonner'
import {
  CalendarClock,
  Loader2,
  Download,
  RotateCcw,
  X,
  AlertTriangle,
} from 'lucide-react'
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import { GradeSlots } from './GradeSlots'
import {
  getDocumentoUrl,
  useAgendamentosDaSolicitacao,
  useCancelarAgendamento,
  useReagendar,
  useSlotsDoTerminal,
  useSolicitarAgendamento,
  type Agendamento,
} from './useAgendamentos'
import {
  AGENDAMENTO_STATUS_CLASSES,
  AGENDAMENTO_STATUS_LABELS,
  TIPO_VEICULO_ESCOLHA,
  dataCompleta,
  dataCurta,
  dataMinima,
  divergiu,
  horaCurta,
  numeroAgendamento,
  separaPorTipo,
  tipoVeiculoLabel,
  tiposDaGrade,
} from './agendamento'
import type {
  AgendamentoStatus,
  SolicitacaoStatus,
  TipoVeiculo,
  Views,
} from '@sislog/shared/types'

type ClientePublico = Views<'clientes_publicos'>

/** A nota fiscal nasce no carregamento: antes da OC enviada não há nota para
 *  levar ao terminal, e o pedido chegaria cedo demais. */
const STATUS_CARGA_NA_RUA: SolicitacaoStatus[] = ['oc_enviada', 'finalizada']

/** Estados vivos: o parceiro pode desistir em qualquer um deles (0065). Quem
 *  desiste da carga é ele, e manter de pé um pedido abandonado é que faria o
 *  SisLog mentir — a equipe seguiria tocando uma janela que ninguém vai usar. */
const CANCELAVEIS: AgendamentoStatus[] = ['solicitado', 'em_andamento', 'agendado']

interface Props {
  solicitacaoId: string
  status: SolicitacaoStatus
  cliente: ClientePublico | null
}

/**
 * Agendamento de descarga no portal: pedir, acompanhar e baixar o comprovante.
 *
 * Só aparece quando o destino exige agendamento. A divergência entre o que foi
 * pedido e o que foi confirmado é mostrada lado a lado — ela é rotina (agenda-se
 * na data disponível mais próxima), e esconder seria pior do que exibir.
 */
export function AgendamentoCard({ solicitacaoId, status, cliente }: Props) {
  const exige = cliente?.requer_agendamento === true
  const lista = useAgendamentosDaSolicitacao(exige ? solicitacaoId : null)
  const cancelar = useCancelarAgendamento()

  const [pedindo, setPedindo] = React.useState(false)
  const [reagendando, setReagendando] = React.useState<Agendamento | null>(null)
  const [confirmCancel, setConfirmCancel] = React.useState<Agendamento | null>(null)

  if (!exige) return null

  const itens = lista.data ?? []
  const ativo = itens.find((a) => ['solicitado', 'em_andamento', 'agendado'].includes(a.status))
  const cargaNaRua = STATUS_CARGA_NA_RUA.includes(status)
  const terminal = cliente?.terminal_nome?.trim() || cliente?.razao_social || 'terminal'

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Agendamento de descarga
        </h2>
        {!ativo && cargaNaRua && (
          <Button onClick={() => setPedindo(true)}>Solicitar agendamento</Button>
        )}
      </header>

      <div className="space-y-3 px-5 py-4">
        <p className="text-[12px] text-muted-foreground">
          A descarga em {terminal} exige agendamento prévio.
          {cliente?.antecedencia_minima_horas != null && (
            <> Este terminal exige {cliente.antecedencia_minima_horas}h de antecedência.</>
          )}
        </p>

        {lista.isLoading ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {cargaNaRua
              ? 'Nenhum agendamento pedido ainda. Informe a data desejada e a equipe da LHG agenda no terminal.'
              : 'O pedido é liberado assim que a OC for enviada — a nota fiscal só existe depois do carregamento.'}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {itens.map((a) => (
              <li key={a.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      AGENDAMENTO_STATUS_CLASSES[a.status],
                    )}
                  >
                    {AGENDAMENTO_STATUS_LABELS[a.status]}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {numeroAgendamento(a.numero_interno)}
                  </span>
                </div>

                {a.status === 'agendado' ? (
                  <div className="mt-2 space-y-1 text-[13px]">
                    <div className="flex gap-3">
                      <span className="w-[72px] shrink-0 text-muted-foreground">Pediu</span>
                      <span className="tabular-nums text-muted-foreground">
                        {dataCurta(a.data_preferida)}
                        {a.hora_preferida ? ` · ${horaCurta(a.hora_preferida)}` : ' · qualquer horário'}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-[72px] shrink-0 text-muted-foreground">Agendado</span>
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          divergiu(a) ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {dataCompleta(a.data_agendada)} · {horaCurta(a.hora_agendada)}
                      </span>
                    </div>
                    {divergiu(a) && (
                      <p className="text-[12px] text-muted-foreground">
                        Não havia vaga na data pedida; ficou para a mais próxima disponível.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] tabular-nums text-foreground">
                    Pedido para {dataCompleta(a.data_preferida)}
                    {a.hora_preferida ? ` às ${horaCurta(a.hora_preferida)}` : ' (qualquer horário)'}
                  </p>
                )}

                {/* O tipo decide a grade: no terminal que separa, 13:00 de
                    caçamba e 13:00 de graneleiro são filas diferentes. */}
                {tipoVeiculoLabel(a.tipo_veiculo) && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">Veículo: </span>
                    {tipoVeiculoLabel(a.tipo_veiculo)}
                  </p>
                )}

                {a.nota_fiscal && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">Nota fiscal: </span>
                    <span className="tabular-nums">{a.nota_fiscal}</span>
                  </p>
                )}
                {a.observacoes && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{a.observacoes}</p>
                )}
                {a.motivo_reagendamento && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">Motivo: </span>
                    {a.motivo_reagendamento}
                  </p>
                )}

                {/* Recado que a equipe escreveu junto com os documentos (0073).
                    Aparece só em 'agendado', a mesma regra dos anexos: o pacote
                    chega inteiro. Vem destacado porque costuma ser condição da
                    descarga — horário de portaria, via impressa, portão. */}
                {a.status === 'agendado' && a.observacoes_para_parceiro && (
                  <p className="mt-2 rounded-md border border-primary/30 bg-background px-2.5 py-2 text-[12px] leading-relaxed text-foreground">
                    <span className="font-medium">Observação da LHG: </span>
                    {a.observacoes_para_parceiro}
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {/* Os arquivos são gravados na linha conforme a equipe anexa,
                      mas só aparecem aqui quando o agendamento é concluído: o
                      comprovante e o contrato chegam juntos, nunca em partes. */}
                  {a.status === 'agendado' && a.comprovante_path && (
                    <BotaoDocumento path={a.comprovante_path} rotulo="Baixar comprovante" />
                  )}
                  {a.status === 'agendado' && a.contrato_frete_path && (
                    <BotaoDocumento path={a.contrato_frete_path} rotulo="Baixar contrato de frete" />
                  )}
                  {a.status === 'agendado' && (
                    <Button variant="outline" size="sm" onClick={() => setReagendando(a)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reagendar
                    </Button>
                  )}
                  {CANCELAVEIS.includes(a.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmCancel(a)}
                      disabled={cancelar.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancelar agendamento
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PedidoDialog
        open={pedindo}
        onOpenChange={setPedindo}
        solicitacaoId={solicitacaoId}
        cliente={cliente}
      />

      <PedidoDialog
        open={!!reagendando}
        onOpenChange={(o) => !o && setReagendando(null)}
        solicitacaoId={solicitacaoId}
        cliente={cliente}
        reagendarDe={reagendando}
      />

      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(o) => !o && setConfirmCancel(null)}
        title="Cancelar o agendamento?"
        description={confirmCancel ? textoCancelamento(confirmCancel) : ''}
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        destructive
        onConfirm={async () => {
          if (!confirmCancel) return
          await cancelar.mutateAsync({ id: confirmCancel.id, solicitacaoId })
          setConfirmCancel(null)
        }}
      />
    </section>
  )
}

/** O peso do cancelamento muda com o estado: desistir de um pedido que ainda
 *  está na fila não custa nada a ninguém; desistir de uma janela já confirmada
 *  obriga a equipe a desmarcar no sistema do terminal. O aviso precisa dizer
 *  isso — quem cancela é que sabe se vale a pena. */
function textoCancelamento(a: Agendamento): string {
  if (a.status === 'agendado') {
    return (
      `A descarga de ${dataCompleta(a.data_agendada)} às ${horaCurta(a.hora_agendada)} já está ` +
      'confirmada no terminal. Ao cancelar, a equipe da LHG precisa desmarcar a janela lá — ' +
      'e o comprovante deixa de valer. Se o veículo só vai atrasar, prefira Reagendar.'
    )
  }
  if (a.status === 'em_andamento') {
    return 'A equipe da LHG já está agendando este pedido no terminal. Ao cancelar, ela para o que está fazendo. Você pode pedir de novo depois.'
  }
  return 'O pedido sai da fila da equipe. Você pode pedir de novo depois.'
}

function BotaoDocumento({ path, rotulo }: { path: string; rotulo: string }) {
  const [abrindo, setAbrindo] = React.useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={abrindo}
      onClick={async () => {
        // Abre a aba ANTES do await (gesto do usuário), como no download da OC:
        // depois do await o bloqueador de pop-up derruba o window.open.
        const win = window.open('', '_blank')
        setAbrindo(true)
        try {
          const url = await getDocumentoUrl(path)
          if (win) win.location.href = url
          else window.location.href = url
        } catch {
          win?.close()
          toast.error('Não foi possível abrir o documento.')
        } finally {
          setAbrindo(false)
        }
      }}
    >
      {abrindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {rotulo}
    </Button>
  )
}

/** Um só diálogo para pedir e para reagendar: os campos são os mesmos, só muda
 *  a RPC e o motivo, que o reagendamento pede e o pedido novo não tem. */
function PedidoDialog({
  open,
  onOpenChange,
  solicitacaoId,
  cliente,
  reagendarDe = null,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  solicitacaoId: string
  cliente: ClientePublico | null
  reagendarDe?: Agendamento | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        {/* O formulário só monta quando o diálogo abre, e remonta quando muda o
            agendamento sendo reagendado: os campos nascem prontos, sem efeito
            copiando prop para estado. */}
        {open && (
          <Formulario
            key={reagendarDe?.id ?? 'novo'}
            onOpenChange={onOpenChange}
            solicitacaoId={solicitacaoId}
            cliente={cliente}
            reagendarDe={reagendarDe}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({
  onOpenChange,
  solicitacaoId,
  cliente,
  reagendarDe,
}: {
  onOpenChange: (o: boolean) => void
  solicitacaoId: string
  cliente: ClientePublico | null
  reagendarDe: Agendamento | null
}) {
  const solicitar = useSolicitarAgendamento()
  const reagendar = useReagendar()
  const antecedencia = cliente?.antecedencia_minima_horas ?? null
  const minimo = dataMinima(antecedencia)

  const [data, setData] = React.useState(minimo)
  const [hora, setHora] = React.useState<string | null>(reagendarDe?.hora_preferida ?? null)
  const [observacoes, setObservacoes] = React.useState('')
  const [notaFiscal, setNotaFiscal] = React.useState('')
  const [motivo, setMotivo] = React.useState('')

  const slots = useSlotsDoTerminal(cliente?.id ?? null, data || null)
  const enviando = solicitar.isPending || reagendar.isPending

  // A grade responde se este terminal separa horários por tipo de veículo — não
  // há campo no cliente para isso, e não precisa haver: basta um slot tipado.
  const grade = slots.data ?? []
  const separa = separaPorTipo(grade)
  const tipos = tiposDaGrade(grade)

  // Reagendar mantém o veículo: quem atrasou foi o mesmo caminhão, e a RPC
  // copia o tipo do agendamento anterior. Trocar de tipo é outro pedido.
  const tipoFixo = reagendarDe?.tipo_veiculo ?? null
  const [tipoEscolhido, setTipoEscolhido] = React.useState<TipoVeiculo | null>(tipoFixo)
  const tipo = reagendarDe ? tipoFixo : tipoEscolhido

  // Sem o tipo não dá para oferecer horário: na A.B, caçamba descarrega às 19h
  // e graneleiro não. Mostrar a grade inteira antes da escolha seria oferecer
  // horários que o terminal recusa.
  const faltaTipo = separa && tipo == null

  function escolherTipo(novo: TipoVeiculo) {
    setTipoEscolhido(novo)
    // A hora escolhida pertencia à grade do outro tipo. Mantê-la selecionada
    // enviaria um horário que não existe para o veículo agora escolhido.
    if (novo !== tipo) setHora(null)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{reagendarDe ? 'Reagendar descarga' : 'Solicitar agendamento'}</DialogTitle>
        <DialogDescription>
          {cliente?.terminal_nome?.trim() || cliente?.razao_social || 'Terminal'}
          {reagendarDe && (
            <> · hoje em {dataCompleta(reagendarDe.data_agendada)} às {horaCurta(reagendarDe.hora_agendada)}</>
          )}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {reagendarDe && (
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: o veículo atrasou na estrada."
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="data_desejada">Data desejada *</Label>
          <Input
            id="data_desejada"
            type="date"
            className="w-[180px]"
            min={minimo}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          {antecedencia != null && (
            <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              Este terminal exige {antecedencia}h de antecedência.
            </p>
          )}
        </div>

        {separa && (
          <div className="space-y-1.5">
            <Label>Tipo de veículo *</Label>
            {reagendarDe ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-[13px] text-foreground">
                {tipoVeiculoLabel(tipoFixo) ?? 'Não informado'}
                <span className="ml-1.5 text-[12px] text-muted-foreground">
                  — o mesmo do agendamento atual.
                </span>
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {tipos.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => escolherTipo(t)}
                      aria-pressed={tipo === t}
                      className={cn(
                        'rounded-md border px-3 py-2 text-[13px] font-medium transition-colors',
                        tipo === t
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
                      )}
                    >
                      {TIPO_VEICULO_ESCOLHA[t]}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Este terminal descarrega cada tipo em horários diferentes.
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Horário</Label>
          {faltaTipo ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
              Escolha o tipo de veículo para ver os horários deste terminal.
            </p>
          ) : (
            <GradeSlots
              slots={grade}
              value={hora}
              onChange={setHora}
              tipo={tipo}
              isLoading={slots.isLoading}
            />
          )}
        </div>

        {!reagendarDe && (
          <div className="space-y-1.5">
            <Label htmlFor="nota_fiscal_pedido">Número da nota fiscal</Label>
            <Input
              id="nota_fiscal_pedido"
              value={notaFiscal}
              onChange={(e) => setNotaFiscal(e.target.value)}
              placeholder="Ex.: 6/254215"
              maxLength={40}
              className="w-[220px]"
            />
            <p className="text-[12px] text-muted-foreground">
              Opcional. Se você já tem a nota em mãos, informar o número aqui poupa a equipe
              de procurá-la no Corporate.
            </p>
          </div>
        )}

        {!reagendarDe && (
          <div className="space-y-1.5">
            <Label htmlFor="observacoes_agendamento">Observações</Label>
            <Textarea
              id="observacoes_agendamento"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Algo que a equipe precise saber (opcional)."
            />
          </div>
        )}

        <p className="rounded-md border bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          Se não houver vaga na data desejada, agendamos para a data disponível mais próxima e
          avisamos aqui.
        </p>
      </DialogBody>

      <DialogFooter>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            type="button"
            // Enquanto a grade não chega não se sabe se o terminal separa por
            // tipo. Enviar aí levaria a uma recusa do banco por um campo que a
            // tela ainda nem mostrou.
            disabled={!data || faltaTipo || slots.isLoading || enviando}
            title={faltaTipo ? 'Escolha o tipo de veículo.' : undefined}
            onClick={async () => {
              if (reagendarDe) {
                await reagendar.mutateAsync({
                  id: reagendarDe.id,
                  solicitacaoId,
                  motivo: motivo.trim(),
                  novaData: data,
                  novaHora: hora,
                })
              } else {
                await solicitar.mutateAsync({
                  solicitacaoId,
                  dataPreferida: data,
                  horaPreferida: hora,
                  observacoes: observacoes.trim() || null,
                  notaFiscal: notaFiscal.trim() || null,
                  tipoVeiculo: tipo,
                })
              }
              onOpenChange(false)
            }}
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {reagendarDe ? 'Pedir reagendamento' : 'Enviar pedido'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
