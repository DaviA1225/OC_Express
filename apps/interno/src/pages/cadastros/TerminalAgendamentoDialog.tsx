import * as React from 'react'
import { Loader2, Plus, Trash2, CalendarClock } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { TIPO_SLOT_LABELS, duracaoLegivel, horaCurta } from '@/features/agendamentos/agendamento'
import {
  useTerminalJanelas,
  useSalvarJanela,
  useRemoverJanela,
  useGerarGrade,
  gerarHorarios,
  MAX_SLOTS_GRADE,
} from '@/features/agendamentos/useTerminais'
import type { Tables, TipoVeiculoSlot } from '@/types/database.types'

type Cliente = Tables<'clientes'>

export interface TerminalValues {
  requer_agendamento: boolean
  terminal_nome: string | null
  antecedencia_minima_horas: number | null
  observacoes_agendamento: string | null
}

interface Props {
  row: Cliente | null
  onOpenChange: (o: boolean) => void
  onSubmit: (values: TerminalValues) => Promise<void>
}

/**
 * Configura o agendamento de um cliente: se exige, qual terminal, antecedência
 * e a grade de horários.
 *
 * A grade é salva na hora (tabela própria), os campos do cliente ao clicar em
 * Salvar. Separado de propósito: mexer num slot não deveria obrigar a confirmar
 * o formulário inteiro, e a grade é o que a equipe vai ajustar com frequência
 * enquanto confirma os números reais com cada terminal.
 */
