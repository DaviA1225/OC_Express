import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  Bot,
  Check,
  FileText,
  Hand,
  ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Search,
  Send,
  TriangleAlert,
  Undo2,
  Wrench,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { canAlterarModoAgente } from '@/features/auth/permissions'
import {
  urlDaMidia,
  useAgenteModo,
  useAprovarRascunho,
  useAssumirConversa,
  useConversa,
  useConversas,
  useDefinirModo,
  useDevolverAoAgente,
  useEnviarMensagem,
  useRejeitarRascunho,
  type AcaoAgente,
  type ConversaResumo,
  type MensagemAgente,
} from '@/features/agente/useConversas'
import type { AgenteModo } from '@/types/database.types'
import { cn } from '@/lib/utils'

/**
 * Conversas do WhatsApp atendidas pelo agente de IA (docs/SPEC-AGENTE-IA.md).
 *
 * É a mesa de controle do agente: a equipe acompanha o que ele está fazendo,
 * assume quando precisa, responde pelo sistema e — no modo sombra — decide os
 * rascunhos que ele deixou. Lista à esquerda, conversa à direita; em tela
 * estreita uma coisa de cada vez.
 */

type Filtro = 'todas' | 'humano' | 'rascunhos'

const MODOS: { valor: AgenteModo; rotulo: string; descricao: string }[] = [
  { valor: 'desligado', rotulo: 'Desligado', descricao: 'Mensagens ficam registradas; ninguém responde automaticamente.' },
  { valor: 'sombra', rotulo: 'Sombra', descricao: 'O agente lê e sugere, mas não envia nem grava no sistema.' },
  { valor: 'autonomo', rotulo: 'Autônomo', descricao: 'O agente atende sozinho e chama a equipe quando precisa.' },
]

const FERRAMENTAS: Record<string, string> = {
  cadastrar_motorista: 'Cadastrar motorista',
  cadastrar_subcontratada: 'Cadastrar subcontratada',
  cadastrar_cavalo: 'Cadastrar cavalo',
  cadastrar_carreta: 'Cadastrar carreta',
  criar_solicitacao: 'Criar solicitação',
  transferir_para_humano: 'Chamou a equipe',
}

function telefoneFmt(t: string): string {
  const d = t.startsWith('55') && t.length > 11 ? t.slice(2) : t
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d
}

function horaCurta(iso: string): string {
  const d = new Date(iso)
  return isToday(d) ? format(d, 'HH:mm') : format(d, 'dd/MM HH:mm', { locale: ptBR })
}

function previa(m: ConversaResumo['ultimaMensagem']): string {
  if (!m) return 'Sem mensagens'
  const quem = m.direcao === 'saida' ? (m.autor === 'agente' ? 'Agente: ' : 'Equipe: ') : ''
  const corpo =
    m.tipo === 'audio' ? 'Áudio' : m.tipo === 'imagem' ? 'Foto' : m.tipo === 'documento' ? 'Documento' : (m.texto ?? '')
  return quem + corpo
}

