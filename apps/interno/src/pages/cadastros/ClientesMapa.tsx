import * as React from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from 'react-leaflet'
import { LatLngBounds, divIcon, type DivIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPinned, Truck } from 'lucide-react'
import { formatNumeroOC } from '@/lib/utils'
import { SolicitacaoStatusBadge } from '@/components/shared/SolicitacaoStatusBadge'
import { cn } from '@/lib/utils'
import type { ClienteMapaPonto } from '@/features/clientes/useClientesMapa'
import { Spinner } from '@/components/shared/Spinner'
import { useTheme } from '@/hooks/useTheme'

// Centro aproximado do Brasil e zoom inicial — usados como fallback quando não
// há pontos suficientes para calcular um enquadramento.
const BRASIL_CENTRO: [number, number] = [-14.5, -52]
const BRASIL_ZOOM = 4

// Tiles por tema: OSM padrão no claro; CARTO dark_all no escuro (o OSM claro
// ofuscava o tema escuro). O img-src da CSP (apps/interno/vercel.json) libera
// os dois domínios.
const TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const

// Pin de localização (SVG inline). Cor muda pelo status de liberação para que
// cada localidade comunique de imediato se está liberada (ok) ou bloqueada
// (bad). Quando há veículos carregando, um badge mostra a quantidade.
// As cores são var() dos tokens de gráfico: o HTML do divIcon vive no DOM da
// página, então o pin troca de tom junto com o tema sem recriar o ícone.
const FILL = { liberado: 'var(--chart-ok)', bloqueado: 'var(--chart-bad)' } as const

const iconCache = new Map<string, DivIcon>()

function pinIcon(liberado: boolean, carregando: number): DivIcon {
  const key = `${liberado ? 'L' : 'B'}-${carregando}`
  const cached = iconCache.get(key)
  if (cached) return cached
  const fill = liberado ? FILL.liberado : FILL.bloqueado
  // Badge neutro (texto 1 sobre superfície invertida), raio 2px — sem azul solto.
  const badge =
    carregando > 0
      ? `<span style="position:absolute;top:-4px;right:-6px;display:flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;border-radius:2px;background:hsl(var(--foreground));color:hsl(var(--background));font:600 10px/1 ui-sans-serif,system-ui;font-variant-numeric:tabular-nums;border:1px solid hsl(var(--card));">${carregando}</span>`
      : ''
  const html = `<div style="position:relative;width:21px;height:28px;">
    <svg width="21" height="28" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.37 18.63 0 12 0z" fill="${fill}" stroke="hsl(var(--card))" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.6" fill="hsl(var(--card))"/>
    </svg>
    ${badge}
  </div>`
  const icon = divIcon({
    html,
    className: 'cliente-pin-icon',
    iconSize: [21, 28],
    iconAnchor: [10, 28],
    popupAnchor: [0, -25],
  })
  iconCache.set(key, icon)
  return icon
}

function formatFrete(value: number | null): string {
  if (value == null) return '—'
  return (
    value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' /t'
  )
}

