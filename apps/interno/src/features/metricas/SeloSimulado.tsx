import { DADOS_SIMULADOS } from './fonte'

/**
 * Selo discreto no PageHeader enquanto `FONTE === 'simulada'` (fonte.ts): os
 * números da tela são de demonstração. Some sozinho quando a fonte vira 'rpc'.
 */
export function SeloSimulado() {
  if (!DADOS_SIMULADOS) return null
  return (
    <span
      className="inline-flex items-center rounded-[2px] border border-warning-border bg-warning-subtle px-1.5 py-0.5 text-meta font-medium text-warning"
      title="Números de demonstração: as consultas reais entram com a migration 0080. Nada aqui reflete a operação."
    >
      Dados simulados
    </span>
  )
}
