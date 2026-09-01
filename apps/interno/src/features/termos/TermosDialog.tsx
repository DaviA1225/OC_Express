import * as React from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { TERMOS_VERSAO, termosDeUso } from '@sislog/shared/termos'
import { SISLOG_VERSAO } from '@sislog/shared/versao'
import { useAceiteDeTermos, useAceitarTermos } from './useTermos'

/**
 * Termo de Uso e Confidencialidade — uma vez por usuário, por versão do texto.
 *
 * Bloqueia o sistema porque é condição de acesso, não aviso: quem não assume o
 * dever de confidencialidade não deveria estar vendo CPF de motorista. Por isso
 * não fecha por Esc, por clique fora nem pelo X — as duas saídas são aceitar ou
 * sair do sistema.
 *
 * A caixa "Li e concordo" fica no FIM do texto, e não no rodapé: para marcá-la
 * é preciso rolar até o fim. Não prova leitura — nada prova —, mas evita o
 * aceite reflexo em quem nem viu que havia texto.
 *
 * O que este aceite é (e o que não é) está em `@sislog/shared/termos`: não é
 * consentimento do art. 8 da LGPD, é registro de instrução ao operador.
 */
export function TermosDialog() {
  const { session, user, signOut } = useAuth()
  const aceite = useAceiteDeTermos(user?.id)
  const aceitar = useAceitarTermos()
  const [concordo, setConcordo] = React.useState(false)

  const termo = termosDeUso('interno')

  // Só abre com resposta do banco na mão (`=== false`, não `!aceite.data`).
  // Enquanto carrega, nada aparece — um modal piscando a cada F5 de quem já
  // aceitou seria pior que inútil.
  //
  // FAIL-OPEN por consequência disso, e de propósito: se a consulta falhar
  // (rede, Supabase fora), `data` fica indefinido e o modal não abre. Mesma
  // escolha do gate de manutenção — um soluço de infra não pode trancar a
  // operação inteira do lado de fora. O aceite volta a ser cobrado assim que a
  // consulta responder.
  const precisaAceitar = !!session && aceite.data === false

  return (
    <Dialog open={precisaAceitar}>
      <DialogContent
        className="max-w-[640px] [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            {termo.titulo}
          </DialogTitle>
          <DialogDescription>{termo.resumo}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {termo.secoes.map((secao) => (
            <section key={secao.titulo} className="space-y-1.5">
              <h3 className="text-[13px] font-semibold text-foreground">{secao.titulo}</h3>
              {secao.paragrafos?.map((p) => (
                <p key={p} className="text-[12px] leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {secao.itens && (
                <ul className="space-y-1">
                  {secao.itens.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground"
                    >
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
            <Checkbox
              id="concordo_termos"
              checked={concordo}
              onCheckedChange={(v) => setConcordo(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="concordo_termos" className="text-[13px] font-normal leading-relaxed">
              Li e concordo com o Termo de Uso e Confidencialidade, e assumo o compromisso de
              tratar os dados pessoais deste sistema apenas para a operação.
            </Label>
          </div>
        </DialogBody>

        <DialogFooter>
          {/* As duas versões, porque são coisas diferentes: a do SisLog muda a
              cada release; a do termo, só quando o texto muda — e é ELA que
              fica gravada no aceite. Quem for conferir uma linha de
              `termos_aceite` precisa achar na tela o número que está lá. */}
          <span className="text-[11px] text-muted-foreground/80">
            SisLog v{SISLOG_VERSAO} · termo {TERMOS_VERSAO}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={aceitar.isPending}
              onClick={() => void signOut()}
            >
              Recusar e sair
            </Button>
            <Button
              type="button"
              disabled={!concordo || aceitar.isPending}
              title={concordo ? undefined : 'Role até o fim e marque a caixa para continuar.'}
              onClick={() => aceitar.mutate()}
            >
              {aceitar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Aceitar e continuar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