/** Ajusta o enquadramento do mapa para conter todos os pontos visíveis. */
function FitBounds({ pontos }: { pontos: ClienteMapaPonto[] }) {
  const map = useMap()
  const key = pontos.map((p) => p.id).join(',')
  React.useEffect(() => {
    if (pontos.length === 0) return
    if (pontos.length === 1) {
      map.setView([pontos[0].latitude, pontos[0].longitude], 9)
      return
    }
    const bounds = new LatLngBounds(pontos.map((p) => [p.latitude, p.longitude]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 11 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

interface Props {
  pontos: ClienteMapaPonto[]
  isLoading: boolean
  semCoordenadas: number
}

export function ClientesMapa({ pontos, isLoading, semCoordenadas }: Props) {
  const { theme } = useTheme()
  const tiles = TILES[theme]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPinned className="h-3.5 w-3.5" />
          {pontos.length} {pontos.length === 1 ? 'cliente no mapa' : 'clientes no mapa'}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LegendaItem cor={FILL.liberado} label="Liberado" />
          <LegendaItem cor={FILL.bloqueado} label="Bloqueado" />
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-[2px] bg-foreground px-1 text-meta font-semibold leading-none text-background">
              n
            </span>
            veículos carregando
          </span>
          {semCoordenadas > 0 && (
            <span className="text-warning">
              {semCoordenadas} sem coordenadas (não aparecem)
            </span>
          )}
        </div>
      </div>

      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border bg-card">
        {isLoading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-card/60">
            <Spinner size="md" label="Carregando mapa" className="text-muted-foreground" />
          </div>
        )}
        <MapContainer
          center={BRASIL_CENTRO}
          zoom={BRASIL_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: theme === 'dark' ? 'hsl(var(--canvas))' : 'hsl(var(--muted))' }}
        >
          {/* key = tema: remonta a camada ao trocar o tema (url, subdomínios e
              atribuição mudam juntos), sem recarregar a página. */}
          <TileLayer key={theme} attribution={tiles.attribution} url={tiles.url} subdomains={tiles.subdomains} />
          <FitBounds pontos={pontos} />
          {pontos.map((p) => (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={pinIcon(p.liberado, p.carregando.length)}
              zIndexOffset={p.carregando.length > 0 ? 1000 : 0}
            >
              <Tooltip permanent direction="top" offset={[0, -28]} className="cliente-tooltip">
                {p.razao_social}
              </Tooltip>
              <Popup className="[&_.leaflet-popup-content-wrapper]:rounded-surface [&_.leaflet-popup-content-wrapper]:border [&_.leaflet-popup-content-wrapper]:bg-popover [&_.leaflet-popup-content-wrapper]:text-popover-foreground [&_.leaflet-popup-content-wrapper]:shadow-overlay [&_.leaflet-popup-tip]:bg-popover">
                <PopupConteudo p={p} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}

function PopupConteudo({ p }: { p: ClienteMapaPonto }) {
  const local = [p.cidade, p.uf].filter(Boolean).join('/')
  return (
    <div className="min-w-[220px] space-y-2">
      <div>
        <p className="text-body font-semibold leading-tight text-foreground">{p.razao_social}</p>
        {local && <p className="text-meta text-muted-foreground">{local}</p>}
      </div>

      <div className="space-y-1">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[2px] px-1.5 py-0.5 text-meta font-medium',
            p.liberado ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', p.liberado ? 'bg-chart-ok' : 'bg-chart-bad')} />
          {p.liberado ? 'Liberado' : 'Bloqueado'}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {p.aceita_cacamba && (
          <FreteLinha label="Caçamba" value={p.frete_cacamba} className="cat-brass" />
        )}
        {p.aceita_graneleiro && (
          <FreteLinha label="Graneleiro" value={p.frete_graneleiro} className="cat-steel" />
        )}
        {!p.aceita_cacamba && !p.aceita_graneleiro && (
          <span className="text-meta text-muted-foreground">Sem frete configurado</span>
        )}
      </div>

      <div className="border-t pt-2">
        <p className="mb-1 flex items-center gap-1 text-meta font-semibold text-muted-foreground">
          <Truck className="h-3 w-3" />
          Carregando ({p.carregando.length})
        </p>
        {p.carregando.length === 0 ? (
          <p className="text-meta text-muted-foreground">Nenhum veículo em carregamento.</p>
        ) : (
          <ul className="space-y-1">
            {p.carregando.map((c) => {
              const placas = [c.veiculo, c.carreta].filter(Boolean).join(' / ')
              return (
                <li key={c.id} className="text-meta leading-tight">
                  <span className="font-medium text-primary-strong">{formatNumeroOC(c.numero_interno)}</span>
                  {' · '}
                  <span className="text-foreground">{placas || 'sem placa'}</span>
                  {c.motorista && <span className="text-muted-foreground"> · {c.motorista}</span>}
                  <SolicitacaoStatusBadge status={c.status} className="ml-1" />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function LegendaItem({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: cor }}
      />
      {label}
    </span>
  )
}

function FreteLinha({
  label,
  value,
  className,
}: {
  label: string
  value: number | null
  className: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-between gap-2 rounded-[2px] border px-1.5 py-0.5 text-meta font-medium leading-tight',
        className,
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatFrete(value)}</span>
    </span>
  )
}
