import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  FileText,
  Building2,
  CalendarClock,
  ShieldCheck,
  HeartHandshake,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SISLOG_VERSAO } from '@sislog/shared/versao'
import { PreviaPainel } from './PreviaPainel'

/**
 * Página pública de apresentação do SisLog + pedido de apoio.
 *
 * Fica FORA do `ProtectedRoute`: é para quem ainda não entrou (e para quem nem
 * tem conta). Nada aqui consulta o banco — a prévia do painel é maquete, com
 * dados de uma transportadora fictícia. Página pública não mostra operação
 * real.
 */

/**
 * TROCAR PELA CHAVE REAL antes de divulgar a página.
 *
 * Enquanto ficar vazia, o bloco de apoio mostra um aviso em vez de uma chave —
 * chave de mentira numa página de doação é pior do que não ter chave nenhuma.
 */
const CHAVE_PIX: string = ''
const NOME_RECEBEDOR: string = ''

const RECURSOS = [
  {
    icone: FileText,
    titulo: 'Da solicitação ao PDF',
    texto:
      'Cadastros reutilizáveis, solicitação em segundos e a Ordem de Carregamento gerada automaticamente. O que era planilha preenchida célula a célula virou um formulário — e um PDF que sai pronto para o motorista.',
  },
  {
    icone: Building2,
    titulo: 'Portal do parceiro',
    texto:
      'A transportadora abre a própria solicitação, acompanha o status e baixa os documentos. Sem telefonema, sem planilha por e-mail, e cada parceiro enxerga apenas o que é dele.',
  },
  {
    icone: CalendarClock,
    titulo: 'Agendamento no terminal',
    texto:
      'A descarga tem hora marcada. O pedido chega numa fila, a equipe confirma a janela no sistema do terminal e devolve o comprovante — tudo registrado na mesma solicitação.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Auditoria e LGPD',
    texto:
      'Quem criou, quem alterou, quem exportou. Registro de acesso a dado pessoal, prazos de retenção definidos e termo de confidencialidade aceito por quem opera o sistema.',
  },
] as const

