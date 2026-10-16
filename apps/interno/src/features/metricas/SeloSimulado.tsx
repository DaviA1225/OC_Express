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

/**
 * Trava de produção: se um build de produção sair com `FONTE === 'simulada'`
 * (fonte.ts), a tela ganha uma faixa de largura total, além do selo — número de
 * mentira em produção não pode passar por número real.
 */
export function FaixaSimulacaoProducao() {
  if (!(import.meta.env.PROD && DADOS_SIMULADOS)) return null
  return (
    <div role="alert" className="w-full border border-warning-border bg-warning-subtle px-4 py-2 text-body font-medium text-warning">
      Dados simulados — não usar para decisão. As consultas reais ainda não foram ligadas nesta versão.
    </div>
  )
}
