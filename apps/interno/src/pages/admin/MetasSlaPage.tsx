import * as React from 'react'
import { toast } from 'sonner'
import { Save, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/layout/PageHeader'
import { CadastroField } from '@/components/forms/CadastroField'
import { StatusDot } from '@/components/shared/SolicitacaoStatusBadge'
import { Spinner } from '@/components/shared/Spinner'
import { Bloco, BlocoErro } from '@/components/painel/Bloco'
import { useAuth } from '@/hooks/useAuth'
import { canEditMetasSla } from '@/features/auth/permissions'
import { useDescartarAlteracoes } from '@/features/crud/useDescartarAlteracoes'
import { intervaloPadrao } from '@/features/relatorios/intervalo'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { classificarSla, ETAPAS_SLA, mapaSla } from '@/features/metricas/sla'
import { useFilaPrevia, useMetasSla, useSalvarMetasSla } from '@/features/metricas/useMetasSla'
import { useRelatorioTempoEtapas } from '@/features/metricas/useRelatorioMetricas'
import type { ConfigMetasSla, ConfigMetasSlaEntrada, EtapaSla } from '@/features/metricas/tipos'
import { fmtDec, fmtDur, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Metas e SLA (§3.4): limites de aviso/alerta por etapa (horas corridas, D2) e
 * as metas do dia. A gestão vê; só o admin edita (no banco, a RLS de UPDATE é
 * só do admin). Salvar invalida o Painel e os Relatórios.
 */
export default function MetasSlaPage() {
  const { profile } = useAuth()
  const podeEditar = canEditMetasSla(profile)
  const config = useMetasSla()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Metas e SLA"
        breadcrumb={[{ label: 'Administração' }, { label: 'Metas e SLA' }]}
        description="Limites de SLA por etapa e metas do dia. O relógio do SLA conta horas corridas, inclusive noite e fim de semana."
        meta={
          <>
            {!podeEditar && (
              <span className="inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-meta font-medium text-muted-foreground">
                Somente leitura
              </span>
            )}
          </>
        }
      />
      {config.isLoading && <Skeleton className="h-[420px] w-full" />}
      {config.isError && (
        <div className="rounded-lg border bg-card p-4">
          <BlocoErro onRetry={() => void config.refetch()} />
        </div>
      )}
      {config.data && (
        // A chave remonta o formulário quando a config salva muda — o rascunho
        // recomeça dos valores novos sem efeito sincronizando estado.
        <Formulario key={versao(config.data)} config={config.data} podeEditar={podeEditar} />
      )}
    </div>
  )
}

function versao(c: ConfigMetasSla): string {
  return [c.metas.atualizado_em, ...c.etapas.map((e) => e.atualizado_em)].join('|')
}

// ── Rascunho (texto dos campos, em horas) ───────────────────────────────────

interface EtapaRascunho {
  status: EtapaSla
  ativo: boolean
  aviso: string
  alerta: string
}

interface Rascunho {
  etapas: EtapaRascunho[]
  meta: string
  p90: string
  validade: string
  inicio: string
  fim: string
}

const horas = (min: number | null) => (min == null ? '' : fmtDec(min / 60, 2, 0))
const lerNumero = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

function paraRascunho(c: ConfigMetasSla): Rascunho {
  return {
    etapas: ETAPAS_SLA.map((status) => {
      const e = c.etapas.find((x) => x.status === status)
      return { status, ativo: e?.ativo ?? status !== 'oc_enviada', aviso: horas(e?.aviso_min ?? 120), alerta: horas(e?.alerta_min ?? 480) }
    }),
    meta: c.metas.meta_finalizadas_dia == null ? '' : String(c.metas.meta_finalizadas_dia),
    p90: horas(c.metas.meta_lead_time_p90_min),
    validade: String(c.metas.alerta_validade_h),
    inicio: c.metas.expediente_inicio.slice(0, 5),
    fim: c.metas.expediente_fim.slice(0, 5),
  }
}

type Erros = Partial<Record<string, string>>

/** Mesmas regras dos CHECKs da 0079 (aviso > 0, alerta > aviso, meta ≥ 0, validade 1–168). */
function validar(r: Rascunho): { erros: Erros; entrada: ConfigMetasSlaEntrada | null } {
  const erros: Erros = {}
  const etapas = r.etapas.map((e) => {
    const av = lerNumero(e.aviso)
    const al = lerNumero(e.alerta)
    const avMin = av == null || Number.isNaN(av) ? NaN : Math.round(av * 60)
    const alMin = al == null || Number.isNaN(al) ? NaN : Math.round(al * 60)
    if (!(avMin > 0)) erros[`${e.status}.aviso`] = 'Informe um aviso maior que zero.'
    if (!Number.isFinite(alMin)) erros[`${e.status}.alerta`] = 'Informe o alerta.'
    else if (Number.isFinite(avMin) && alMin <= avMin) erros[`${e.status}.alerta`] = 'O alerta precisa ser maior que o aviso.'
    return { status: e.status, ativo: e.ativo, aviso_min: avMin, alerta_min: alMin }
  })
  const meta = lerNumero(r.meta)
  if (meta != null && (Number.isNaN(meta) || meta < 0 || !Number.isInteger(meta))) erros.meta = 'Use um número inteiro, ou deixe em branco.'
  const p90 = lerNumero(r.p90)
  if (p90 != null && (Number.isNaN(p90) || p90 <= 0)) erros.p90 = 'Use um tempo maior que zero, ou deixe em branco.'
  const validade = lerNumero(r.validade)
  if (validade == null || Number.isNaN(validade) || !Number.isInteger(validade) || validade < 1 || validade > 168) {
    erros.validade = 'Entre 1 e 168 horas.'
  }
  if (!/^\d{2}:\d{2}$/.test(r.inicio)) erros.inicio = 'Informe o horário.'
  if (!/^\d{2}:\d{2}$/.test(r.fim)) erros.fim = 'Informe o horário.'
  else if (r.fim <= r.inicio) erros.fim = 'O fim precisa ser depois do início.'
  if (Object.keys(erros).length > 0) return { erros, entrada: null }
  return {
    erros,
    entrada: {
      etapas,
      metas: {
        meta_finalizadas_dia: meta,
        meta_lead_time_p90_min: p90 == null ? null : Math.round(p90 * 60),
        alerta_validade_h: validade as number,
        expediente_inicio: r.inicio,
        expediente_fim: r.fim,
      },
    },
  }
}

// ── Formulário ──────────────────────────────────────────────────────────────

function Formulario({ config, podeEditar }: { config: ConfigMetasSla; podeEditar: boolean }) {
  const inicial = React.useMemo(() => paraRascunho(config), [config])
  const [r, setR] = React.useState<Rascunho>(inicial)
  const [tentou, setTentou] = React.useState(false)
  const salvar = useSalvarMetasSla()
  const alterado = JSON.stringify(r) !== JSON.stringify(inicial)
  const { erros, entrada } = validar(r)
  const errosVisiveis = tentou ? erros : {}

  const descartar = useDescartarAlteracoes(alterado, (aberto) => {
    if (!aberto) {
      setR(inicial)
      setTentou(false)
    }
  }, salvar.isPending)

  // Fechar/recarregar a aba com rascunho pendente pede confirmação do navegador.
  React.useEffect(() => {
    if (!alterado) return
    const h = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [alterado])

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault()
    setTentou(true)
    if (!entrada) {
      toast.error('Revise os campos destacados.')
      return
    }
    salvar.mutate(
      { entrada },
      {
        onSuccess: () => toast.success('Metas e SLA salvos. O Painel já usa os novos limites.'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Falha ao salvar'),
      },
    )
  }

  const setEtapa = (status: EtapaSla, parcial: Partial<EtapaRascunho>) =>
    setR((x) => ({ ...x, etapas: x.etapas.map((e) => (e.status === status ? { ...e, ...parcial } : e)) }))

  const somenteLeitura = !podeEditar || salvar.isPending

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Bloco
          titulo="SLA por etapa"
          subtitulo="Aviso = começa a pedir atenção; alerta = fora do SLA. Valores em horas (1,5 = 1 h 30 min)."
          className="xl:col-span-2"
        >
          <TabelaEtapas r={r} erros={errosVisiveis} somenteLeitura={somenteLeitura} setEtapa={setEtapa} />
        </Bloco>
        <Previa r={r} />
      </div>

      <Bloco titulo="Metas do dia" subtitulo="Em branco = sem meta: o Painel e a TV mostram só o realizado.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <CadastroField label="Meta de finalizadas por dia" hint="Vale para a operação inteira" error={errosVisiveis.meta}>
            <Input inputMode="numeric" placeholder="Sem meta" value={r.meta} disabled={somenteLeitura} onChange={(e) => setR({ ...r, meta: e.target.value })} />
          </CadastroField>
          <CadastroField label="Alvo do lead time P90 (h)" hint="Em branco = sem alvo" error={errosVisiveis.p90}>
            <Input inputMode="decimal" placeholder="Sem alvo" value={r.p90} disabled={somenteLeitura} onChange={(e) => setR({ ...r, p90: e.target.value })} />
          </CadastroField>
          <CadastroField label="Alerta de validade da OC (h)" hint="OCs que vencem dentro deste prazo" error={errosVisiveis.validade} required>
            <Input inputMode="numeric" value={r.validade} disabled={somenteLeitura} onChange={(e) => setR({ ...r, validade: e.target.value })} />
          </CadastroField>
          <CadastroField label="Início do expediente" error={errosVisiveis.inicio} required>
            <Input type="time" value={r.inicio} disabled={somenteLeitura} onChange={(e) => setR({ ...r, inicio: e.target.value })} />
          </CadastroField>
          <CadastroField label="Fim do expediente" hint="Base da projeção do ritmo" error={errosVisiveis.fim} required>
            <Input type="time" value={r.fim} disabled={somenteLeitura} onChange={(e) => setR({ ...r, fim: e.target.value })} />
          </CadastroField>
        </div>
      </Bloco>

      <div className="flex flex-col-reverse gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-muted-foreground">
          {config.ultima_alteracao
            ? `Alterado por ${config.ultima_alteracao.por_nome ?? 'usuário removido'} em ${new Date(config.ultima_alteracao.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
            : 'Valores iniciais: nunca alterados.'}
        </p>
        {podeEditar && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={!alterado || salvar.isPending} onClick={() => descartar.onOpenChange(false)}>
              <Undo2 className="h-4 w-4" /> Descartar
            </Button>
            {/* Simulado: a config vive só na memória da aba — "salvou" seria mentira. */}
            <Button
              type="submit"
              disabled={!alterado || salvar.isPending}
            >
              {salvar.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        )}
      </div>
      {descartar.dialog}
    </form>
  )
}

function TabelaEtapas({
  r, erros, somenteLeitura, setEtapa,
}: {
  r: Rascunho
  erros: Erros
  somenteLeitura: boolean
  setEtapa: (s: EtapaSla, p: Partial<EtapaRascunho>) => void
}) {
  const [periodo] = React.useState(() => intervaloPadrao(30))
  const medido = useRelatorioTempoEtapas({ ...periodo, origem: 'todas', clienteId: null, local: null })
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-body">
        <thead className="bg-muted">
          <tr className="border-b text-left text-meta text-muted-foreground">
            <th scope="col" className="h-9 px-4 font-medium">Etapa</th>
            <th scope="col" className="h-9 px-4 font-medium">Ativo</th>
            <th scope="col" className="h-9 px-4 font-medium">Aviso (h)</th>
            <th scope="col" className="h-9 px-4 font-medium">Alerta (h)</th>
            <th scope="col" className="h-9 px-4 text-right font-medium" title="Tempo na etapa nos últimos 30 dias">Medido 30 dias (P50 / P90)</th>
          </tr>
        </thead>
        <tbody>
          {r.etapas.map((e) => {
            const m = medido.data?.find((x) => x.status === e.status)
            const errAv = erros[`${e.status}.aviso`]
            const errAl = erros[`${e.status}.alerta`]
            return (
              <tr key={e.status} className="border-b align-top last:border-0">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-foreground">
                    <StatusDot status={e.status} /> {STATUS_LABELS[e.status]}
                  </span>
                  {e.status === 'oc_enviada' && <span className="text-meta text-muted-foreground">Sem SLA: a OC já está com o motorista</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Switch
                    checked={e.ativo}
                    disabled={somenteLeitura}
                    onCheckedChange={(v) => setEtapa(e.status, { ativo: v })}
                    aria-label={`SLA ativo em ${STATUS_LABELS[e.status]}`}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    className={cn('h-8 w-24', errAv && 'border-destructive', !e.ativo && 'opacity-60')}
                    inputMode="decimal"
                    value={e.aviso}
                    disabled={somenteLeitura}
                    onChange={(ev) => setEtapa(e.status, { aviso: ev.target.value })}
                    aria-label={`Aviso em horas, ${STATUS_LABELS[e.status]}`}
                    aria-invalid={errAv ? true : undefined}
                  />
                  {errAv && <p className="mt-1 max-w-[10rem] text-meta text-destructive">{errAv}</p>}
                </td>
                <td className="px-4 py-2">
                  <Input
                    className={cn('h-8 w-24', errAl && 'border-destructive', !e.ativo && 'opacity-60')}
                    inputMode="decimal"
                    value={e.alerta}
                    disabled={somenteLeitura}
                    onChange={(ev) => setEtapa(e.status, { alerta: ev.target.value })}
                    aria-label={`Alerta em horas, ${STATUS_LABELS[e.status]}`}
                    aria-invalid={errAl ? true : undefined}
                  />
                  {errAl && <p className="mt-1 max-w-[10rem] text-meta text-destructive">{errAl}</p>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {medido.isLoading ? (
                    <Skeleton className="ml-auto h-4 w-24" />
                  ) : m && m.n >= 5 && m.p50_min != null ? (
                    <>
                      <span className="text-foreground">{fmtDur(m.p50_min)}</span> / {fmtDur(m.p90_min)}
                      <span className="block text-meta">n={fmtInt(m.n)}</span>
                    </>
                  ) : (
                    'amostra pequena'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** "Com estes limites, hoje N estariam fora do SLA" — sobre a fila atual. */
function Previa({ r }: { r: Rascunho }) {
  const fila = useFilaPrevia()
  const [agora] = React.useState(() => Date.now())
  const contar = (cfg: ReturnType<typeof mapaSla>) =>
    (fila.data ?? []).reduce(
      (acc, it) => {
        const c = classificarSla(it.status, it.status_desde, agora, cfg[it.status])
        if (c === 'fora') acc.fora++
        else if (c === 'aviso') acc.aviso++
        return acc
      },
      { fora: 0, aviso: 0 },
    )
  const rascunho = mapaSla(
    r.etapas.map((e) => ({
      status: e.status,
      ativo: e.ativo,
      aviso_min: Math.round((lerNumero(e.aviso) ?? NaN) * 60),
      alerta_min: Math.round((lerNumero(e.alerta) ?? NaN) * 60),
    })),
  )
  const valido = r.etapas.every((e) => {
    const av = lerNumero(e.aviso)
    const al = lerNumero(e.alerta)
    return av != null && al != null && av > 0 && al > av
  })
  const novo = contar(rascunho)
  return (
    <Bloco
      titulo="Prévia"
      subtitulo="Aproximada: a fila muda a cada minuto"
      carregando={fila.isLoading}
      erro={fila.isError}
      onRetry={() => void fila.refetch()}
      alturaEsqueleto={140}
    >
      {valido ? (
        <div className="space-y-3">
          <p className="text-body text-foreground">Com estes limites, hoje</p>
          <p className="font-display text-kpi font-medium tabular-nums text-foreground">
            {fmtInt(novo.fora)} <span className="text-body font-normal text-muted-foreground">estariam fora do SLA</span>
          </p>
          <p className="text-body-sm text-muted-foreground tabular-nums">
            {fmtInt(novo.aviso)} em aviso · {fmtInt(fila.data?.length ?? 0)} na fila e aguardando finalização
          </p>
        </div>
      ) : (
        <p className="text-body text-muted-foreground">Corrija os limites para ver a prévia.</p>
      )}
    </Bloco>
  )
}