export default function ApresentacaoPage() {
  return (
    <div className="min-h-full bg-[#F5F7F9] dark:bg-[var(--canvas-dark)]">
      <Cabecalho />

      <main>
        <Hero />

        <Secao>
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-[#1A1F28] dark:text-white">
            O que o sistema faz
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {RECURSOS.map((r) => (
              <article
                key={r.titulo}
                className="rounded-xl border border-[#E1E4EA] bg-white p-5 shadow-[0_1px_2px_rgba(26,31,40,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_-16px_rgba(26,31,40,0.35)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
              >
                <r.icone className="h-5 w-5 text-[#FF5100]" />
                <h3 className="mt-3 font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
                  {r.titulo}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{r.texto}</p>
              </article>
            ))}
          </div>
        </Secao>

        <Secao id="painel">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-[22px] font-semibold tracking-tight text-[#1A1F28] dark:text-white">
                Por dentro do painel
              </h2>
              <p className="mt-1 text-[13px] text-[#6B7280]">
                Uma amostra da tela de operação. Os números são de exemplo, de uma transportadora
                fictícia — dado real de cliente não aparece em página pública.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <PreviaPainel />
          </div>
        </Secao>

        <Apoio />
      </main>

      <Rodape />
    </div>
  )
}

function Cabecalho() {
  return (
    <header className="sticky top-0 z-10 border-b border-[#E1E4EA] bg-[#F5F7F9]/85 backdrop-blur dark:border-[var(--border-dark)] dark:bg-[var(--canvas-dark)]/85">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7" />
          <span className="bg-gradient-to-r from-[#FF5100] to-[#D3641A] bg-clip-text font-display text-[18px] font-semibold tracking-tight text-transparent">
            SisLog
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#apoiar"
            className="text-[13px] font-medium text-[#6B7280] underline-offset-2 hover:text-[#1A1F28] hover:underline dark:hover:text-white"
          >
            Apoiar
          </a>
          <Button asChild variant="outline" className="h-9">
            <Link to="/login">
              <ArrowLeft className="h-4 w-4" />
              Entrar
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto max-w-[1100px] px-5 pb-4 pt-14 sm:pt-20">
      <p className="text-[12px] font-medium uppercase tracking-[1px] text-[#FF5100]">
        LHG Logística
      </p>
      <h1 className="mt-3 max-w-[18ch] font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-[#1A1F28] sm:text-[46px] dark:text-white">
        A Ordem de Carregamento deixou de ser uma planilha.
      </h1>
      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-[#6B7280]">
        O SisLog organiza o pedido de carga, gera o PDF da Ordem de Carregamento, entrega ao
        motorista e acompanha a viagem até a descarga no terminal. Foi feito para a operação da
        LHG Logística e roda todo dia útil, com a equipe dentro dele.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild className="h-11 px-5">
          <a href="#apoiar">
            <HeartHandshake className="h-4 w-4" />
            Ajudar a manter no ar
          </a>
        </Button>
        <Button asChild variant="outline" className="h-11 px-5">
          <a href="#painel">
            Ver o painel
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </section>
  )
}

function Secao({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-[1100px] scroll-mt-20 px-5 py-12">
      {children}
    </section>
  )
}

function Apoio() {
  const [copiado, setCopiado] = React.useState(false)
  const temChave = CHAVE_PIX.trim().length > 0

  async function copiar() {
    try {
      await navigator.clipboard.writeText(CHAVE_PIX)
      setCopiado(true)
      toast.success('Chave PIX copiada.')
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione a chave e copie à mão.')
    }
  }

  return (
    <section id="apoiar" className="mx-auto max-w-[1100px] scroll-mt-20 px-5 pb-16 pt-4">
      <div className="overflow-hidden rounded-xl border border-[#FF5100]/25 bg-white shadow-[0_1px_2px_rgba(26,31,40,0.06)] dark:border-[#FF5100]/25 dark:bg-[var(--surface-dark)]">
        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-tight text-[#1A1F28] dark:text-white">
              Ajude a manter o SisLog no ar
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">
              O sistema roda em infraestrutura paga — banco de dados, hospedagem e domínio — e é
              mantido fora do horário da operação. Qualquer valor ajuda a pagar essa conta e a
              manter o desenvolvimento andando.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">
              Apoiar é opcional e não muda nada para quem usa: não há plano, cobrança, limite de
              uso nem propaganda. Quem depende do sistema continua trabalhando do mesmo jeito.
            </p>
          </div>

          <div className="rounded-xl border border-[#E1E4EA] bg-[#F5F7F9] p-5 dark:border-[var(--border-dark)] dark:bg-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6B7280]">
              Contribuir por PIX
            </p>

            {temChave ? (
              <>
                <p className="mt-3 break-all rounded-lg border border-[#E1E4EA] bg-white px-3 py-2.5 font-mono text-[13px] text-[#1A1F28] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)] dark:text-white">
                  {CHAVE_PIX}
                </p>
                {NOME_RECEBEDOR && (
                  <p className="mt-2 text-[12px] text-[#6B7280]">Recebedor: {NOME_RECEBEDOR}</p>
                )}
                <Button type="button" className="mt-3 h-10 w-full" onClick={() => void copiar()}>
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiado ? 'Chave copiada' : 'Copiar chave PIX'}
                </Button>
              </>
            ) : (
              /* Sem chave configurada, o bloco DIZ isso. Exibir uma chave de
                 exemplo numa página de doação faria alguém transferir para o
                 lugar errado. */
              <p className="mt-3 rounded-lg border border-dashed border-[#E1E4EA] px-3 py-4 text-[13px] leading-relaxed text-[#6B7280] dark:border-[var(--border-dark)]">
                A chave PIX ainda não foi configurada. Enquanto isso, fale com a equipe da LHG se
                quiser apoiar o projeto.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Rodape() {
  return (
    <footer className="border-t border-[#E1E4EA] px-5 py-8 dark:border-[var(--border-dark)]">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#6B7280]">
          LHG Logística · SisLog v{SISLOG_VERSAO} · sistema interno de ordens de carregamento
        </p>
        <Link
          to="/login"
          className="text-[12px] font-medium text-[#6B7280] underline-offset-2 hover:text-[#1A1F28] hover:underline dark:hover:text-white"
        >
          Ir para o login
        </Link>
      </div>
    </footer>
  )
}
