import { toast } from 'sonner'
import { AlarmClock, CheckCircle2, ClipboardList, Download, Handshake, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiTile } from '@/components/shared/KpiTile'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { Bloco, Vazio } from '@/components/painel/Bloco'
import { labelPerfil } from '@/features/auth/perfis'
import { IntervaloDatas } from '@/features/relatorios/IntervaloDatas'
import { useIntervaloPersistido } from '@/features/relatorios/useIntervaloPersistido'
import { intervaloPadrao, rotuloIntervalo } from '@/features/relatorios/intervalo'
import { exportarProdutividade } from '@/features/relatorios/exportacao'
import { linkSolicitacao } from '@/features/metricas/links'
import { mapaSla, type SlaCfg } from '@/features/metricas/sla'
import { useMetasSla } from '@/features/metricas/useMetasSla'
import { LinkDrill } from '@/components/painel/LinkDrill'
import { useProdutividade } from '@/features/metricas/useRelatorioMetricas'
import type { AbertaParada, ProdutividadeUsuario } from '@/features/metricas/tipos'
import { fmtDur, fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TabelaOrdenavel, type Coluna } from './TabelaOrdenavel'

// Mesmo intervalo inicial da tela de Relatórios: últimos 30 dias.
const INTERVALO_PADRAO = intervaloPadrao(30)

/**
 * Produtividade da equipe (§1.3, só gestão): o que cada atendente fez no
 * período, contado pelas TRANSIÇÕES (solicitações distintas por etapa). O
 * agente de WhatsApp aparece numa linha separada, fora dos totais (N3).
 */
export default function RelatoriosInternosPage() {
  const intervalo = useIntervaloPersistido('relatorios-internos', INTERVALO_PADRAO)
  const q = useProdutividade({ de: intervalo.de, ate: intervalo.ate })
  const data = q.data
  const totais = data?.totais

  const exportar = () => {
    if (!data) return
    try {
      exportarProdutividade(intervalo.de, intervalo.ate, data)
      toast.success('Relatório exportado')
    } catch (err) {
      toast.error('Falha ao exportar')
      console.error(err)
    }
  }

  const kpi = (n: number | undefined) => (q.isLoading ? <Skeleton className="inline-block h-8 w-16 align-middle" /> : q.isError ? '—' : fmtInt(n ?? 0))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produtividade da equipe"
        description={rotuloIntervalo(intervalo.de, intervalo.ate)}
        actions={
          <>
            <IntervaloDatas
              idPrefix="rel-int"
              de={intervalo.deCampo}
              ate={intervalo.ateCampo}
              onChange={intervalo.setIntervalo}
              mostrarLimpar={!intervalo.noPadrao}
              onLimpar={intervalo.limpar}
            />
            <Button type="button" variant="outline" onClick={exportar} disabled={q.isLoading || !data} title="Exportar produtividade em CSV">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Entradas no período" value={kpi(totais?.entradas)} icon={ClipboardList} />
        <KpiTile label="De parceiros" value={kpi(totais?.de_parceiro)} icon={Handshake} />
        <KpiTile label="Finalizadas" value={kpi(totais?.finalizadas)} icon={CheckCircle2} />
        <KpiTile label="Em aberto" value={kpi(totais?.abertas)} icon={AlarmClock} />
        <KpiTile
          label="Recebidas sem responsável"
          value={kpi(totais?.recebidas_sem_responsavel)}
          icon={TriangleAlert}
          className="col-span-2 sm:col-span-1"
          tone={!q.isLoading && (totais?.recebidas_sem_responsavel ?? 0) > 0 ? 'alert' : 'default'}
        />
      </div>

      <Bloco
        titulo="Por atendente"
        subtitulo="Solicitações distintas em que a pessoa fez cada transição no período (reaberturas não contam em dobro). Clique no cabeçalho para ordenar."
        carregando={q.isLoading}
        erro={q.isError}
        onRetry={() => void q.refetch()}
        alturaEsqueleto={320}
      >
        {data &&
          (data.usuarios.length === 0 && !data.agente ? (
            <Vazio>Nenhuma atividade da equipe no período.</Vazio>
          ) : (
            <TabelaEquipe usuarios={data.usuarios} agente={data.agente} />
          ))}
      </Bloco>

      <Bloco
        titulo="Abertas paradas"
        subtitulo="Solicitações de parceiro em andamento, da mais parada para a menos, com quem as pôs em emissão"
        carregando={q.isLoading}
        erro={q.isError}
        onRetry={() => void q.refetch()}
        alturaEsqueleto={200}
      >
        {data && <Paradas abertas={data.abertas_paradas} />}
      </Bloco>
    </div>
  )
}