export default function ConversasPage() {
  const [params, setParams] = useSearchParams()
  const selecionada = params.get('c')
  const [filtro, setFiltro] = React.useState<Filtro>('todas')
  const [busca, setBusca] = React.useState('')
  const conversas = useConversas()
  const modo = useAgenteModo()

  const selecionar = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('c', id)
    else p.delete('c')
    setParams(p, { replace: true })
  }

  const lista = React.useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return (conversas.data ?? []).filter((c) => {
      if (filtro === 'humano' && c.estado !== 'humano') return false
      if (filtro === 'rascunhos' && c.rascunhos === 0) return false
      if (!termo) return true
      return (c.nome_contato ?? '').toLowerCase().includes(termo) || (!!digitos && c.telefone.includes(digitos))
    })
  }, [conversas.data, filtro, busca])

  const totalHumano = (conversas.data ?? []).filter((c) => c.estado === 'humano').length
  const totalRascunhos = (conversas.data ?? []).reduce((s, c) => s + c.rascunhos, 0)

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-medium text-foreground">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            Conversas
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            WhatsApp atendido pelo agente de IA. Assuma uma conversa para responder pela equipe.
          </p>
        </div>
        <SeletorModo modo={modo.data} carregando={modo.isPending} falhou={modo.isError} />
      </div>

      {modo.data && modo.data !== 'autonomo' && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-[13px] text-foreground">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            <strong className="font-medium">Agente {modo.data === 'sombra' ? 'em modo sombra' : 'desligado'}.</strong>{' '}
            {MODOS.find((m) => m.valor === modo.data)?.descricao}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border bg-card">
        {/* Lista */}
        <section
          aria-label="Lista de conversas"
          className={cn('flex w-full flex-col border-r lg:w-[320px] lg:shrink-0', selecionada && 'hidden lg:flex')}
        >
          <div className="space-y-2 border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou telefone"
                aria-label="Buscar conversa"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
            <div className="flex gap-1" role="tablist" aria-label="Filtrar conversas">
              <BotaoFiltro ativo={filtro === 'todas'} onClick={() => setFiltro('todas')}>
                Todas
              </BotaoFiltro>
              <BotaoFiltro ativo={filtro === 'humano'} onClick={() => setFiltro('humano')} contagem={totalHumano}>
                Com a equipe
              </BotaoFiltro>
              <BotaoFiltro ativo={filtro === 'rascunhos'} onClick={() => setFiltro('rascunhos')} contagem={totalRascunhos}>
                Rascunhos
              </BotaoFiltro>
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {/* isPending, não isLoading: com a janela sem foco o react-query pausa a
                nova tentativa, e a consulta fica pendente sem "carregar" — não pode
                cair no estado vazio e dizer que não há conversa. */}
            {conversas.isPending &&
              Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="border-b px-3 py-2.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-1.5 h-3 w-full" />
                </li>
              ))}
            {conversas.isError && (
              <li className="flex items-center gap-2 px-3 py-4 text-[13px] text-destructive">
                <TriangleAlert className="h-4 w-4" /> Não foi possível carregar as conversas.
              </li>
            )}
            {conversas.isSuccess && lista.length === 0 && (
              <li className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                {conversas.data?.length ? 'Nenhuma conversa neste filtro.' : 'Nenhuma conversa ainda. Elas aparecem aqui quando alguém escreve no WhatsApp do agente.'}
              </li>
            )}
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selecionar(c.id)}
                  aria-current={selecionada === c.id ? 'true' : undefined}
                  className={cn(
                    'relative block w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                    selecionada === c.id && 'bg-primary/[0.06] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {c.nome_contato ?? telefoneFmt(c.telefone)}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {horaCurta(c.ultima_atividade_em)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{previa(c.ultimaMensagem)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <EstadoBadge estado={c.estado} />
                    {c.pendentes > 0 && c.estado === 'humano' && (
                      <span className="rounded-sm border px-1.5 text-[11px] font-medium text-foreground">
                        {c.pendentes} sem resposta
                      </span>
                    )}
                    {c.rascunhos > 0 && (
                      <span className="cat-brass rounded-sm border px-1.5 text-[11px] font-medium">
                        {c.rascunhos} rascunho{c.rascunhos > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Conversa */}
        <section aria-label="Conversa" className={cn('min-w-0 flex-1 flex-col', selecionada ? 'flex' : 'hidden lg:flex')}>
          {selecionada ? (
            <PainelConversa id={selecionada} modo={modo.data ?? 'desligado'} onVoltar={() => selecionar(null)} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
              Escolha uma conversa na lista.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function BotaoFiltro({
  ativo,
  onClick,
  contagem,
  children,
}: {
  ativo: boolean
  onClick: () => void
  contagem?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium transition-colors',
        ativo ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {!!contagem && <span className="tabular-nums text-muted-foreground">{contagem}</span>}
    </button>
  )
}

function EstadoBadge({ estado }: { estado: 'agente' | 'humano' }) {
  return estado === 'humano' ? (
    <span className="cat-clay inline-flex items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium">
      <Hand className="h-3 w-3" aria-hidden /> Com a equipe
    </span>
  ) : (
    <span className="cat-steel inline-flex items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium">
      <Bot className="h-3 w-3" aria-hidden /> Agente
    </span>
  )
}

function SeletorModo({ modo, carregando, falhou }: { modo: AgenteModo | undefined; carregando: boolean; falhou: boolean }) {
  const { profile } = useAuth()
  const definir = useDefinirModo()
  const podeAlterar = canAlterarModoAgente(profile)

  if (falhou) return <span className="text-[12px] text-muted-foreground">Modo do agente indisponível</span>
  if (carregando || !modo) return <Skeleton className="h-8 w-56" />

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-muted-foreground">Modo do agente</span>
      <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5" role="radiogroup" aria-label="Modo do agente">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={modo === m.valor}
            disabled={!podeAlterar || definir.isPending}
            title={podeAlterar ? m.descricao : 'Só administradores trocam o modo'}
            onClick={() => modo !== m.valor && definir.mutate(m.valor)}
            className={cn(
              'rounded px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed',
              modo === m.valor ? 'bg-foreground text-background' : 'text-muted-foreground enabled:hover:text-foreground',
            )}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Painel da conversa ──────────────────────────────────────────────────────

type ItemLinha = { tipo: 'mensagem'; at: string; m: MensagemAgente } | { tipo: 'acao'; at: string; a: AcaoAgente }

function PainelConversa({ id, modo, onVoltar }: { id: string; modo: AgenteModo; onVoltar: () => void }) {
  const { data, isPending, isError } = useConversa(id)
  const assumir = useAssumirConversa()
  const devolver = useDevolverAoAgente()
  const fimRef = React.useRef<HTMLDivElement>(null)

  const linha = React.useMemo<ItemLinha[]>(() => {
    if (!data) return []
    return [
      ...data.mensagens.map((m) => ({ tipo: 'mensagem' as const, at: m.created_at, m })),
      // Transferência já aparece como estado; as demais ações entram na linha do tempo.
      ...data.acoes.map((a) => ({ tipo: 'acao' as const, at: a.created_at, a })),
    ].sort((x, y) => x.at.localeCompare(y.at))
  }, [data])

  // Rola para o fim quando chega item novo, não a cada consulta.
  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [linha.length, id])

  if (isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-2/3" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 p-4 text-[13px] text-destructive">
        <TriangleAlert className="h-4 w-4" /> Não foi possível abrir a conversa.
      </div>
    )
  }

  const { conversa, nomes } = data
  const comEquipe = conversa.estado === 'humano'
  const foraDaJanela = !data.janelaAberta

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={onVoltar} aria-label="Voltar à lista">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-foreground">
              {conversa.nome_contato ?? telefoneFmt(conversa.telefone)}
            </div>
            <div className="text-[12px] tabular-nums text-muted-foreground">
              {telefoneFmt(conversa.telefone)}
              {comEquipe && conversa.assumida_por && ` · com ${nomes[conversa.assumida_por] ?? 'a equipe'}`}
            </div>
          </div>
          <EstadoBadge estado={conversa.estado} />
        </div>
        {comEquipe ? (
          <Button variant="outline" size="sm" onClick={() => devolver.mutate(conversa.id)} disabled={devolver.isPending}>
            {devolver.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Devolver ao agente
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => assumir.mutate(conversa.id)} disabled={assumir.isPending}>
            {assumir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}
            Assumir conversa
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 px-3 py-3">
        {linha.length === 0 && <p className="py-8 text-center text-[13px] text-muted-foreground">Sem mensagens.</p>}
        {linha.map((item) =>
          item.tipo === 'mensagem' ? (
            <Balao key={item.m.id} m={item.m} nomes={nomes} conversaId={conversa.id} podeEnviarSugestao={modo === 'sombra' && !foraDaJanela} />
          ) : (
            <LinhaAcao key={item.a.id} a={item.a} nomes={nomes} />
          ),
        )}
        <div ref={fimRef} />
      </div>

      {/* key: o texto digitado não vaza de uma conversa para outra. */}
      <Compositor
        key={conversa.id}
        conversaId={conversa.id}
        habilitado={(comEquipe || modo === 'sombra') && !foraDaJanela}
        motivo={
          foraDaJanela
            ? 'Passaram 24 h desde a última mensagem do contato: o WhatsApp só aceita modelo de mensagem aprovado.'
            : 'Assuma a conversa para responder. Enquanto o agente atende, duas vozes confundiriam o contato.'
        }
      />
    </>
  )
}

function Balao({
  m,
  nomes,
  conversaId,
  podeEnviarSugestao,
}: {
  m: MensagemAgente
  nomes: Record<string, string>
  conversaId: string
  podeEnviarSugestao: boolean
}) {
  const enviar = useEnviarMensagem()
  const saida = m.direcao === 'saida'
  const autor = !saida ? null : m.autor === 'agente' ? 'Agente IA' : (m.enviada_por && nomes[m.enviada_por]) || 'Equipe'

  return (
    <div className={cn('flex', saida ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[min(560px,85%)] rounded-md border px-3 py-2 text-[13px] leading-relaxed text-foreground',
          saida ? 'bg-card' : 'bg-background',
          m.envio === 'sombra' && 'border-dashed',
        )}
      >
        {autor && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {m.autor === 'agente' ? <Bot className="h-3 w-3" aria-hidden /> : <Hand className="h-3 w-3" aria-hidden />}
            {autor}
          </div>
        )}
        <ConteudoMensagem m={m} />
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {m.envio === 'sombra' && <span>sugestão · não enviada</span>}
          {m.envio === 'falhou' && (
            <span className="text-destructive" title={m.erro ?? undefined}>
              falhou no envio
            </span>
          )}
          <span className="tabular-nums">{horaCurta(m.created_at)}</span>
        </div>
        {m.envio === 'sombra' && podeEnviarSugestao && m.texto && (
          <div className="mt-1.5 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={enviar.isPending}
              onClick={() => enviar.mutate({ conversaId, texto: m.texto! })}
            >
              {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar esta resposta
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ConteudoMensagem({ m }: { m: MensagemAgente }) {
  if (m.tipo === 'texto' || m.tipo === 'outro') {
    return <p className="whitespace-pre-wrap break-words">{m.texto}</p>
  }
  return (
    <div className="space-y-1.5">
      <Midia m={m} />
      {m.tipo === 'audio' && (
        <p className="whitespace-pre-wrap break-words text-muted-foreground">
          {m.transcricao ? `“${m.transcricao}”` : m.erro ? 'Não foi possível transcrever.' : 'Transcrevendo…'}
        </p>
      )}
      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
    </div>
  )
}

function Midia({ m }: { m: MensagemAgente }) {
  const { data: url, isLoading } = useQuery({
    queryKey: ['agente', 'midia', m.midia_path],
    enabled: !!m.midia_path,
    staleTime: 50 * 60_000, // URL assinada vale 1 h
    queryFn: () => urlDaMidia(m.midia_path!),
  })

  const Icone = m.tipo === 'audio' ? Mic : m.tipo === 'imagem' ? ImageIcon : FileText
  if (!m.midia_path || isLoading || !url) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icone className="h-3.5 w-3.5" aria-hidden />
        {m.tipo === 'audio' ? 'Áudio' : m.tipo === 'imagem' ? 'Foto' : (m.midia_nome ?? 'Documento')}
        {!m.midia_path && (m.erro ? ' · falha ao baixar' : ' · baixando…')}
      </div>
    )
  }
  if (m.tipo === 'audio') return <audio controls preload="none" src={url} className="h-9 w-64 max-w-full" />
  if (m.tipo === 'imagem') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="Foto enviada pelo contato" className="max-h-56 rounded-sm border object-contain" />
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-primary-strong underline-offset-4 hover:underline">
      <FileText className="h-4 w-4" aria-hidden />
      {m.midia_nome ?? 'Abrir documento'}
    </a>
  )
}

// ── Ações do agente (cadastros, solicitação, rascunhos) ─────────────────────

const ROTULO_CAMPO: Record<string, string> = {
  nome_completo: 'Nome',
  cpf: 'CPF',
  telefone: 'Telefone',
  razao_social: 'Razão social',
  documento: 'Documento',
  placa: 'Placa',
  tipo: 'Tipo',
  capacidade_ton: 'Capacidade (t)',
  solicitante_nome: 'Solicitante',
  material_subtipo: 'Minério',
  local_carregamento: 'Local',
  observacoes: 'Observações',
  motivo: 'Motivo',
}

function mascararCpf(v: string): string {
  const d = v.replace(/\D/g, '')
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : v
}

function resumoEntrada(entrada: unknown): { campos: [string, string][]; referencias: number } {
  const obj = (entrada ?? {}) as Record<string, unknown>
  const campos: [string, string][] = []
  let referencias = 0
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '' || k === 'confirmar_duplicada') continue
    if (k.endsWith('_id')) {
      referencias++
      continue
    }
    const texto = k === 'cpf' ? mascararCpf(String(v)) : String(v)
    campos.push([ROTULO_CAMPO[k] ?? k, texto])
  }
  return { campos, referencias }
}

function LinhaAcao({ a, nomes }: { a: AcaoAgente; nomes: Record<string, string> }) {
  const aprovar = useAprovarRascunho()
  const rejeitar = useRejeitarRascunho()
  const { campos, referencias } = resumoEntrada(a.entrada)
  const resultado = (a.resultado ?? {}) as Record<string, unknown>
  const quem = a.decidido_por ? nomes[a.decidido_por] ?? 'a equipe' : null

  const situacao =
    a.status === 'rascunho'
      ? { rotulo: 'Rascunho', classe: 'cat-brass' }
      : a.status === 'aprovada'
        ? { rotulo: `Aprovada${quem ? ` por ${quem}` : ''}`, classe: 'cat-sage' }
        : a.status === 'rejeitada'
          ? { rotulo: `Rejeitada${quem ? ` por ${quem}` : ''}`, classe: 'cat-steel' }
          : a.status === 'erro'
            ? { rotulo: 'Falhou', classe: 'status-cancelada' }
            : { rotulo: 'Feito pelo agente', classe: 'cat-steel' }

  return (
    <div className="mx-auto max-w-[620px] rounded-md border border-dashed bg-card px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium text-foreground">{FERRAMENTAS[a.ferramenta] ?? a.ferramenta}</span>
        <span className={cn('rounded-sm border px-1.5 text-[11px] font-medium', situacao.classe)}>{situacao.rotulo}</span>
        <span className="ml-auto tabular-nums text-muted-foreground">{horaCurta(a.created_at)}</span>
      </div>
      {campos.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
          {campos.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k}</dt>
              <dd className="break-words text-foreground">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {referencias > 0 && (
        <p className="mt-0.5 text-muted-foreground">
          + {referencias} cadastro{referencias > 1 ? 's' : ''} já existente{referencias > 1 ? 's' : ''} referenciado{referencias > 1 ? 's' : ''}
        </p>
      )}
      {typeof resultado.numero === 'string' && (
        <p className="mt-1 text-foreground">
          Solicitação <span className="font-medium tabular-nums">{resultado.numero}</span>
          {resultado.ja_existia ? ' (já existia)' : ''}
        </p>
      )}
      {typeof resultado.erro === 'string' && <p className="mt-1 text-destructive">{resultado.erro}</p>}
      {a.status === 'rascunho' && (
        <div className="mt-2 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={rejeitar.isPending || aprovar.isPending}
            onClick={() => rejeitar.mutate({ acaoId: a.id, conversaId: a.conversa_id })}
          >
            <X className="h-3.5 w-3.5" /> Rejeitar
          </Button>
          <Button
            size="sm"
            disabled={rejeitar.isPending || aprovar.isPending}
            onClick={() => aprovar.mutate({ acaoId: a.id, conversaId: a.conversa_id })}
          >
            {aprovar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Aprovar
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Resposta da equipe ──────────────────────────────────────────────────────

function Compositor({ conversaId, habilitado, motivo }: { conversaId: string; habilitado: boolean; motivo: string }) {
  const [texto, setTexto] = React.useState('')
  const enviar = useEnviarMensagem()

  const mandar = () => {
    const t = texto.trim()
    if (!t || enviar.isPending) return
    enviar.mutate({ conversaId, texto: t }, { onSuccess: () => setTexto('') })
  }

  if (!habilitado) {
    return <div className="border-t px-3 py-2.5 text-[12px] text-muted-foreground">{motivo}</div>
  }

  return (
    <div className="flex items-end gap-2 border-t p-2">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            mandar()
          }
        }}
        placeholder="Responder pelo WhatsApp…"
        aria-label="Mensagem para o contato"
        rows={2}
        maxLength={4000}
        className="min-h-[60px] resize-none text-[13px]"
      />
      <Button onClick={mandar} disabled={!texto.trim() || enviar.isPending} title="Enviar (Ctrl+Enter)">
        {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar
      </Button>
    </div>
  )
}