export function TerminalAgendamentoDialog({ row, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        {/* `key` no cliente: cada cliente monta um formulário novo, com o estado
            já inicializado a partir da linha. Copiar prop para estado por efeito
            dispara renderização em cascata. */}
        {row && <Conteudo key={row.id} row={row} onOpenChange={onOpenChange} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function Conteudo({ row, onOpenChange, onSubmit }: { row: Cliente } & Omit<Props, 'row'>) {
  const [requer, setRequer] = React.useState(row.requer_agendamento)
  const [nome, setNome] = React.useState(row.terminal_nome ?? '')
  const [antecedencia, setAntecedencia] = React.useState(
    row.antecedencia_minima_horas != null ? String(row.antecedencia_minima_horas) : '',
  )
  const [observacoes, setObservacoes] = React.useState(row.observacoes_agendamento ?? '')
  const [salvando, setSalvando] = React.useState(false)

  const janelas = useTerminalJanelas(row.id)
  const salvarJanela = useSalvarJanela()
  const removerJanela = useRemoverJanela()
  const gerarGrade = useGerarGrade()

  const [novaHora, setNovaHora] = React.useState('')
  const [novoTipo, setNovoTipo] = React.useState<TipoVeiculoSlot>('todos')
  const [novaDuracao, setNovaDuracao] = React.useState('60')
  const [novaCapacidade, setNovaCapacidade] = React.useState('4')

  // Gerador: a faixa que o terminal informou ("das 7 às 18, de 30 em 30, 3
  // vagas") vira a grade inteira. Os valores iniciais são os do TCI, que é o
  // formato mais comum entre os terminais de hoje.
  const [gInicio, setGInicio] = React.useState('08:00')
  const [gFim, setGFim] = React.useState('17:00')
  const [gDuracao, setGDuracao] = React.useState('60')
  const [gCapacidade, setGCapacidade] = React.useState('4')
  const [gTipo, setGTipo] = React.useState<TipoVeiculoSlot>('todos')

  const lista = janelas.data ?? []
  const ativos = lista.filter((j) => j.ativo)
  const totalDia = ativos.reduce((soma, j) => soma + (j.capacidade ?? 0), 0)

  const duracaoGerada = Number(gDuracao) || 0
  const capacidadeGerada = gCapacidade ? Number(gCapacidade) : null
  const previa = gerarHorarios(gInicio, gFim, duracaoGerada)
  const excedeu = previa.length > MAX_SLOTS_GRADE
  // A chave e hora + tipo, como a UNIQUE da 0069: gerar a grade do graneleiro
  // num terminal que ja tem a da cacamba nao pode dizer "todas ja existem".
  const jaExistem = new Set(lista.map((j) => `${j.hora}|${j.tipo_veiculo}`))
  const ineditos = previa.filter((h) => !jaExistem.has(`${h}|${gTipo}`))

  // Fim real da última janela, e não o "Até" digitado: com duração que não
  // divide a faixa (07:00–18:00 de 50 em 50), a última termina antes. Repetir o
  // "Até" ali seria a tela afirmando algo que não vai acontecer.
  const fimDaUltima = React.useMemo(() => {
    if (previa.length === 0) return ''
    const [h, m] = previa[previa.length - 1].split(':').map(Number)
    const total = h * 60 + m + duracaoGerada
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }, [previa, duracaoGerada])

  async function adicionarSlot() {
    if (!novaHora) return
    await salvarJanela.mutateAsync({
      cliente_id: row.id,
      hora: novaHora.length === 5 ? `${novaHora}:00` : novaHora,
      tipo_veiculo: novoTipo,
      duracao_minutos: Number(novaDuracao) || 60,
      capacidade: novaCapacidade ? Number(novaCapacidade) : null,
    })
    setNovaHora('')
  }

  async function gerar() {
    if (ineditos.length === 0 || excedeu) return
    await gerarGrade.mutateAsync({
      clienteId: row.id,
      horas: ineditos,
      tipoVeiculo: gTipo,
      duracaoMinutos: duracaoGerada,
      capacidade: capacidadeGerada,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agendamento de descarga</DialogTitle>
        <DialogDescription>{row.razao_social}</DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div
          className={cn(
            'flex h-11 items-center justify-between rounded-md border px-3',
            requer ? 'border-primary/40 bg-accent' : 'bg-card',
          )}
        >
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Este cliente exige agendamento prévio
          </span>
          <Switch checked={requer} onCheckedChange={setRequer} aria-label="Exige agendamento" />
        </div>

        {!requer && (
          <p className="text-[11px] text-muted-foreground">
            Com o agendamento desligado, o botão não aparece no portal e a equipe não recebe
            pedidos deste cliente na fila.
          </p>
        )}

        {requer && (
          <>
            <div className="grid grid-cols-[1fr_160px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="terminal_nome">Nome do terminal</Label>
                <Input
                  id="terminal_nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: CSN Pindamonhangaba"
                />
                <p className="text-[11px] text-muted-foreground">
                  Como a equipe chama o destino. É o título do grupo na fila.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="antecedencia">Antecedência (h)</Label>
                <Input
                  id="antecedencia"
                  inputMode="numeric"
                  value={antecedencia}
                  onChange={(e) => setAntecedencia(e.target.value.replace(/\D/g, ''))}
                  placeholder="24"
                />
                <p className="text-[11px] text-muted-foreground">Vazio = sem regra.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs_agendamento">Observações do terminal</Label>
              <Textarea
                id="obs_agendamento"
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Regras que a equipe precisa lembrar na hora de agendar."
              />
            </div>

            <div className="space-y-2 rounded-lg border bg-card p-3">
              <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                Grade de horários
              </Label>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Um horário por linha. A capacidade é referência da LHG: a vaga final depende do
                sistema do terminal, que também atende outras transportadoras. Onde o terminal
                descarrega cada tipo de veículo num horário diferente, marque o tipo em cada
                linha — o portal passa a pedir o tipo antes de oferecer os horários.
              </p>

              <div className="space-y-2 rounded-md border border-dashed p-2.5">
                <p className="text-[11px] font-medium text-foreground">
                  Gerar a partir da faixa que o terminal informou
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="g_inicio" className="text-[11px]">Das</Label>
                    <Input
                      id="g_inicio"
                      type="time"
                      value={gInicio}
                      onChange={(e) => setGInicio(e.target.value)}
                      className="w-[110px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="g_fim" className="text-[11px]">Até</Label>
                    <Input
                      id="g_fim"
                      type="time"
                      value={gFim}
                      onChange={(e) => setGFim(e.target.value)}
                      className="w-[110px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="g_duracao" className="text-[11px]">Janelas de (min)</Label>
                    <Input
                      id="g_duracao"
                      inputMode="numeric"
                      value={gDuracao}
                      onChange={(e) => setGDuracao(e.target.value.replace(/\D/g, ''))}
                      className="w-[110px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="g_capacidade" className="text-[11px]">Vagas</Label>
                    <Input
                      id="g_capacidade"
                      inputMode="numeric"
                      value={gCapacidade}
                      onChange={(e) => setGCapacidade(e.target.value.replace(/\D/g, ''))}
                      className="w-[80px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Veículo</Label>
                    <SeletorTipo value={gTipo} onChange={setGTipo} aria-label="Tipo de veículo da grade gerada" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void gerar()}
                    disabled={ineditos.length === 0 || excedeu || gerarGrade.isPending}
                  >
                    {gerarGrade.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Gerar
                  </Button>
                </div>

                {/* Prévia ao vivo: "das 7 às 18" pode ser lido como última janela
                    às 17:30 ou às 18:00. Em vez de escolher por quem cadastra, a
                    tela mostra o que vai criar antes do clique. */}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {excedeu ? (
                    <span className="text-amber-700">
                      Mais de {MAX_SLOTS_GRADE} janelas nessa faixa. Confira a duração.
                    </span>
                  ) : previa.length === 0 ? (
                    <span className="text-amber-700">
                      Faixa inválida: o fim precisa ser depois do início e caber ao menos uma janela.
                    </span>
                  ) : (
                    <>
                      {previa.length} janela(s) · {horaCurta(previa[0])} às{' '}
                      {horaCurta(previa[previa.length - 1])}
                      {capacidadeGerada != null && (
                        <> · {previa.length * capacidadeGerada} veículos/dia</>
                      )}
                      {ineditos.length === 0
                        ? ' — todas já existem na grade.'
                        : ineditos.length < previa.length
                          ? ` — ${ineditos.length} seria(m) criada(s), o resto já existe.`
                          : ''}
                      {' '}A última termina às {fimDaUltima}.
                    </>
                  )}
                </p>
              </div>

              {janelas.isLoading ? (
                <p className="py-3 text-[12px] text-muted-foreground">Carregando grade…</p>
              ) : lista.length === 0 ? (
                <p className="py-3 text-[12px] text-muted-foreground">
                  Nenhum horário cadastrado. Use um dos padrões acima ou adicione manualmente —
                  sem grade, o portal aceita qualquer horário.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {lista.map((j) => (
                    <li
                      key={j.id}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 text-[12px]',
                        !j.ativo && 'opacity-50',
                      )}
                    >
                      <span className="w-14 font-medium tabular-nums text-foreground">
                        {horaCurta(j.hora)}
                      </span>
                      <span className="w-20 text-muted-foreground">
                        {TIPO_SLOT_LABELS[j.tipo_veiculo]}
                      </span>
                      <span className="w-16 tabular-nums text-muted-foreground">
                        {duracaoLegivel(j.duracao_minutos)}
                      </span>
                      <span className="flex-1 tabular-nums text-muted-foreground">
                        {j.capacidade != null ? `${j.capacidade} vagas` : 'sem limite'}
                      </span>
                      <Switch
                        checked={j.ativo}
                        onCheckedChange={(v) =>
                          void salvarJanela.mutateAsync({
                            id: j.id,
                            cliente_id: j.cliente_id,
                            hora: j.hora,
                            tipo_veiculo: j.tipo_veiculo,
                            duracao_minutos: j.duracao_minutos,
                            capacidade: j.capacidade,
                            ativo: v,
                          })
                        }
                        aria-label={`Ativar horário ${horaCurta(j.hora)} (${TIPO_SLOT_LABELS[j.tipo_veiculo]})`}
                      />
                      <button
                        type="button"
                        onClick={() => void removerJanela.mutateAsync(j.id)}
                        className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        aria-label={`Remover horário ${horaCurta(j.hora)} (${TIPO_SLOT_LABELS[j.tipo_veiculo]})`}
                        title="Remover da grade"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="nova_hora" className="text-[11px]">Horário</Label>
                  <Input
                    id="nova_hora"
                    type="time"
                    value={novaHora}
                    onChange={(e) => setNovaHora(e.target.value)}
                    className="w-[110px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nova_duracao" className="text-[11px]">Duração (min)</Label>
                  <Input
                    id="nova_duracao"
                    inputMode="numeric"
                    value={novaDuracao}
                    onChange={(e) => setNovaDuracao(e.target.value.replace(/\D/g, ''))}
                    className="w-[110px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nova_capacidade" className="text-[11px]">Vagas</Label>
                  <Input
                    id="nova_capacidade"
                    inputMode="numeric"
                    value={novaCapacidade}
                    onChange={(e) => setNovaCapacidade(e.target.value.replace(/\D/g, ''))}
                    className="w-[80px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Veículo</Label>
                  <SeletorTipo value={novoTipo} onChange={setNovoTipo} aria-label="Tipo de veículo do horário" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void adicionarSlot()}
                  disabled={!novaHora || salvarJanela.isPending}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              {ativos.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {ativos.length} horário(s) ativo(s)
                  {totalDia > 0 && <> · {totalDia} veículos/dia na conta da LHG</>}
                </p>
              )}
            </div>
          </>
        )}
      </DialogBody>

      <DialogFooter>
        <span className="text-[11px] text-muted-foreground/80">
          A grade é salva na hora; os campos acima, ao salvar.
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={salvando}
            onClick={async () => {
              setSalvando(true)
              try {
                await onSubmit({
                  requer_agendamento: requer,
                  terminal_nome: nome.trim() || null,
                  antecedencia_minima_horas: antecedencia ? Number(antecedencia) : null,
                  observacoes_agendamento: observacoes.trim() || null,
                })
              } finally {
                setSalvando(false)
              }
            }}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

/** Tipo de veículo do slot. 'Todos' é o padrão e o caso comum: só a A.B/CSN
 *  separa a grade por tipo hoje. */
function SeletorTipo({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: TipoVeiculoSlot
  onChange: (v: TipoVeiculoSlot) => void
  'aria-label': string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TipoVeiculoSlot)}>
      <SelectTrigger className="w-[130px]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(['todos', 'cacamba', 'graneleiro'] as TipoVeiculoSlot[]).map((t) => (
          <SelectItem key={t} value={t}>
            {TIPO_SLOT_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
