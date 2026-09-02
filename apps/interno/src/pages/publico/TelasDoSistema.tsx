import * as React from 'react'
import { Search, FileText, Send, Copy, Clock, CheckCircle2, CalendarClock, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Reproduções das telas que o atendente usa todo dia: fila, solicitação
 * aberta e painel de agendamento.
 *
 * SÃO REPRODUÇÕES, não capturas de tela, e a diferença é deliberada: um print
 * do sistema real numa página pública publicaria nome e CPF de motorista, placa
 * e carteira de clientes da LHG. É o mesmo dado que a migration 0072 acabou de
 * tirar do alcance de quem não tem sessão, e não faria sentido devolvê-lo aqui
 * em forma de imagem.
 *
 * O que é fiel: a estrutura, os rótulos, os estados e as cores, lidos dos
 * componentes de verdade (`SolicitacaoStatusBadge`, `features/solicitacoes/
 * status.ts`, `features/agendamentos/`). O CPF aparece mascarado porque o
 * sistema o mascara mesmo, porque revelar só ao copiar é regra de LGPD dele.
 *
 * O que é inventado: pessoas, placas e empresas. Nenhuma existe.
 */

const STATUS = {
  recebida: { rotulo: 'Recebida', classe: 'bg-slate-100 text-slate-700' },
  em_cadastro: { rotulo: 'Em emissão', classe: 'bg-[#FFE8D6] text-[#C44612]' },
  oc_gerada: { rotulo: 'OC gerada', classe: 'bg-[#F4D4BD] text-[#8F3700]' },
  oc_enviada: { rotulo: 'OC enviada', classe: 'bg-emerald-100 text-emerald-800' },
  finalizada: { rotulo: 'Finalizada', classe: 'bg-emerald-200 text-emerald-900' },
} as const

function Badge({ tipo }: { tipo: keyof typeof STATUS }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        STATUS[tipo].classe,
      )}
    >
      {STATUS[tipo].rotulo}
    </span>
  )
}

/** Moldura comum das três telas: barra de janela + legenda embaixo. */
export function Tela({
  titulo,
  legenda,
  children,
}: {
  titulo: string
  legenda: string
  children: React.ReactNode
}) {
  return (
    <figure className="m-0">
      <div
        aria-hidden
        className="overflow-hidden rounded-xl border border-[#E1E4EA] bg-white shadow-[0_20px_50px_-24px_rgba(26,31,40,0.4)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
      >
        <div className="flex items-center gap-2 border-b border-[#E1E4EA] bg-[#F5F7F9] px-3 py-2 dark:border-[var(--border-dark)] dark:bg-white/5">
          <span className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#E1E4EA]" />
            <span className="h-2 w-2 rounded-full bg-[#E1E4EA]" />
            <span className="h-2 w-2 rounded-full bg-[#E1E4EA]" />
          </span>
          <span className="text-[11px] font-medium text-[#6B7280]">{titulo}</span>
        </div>
        <div className="p-4">{children}</div>
      </div>
      <figcaption className="mt-3 text-[13px] leading-relaxed text-[#6B7280]">{legenda}</figcaption>
    </figure>
  )
}

/** 1. A fila. É a primeira tela do dia. */
export function TelaFila() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-[#E1E4EA] bg-[#F5F7F9] px-3 py-2 dark:border-[var(--border-dark)] dark:bg-white/5">
        <Search className="h-3.5 w-3.5 text-[#6B7280]" />
        <span className="text-[12px] text-[#6B7280]">
          Buscar por número, motorista, CPF, placa ou cliente
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['recebida', 'em_cadastro', 'oc_gerada', 'oc_enviada', 'finalizada'] as const).map((s) => (
          <span
            key={s}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px]',
              s === 'recebida'
                ? 'border-[#FF5100] bg-[#FF5100]/10 font-medium text-[#C44612]'
                : 'border-[#E1E4EA] text-[#6B7280] dark:border-[var(--border-dark)]',
            )}
          >
            {STATUS[s].rotulo}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        <CardSolicitacao
          numero="0287"
          status="recebida"
          espera="há 12min"
          motorista="Anderson Ribeiro"
          veiculo="SIK6H90 / QXR4B21"
          cliente="Siderúrgica Vale Verde"
          material="SINTER"
        />
        <CardSolicitacao
          numero="0286"
          status="em_cadastro"
          espera="há 40min"
          motorista="Marcos Vinícius Alves"
          veiculo="RTB8J45 / LPD2C77"
          cliente="Metalúrgica Serra Azul"
          material="HEMATITA"
        />
        <CardSolicitacao
          numero="0285"
          status="oc_enviada"
          motorista="Cleber Antunes"
          veiculo="HFG1M06 / VNE9K34"
          cliente="Siderúrgica Vale Verde"
          material="LUMP"
        />
      </div>
    </div>
  )
}

