import * as React from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Plus,
  Pencil,
  Trash2,
  Inbox,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import {
  useAuditList,
  useAuditUsuarios,
  diffJson,
  formatJsonValue,
  TABELAS_AUDITADAS,
  TABELA_LABELS,
  ACAO_LABELS,
  type AuditAcao,
  type AuditFilters,
  type AuditLogRow,
} from '@/features/auditoria/useAuditoria'

const PAGE_SIZE = 30

const ACAO_OPTS: AuditAcao[] = ['INSERT', 'UPDATE', 'DELETE']

function startOfTodayISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}
function nDaysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}
function startOfMonthISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

type Periodo = 'todos' | 'hoje' | '7d' | '30d' | 'mes'

const PERIODO_LABELS: Record<Periodo, string> = {
  todos: 'Todos os períodos',
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  mes: 'Mês atual',
}

function periodoToDesde(p: Periodo): string | null {
  switch (p) {
    case 'hoje': return startOfTodayISO()
    case '7d': return nDaysAgoISO(7)
    case '30d': return nDaysAgoISO(30)
    case 'mes': return startOfMonthISO()
    default: return null
  }
}

export default function AuditoriaPage() {
  const [periodo, setPeriodo] = React.useState<Periodo>('7d')
  const [acoes, setAcoes] = React.useState<AuditAcao[]>([])
  const [tabelas, setTabelas] = React.useState<string[]>([])
  const [usuarioIds, setUsuarioIds] = React.useState<string[]>([])
  const [page, setPage] = React.useState(1)
  const [openLog, setOpenLog] = React.useState<AuditLogRow | null>(null)

  const usuarios = useAuditUsuarios()

  const filters: AuditFilters = {
    acoes,
    tabelas,
    usuarioIds,
    periodo: { desde: periodoToDesde(periodo), ate: null },
    page,
    pageSize: PAGE_SIZE,
  }

  const list = useAuditList(filters)

  const [lastFilters, setLastFilters] = React.useState({ periodo, acoes, tabelas, usuarioIds })
  if (
    lastFilters.periodo !== periodo ||
    lastFilters.acoes !== acoes ||
    lastFilters.tabelas !== tabelas ||
    lastFilters.usuarioIds !== usuarioIds
  ) {
    setLastFilters({ periodo, acoes, tabelas, usuarioIds })
    if (page !== 1) setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE))
  const hasFilters = acoes.length > 0 || tabelas.length > 0 || usuarioIds.length > 0 || periodo !== 'todos'

  const clearFilters = () => {
    setAcoes([])
    setTabelas([])
    setUsuarioIds([])
    setPeriodo('todos')
  }

  const toggleArr = <T,>(arr: T[], setArr: (v: T[]) => void, item: T) => {
    setArr(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item])
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-medium text-foreground">Auditoria</h1>
            <p className="text-[12px] text-muted-foreground">
              Histórico de criação, edição e exclusão dos registros do sistema.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">Período</Label>
              <PeriodoSelect value={periodo} onChange={setPeriodo} />
            </div>
            <div className="ml-auto">
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <Eraser className="h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          <FilterChips
            label="Ação"
            options={ACAO_OPTS.map((a) => ({ value: a, label: ACAO_LABELS[a] }))}
            value={acoes}
            onToggle={(v) => toggleArr(acoes, setAcoes, v as AuditAcao)}
          />

          <FilterChips
            label="Entidade"
            options={TABELAS_AUDITADAS.map((t) => ({ value: t, label: TABELA_LABELS[t] }))}
            value={tabelas}
            onToggle={(v) => toggleArr(tabelas, setTabelas, v)}
          />

          <UsuarioFilter
            usuarios={usuarios.data ?? []}
            value={usuarioIds}
            onToggle={(v) => toggleArr(usuarioIds, setUsuarioIds, v)}
          />
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Data/hora</TableHead>
                <TableHead className="w-[110px]">Ação</TableHead>
                <TableHead className="w-[160px]">Entidade</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="w-[260px]">Resumo</TableHead>
                <TableHead className="w-[60px] text-right">Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                  ))}
                </>
              )}
              {!list.isLoading && (list.data?.data.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState
                      icon={Inbox}
                      title="Nenhum registro encontrado"
                      description={hasFilters ? 'Ajuste os filtros acima.' : 'Ainda não há histórico registrado.'}
                    />
                  </TableCell>
                </TableRow>
              )}
              {!list.isLoading && (list.data?.data ?? []).map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setOpenLog(row)}
                >
                  <TableCell className="text-[12px] text-muted-foreground">
                    {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <AcaoBadge acao={row.acao as AuditAcao} />
                  </TableCell>
                  <TableCell className="text-[12px] text-foreground">
                    {TABELA_LABELS[row.tabela] ?? row.tabela}
                  </TableCell>
                  <TableCell className="text-[12px]">
                    {row.usuario_nome ?? <span className="text-muted-foreground">Sistema/desconhecido</span>}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    <ResumoCell row={row} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {(list.data?.count ?? 0) > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-[12px] text-muted-foreground">
              <span>
                Página {page} de {totalPages} · {list.data?.count} registros
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DetalheDialog log={openLog} onClose={() => setOpenLog(null)} />
    </>
  )
}

