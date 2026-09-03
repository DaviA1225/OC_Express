import * as React from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Copy,
  Check,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
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
import { cn, formatTelefone } from '@/lib/utils'
import { registrarAcesso } from '@/lib/acesso'
import { GradeSlots } from '@/features/agendamentos/GradeSlots'
import { useOcupacaoSlots } from '@/features/agendamentos/useTerminais'
import {
  MAX_OBS_PARCEIRO_CHARS,
  dadosDoVeiculo,
  getDocumentoSignedUrl,
  nomeTerminal,
  useAgendamento,
  useConcluirAgendamento,
  useNotaFiscalAutomatica,
  useSalvarObservacaoParceiro,
  useUploadDocumento,
  type AgendamentoRow,
  type TipoDocumento,
} from '@/features/agendamentos/useAgendamentos'
import {
  dataCompleta,
  formatarCpf,
  horaCurta,
  mascararCpf,
  numeroAgendamento,
  tipoVeiculoLabel,
} from '@/features/agendamentos/agendamento'

interface Props {
  agendamentoId: string | null
  onOpenChange: (o: boolean) => void
}

/**
 * Painel de trabalho — aberto ao assumir um agendamento.
 *
 * O SisLog não conversa com o sistema do terminal. O que ele pode fazer é
 * preparar os dados para colar, que é onde nascem erro de placa e de nota, e
 * guardar o que foi confirmado. Mesma lógica do fluxo da OC.
 */
