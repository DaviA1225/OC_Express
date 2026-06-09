import * as React from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { LatLngBounds } from 'leaflet'
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
        {semCoordenadas > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            {semCoordenadas} sem latitude/longitude (não aparecem)
          </span>
        )}
      </div>

      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border bg-background">
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
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={8}
              pathOptions={{
                color: '#b91c1c',
                fillColor: '#ef4444',
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <PopupConteudo p={p} />
              </Popup>
            </CircleMarker>
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
          <FreteLinha label="Caçamba" value={p.frete_cacamba} className="bg-amber-50 text-amber-800 border-amber-200" />
        )}
        {p.aceita_graneleiro && (
          <FreteLinha label="Graneleiro" value={p.frete_graneleiro} className="bg-sky-50 text-sky-800 border-sky-200" />
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
