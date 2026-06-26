import * as React from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from 'react-leaflet'
import { LatLngBounds, divIcon, type DivIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, MapPinned, Truck } from 'lucide-react'
import { STATUS_LABELS } from '@/features/solicitacoes/status'
import { formatNumeroOC } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ClienteMapaPonto } from '@/features/clientes/useClientesMapa'

// Centro aproximado do Brasil e zoom inicial — usados como fallback quando não
// há pontos suficientes para calcular um enquadramento.
const BRASIL_CENTRO: [number, number] = [-14.5, -52]
const BRASIL_ZOOM = 4

// Pin de localização (SVG inline). Cor muda pelo status de liberação para que
// cada localidade comunique de imediato se está liberada (verde) ou bloqueada
// (vermelho). Quando há veículos carregando, um badge mostra a quantidade.
const FILL = { liberado: '#16a34a', bloqueado: '#ef4444' } as const
const STROKE = { liberado: '#15803d', bloqueado: '#991b1b' } as const

const iconCache = new Map<string, DivIcon>()

function pinIcon(liberado: boolean, carregando: number): DivIcon {
  const key = `${liberado ? 'L' : 'B'}-${carregando}`
  const cached = iconCache.get(key)
  if (cached) return cached
  const fill = liberado ? FILL.liberado : FILL.bloqueado
  const stroke = liberado ? STROKE.liberado : STROKE.bloqueado
  const badge =
    carregando > 0
      ? `<span style="position:absolute;top:-4px;right:-5px;display:flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#2563eb;color:#fff;font:700 9px/1 ui-sans-serif,system-ui;border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3);">${carregando}</span>`
      : ''
  const html = `<div style="position:relative;width:21px;height:28px;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35));">
    <svg width="21" height="28" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.37 18.63 0 12 0z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.6" fill="#fff"/>
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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPinned className="h-3.5 w-3.5" />
          {pontos.length} {pontos.length === 1 ? 'cliente no mapa' : 'clientes no mapa'}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LegendaItem cor="#16a34a" label="Liberado" />
          <LegendaItem cor="#ef4444" label="Bloqueado" />
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-blue-600 px-1 text-[9px] font-bold leading-none text-white shadow">
              n
            </span>
            veículos carregando
          </span>
          {semCoordenadas > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {semCoordenadas} sem coordenadas (não aparecem)
            </span>
          )}
        </div>
      </div>

      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border bg-card">
        {isLoading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <MapContainer
          center={BRASIL_CENTRO}
          zoom={BRASIL_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: '#aad3df' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
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
              <Popup>
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
        <p className="text-[13px] font-semibold leading-tight text-foreground">{p.razao_social}</p>
        {local && <p className="text-[11px] text-muted-foreground">{local}</p>}
      </div>

      <div className="space-y-1">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
            p.liberado ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', p.liberado ? 'bg-emerald-500' : 'bg-red-500')} />
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
          <span className="text-[11px] text-muted-foreground">Sem frete configurado</span>
        )}
      </div>

      <div className="border-t pt-2">
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
          <Truck className="h-3 w-3" />
          Carregando ({p.carregando.length})
        </p>
        {p.carregando.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhum veículo em carregamento.</p>
        ) : (
          <ul className="space-y-1">
            {p.carregando.map((c) => {
              const placas = [c.veiculo, c.carreta].filter(Boolean).join(' / ')
              return (
                <li key={c.id} className="text-[11px] leading-tight">
                  <span className="font-medium text-primary">{formatNumeroOC(c.numero_interno)}</span>
                  {' · '}
                  <span className="text-foreground">{placas || 'sem placa'}</span>
                  {c.motorista && <span className="text-muted-foreground"> · {c.motorista}</span>}
                  <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {STATUS_LABELS[c.status]}
                  </span>
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
        className="inline-block h-3 w-3 rounded-full border border-black/20"
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
        'inline-flex items-center justify-between gap-2 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight',
        className,
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatFrete(value)}</span>
    </span>
  )
}
