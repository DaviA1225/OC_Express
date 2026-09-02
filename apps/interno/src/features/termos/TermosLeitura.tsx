import * as React from 'react'
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
import { TERMOS_VERSAO, termosDeUso, type AudienciaTermos } from '@sislog/shared/termos'
import { SISLOG_VERSAO } from '@sislog/shared/versao'
import { TermosTexto } from './TermosTexto'

/**
 * Consulta ao termo pela tela de login — sem sessão, sem aceite, sem registro.
 *
 * O modal de aceite aparece uma vez e some. Quem quiser reler depois (ou ler
 * ANTES de entrar, o que é o caso mais legítimo de todos) não tinha por onde:
 * transparência que só existe no instante em que se pede o "aceito" não é
 * transparência.
 *
 * Texto idêntico ao do aceite, do mesmo `@sislog/shared/termos` — ver
 * `TermosTexto`. Aqui o diálogo fecha por Esc, clique fora e X: nada a
 * bloquear, ninguém tem nada a assumir.
 */
export function TermosLeitura({ audiencia }: { audiencia: AudienciaTermos }) {
  const [aberto, setAberto] = React.useState(false)
  const termo = termosDeUso(audiencia)

  return (
    <>
      {/* Mesmas classes do botão "Suporte" ao lado, no rodapé do login: os dois
          são links discretos da mesma linha e precisam pesar igual. */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F7F9] dark:focus-visible:ring-offset-[var(--canvas-dark)]"
      >
        Termos de uso
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{termo.titulo}</DialogTitle>
            <DialogDescription>{termo.resumo}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <TermosTexto termo={termo} />
          </DialogBody>

          <DialogFooter>
            <span className="text-[11px] text-muted-foreground/80">
              SisLog v{SISLOG_VERSAO} · termo {TERMOS_VERSAO}
            </span>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
