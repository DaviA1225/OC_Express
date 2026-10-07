import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, Eraser, Inbox, Loader2, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn, formatCpf } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { canAnonimizarTitular, canExportarTitular } from '@/features/auth/permissions'
import {
  ACOES_ACESSO,
  ACAO_ACESSO_LABELS,
  useLogAcesso,
  useOrfaosStorage,
  useRemoverOrfaos,
  exportarDadosTitular,
  simularAnonimizacao,
  confirmarAnonimizacao,
  baixarJsonTitular,
  traduzirErroTitular,
  type AcaoAcessoLog,
  type ExportacaoTitular,
  type SimulacaoAnonimizacao,
} from '@/features/privacidade/usePrivacidade'

const PAGE_SIZE = 30

type Aba = 'acessos' | 'orfaos' | 'titular'

type Periodo = 'hoje' | '7d' | '30d' | 'todos'

const PERIODO_LABELS: Record<Periodo, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  todos: 'Todos os períodos',
}

function periodoToDesde(p: Periodo): string | null {
  const d = new Date()
  const inicio = (dias: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() - dias).toISOString()
  switch (p) {
    case 'hoje': return inicio(0)
    case '7d': return inicio(7)
    case '30d': return inicio(30)
    default: return null
  }
}

function dataHora(iso: string): string {
  return format(new Date(iso), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })
}

