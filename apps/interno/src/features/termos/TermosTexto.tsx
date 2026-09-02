import type { Termo } from '@sislog/shared/termos'

/**
 * Corpo do termo, renderizado.
 *
 * Existe separado porque o mesmo texto aparece em dois lugares: o modal de
 * aceite (bloqueante, no primeiro acesso) e a leitura avulsa pela tela de
 * login. Se cada um montasse o seu, um dia divergem — e aí o registro em
 * `termos_aceite` deixa de dizer o que a pessoa leu, que é a única coisa que
 * aquele registro existe para provar.
 */
export function TermosTexto({ termo }: { termo: Termo }) {
  return (
    <>
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
    </>
  )
}
