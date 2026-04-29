import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { profile } = useAuth()
  const saudacao = saudar()
  const nome = profile?.nome_completo?.split(' ')[0] ?? 'usuário'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-medium text-foreground">
          {saudacao}, {nome}.
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Aqui está o resumo do dia.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricPlaceholder label="OCs emitidas hoje" />
        <MetricPlaceholder label="Solicitações pendentes" />
        <MetricPlaceholder label="Aguardando documentação" />
        <MetricPlaceholder label="Minha produtividade hoje" />
      </div>

      <div className="rounded-lg border bg-background p-4">
        <p className="text-[13px] text-muted-foreground">
          Os gráficos e a tabela de últimas solicitações serão implementados na Fase 6.
        </p>
      </div>
    </div>
  )
}

function MetricPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-medium text-foreground">—</p>
      <p className="mt-1 text-[11px] text-muted-foreground">aguardando dados</p>
    </div>
  )
}

function saudar() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