export default function PrivacidadePage() {
  const { profile } = useAuth()
  const podeTitular = canExportarTitular(profile)
  const [params, setParams] = useSearchParams()

  const abas: { value: Aba; label: string }[] = [
    { value: 'acessos', label: 'Registro de acesso' },
    { value: 'orfaos', label: 'Arquivos órfãos' },
    ...(podeTitular ? [{ value: 'titular' as const, label: 'Pedidos do titular' }] : []),
  ]
  const raw = params.get('aba')
  const aba: Aba = abas.some((a) => a.value === raw) ? (raw as Aba) : 'acessos'

  const setAba = (v: Aba) =>
    setParams(v === 'acessos' ? {} : { aba: v }, { replace: true })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Privacidade</h1>
        <p className="text-[12px] text-muted-foreground">
          Quem tirou dado pessoal do sistema, arquivos que ficaram para trás e pedidos de titulares (LGPD).
        </p>
      </div>

      <div className="inline-flex rounded-lg border bg-card p-1" role="tablist" aria-label="Seções de privacidade">
        {abas.map((a) => (
          <button
            key={a.value}
            type="button"
            role="tab"
            aria-selected={aba === a.value}
            onClick={() => setAba(a.value)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
              aba === a.value
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground/70 hover:bg-muted hover:text-foreground',
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'acessos' && <AbaAcessos />}
      {aba === 'orfaos' && <AbaOrfaos />}
      {aba === 'titular' && podeTitular && <AbaTitular podeAnonimizar={canAnonimizarTitular(profile)} />}
    </div>
  )
}

// ── Registro de acesso ──────────────────────────────────────────────────────

function AbaAcessos() {
  const [periodo, setPeriodo] = React.useState<Periodo>('7d')
  const [acoes, setAcoes] = React.useState<AcaoAcessoLog[]>([])
  const [page, setPage] = React.useState(1)

  const list = useLogAcesso({ acoes, desde: periodoToDesde(periodo), page, pageSize: PAGE_SIZE })
  const total = list.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = acoes.length > 0 || periodo !== '7d'

  const toggleAcao = (a: AcaoAcessoLog) => {
    setAcoes((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))
    setPage(1)
  }

  return (
    <>
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="privacidade-periodo" className="text-[12px] text-muted-foreground">Período</Label>
            <div className="relative">
              <select
                id="privacidade-periodo"
                value={periodo}
                onChange={(e) => { setPeriodo(e.target.value as Periodo); setPage(1) }}
                className="h-9 appearance-none rounded-md border bg-card pl-3 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.keys(PERIODO_LABELS) as Periodo[]).map((p) => (
                  <option key={p} value={p}>{PERIODO_LABELS[p]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="ml-auto">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setPeriodo('7d'); setAcoes([]); setPage(1) }}>
                <Eraser className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] text-muted-foreground">Tipo de acesso</p>
          <div className="flex flex-wrap gap-1.5">
            {ACOES_ACESSO.map((a) => {
              const active = acoes.includes(a)
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleAcao(a)}
                  className={cn(
                    'rounded-md border px-3 py-1 text-[12px] transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground/80 hover:bg-muted',
                  )}
                >
                  {ACAO_ACESSO_LABELS[a]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Data/hora</TableHead>
              <TableHead className="w-[190px]">Acesso</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>O quê</TableHead>
              <TableHead className="w-[130px]">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
              </TableRow>
            ))}
            {list.isError && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[13px] text-destructive">
                  Não foi possível carregar o registro de acesso.
                </TableCell>
              </TableRow>
            )}
            {!list.isLoading && !list.isError && (list.data?.data.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12">
                  <EmptyState
                    icon={Inbox}
                    title="Nenhum acesso registrado"
                    description={hasFilters ? 'Ajuste os filtros acima.' : 'Ninguém exportou ou abriu dado pessoal nos últimos 7 dias.'}
                  />
                </TableCell>
              </TableRow>
            )}
            {(list.data?.data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-[12px] text-muted-foreground tabular-nums">{dataHora(r.created_at)}</TableCell>
                <TableCell className="text-[12px]">
                  {ACAO_ACESSO_LABELS[r.acao as AcaoAcessoLog] ?? r.acao}
                </TableCell>
                <TableCell className="text-[12px]">
                  {r.usuario_nome ?? <span className="text-muted-foreground">Usuário removido</span>}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">
                  <span className="line-clamp-1 break-all" title={r.recurso ?? undefined}>
                    {resumoAcesso(r.recurso, r.detalhe)}
                  </span>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground tabular-nums">{r.ip ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-[12px] text-muted-foreground">
            <span>Página {page} de {totalPages} · {total} registros</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/** Texto curto do recurso + o que o detalhe tem de útil (linhas exportadas, CPF mascarado). */
function resumoAcesso(recurso: string | null, detalhe: unknown): string {
  const d = (detalhe && typeof detalhe === 'object' ? detalhe : {}) as Record<string, unknown>
  const partes: string[] = [recurso ?? '—']
  if (typeof d.linhas === 'number') partes.push(`${d.linhas} ${d.linhas === 1 ? 'linha' : 'linhas'}`)
  if (typeof d.cpf === 'string' && d.cpf) partes.push(`CPF ${d.cpf}`)
  return partes.join(' · ')
}

// ── Arquivos órfãos ─────────────────────────────────────────────────────────

function AbaOrfaos() {
  const orfaos = useOrfaosStorage()
  const remover = useRemoverOrfaos()
  const [confirmar, setConfirmar] = React.useState(false)
  const lista = orfaos.data ?? []

  const removerTodos = async () => {
    const res = await remover.mutateAsync(lista)
    if (res.falhas.length === 0) {
      toast.success(res.removidos === 1 ? '1 arquivo removido do storage' : `${res.removidos} arquivos removidos do storage`)
    } else {
      toast.error(
        `${res.falhas.length} ${res.falhas.length === 1 ? 'arquivo continua' : 'arquivos continuam'} no storage. O motivo ficou registrado na linha.`,
      )
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <p className="max-w-[640px] text-[12px] text-muted-foreground">
          Anexos que foram apagados do sistema mas cujo arquivo pode ter ficado no storage. São CRLV, CNH e
          prints com dado pessoal: o arquivo precisa sair do bucket junto com o registro.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmar(true)}
          disabled={lista.length === 0 || remover.isPending}
        >
          {remover.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Remover do storage
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Apagado em</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead className="w-[280px]">Última tentativa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orfaos.isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={3}><Skeleton className="h-5 w-full" /></TableCell>
              </TableRow>
            ))}
            {orfaos.isError && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-[13px] text-destructive">
                  Não foi possível carregar a fila de remoção.
                </TableCell>
              </TableRow>
            )}
            {!orfaos.isLoading && !orfaos.isError && lista.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-12">
                  <EmptyState
                    icon={Inbox}
                    title="Nenhum arquivo órfão"
                    description="Todo anexo apagado teve o arquivo removido do storage."
                  />
                </TableCell>
              </TableRow>
            )}
            {lista.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-[12px] text-muted-foreground tabular-nums">{dataHora(o.created_at)}</TableCell>
                <TableCell className="text-[12px]">
                  <span className="line-clamp-1 break-all font-mono" title={o.path}>{o.path}</span>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">
                  {o.erro ? <span className="text-destructive">{o.erro}</span> : 'Sem tentativa registrada'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Remover arquivos do storage?"
        description={`${lista.length === 1 ? 'O arquivo da lista será apagado' : `Os ${lista.length} arquivos da lista serão apagados`} do bucket. Não dá para desfazer.`}
        confirmLabel="Remover"
        destructive
        onConfirm={removerTodos}
      />
    </>
  )
}

// ── Pedidos do titular ──────────────────────────────────────────────────────

function AbaTitular({ podeAnonimizar }: { podeAnonimizar: boolean }) {
  const qc = useQueryClient()
  const [cpf, setCpf] = React.useState('')
  const [exportando, setExportando] = React.useState(false)
  const [exportacao, setExportacao] = React.useState<ExportacaoTitular | null>(null)
  const [simulando, setSimulando] = React.useState(false)
  const [simulacao, setSimulacao] = React.useState<SimulacaoAnonimizacao | null>(null)

  const digitos = cpf.replace(/\D/g, '')
  const cpfCompleto = digitos.length === 11

  const onCpfChange = (v: string) => {
    setCpf(formatCpf(v))
    // Resultado de um CPF não pode ficar na tela enquanto outro é digitado.
    setExportacao(null)
  }

  const exportar = async () => {
    setExportando(true)
    try {
      const res = await exportarDadosTitular(digitos)
      setExportacao(res)
      if (res.encontrado) baixarJsonTitular(res.dados)
    } catch (e) {
      toast.error(traduzirErroTitular(e))
    } finally {
      setExportando(false)
    }
  }

  const simular = async () => {
    setSimulando(true)
    try {
      const res = await simularAnonimizacao(digitos)
      if (!res.encontrado) {
        toast.info('Nenhum motorista com este CPF.')
        return
      }
      setSimulacao(res)
    } catch (e) {
      toast.error(traduzirErroTitular(e))
    } finally {
      setSimulando(false)
    }
  }

  const onAnonimizado = () => {
    setSimulacao(null)
    setExportacao(null)
    setCpf('')
    // Cadastros de motorista (interno e parceiro) passam pelo CRUD genérico.
    qc.invalidateQueries({ queryKey: ['crud'] })
    qc.invalidateQueries({ queryKey: ['crud-options'] })
    qc.invalidateQueries({ queryKey: ['auditoria'] })
  }

  return (
    <>
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="max-w-[640px] space-y-1 text-[12px] text-muted-foreground">
          <p>
            Para atender um pedido de motorista (LGPD, art. 18). A busca é pelo CPF, nos cadastros da frota
            interna e dos parceiros.
          </p>
          <p>
            <strong className="font-medium text-foreground">Exportar</strong> baixa um arquivo com tudo que o
            sistema guarda sobre a pessoa, para entregar a ela.{' '}
            {podeAnonimizar && (
              <>
                <strong className="font-medium text-foreground">Anonimizar</strong> apaga nome, CPF, telefone e
                observações, mas mantém as OCs antigas apontando para o cadastro.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="titular-cpf" className="text-[12px] text-muted-foreground">CPF do titular</Label>
            <Input
              id="titular-cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => onCpfChange(e.target.value)}
              className="w-[180px] tabular-nums"
            />
          </div>
          <Button type="button" onClick={exportar} disabled={!cpfCompleto || exportando}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar dados
          </Button>
          {podeAnonimizar && (
            <Button type="button" variant="outline" onClick={simular} disabled={!cpfCompleto || simulando}>
              {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Anonimizar…
            </Button>
          )}
        </div>

        {exportacao && (
          <div className="border-t pt-3 text-[13px]">
            {exportacao.encontrado ? (
              <p>
                Arquivo baixado: {exportacao.cadastros} {exportacao.cadastros === 1 ? 'cadastro' : 'cadastros'},{' '}
                {exportacao.solicitacoes} {exportacao.solicitacoes === 1 ? 'solicitação' : 'solicitações'} e{' '}
                {exportacao.anexos} {exportacao.anexos === 1 ? 'anexo' : 'anexos'} (só os metadados; os arquivos
                ficam no storage).
              </p>
            ) : (
              <p className="text-muted-foreground">
                Nenhum motorista com este CPF. O sistema não guarda dado desta pessoa nos cadastros.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="max-w-[640px] text-[12px] text-muted-foreground">
        O nome e o telefone de quem pediu a solicitação são texto livre e não se ligam ao CPF. Se a pessoa também
        aparecer ali, a limpeza é manual (veja o fim da migration 0057).
      </p>

      {simulacao && (
        <AnonimizarDialog
          cpf={digitos}
          simulacao={simulacao}
          onClose={() => setSimulacao(null)}
          onDone={onAnonimizado}
        />
      )}
    </>
  )
}

const PALAVRA_CONFIRMACAO = 'ANONIMIZAR'

function AnonimizarDialog({
  cpf, simulacao, onClose, onDone,
}: {
  cpf: string
  simulacao: SimulacaoAnonimizacao
  onClose: () => void
  onDone: () => void
}) {
  const [palavra, setPalavra] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const cadastros = simulacao.cadastrosInterna + simulacao.cadastrosParceiro

  const confirmar = async () => {
    setBusy(true)
    try {
      await confirmarAnonimizacao(cpf)
      toast.success('Titular anonimizado')
      onDone()
    } catch (e) {
      toast.error(traduzirErroTitular(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Anonimizar o CPF {formatCpf(cpf)}?</DialogTitle>
          <DialogDescription>Não dá para desfazer. Nada foi alterado ainda.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-[13px]">
          <ul className="space-y-1">
            <li>
              {cadastros} {cadastros === 1 ? 'cadastro de motorista perde' : 'cadastros de motorista perdem'} nome,
              CPF, telefone e observações, e {cadastros === 1 ? 'fica inativo' : 'ficam inativos'}.
            </li>
            <li>
              {simulacao.linhasAuditoria} {simulacao.linhasAuditoria === 1 ? 'linha' : 'linhas'} da auditoria
              {simulacao.linhasAuditoria === 1 ? ' perde' : ' perdem'} o dado pessoal.
            </li>
            <li>
              {simulacao.solicitacoesPreservadas}{' '}
              {simulacao.solicitacoesPreservadas === 1 ? 'solicitação continua' : 'solicitações continuam'} no
              histórico, sem o nome da pessoa.
            </li>
          </ul>
          <div className="space-y-1">
            <Label htmlFor="anonimizar-palavra" className="text-[12px] text-muted-foreground">
              Digite {PALAVRA_CONFIRMACAO} para confirmar
            </Label>
            <Input
              id="anonimizar-palavra"
              autoComplete="off"
              value={palavra}
              onChange={(e) => setPalavra(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <span />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={confirmar}
              disabled={busy || palavra.trim().toUpperCase() !== PALAVRA_CONFIRMACAO}
            >
              {busy ? 'Aguarde…' : 'Anonimizar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
