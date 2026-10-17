import * as React from 'react'
import { Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  idDaSessao,
  marcarAtividade,
  observarInatividade,
  registrarMotivoSaida,
} from '@sislog/shared/sessao'

/**
 * Encerra a sessão depois de 50 minutos sem interação.
 *
 * Fica montado ao lado das rotas, e não dentro de uma página: a contagem não
 * pode reiniciar porque alguém navegou do Dashboard para Solicitações.
 *
 * O aviso de 2 minutos existe para o logout não chegar em silêncio — quem
 * estava lendo um relatório longo, ou voltou ao computador na hora errada, tem
 * um clique para continuar. Depois do prazo o `signOut()` revoga o refresh
 * token no servidor: a sessão daquela máquina deixa de existir, não fica só
 * escondida atrás da tela de login.
 *
 * O `signOut()` usa o escopo padrão do Supabase, que é GLOBAL: revoga a sessão
 * do usuário em todos os dispositivos, não só nesta máquina. É o mesmo que o
 * botão "Sair" sempre fez, e é decisão consciente — o token que ficou no disco
 * da estação abandonada é justamente o que esta regra existe para invalidar.
 * O preço é conhecido: quem estiver logado em dois computadores cai nos dois.
 */
export function VigiaDeSessao() {
  const { session, signOut } = useAuth()
  const [restanteMs, setRestanteMs] = React.useState<number | null>(null)

  // A identidade da sessão, não o objeto: renovar o token troca o `session`
  // a cada hora, e religar o vigia por isso seria desperdício. Login novo
  // troca o id e religa — é o que faz o relógio começar do zero.
  const idSessao = session ? idDaSessao(session.access_token) : null

  // `signOut` muda de identidade a cada render do provider. Sem o ref, o efeito
  // abaixo desligaria e religaria o vigia (ouvintes, timer) a cada render.
  const signOutRef = React.useRef(signOut)
  React.useEffect(() => {
    signOutRef.current = signOut
  }, [signOut])

  React.useEffect(() => {
    if (idSessao === null) return

    const desligar = observarInatividade({
      idSessao,
      // Batimento para o hook da 0077. Erro de rede não interessa aqui: o
      // limite do cliente continua de pé, e o próximo clique tenta de novo.
      aoRegistrarNoServidor: () => {
        void supabase.rpc('registrar_atividade_sessao').then(
          () => undefined,
          () => undefined,
        )
      },
      aoAvisar: setRestanteMs,
      aoRetomar: () => setRestanteMs(null),
      aoExpirar: () => {
        setRestanteMs(null)
        // Antes do signOut: a tela de login lê o motivo e explica a queda, em
        // vez de aparecer do nada no meio do expediente.
        registrarMotivoSaida('inatividade')
        void signOutRef.current()
      },
    })

    // Só desliga os ouvintes: o carimbo NÃO é apagado aqui. Ele é
    // compartilhado entre as abas, e apagá-lo no unmount faria fechar uma aba
    // ativa derrubar a contagem de outra que estava só aberta — a segunda
    // cairia para o próprio relógio, já vencido, e deslogaria alguém que
    // acabou de interagir ao lado. Quem zera é o `observarInatividade` na
    // largada, quando vê uma sessão nova: no login.
    return desligar
  }, [idSessao])

  function continuar() {
    marcarAtividade()
    setRestanteMs(null)
  }

  return (
    <Dialog
      open={restanteMs !== null}
      onOpenChange={(aberto) => {
        // Fechar por Esc ou clique fora é uma interação como outra qualquer:
        // quem está ali continua conectado.
        if (!aberto) continuar()
      }}
    >
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            A sessão vai expirar
          </DialogTitle>
          <DialogDescription>
            Por segurança dos dados, o SisLog encerra sessões inativas.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <p className="text-body leading-relaxed text-foreground">
            Desconexão automática em{' '}
            <span className="font-mono font-semibold tabular-nums">
              {formatarRestante(restanteMs ?? 0)}
            </span>
            . Qualquer clique ou tecla mantém a sessão ativa.
          </p>
          <p className="mt-2 text-body-sm text-muted-foreground">
            Trabalho não salvo em formulários abertos se perde no logout — se estiver no meio de
            um cadastro, continue e salve antes de sair.
          </p>
        </DialogBody>

        <DialogFooter>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRestanteMs(null)
                void signOutRef.current()
              }}
            >
              Sair agora
            </Button>
            <Button type="button" onClick={continuar}>
              Continuar conectado
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** `m:ss` — a contagem cabe sempre em poucos minutos (ver `AVISO_MINUTOS`). */
function formatarRestante(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const min = Math.floor(total / 60)
  const seg = total % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}
