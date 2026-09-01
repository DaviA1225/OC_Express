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
import {
  marcarAtividade,
  observarInatividade,
  registrarMotivoSaida,
} from '@sislog/shared/sessao'

/**
 * Gêmeo de `apps/interno/src/features/auth/VigiaDeSessao.tsx` — mesma regra de
 * inatividade, com o kit de UI e o vocabulário do portal.
 *
 * Fica montado ao lado das rotas, e não dentro de uma página: a contagem não
 * pode reiniciar porque alguém navegou entre telas.
 *
 * Vale para o parceiro pelo mesmo motivo que vale para a equipe, e por mais um:
 * o portal é acessado de fora, em máquina que a LHG não administra. Sessão
 * eterna ali é um acesso aos dados da transportadora esquecido num computador
 * que ninguém daqui vai auditar. Depois do prazo o `signOut()` revoga o refresh
 * token no servidor — a sessão deixa de existir, não fica só escondida atrás da
 * tela de login.
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

  const temSessao = !!session

  // `signOut` muda de identidade a cada render do provider. Sem o ref, o efeito
  // abaixo religaria o vigia a cada render — e religar zera o carimbo de
  // atividade, o que faria a sessão nunca expirar.
  const signOutRef = React.useRef(signOut)
  React.useEffect(() => {
    signOutRef.current = signOut
  }, [signOut])

  React.useEffect(() => {
    if (!temSessao) return

    const desligar = observarInatividade({
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
    // largada, que é o momento em que zerar importa: no login.
    return desligar
  }, [temSessao])

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
            Sua sessão vai expirar
          </DialogTitle>
          <DialogDescription>
            Por segurança dos dados, o portal encerra sessões inativas.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <p className="text-[13px] leading-relaxed text-foreground">
            Você será desconectado em{' '}
            <span className="font-mono font-semibold tabular-nums">
              {formatarRestante(restanteMs ?? 0)}
            </span>
            . Qualquer clique ou tecla mantém você conectado.
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Uma solicitação em preenchimento se perde no logout — se estiver no meio dela,
            continue e envie antes de sair.
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
