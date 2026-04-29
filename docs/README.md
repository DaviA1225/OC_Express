# SisLog LHG — Pacote inicial do projeto

Este é o pacote de partida para construir o sistema SisLog LHG usando Claude Code.

## Arquivos deste pacote

- **`SPEC.md`** — Especificação principal: modelo de dados, fluxos de negócio,
  fases de execução, escopo do MVP.
- **`SPEC-FRONTEND.md`** — Especificação complementar de front-end: padrões
  visuais, layout de telas, componentes, anti-padrões, checklist de revisão.

## Como começar

### Pré-requisitos

Antes de rodar o Claude Code, você precisa:

1. **Node.js 18+** instalado
2. **Claude Code instalado:** `npm install -g @anthropic-ai/claude-code`
3. **Conta no Supabase** criada (supabase.com) com um projeto novo. Anote a URL
   do projeto e a anon key.
4. **Supabase CLI:** `npm install -g supabase`
5. **Git** configurado na sua máquina
6. **Pasta vazia** para o projeto, ex: `~/projetos/sislog-lhg`
7. **Imagem PNG do template da OC** salva em `docs/template-oc.png` dentro da
   pasta do projeto (converta uma página do seu PDF usando smallpdf, ilovepdf ou similar)

### Passos

1. Crie a pasta do projeto:
   ```
   mkdir sislog-lhg && cd sislog-lhg
   ```

2. Copie `SPEC.md` e `SPEC-FRONTEND.md` para a raiz da pasta do projeto.

3. Crie a subpasta `docs/` e coloque o `template-oc.png` lá:
   ```
   mkdir docs
   # copie sua imagem para docs/template-oc.png
   ```

4. Inicialize um repositório git:
   ```
   git init
   ```

5. Abra o Claude Code na pasta:
   ```
   claude
   ```

6. Cole o prompt inicial abaixo no Claude Code:

```
Olá. Você vai construir um sistema web completo chamado SisLog LHG seguindo
rigorosamente as especificações técnicas em SPEC.md e SPEC-FRONTEND.md.

Antes de começar, leia SPEC.md do início ao fim e confirme que entendeu.
Em seguida, leia também SPEC-FRONTEND.md, que define padrões visuais, componentes,
comportamentos e anti-padrões. Você deve seguir os dois documentos. Em caso de
conflito sobre questões visuais, SPEC-FRONTEND.md prevalece. Em questões de
domínio/dados, SPEC.md prevalece.

Depois de ler:
1. Crie uma lista de tarefas usando TodoWrite espelhando as fases descritas na
   seção 8 do SPEC.md
2. Pare e me mostre a lista. Não comece a executar ainda.
3. Me pergunte quais credenciais Supabase eu tenho disponíveis (URL do projeto,
   anon key, service role key) e se o supabase CLI já está autenticado.
4. Aguarde minha resposta antes de iniciar a Fase 0.

Regras de execução ao longo de todo o projeto:
- Execute UMA fase por vez. Ao terminar uma fase, pare, me mostre o que foi feito,
  peça pra eu testar, e só prossiga para a próxima fase após meu "ok".
- Nunca pule fases. Nunca antecipe trabalho de uma fase posterior.
- Faça commits git ao fim de cada fase com mensagens descritivas em português.
- Se encontrar ambiguidade nas specs, PERGUNTE antes de assumir.
- Se alguma dependência externa falhar (comando supabase, npm install), pare e me
  avise com o erro exato.
- Ao escrever código, siga estritamente a stack e padrões da seção 2 e 7 do SPEC.md
  e da seção 2 do SPEC-FRONTEND.md.
- TypeScript estrito, zero `any`, componentes pequenos e reutilizáveis.
- Toda interface em português do Brasil.
- Ao gerar o PDF (Fase 5), use docs/template-oc.png como referência visual
  obrigatória. Se o arquivo não existir, me avise antes de prosseguir.
- Ao final de cada fase, aplique mentalmente o checklist da seção 9 do
  SPEC-FRONTEND.md antes de me entregar.

Pode começar lendo o SPEC.md.
```

## Fluxo recomendado

- **Dia 1:** Setup (Fase 0) e Banco de Dados (Fase 1)
- **Dia 2:** Testar banco no painel Supabase, aprovar, ir para Fase 2 (auth + layout)
- **Dia 3-4:** Cadastros (Fase 3)
- **Dia 5-6:** Solicitações (Fase 4) e PDF (Fase 5)
- **Dia 7:** WhatsApp + retorno + dashboard (Fase 6) e polimento (Fase 7)

## Dicas

- Versione no GitHub desde o início (Claude Code faz commits automaticamente)
- Não use `--dangerously-skip-permissions` na primeira vez
- Quando algo quebrar, cole o erro exato (terminal output) — não descreva vagamente
- Ao final de cada fase, use o checklist da seção 9 do SPEC-FRONTEND.md
- Se o Claude Code mexer em algo que não devia, dê um prompt curto de escopo:
  "Não mexa nos arquivos X e Y, apenas corrija Z"

## O que NÃO entra neste MVP

Está documentado na seção 9 do SPEC.md. Resumindo: nada de integração com
Protheus/Citrix, API oficial WhatsApp, leitura automática de e-mail, emissão de
Ct-e/MDF-e, app mobile nativo. Tudo isso fica para versões futuras.
