import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowLeft,
  HeartHandshake,
  Timer,
  Route,
  ShieldCheck,
  BarChart3,
  Building2,
  MessageSquareText,
  MonitorCog,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SISLOG_VERSAO } from '@sislog/shared/versao'
import { Tela, TelaAgendamento, TelaFila, TelaSolicitacao } from './TelasDoSistema'
import { FLUXO } from './fluxo'

/**
 * Página pública de apresentação do SisLog + pedido de apoio.
 *
 * Fica FORA do `ProtectedRoute`: é para quem ainda não entrou, e para quem nem
 * tem conta.
 *
 * O texto sai do que a operação já escreveu sobre o próprio sistema
 * (`docs/apresentacao/build-diretoria.js`, a apresentação da diretoria), e não
 * de promessa inventada aqui. Onde não existe número medido, não entra número:
 * "menos retrabalho" é afirmação sobre o fluxo; "reduz 40%" seria chute com
 * cara de dado.
 */

/** QR estático do PIX, entregue pelo dono da chave (`docs/comercial`). Imagem
 *  em vez de chave digitada de propósito: chave de PIX transcrita à mão é
 *  exatamente como se erra o destinatário de uma transferência. */
const PIX_QR = '/pix-sislog.jpeg'

const PROBLEMAS = [
  'Cada OC digitada campo a campo numa planilha, lento e repetitivo, dezenas de vezes ao dia.',
  'Placa, CPF ou material trocados só aparecem no caminhão: retrabalho e atraso no pátio.',
  'Onde está cada OC? Acompanhamento por conversa e memória, não por sistema.',
  'A planilha vive numa máquina só, sem histórico, sem visão da equipe, sem indicador.',
] as const

const IMPACTOS = [
  {
    icone: Timer,
    titulo: 'Caminhão liberado mais cedo',
    texto:
      'A OC deixa de ser digitada e passa a ser montada a partir de cadastros. Menos gargalo na emissão é menos caminhão esperando no pátio.',
  },
  {
    icone: Route,
    titulo: 'Nada se perde no caminho',
    texto:
      'Cada carga tem estado, linha do tempo e responsável. O que estava na cabeça de quem atendeu passa a estar no sistema, e aparece para a equipe inteira na hora.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Dado certo na primeira vez',
    texto:
      'CPF, CNPJ, placa e telefone conferidos no preenchimento; motorista, veículo e cliente cadastrados uma vez e reaproveitados sempre. Menos divergência, menos OC refeita.',
  },
  {
    icone: BarChart3,
    titulo: 'A operação enxergada por inteiro',
    texto:
      'Volume, finalizadas, tempo médio por etapa e fila de pendências. Os relatórios saem em CSV, e a gestão para de pedir planilha para saber como foi o mês.',
  },
] as const

const SUPERFICIES = [
  {
    icone: MonitorCog,
    titulo: 'Sistema interno',
    texto: 'A equipe da LHG emite as OCs, acompanha o status e audita cada operação.',
  },
  {
    icone: Building2,
    titulo: 'Portal de parceiros',
    texto:
      'A transportadora parceira envia solicitações num ambiente isolado: ela vê só os próprios dados, e a base da LHG nunca fica exposta.',
  },
  {
    icone: MessageSquareText,
    titulo: 'Agente de WhatsApp',
    texto:
      'A mensagem do solicitante vira solicitação sozinha, com leitura por IA, sem ninguém digitar e a qualquer hora.',
  },
] as const

export default function ApresentacaoPage() {
  return (
    <div className="min-h-full bg-[#F5F7F9] dark:bg-[var(--canvas-dark)]">
      <Cabecalho />

      <main>
        <Hero />
        <Problema />
        <Fluxo />
        <Telas />
        <Impacto />
        <Superficies />
        <Apoio />
      </main>

      <Rodape />
    </div>
  )
}

