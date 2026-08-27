import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { diasDoIntervalo } from '@/features/relatorios/useRelatorios'

/** A partir daqui o relatório varre muitos meses de solicitações e o gráfico
 *  por dia passa de 180 pontos. Não é limite — é aviso: antes, o preset máximo
 *  era 90 dias e ninguém conseguia pedir uma varredura assim sem querer. */
const DIAS_INTERVALO_LONGO = 180

interface Props {
  /** `yyyy-mm-dd`, como o `<input type="date">` usa. */
  de: string
  ate: string
  onChange: (de: string, ate: string) => void
  /** Volta ao intervalo padrão da tela. Some quando já está nele. */
  onLimpar?: () => void
  mostrarLimpar?: boolean
  /** Prefixo dos ids — a mesma tela pode ter mais de um par. */
  idPrefix: string
}

/**
 * Intervalo "de tal data até tal data", o mesmo controle da Conferência de
 * Viagem. Substituiu as abas de preset (7 dias / 30 dias / mês) no Dashboard e
 * nos Relatórios: preset responde "quanto tempo atrás", e a pergunta da
 * operação costuma ser "o que aconteceu entre estas duas datas".
 *
 * O `max` de um input é o valor do outro, então a faixa invertida nem chega a
 * ser escolhível no seletor.
 */
export function IntervaloDatas({ de, ate, onChange, onLimpar, mostrarLimpar, idPrefix }: Props) {
  const dias = diasDoIntervalo(de, ate)
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
      <div>
        <label
          htmlFor={`${idPrefix}-de`}
          className="mb-1 block text-[10px] uppercase tracking-[0.5px] text-muted-foreground"
        >
          De
        </label>
        <Input
          id={`${idPrefix}-de`}
          type="date"
          value={de}
          max={ate || undefined}
          onChange={(e) => onChange(e.target.value, ate)}
          className="w-[160px]"
        />
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-ate`}
          className="mb-1 block text-[10px] uppercase tracking-[0.5px] text-muted-foreground"
        >
          Até
        </label>
        <Input
          id={`${idPrefix}-ate`}
          type="date"
          value={ate}
          min={de || undefined}
          onChange={(e) => onChange(de, e.target.value)}
          className="w-[160px]"
        />
      </div>
      {mostrarLimpar && onLimpar && (
        <Button variant="ghost" size="sm" onClick={onLimpar}>
          <Eraser className="h-3.5 w-3.5" />
          Limpar
        </Button>
      )}

      {dias > DIAS_INTERVALO_LONGO && (
        <p className="w-full text-[11px] text-amber-700 dark:text-amber-400">
          {dias} dias no intervalo — a consulta varre todas as solicitações do
          período e pode demorar.
        </p>
      )}
    </div>
  )
}