function TabelaEquipe({ usuarios, agente }: { usuarios: ProdutividadeUsuario[]; agente: ProdutividadeUsuario | null }) {
  const colunas: Coluna<ProdutividadeUsuario>[] = [
    {
      chave: 'nome',
      rotulo: 'Atendente',
      valor: (u) => u.nome,
      render: (u) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn('font-medium text-foreground', !u.ativo && 'text-muted-foreground line-through')}>{u.nome}</span>
          <span className="text-meta text-muted-foreground">{labelPerfil(u.perfil)}</span>
        </span>
      ),
    },
    { chave: 'criou', rotulo: 'Criou', titulo: 'Solicitações registradas por ele', alinhar: 'direita', valor: (u) => u.criou },
    { chave: 'em_emissao', rotulo: 'Em emissão', titulo: 'Solicitações que ele pôs em emissão', alinhar: 'direita', valor: (u) => u.em_emissao },
    { chave: 'gerou_oc', rotulo: 'Gerou OC', alinhar: 'direita', valor: (u) => u.gerou_oc },
    { chave: 'enviou_oc', rotulo: 'Enviou OC', alinhar: 'direita', valor: (u) => u.enviou_oc },
    { chave: 'finalizou', rotulo: 'Finalizou', alinhar: 'direita', valor: (u) => u.finalizou, render: (u) => <span className="font-medium text-foreground">{fmtInt(u.finalizou)}</span> },
    {
      chave: 'conclusao',
      rotulo: 'Conclusão P50',
      titulo: 'Mediana de "Em emissão" até a finalização, nas que ele finalizou',
      alinhar: 'direita',
      valor: (u) => u.conclusao_p50_min,
      render: (u) => <span className="text-muted-foreground">{fmtDur(u.conclusao_p50_min)}</span>,
    },
    {
      chave: 'em_aberto',
      rotulo: 'Em aberto',
      titulo: 'Última entrada em "Em emissão" foi dele e seguem abertas',
      alinhar: 'direita',
      valor: (u) => u.em_aberto,
      render: (u) => <span className={cn(u.em_aberto > 0 ? 'text-foreground' : 'text-muted-foreground')}>{fmtInt(u.em_aberto)}</span>,
    },
    {
      chave: 'parada',
      rotulo: 'Parada mais longa',
      titulo: 'Maior tempo na etapa atual entre as em aberto com ele',
      alinhar: 'direita',
      valor: (u) => u.parada_mais_longa_min,
      render: (u) => <TempoParado min={u.parada_mais_longa_min} />,
    },
  ]
  const soma = (k: 'criou' | 'em_emissao' | 'gerou_oc' | 'enviou_oc' | 'finalizou' | 'em_aberto') => usuarios.reduce((a, u) => a + u[k], 0)
  const celula = 'h-10 px-4 text-right tabular-nums'
  const rodape = (
    <>
      <tr className="border-t-2 bg-muted font-medium">
        <td className="h-10 px-4 text-foreground">Total da equipe</td>
        <td className={celula}>{fmtInt(soma('criou'))}</td>
        <td className={celula}>{fmtInt(soma('em_emissao'))}</td>
        <td className={celula}>{fmtInt(soma('gerou_oc'))}</td>
        <td className={celula}>{fmtInt(soma('enviou_oc'))}</td>
        <td className={celula}>{fmtInt(soma('finalizou'))}</td>
        <td className={celula} />
        <td className={celula}>{fmtInt(soma('em_aberto'))}</td>
        <td className={celula} />
      </tr>
      {agente && (
        <>
          <tr>
            <td colSpan={9} className="px-4 pb-1 pt-4 text-meta font-medium text-muted-foreground">
              Fora dos totais
            </td>
          </tr>
          <tr className="border-t">
            <td className="h-10 px-4">
              <span className="font-medium text-foreground">{agente.nome}</span>
              <span className="ml-1.5 text-meta text-muted-foreground">automação</span>
            </td>
            <td className={celula}>{fmtInt(agente.criou)}</td>
            <td className={celula}>{fmtInt(agente.em_emissao)}</td>
            <td className={celula}>{fmtInt(agente.gerou_oc)}</td>
            <td className={celula}>{fmtInt(agente.enviou_oc)}</td>
            <td className={celula}>{fmtInt(agente.finalizou)}</td>
            <td className={cn(celula, 'text-muted-foreground')}>{fmtDur(agente.conclusao_p50_min)}</td>
            <td className={celula}>{fmtInt(agente.em_aberto)}</td>
            <td className={celula}><TempoParado min={agente.parada_mais_longa_min} /></td>
          </tr>
        </>
      )}
    </>
  )
  return (
    <TabelaOrdenavel
      rotulo="Produtividade por atendente"
      colunas={colunas}
      linhas={usuarios}
      chaveLinha={(u) => u.usuario_id}
      ordemInicial={{ coluna: 'finalizou', dir: 'desc' }}
      rodape={rodape}
    />
  )
}