function Cabecalho() {
  return (
    <header className="sticky top-0 z-10 border-b border-[#E1E4EA] bg-[#F5F7F9]/85 backdrop-blur dark:border-[var(--border-dark)] dark:bg-[var(--canvas-dark)]/85">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" aria-hidden className="h-7 w-7" />
          <span className="bg-gradient-to-r from-[#FF5100] to-[#D3641A] bg-clip-text font-display text-[18px] font-semibold tracking-tight text-transparent">
            SisLog
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#telas"
            className="hidden text-[13px] font-medium text-[#6B7280] underline-offset-2 hover:text-[#1A1F28] hover:underline sm:inline dark:hover:text-white"
          >
            As telas
          </a>
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

function Secao({
  id,
  children,
  className,
}: {
  id?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`mx-auto max-w-[1080px] scroll-mt-20 px-5 py-14 ${className ?? ''}`}>
      {children}
    </section>
  )
}

function Titulo({ children, apoio }: { children: React.ReactNode; apoio?: string }) {
  return (
    <div className="max-w-[62ch]">
      <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1F28] dark:text-white">
        {children}
      </h2>
      {apoio && <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">{apoio}</p>}
    </div>
  )
}

function Hero() {
  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-2 pt-14 sm:pt-20">
      <p className="text-[12px] font-medium uppercase tracking-[1px] text-[#FF5100]">
        Plataforma de operação logística
      </p>
      <h1 className="mt-3 max-w-[20ch] font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-[#1A1F28] sm:text-[46px] dark:text-white">
        A Ordem de Carregamento deixou de ser uma planilha.
      </h1>
      <p className="mt-5 max-w-[64ch] text-[15px] leading-relaxed text-[#6B7280]">
        O SisLog emite, acompanha e audita cada Ordem de Carregamento do transporte de minério,
        do pedido que chega até a descarga no terminal. Foi feito para a operação da LHG Logística,
        e é ela que o usa todo dia útil.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="h-11 px-5">
          <a href="#telas">
            Ver as telas do sistema
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
        <Button asChild className="h-11 px-5">
          <a href="#apoiar">
            <HeartHandshake className="h-4 w-4" />
            Ajudar a manter no ar
          </a>
        </Button>
      </div>
    </section>
  )
}

function Problema() {
  return (
    <Secao>
      <Titulo apoio="Cada carregamento vira uma Ordem de Carregamento. Antes do SisLog, cada uma delas era montada assim:">
        O que existia antes
      </Titulo>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {PROBLEMAS.map((p) => (
          <li
            key={p}
            className="flex gap-3 rounded-xl border border-[#E1E4EA] bg-white p-4 text-[13px] leading-relaxed text-[#6B7280] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
          >
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C44612]" />
            {p}
          </li>
        ))}
      </ul>
    </Secao>
  )
}