function CardSolicitacao({
  numero,
  status,
  espera,
  motorista,
  veiculo,
  cliente,
  material,
}: {
  numero: string
  status: keyof typeof STATUS
  espera?: string
  motorista: string
  veiculo: string
  cliente: string
  material: string
}) {
  return (
    <div className="rounded-lg border border-[#E1E4EA] p-3 dark:border-[var(--border-dark)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[12px] font-medium text-[#1A1F28] dark:text-white">
          #{numero}
        </span>
        <span className="flex items-center gap-1.5">
          {espera && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EDEFF2] px-2 py-0.5 text-[10px] text-[#475569] dark:bg-white/10 dark:text-slate-300">
              <Clock className="h-2.5 w-2.5" />
              {espera}
            </span>
          )}
          <Badge tipo={status} />
        </span>
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#E1E4EA] pt-2.5 text-[12px] dark:border-[var(--border-dark)]">
        <Campo rotulo="Motorista" valor={motorista} extra="•••.•••.789-••" />
        <Campo rotulo="Veículo" valor={veiculo} mono />
        <Campo rotulo="Cliente" valor={cliente} />
        <Campo rotulo="Material" valor={material} />
      </dl>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  extra,
  mono,
}: {
  rotulo: string
  valor: string
  extra?: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.5px] text-[#6B7280]">{rotulo}</dt>
      <dd
        className={cn(
          'truncate font-medium text-[#1A1F28] dark:text-slate-100',
          mono && 'font-mono text-[11px]',
        )}
      >
        {valor}
      </dd>
      {extra && <dd className="font-mono text-[10px] text-[#6B7280]">{extra}</dd>}
    </div>
  )
}