export function PainelAgendamento({ agendamentoId, onOpenChange }: Props) {
  const consulta = useAgendamento(agendamentoId)
  const row = consulta.data ?? null

  return (
    <Dialog open={!!agendamentoId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px]">
        {consulta.isLoading || !row ? (
          <>
            <DialogHeader>
              <DialogTitle>Agendamento</DialogTitle>
              <DialogDescription>Carregando…</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </DialogBody>
          </>
        ) : (
          <Conteudo row={row} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Conteudo({ row, onOpenChange }: { row: AgendamentoRow; onOpenChange: (o: boolean) => void }) {
  const dados = dadosDoVeiculo(row)
  const clienteId = row.solicitacao?.cliente_id ?? null

  const [dataAgendada, setDataAgendada] = React.useState(row.data_agendada ?? row.data_preferida)
  const [horaAgendada, setHoraAgendada] = React.useState<string | null>(
    row.hora_agendada ?? row.hora_preferida ?? null,
  )
  const [horaLivre, setHoraLivre] = React.useState(false)

  const ocupacao = useOcupacaoSlots(clienteId, dataAgendada)
  const nfAuto = useNotaFiscalAutomatica(row)
  const upload = useUploadDocumento()
  const concluir = useConcluirAgendamento()
  const salvarObs = useSalvarObservacaoParceiro()

  // Recado que a equipe manda junto com os documentos (0073). O valor salvo vive
  // na linha; o estado guarda só o que está sendo digitado.
  const [obsParceiro, setObsParceiro] = React.useState(row.observacoes_para_parceiro ?? '')
  const obsSalva = row.observacoes_para_parceiro ?? ''
  const obsAlterada = obsParceiro.trim() !== obsSalva.trim()

  // NF do módulo de Embarques. A importação é diária, então agendamento pedido
  // logo após o carregamento cai no caso manual — é o esperado, não um erro.
  const nfLocalizada = nfAuto.data?.disponivel === true && !!nfAuto.data.notaFiscal

  // O que a equipe digitou vence; enquanto não digitou nada, vale a NF do
  // embarque (que chega depois, assíncrona) ou a que já estava na linha.
  // Derivado em vez de copiado por efeito: assim o valor do Embarques nunca
  // sobrescreve o que alguém acabou de escrever.
  const [notaFiscalEditada, setNotaFiscalEditada] = React.useState<string | null>(null)
  const notaFiscal = notaFiscalEditada ?? row.nota_fiscal ?? (nfAuto.data?.notaFiscal || '')

  const slots = ocupacao.data ?? []

  // O tipo pedido decide qual grade vale. 06:00 existe na A.B, mas só para
  // graneleiro: uma caçamba confirmada ali está fora da grade DELA, e é assim
  // que o banco marca `hora_fora_da_grade` (0069). Pedido sem tipo vê a grade
  // inteira, com cada horário etiquetado.
  const tipoPedido = row.tipo_veiculo
  const slotsDoTipo =
    tipoPedido == null
      ? slots
      : slots.filter((s) => s.tipo_veiculo === 'todos' || s.tipo_veiculo === tipoPedido)
  const horaNaGrade = horaAgendada != null && slotsDoTipo.some((s) => s.hora === horaAgendada)
  const foraDaGrade = slots.length > 0 && horaAgendada != null && !horaNaGrade

  // Já concluído: o painel vira modo documentos. Serve para o contrato que
  // chegou depois e para trocar um arquivo errado, sem abrir caminho para
  // reescrever por cima uma janela que o terminal já confirmou.
  const concluido = row.status === 'agendado'

  // O parceiro pode cancelar a qualquer momento (0065), inclusive com este
  // painel aberto — o realtime traz o novo status. Sem isto, o botão Concluir
  // seguiria ali e o banco devolveria "transicao invalida", um erro que não
  // explica nada a quem estava no meio do trabalho.
  const encerrado = row.status === 'cancelado' || row.status === 'substituido'

  // Os caminhos vêm da linha, não de estado local: o upload já os gravou, e a
  // query revalida. Comprovante e contrato são obrigatórios — o CHECK do banco
  // recusaria de todo jeito, mas o botão explica antes em vez de dar erro.
  const faltando: string[] = []
  if (!dataAgendada) faltando.push('data')
  if (!horaAgendada) faltando.push('hora')
  if (!row.comprovante_path) faltando.push('comprovante')
  if (!row.contrato_frete_path) faltando.push('contrato de frete')
  const podeConcluir = faltando.length === 0 && !concluir.isPending

  async function enviar(tipo: TipoDocumento, file: File | null | undefined) {
    if (!file) return
    await upload.mutateAsync({ agendamentoId: row.id, tipo, file })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] text-muted-foreground">
            {numeroAgendamento(row.numero_interno)}
          </span>
          {nomeTerminal(row)}
        </DialogTitle>
        <DialogDescription>
          {row.parceiro?.razao_social ?? 'Solicitação interna'} · Solicitação #
          {row.solicitacao?.numero_interno ?? '—'} · Pediu {dataCompleta(row.data_preferida)}
          {row.hora_preferida ? ` às ${horaCurta(row.hora_preferida)}` : ' (qualquer horário)'}
          {tipoVeiculoLabel(row.tipo_veiculo) && ` · ${tipoVeiculoLabel(row.tipo_veiculo)}`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {encerrado && (
          <p className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {row.status === 'cancelado'
              ? 'Este agendamento foi cancelado. Se você já tinha confirmado a janela no sistema do terminal, desmarque lá — o SisLog não fala com ele.'
              : 'Este agendamento foi substituído por um reagendamento. O pedido novo está na fila.'}
          </p>
        )}

        {row.observacoes && (
          <p className="rounded-md border bg-card px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Observação do solicitante: </span>
            {row.observacoes}
          </p>
        )}

        {row.solicitacao?.cliente?.observacoes_agendamento && (
          <p className="rounded-md border bg-card px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Regra do terminal: </span>
            {row.solicitacao.cliente.observacoes_agendamento}
          </p>
        )}

        <section className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
            Dados para o terminal
          </Label>
          <div className="divide-y rounded-lg border">
            <LinhaCopiavel rotulo="Placa cavalo" valor={dados.placaCavalo} />
            <LinhaCopiavel rotulo="Placa carreta" valor={dados.placaCarreta} />
            {dados.placaPrimeiraCarreta && (
              <LinhaCopiavel rotulo="1ª carreta" valor={dados.placaPrimeiraCarreta} />
            )}
            {dados.placaDolly && <LinhaCopiavel rotulo="Dolly" valor={dados.placaDolly} />}
            {tipoVeiculoLabel(row.tipo_veiculo) && (
              <LinhaCopiavel rotulo="Tipo de veículo" valor={tipoVeiculoLabel(row.tipo_veiculo)} />
            )}
            <LinhaCopiavel rotulo="Nota fiscal" valor={notaFiscal || null} />
            <LinhaCopiavel rotulo="Motorista" valor={dados.motoristaNome} />
            {/* Sem máscara, diferente do CPF: o telefone já aparece aberto na
                solicitação e no envio por WhatsApp — escondê-lo só aqui seria
                inconsistente sem proteger nada. */}
            <LinhaCopiavel
              rotulo="Telefone"
              valor={dados.motoristaTelefone ? formatTelefone(dados.motoristaTelefone) : null}
            />
            <LinhaCopiavel
              rotulo="CPF"
              valor={formatarCpf(dados.motoristaCpf)}
              exibicao={mascararCpf(dados.motoristaCpf)}
              onCopiar={() => registrarAcesso('copiar_cpf', row.id, { origem: 'painel_agendamento' })}
            />
            {nfAuto.data?.pesoLiquido != null && (
              <LinhaCopiavel
                rotulo="Peso"
                valor={String(nfAuto.data.pesoLiquido).replace('.', ',')}
                exibicao={`${nfAuto.data.pesoLiquido.toLocaleString('pt-BR')} t`}
              />
            )}
            {row.solicitacao?.numero_instrucao && (
              <LinhaCopiavel rotulo="Instrução" valor={row.solicitacao.numero_instrucao} />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            O CPF só aparece por inteiro no que é copiado, e o acesso fica registrado.
          </p>
        </section>

        <section className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="nota_fiscal" className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
              Nota fiscal
            </Label>
            {/* Três estados, não dois: o parceiro agora pode informar o número
                ao pedir (0068). Sem esta distinção, um agendamento que já veio
                com a nota mostraria "Buscar no Corporate" ao lado do número —
                mandando procurar o que já está na tela. */}
            {nfLocalizada ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                NF localizada
              </span>
            ) : row.nota_fiscal ? (
              <span className="inline-flex items-center gap-1 rounded-full cat-steel px-2 py-0.5 text-[11px] font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Informada pelo parceiro
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                Buscar no Corporate
              </span>
            )}
          </div>
          <Input
            id="nota_fiscal"
            value={notaFiscal}
            onChange={(e) => setNotaFiscalEditada(e.target.value)}
            placeholder="Ex.: 6/254215"
            readOnly={concluido || encerrado}
            className={concluido || encerrado ? 'bg-muted text-muted-foreground' : undefined}
          />
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-3">
          <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
            Confirmação do terminal
          </Label>

          {/* Já concluído: data e hora viram leitura. Trocar a janela de um
              agendamento confirmado é reagendar — cria linha nova e encadeia o
              histórico —, não editar por cima. Aqui só os documentos seguem
              abertos, que é o caso de um contrato que chegou depois. */}
          {concluido || encerrado ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {dataCompleta(row.data_agendada)} às {horaCurta(row.hora_agendada)}
              </span>
              {row.hora_fora_da_grade && (
                <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  fora da grade
                </span>
              )}
              <span className="text-[12px] text-muted-foreground">
                Para mudar a janela, use Reagendar.
              </span>
            </div>
          ) : (
          <div className="grid grid-cols-[180px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="data_agendada">Data agendada *</Label>
              <Input
                id="data_agendada"
                type="date"
                value={dataAgendada}
                onChange={(e) => setDataAgendada(e.target.value)}
              />
              {dataAgendada !== row.data_preferida && (
                <p className="text-[11px] text-muted-foreground">
                  Diferente do pedido ({dataCompleta(row.data_preferida)}). É rotina — o portal
                  mostra os dois lado a lado.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Hora agendada *</Label>
              {horaLivre ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-[120px]"
                    value={horaAgendada ? horaAgendada.slice(0, 5) : ''}
                    onChange={(e) => setHoraAgendada(e.target.value ? `${e.target.value}:00` : null)}
                  />
                  <button
                    type="button"
                    className="text-[11px] text-primary-strong underline-offset-2 hover:underline"
                    onClick={() => setHoraLivre(false)}
                  >
                    voltar à grade
                  </button>
                </div>
              ) : (
                <>
                  <GradeSlots
                    slots={slots}
                    value={horaAgendada}
                    onChange={setHoraAgendada}
                    tipo={tipoPedido}
                    mostrarOcupacao
                    isLoading={ocupacao.isLoading}
                  />
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => setHoraLivre(true)}
                  >
                    outro horário
                  </button>
                </>
              )}
              {foraDaGrade && (
                <p className="inline-flex items-start gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Este horário não existe na grade do terminal. Dá para concluir assim mesmo —
                  o comprovante é a prova final —, e a exceção fica registrada.
                </p>
              )}
            </div>
          </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <CampoArquivo
              id="comprovante"
              rotulo="Comprovante (PDF) *"
              path={row.comprovante_path}
              enviando={upload.isPending}
              desabilitado={encerrado}
              onArquivo={(f) => void enviar('comprovante', f)}
            />
            <CampoArquivo
              id="contrato_frete"
              rotulo="Contrato de frete *"
              path={row.contrato_frete_path}
              enviando={upload.isPending}
              desabilitado={encerrado}
              onArquivo={(f) => void enviar('contrato', f)}
            />
            <CampoArquivo
              id="nf_pdf"
              rotulo="PDF da NF (opcional)"
              path={row.nf_pdf_path}
              enviando={upload.isPending}
              desabilitado={encerrado}
              onArquivo={(f) => void enviar('nf', f)}
            />
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {concluido
              ? 'O parceiro já vê estes documentos no portal. Trocar um arquivo aqui substitui o que ele baixa.'
              : 'O contrato de frete da Pamcard sai antes do comprovante do terminal, mas os dois só chegam ao parceiro na conclusão — ele recebe o pacote inteiro de uma vez.'}
          </p>

          {/* Recado que viaja com os documentos (0073). Fica depois dos anexos
              porque é isso que a operação faz: junta os PDFs e, se precisar,
              explica alguma coisa sobre aquela janela. O rótulo diz para QUEM o
              texto é — este campo não é bloco de anotação interna, e a linha
              inteira é legível pelo parceiro dono. */}
          <div className="space-y-1.5 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="observacoes_parceiro">Observação para o parceiro (opcional)</Label>
              {obsParceiro.length > MAX_OBS_PARCEIRO_CHARS - 200 && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {obsParceiro.length}/{MAX_OBS_PARCEIRO_CHARS}
                </span>
              )}
            </div>
            <Textarea
              id="observacoes_parceiro"
              value={obsParceiro}
              onChange={(e) => setObsParceiro(e.target.value.slice(0, MAX_OBS_PARCEIRO_CHARS))}
              maxLength={MAX_OBS_PARCEIRO_CHARS}
              rows={3}
              readOnly={encerrado}
              placeholder="Ex.: o terminal só recebe até 16h — chegar com 30 min de antecedência."
              className={encerrado ? 'bg-muted text-muted-foreground' : undefined}
            />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="max-w-[46ch] text-[11px] leading-relaxed text-muted-foreground">
                {concluido
                  ? 'O parceiro lê este texto no portal, ao lado do comprovante. Salvar publica na hora.'
                  : 'Chega ao parceiro junto com os documentos, na conclusão. Anotação que ele não pode ler não vai aqui.'}
              </p>
              {obsAlterada && !encerrado && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={salvarObs.isPending}
                  onClick={() => salvarObs.mutate({ id: row.id, texto: obsParceiro })}
                >
                  {salvarObs.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar observação
                </Button>
              )}
            </div>
          </div>
        </section>
      </DialogBody>

      <DialogFooter>
        <span className="text-[11px] text-muted-foreground/80">
          {concluido
            ? 'Documentos são salvos assim que você anexa.'
            : 'Concluir avisa o parceiro no portal.'}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!concluido && !encerrado && (
          <Button
            type="button"
            disabled={!podeConcluir}
            title={podeConcluir ? undefined : `Falta ${faltando.join(', ')} para concluir.`}
            onClick={async () => {
              if (!horaAgendada) return
              await concluir.mutateAsync({
                id: row.id,
                dataAgendada,
                horaAgendada,
                notaFiscal: notaFiscal.trim() || null,
                notaFiscalOrigem: notaFiscal.trim()
                  ? nfLocalizada && notaFiscal.trim() === nfAuto.data?.notaFiscal
                    ? 'automatica'
                    : 'manual'
                  : null,
                // Vai na mesma escrita: quem digitou o recado e clicou direto em
                // Concluir não pode perder o texto por não ter salvado antes.
                observacoesParaParceiro: obsParceiro.trim() || null,
              })
              onOpenChange(false)
            }}
          >
            {concluir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Concluir agendamento
          </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}

/** Uma linha do bloco de cópia. `exibicao` existe para o CPF: o que aparece na
 *  tela é mascarado, o que vai para a área de transferência é o valor cheio. */
function LinhaCopiavel({
  rotulo,
  valor,
  exibicao,
  onCopiar,
}: {
  rotulo: string
  valor: string | null
  exibicao?: string
  onCopiar?: () => void
}) {
  const [copiado, setCopiado] = React.useState(false)
  const vazio = !valor

  async function copiar() {
    if (!valor) return
    try {
      await navigator.clipboard.writeText(valor)
      onCopiar?.()
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1800)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-[104px] shrink-0 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
        {rotulo}
      </span>
      <span
        className={cn(
          'flex-1 truncate font-mono text-[13px]',
          vazio ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {exibicao ?? valor ?? '—'}
      </span>
      <button
        type="button"
        onClick={() => void copiar()}
        disabled={vazio}
        className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        aria-label={`Copiar ${rotulo}`}
        title={vazio ? 'Sem valor para copiar' : `Copiar ${rotulo}`}
      >
        {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function CampoArquivo({
  id,
  rotulo,
  path,
  enviando,
  desabilitado = false,
  onArquivo,
}: {
  id: string
  rotulo: string
  path: string | null
  enviando: boolean
  /** Agendamento encerrado: o que já está anexado continua abrindo, mas anexar
   *  ou trocar arquivo num pedido cancelado não leva a lugar nenhum. */
  desabilitado?: boolean
  onArquivo: (file: File | null) => void
}) {
  const [abrindo, setAbrindo] = React.useState(false)

  async function abrir() {
    if (!path) return
    setAbrindo(true)
    try {
      const url = await getDocumentoSignedUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Não foi possível abrir o arquivo.')
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {path ? (
        <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5">
          <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="flex-1 truncate text-[12px] text-foreground">Anexado</span>
          <button
            type="button"
            onClick={() => void abrir()}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Abrir arquivo"
            title="Abrir"
          >
            {abrindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
          </button>
          {!desabilitado && (
            <label
              htmlFor={id}
              className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              trocar
            </label>
          )}
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            'flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground',
            (enviando || desabilitado) && 'pointer-events-none opacity-60',
          )}
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {desabilitado ? 'Sem anexo' : 'Selecionar arquivo'}
        </label>
      )}
      <input
        id={id}
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        onChange={(e) => {
          onArquivo(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
    </div>
  )
}