function Fluxo() {
  return (
    <Secao id="fluxo">
      <Titulo apoio="Seis passos, do pedido à descarga. É este o caminho que toda carga percorre dentro do sistema.">
        Como o sistema funciona
      </Titulo>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FLUXO.map((passo, i) => (
          <li
            key={passo.titulo}
            className="rounded-xl border border-[#E1E4EA] bg-white p-5 shadow-[0_1px_2px_rgba(26,31,40,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_-16px_rgba(26,31,40,0.35)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
          >
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[12px] font-semibold text-[#FF5100]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <passo.icone className="h-4 w-4 text-[#6B7280]" />
            </div>
            <h3 className="mt-3 font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
              {passo.titulo}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </Secao>
  )
}

function Telas() {
  return (
    <Secao id="telas">
      <Titulo apoio="As telas em que o atendente passa o dia. São reproduções fiéis da interface, com dados fictícios, porque nome, CPF, placa e cliente de verdade não aparecem em página pública.">
        O que o atendente vê
      </Titulo>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Tela
          titulo="Solicitações"
          legenda="A fila do dia. Busca por número, motorista, CPF, placa ou cliente, filtro por estado e o relógio de cada pedido à vista, e o que está parado há tempo demais aparece marcado."
        >
          <TelaFila />
        </Tela>

        <Tela
          titulo="Solicitação #0287"
          legenda="A solicitação aberta. Os dados vêm dos cadastros, não da digitação, e o CPF fica mascarado até alguém copiar, momento em que o acesso é registrado. Um clique gera o PDF da OC; outro manda por WhatsApp."
        >
          <TelaSolicitacao />
        </Tela>

        <div className="lg:col-span-2">
          <Tela
            titulo="Agendamento de descarga"
            legenda="O painel de agendamento. O SisLog não conversa com o sistema do terminal, então prepara o que precisa ser colado lá, com um clique por campo, e guarda a janela confirmada junto do comprovante. A grade de horários muda conforme o tipo do veículo, porque no terminal ela muda mesmo."
          >
            <TelaAgendamento />
          </Tela>
        </div>
      </div>
    </Secao>
  )
}

function Impacto() {
  return (
    <Secao id="impacto">
      <Titulo apoio="Não é sobre ter um sistema: é sobre o que muda no pátio, na emissão e no fim do mês.">
        O que muda na operação
      </Titulo>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {IMPACTOS.map((v) => (
          <article
            key={v.titulo}
            className="rounded-xl border border-[#E1E4EA] bg-white p-5 shadow-[0_1px_2px_rgba(26,31,40,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_-16px_rgba(26,31,40,0.35)] dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
          >
            <v.icone className="h-5 w-5 text-[#FF5100]" />
            <h3 className="mt-3 font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
              {v.titulo}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{v.texto}</p>
          </article>
        ))}
      </div>
    </Secao>
  )
}

function Superficies() {
  return (
    <Secao>
      <Titulo apoio="Três portas de entrada, uma só base de dados, e o que uma altera a outra enxerga na hora.">
        Por onde a carga entra
      </Titulo>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {SUPERFICIES.map((s) => (
          <article
            key={s.titulo}
            className="rounded-xl border border-[#E1E4EA] bg-white p-5 dark:border-[var(--border-dark)] dark:bg-[var(--surface-dark)]"
          >
            <s.icone className="h-5 w-5 text-[#FF5100]" />
            <h3 className="mt-3 font-display text-[15px] font-semibold text-[#1A1F28] dark:text-white">
              {s.titulo}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{s.texto}</p>
          </article>
        ))}
      </div>
    </Secao>
  )
}

function Apoio() {
  return (
    <Secao id="apoiar" className="!pb-16">
      <div className="overflow-hidden rounded-xl border border-[#FF5100]/25 bg-white shadow-[0_1px_2px_rgba(26,31,40,0.06)] dark:border-[#FF5100]/25 dark:bg-[var(--surface-dark)]">
        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <h2 className="font-display text-[24px] font-semibold tracking-tight text-[#1A1F28] dark:text-white">
              Ajude a manter o SisLog no ar
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">
              O sistema roda em infraestrutura paga, com banco de dados, hospedagem e domínio,
              e é mantido fora do horário da operação. Qualquer valor ajuda a pagar essa conta e a
              manter o desenvolvimento andando.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">
              Apoiar é opcional e não muda nada para quem usa: não há plano, cobrança, limite nem
              propaganda. Quem depende do sistema continua trabalhando do mesmo jeito.
            </p>
          </div>

          <div className="rounded-xl border border-[#E1E4EA] bg-[#F5F7F9] p-5 text-center dark:border-[var(--border-dark)] dark:bg-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6B7280]">
              Contribuir por PIX
            </p>
            <img
              src={PIX_QR}
              alt="QR Code do PIX para apoiar o SisLog"
              width={200}
              height={200}
              loading="lazy"
              className="mx-auto mt-4 h-[200px] w-[200px] rounded-lg border border-[#E1E4EA] bg-white p-2 dark:border-[var(--border-dark)]"
            />
            <p className="mt-3 text-[12px] leading-relaxed text-[#6B7280]">
              Aponte a câmera do aplicativo do seu banco. O valor é livre.
            </p>
          </div>
        </div>
      </div>
    </Secao>
  )
}

function Rodape() {
  return (
    <footer className="border-t border-[#E1E4EA] px-5 py-8 dark:border-[var(--border-dark)]">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3">
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