/** 2. A solicitação aberta: onde a OC nasce. */
export function TelaSolicitacao() {
  const etapas = [
    { rotulo: 'Recebida', feito: true },
    { rotulo: 'Em emissão', feito: true },
    { rotulo: 'OC gerada', feito: true },
    { rotulo: 'OC enviada', feito: false },
  ]

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
            Solicitação #0287
          </span>
          <Badge tipo="oc_gerada" />
        </div>
        <span className="text-[11px] text-[#6B7280]">Instrução 45821</span>
      </div>

      {/* Linha do tempo: o estado de cada OC é do sistema, não da memória de
          quem atendeu. */}
      <ol className="flex flex-wrap items-center gap-2">
        {etapas.map((e, i) => (
          <li key={e.rotulo} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]',
                e.feito
                  ? 'bg-[#FF5100]/10 font-medium text-[#C44612]'
                  : 'border border-dashed border-[#E1E4EA] text-[#6B7280] dark:border-[var(--border-dark)]',
              )}
            >
              {e.feito && <CheckCircle2 className="h-3 w-3" />}
              {e.rotulo}
            </span>
            {i < etapas.length - 1 && <span className="h-px w-4 bg-[#E1E4EA]" />}
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-[#E1E4EA] p-3 text-[12px] sm:grid-cols-3 dark:border-[var(--border-dark)]">
        <Campo rotulo="Motorista" valor="Anderson Ribeiro" extra="•••.•••.789-••" />
        <Campo rotulo="Telefone" valor="(31) 9••••-••99" />
        <Campo rotulo="Cavalo" valor="SIK6H90" mono />
        <Campo rotulo="Carreta" valor="QXR4B21" mono />
        <Campo rotulo="Cliente" valor="Siderúrgica Vale Verde" />
        <Campo rotulo="Material" valor="SINTER" />
        <Campo rotulo="Subcontratada" valor="Transportes Boa Vista" />
        <Campo rotulo="Pamcard" valor="Providenciado" />
        <Campo rotulo="Peso" valor="36,78 t" />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-lg bg-[#FF5100] px-3.5 py-2 text-[12px] font-semibold text-white">
          <FileText className="h-3.5 w-3.5" />
          Gerar OC
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-[#E1E4EA] px-3.5 py-2 text-[12px] font-medium text-[#1A1F28] dark:border-[var(--border-dark)] dark:text-slate-100">
          <Send className="h-3.5 w-3.5" />
          Enviar por WhatsApp
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-[#E1E4EA] px-3.5 py-2 text-[12px] font-medium text-[#1A1F28] dark:border-[var(--border-dark)] dark:text-slate-100">
          <Paperclip className="h-3.5 w-3.5" />
          Anexos
        </span>
      </div>
    </div>
  )
}

/** 3. O painel de agendamento: o SisLog não fala com o sistema do terminal,
 *  então prepara o que precisa ser colado nele. */
export function TelaAgendamento() {
  const linhas = [
    { rotulo: 'Placa cavalo', valor: 'SIK6H90' },
    { rotulo: 'Placa carreta', valor: 'QXR4B21' },
    { rotulo: 'Tipo de veículo', valor: 'Caçamba' },
    { rotulo: 'Nota fiscal', valor: '6/254215' },
    { rotulo: 'Motorista', valor: 'Anderson Ribeiro' },
    { rotulo: 'CPF', valor: '•••.•••.789-••' },
  ]

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
          <span className="font-mono text-[12px] font-normal text-[#6B7280]">#A0042</span>{' '}
          A.B / CSN Pindamonhangaba
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFE8D6] px-2 py-0.5 text-[11px] font-medium text-[#C44612]">
          Em atendimento
        </span>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.5px] text-[#6B7280]">Dados para o terminal</p>
        <ul className="mt-1.5 divide-y divide-[#E1E4EA] rounded-lg border border-[#E1E4EA] dark:divide-[var(--border-dark)] dark:border-[var(--border-dark)]">
          {linhas.map((l) => (
            <li key={l.rotulo} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
              <span className="w-[92px] shrink-0 text-[#6B7280]">{l.rotulo}</span>
              <span className="flex-1 truncate font-medium text-[#1A1F28] dark:text-slate-100">
                {l.valor}
              </span>
              <Copy className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.5px] text-[#6B7280]">
          Hora agendada · grade da caçamba
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {['01:00', '07:00', '13:00', '19:00', '22:00'].map((h) => (
            <span
              key={h}
              className={cn(
                'flex min-w-[58px] flex-col items-center rounded-lg border px-2.5 py-1.5 text-[12px] font-medium tabular-nums',
                h === '13:00'
                  ? 'border-[#FF5100] bg-[#FF5100] text-white'
                  : 'border-[#E1E4EA] text-[#1A1F28] dark:border-[var(--border-dark)] dark:text-slate-100',
              )}
            >
              {h}
              <span
                className={cn(
                  'text-[9px] font-normal',
                  h === '13:00' ? 'text-white/80' : 'text-[#6B7280]',
                )}
              >
                {h === '13:00' ? '3/10' : h === '07:00' ? '6/10' : '0/10'}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-lg bg-[#FF5100] px-3.5 py-2 text-[12px] font-semibold text-white">
          <CalendarClock className="h-3.5 w-3.5" />
          Concluir agendamento
        </span>
        <span className="text-[11px] text-[#6B7280]">
          Concluir avisa o parceiro no portal e devolve o comprovante.
        </span>
      </div>
    </div>
  )
}