function PeriodoSelect({ value, onChange }: { value: Periodo; onChange: (v: Periodo) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Periodo)}
        className="h-9 appearance-none rounded-md border bg-background pl-3 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {(Object.keys(PERIODO_LABELS) as Periodo[]).map((p) => (
          <option key={p} value={p}>{PERIODO_LABELS[p]}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

interface FilterChipsProps {
  label: string
  options: { value: string; label: string }[]
  value: string[]
  onToggle: (v: string) => void
}

function FilterChips({ label, options, value, onToggle }: FilterChipsProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground/80 hover:bg-muted',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface UsuarioFilterProps {
  usuarios: { user_id: string; nome_completo: string }[]
  value: string[]
  onToggle: (v: string) => void
}

function UsuarioFilter({ usuarios, value, onToggle }: UsuarioFilterProps) {
  if (usuarios.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground">Usuário</Label>
      <div className="flex flex-wrap gap-1.5">
        {usuarios.map((u) => {
          const active = value.includes(u.user_id)
          return (
            <button
              key={u.user_id}
              type="button"
              onClick={() => onToggle(u.user_id)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground/80 hover:bg-muted',
              )}
            >
              {u.nome_completo}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AcaoBadge({ acao }: { acao: AuditAcao }) {
  const map: Record<AuditAcao, { label: string; className: string; icon: React.ReactNode }> = {
    INSERT: { label: 'Criação', className: 'bg-emerald-100 text-emerald-800', icon: <Plus className="h-3 w-3" /> },
    UPDATE: { label: 'Edição', className: 'bg-blue-100 text-blue-800', icon: <Pencil className="h-3 w-3" /> },
    DELETE: { label: 'Exclusão', className: 'bg-red-100 text-red-800', icon: <Trash2 className="h-3 w-3" /> },
  }
  const m = map[acao] ?? { label: acao, className: 'bg-slate-100 text-slate-700', icon: null }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', m.className)}>
      {m.icon}
      {m.label}
    </span>
  )
}

function ResumoCell({ row }: { row: AuditLogRow }) {
  if (row.acao === 'INSERT') {
    const nome = pickNome(row.dados_depois)
    return <span className="line-clamp-1">{nome ? `Criado: ${nome}` : '—'}</span>
  }
  if (row.acao === 'DELETE') {
    const nome = pickNome(row.dados_antes)
    return <span className="line-clamp-1">{nome ? `Excluído: ${nome}` : '—'}</span>
  }
  if (row.acao === 'UPDATE') {
    const diff = diffJson(row.dados_antes, row.dados_depois)
    if (diff.length === 0) return <span>Sem alterações relevantes</span>
    const campos = diff.slice(0, 3).map((d) => d.campo).join(', ')
    return (
      <span className="line-clamp-1">
        {diff.length} {diff.length === 1 ? 'campo' : 'campos'}: {campos}
        {diff.length > 3 ? '…' : ''}
      </span>
    )
  }
  return <span>—</span>
}

function pickNome(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  for (const k of ['razao_social', 'nome_completo', 'nome', 'placa', 'numero_interno']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

function DetalheDialog({ log, onClose }: { log: AuditLogRow | null; onClose: () => void }) {
  if (!log) return null
  const acao = log.acao as AuditAcao
  const diff = acao === 'UPDATE' ? diffJson(log.dados_antes, log.dados_depois) : []

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AcaoBadge acao={acao} />
            {TABELA_LABELS[log.tabela] ?? log.tabela}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
            {log.usuario_nome ? ` · por ${log.usuario_nome}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {acao === 'UPDATE' && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-[12px]">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Campo</th>
                    <th className="px-3 py-2 font-medium">Antes</th>
                    <th className="px-3 py-2 font-medium">Depois</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {diff.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">
                        Sem alterações relevantes registradas.
                      </td>
                    </tr>
                  )}
                  {diff.map((d) => (
                    <tr key={d.campo} className="align-top">
                      <td className="px-3 py-2 font-medium text-foreground">{d.campo}</td>
                      <td className="px-3 py-2 text-red-700">
                        <span className="block max-w-[280px] whitespace-pre-wrap break-words">
                          {formatJsonValue(d.antes)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-emerald-700">
                        <span className="block max-w-[280px] whitespace-pre-wrap break-words">
                          {formatJsonValue(d.depois)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {acao !== 'UPDATE' && (
            <JsonBlock
              titulo={acao === 'INSERT' ? 'Dados criados' : 'Dados excluídos'}
              data={acao === 'INSERT' ? log.dados_depois : log.dados_antes}
            />
          )}

          {log.registro_id && (
            <p className="text-[11px] text-muted-foreground">ID do registro: <code>{log.registro_id}</code></p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function JsonBlock({ titulo, data }: { titulo: string; data: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">{titulo}</p>
      <pre className="max-h-[360px] overflow-auto rounded-md border bg-muted/40 p-3 text-[11px]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