/**
 * Tempo parado. Com a etapa conhecida (lista de abertas), colore pelo SLA
 * VIGENTE dessa etapa: aviso em atenção, acima do alerta em laranja. Na coluna
 * "Parada mais longa" o payload não traz a etapa — fica neutro (contrato: se
 * quiserem cor ali, `relatorio_produtividade` precisa devolver a etapa).
 */
function TempoParado({ min, cfg }: { min: number | null; cfg?: SlaCfg | null }) {
  if (min == null) return <span className="text-muted-foreground">—</span>
  if (!cfg || !cfg.ativo) return <span className="text-muted-foreground">{fmtDur(min)}</span>
  return (
    <span className={cn(min > cfg.alerta_min ? 'font-medium text-primary-strong' : min >= cfg.aviso_min ? 'text-warning' : 'text-muted-foreground')}>
      {fmtDur(min)}
    </span>
  )
}

function Paradas({ abertas }: { abertas: AbertaParada[] }) {
  const metas = useMetasSla()
  const sla = mapaSla(metas.data?.etapas)
  if (abertas.length === 0) return <Vazio altura={80}>Nenhuma solicitação de parceiro parada.</Vazio>
  return (
    <ul className="divide-y">
      {abertas.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-sm">
          <LinkDrill to={linkSolicitacao(a.id)} className="w-14 shrink-0 font-medium tabular-nums text-primary-strong hover:underline">
            #{String(a.numero_interno).padStart(4, '0')}
          </LinkDrill>
          <SolicitacaoStatusBadge status={a.status} />
          <span className="min-w-0 flex-1 truncate text-foreground">{a.parceiro ?? 'Parceiro —'}</span>
          <span className="shrink-0 text-muted-foreground">
            com <span className="font-medium text-foreground">{a.responsavel}</span>
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums">
            <TempoParado min={a.min_na_etapa} cfg={a.status in sla ? sla[a.status as keyof typeof sla] : null} />
          </span>
        </li>
      ))}
    </ul>
  )
}
