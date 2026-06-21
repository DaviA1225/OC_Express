# Product

## Register

product

## Users

**Usuário-foco (prioridade nas decisões de design):** atendentes da operação da LHG
Logística / OC Express — equipe interna que processa até ~30 solicitações de Ordem
de Carregamento (OC) por dia. Contexto de uso: ritmo alto, muitas telas por dia,
cada clique e cada rolagem custam tempo real. Trabalham logados no sistema interno
(`apps/interno`), em desktop/notebook, alternando entre fila de solicitações,
cadastros e geração de PDF.

**Usuários secundários:**
- **Gestores / supervisores** — acompanham KPIs, auditoria e relatórios; priorizam
  visão panorâmica e leitura de indicadores.
- **Parceiros externos** — transportadora parceira que usa o portal isolado
  (`apps/portal`); poucos usuários, uso esporádico, prioriza simplicidade e
  guard-rails sobre densidade.

Quando houver conflito de decisão, otimizar para o atendente da operação.

## Product Purpose

SisLog LHG (codinome OC Express) é o sistema que substitui o preenchimento manual
da planilha de OC (Excel, célula a célula) por um fluxo integrado: cadastros
reutilizáveis → solicitação em segundos → PDF da OC gerado automaticamente → envio
por WhatsApp → status e painel. Opera em paralelo ao ERP corporativo (Protheus),
com ligação manual via número de instrução.

São três superfícies sobre a mesma base Supabase: o **sistema interno** (uso da
equipe LHG), o **portal de parceiros** (entrada isolada e segura para a
transportadora concorrente) e o **agente de WhatsApp com IA** (cria solicitações a
partir de mensagens).

Sucesso = **agilidade da operação**: menos cliques e menos tempo por OC, com menos
retrabalho. Cada decisão de UX deve servir a processar mais rápido.

## Brand Personality

Industrial, sóbrio, eficiente. Tom de mineração/logística — "painel de controle de
operação", não "landing page de startup". Voz direta e operacional, em português do
Brasil, sentence case, sem linguagem de marketing. Identidade visual: estrutura
grafite neutra com o **laranja LHG #FF5100 reservado a acento** (ação primária,
estado ativo, foco). O portal usa azul como acento próprio (sinaliza ao parceiro
que é fornecedor, não funcionário), com a mesma linguagem corporativa.

## Anti-references

**Não pode parecer "gerado por IA / template SaaS genérico".** Especificamente,
evitar os tells que já foram removidos no reskin:
- Gradientes diagonais chamativos em headers/superfícies.
- Chips de ícone pastel coloridos (esmeralda/âmbar/roxo) competindo entre si.
- Cards aninhados dentro de cards; grades de cards idênticos repetidos sem fim.
- Saudação consumer ("Boa tarde, fulano") em tela de operação.
- Inter (ou system default) para tudo; ícone em quadradinho arredondado acima de
  cada título; eyebrow uppercase tracado acima de cada seção.
- Border-radius e sombras "fofos" demais para uma operação de transporte.

Também evitar o extremo oposto: "planilha disfarçada" (telas que são só grades de
células, sem fluxo nem foco) — é exatamente o que o sistema veio substituir.

## Design Principles

1. **Painel de operação, não landing.** Densidade de informação alta a serviço da
   velocidade: padding contido, fontes 13–14px no conteúdo, sem espaço morto.
2. **Cada clique custa tempo real.** Minimizar passos e rolagem; toda ação primária
   tem atalho de teclado visível (Ctrl+N, Ctrl+K, `/`).
3. **Cadastra uma vez, reutiliza sempre.** Nunca pedir o mesmo dado duas vezes;
   autocomplete e quick-create no lugar de redigitação.
4. **Dado certo na primeira vez.** Validação e padronização (CPF/CNPJ/placa) e
   feedback imediato (<200ms) vêm antes de velocidade bruta.
5. **Sobriedade institucional.** Grafite estrutural + laranja como acento único;
   nada que pareça saído de um template. Consistência por tokens, não por exceções.

## Accessibility & Inclusion

- **WCAG 2.1 AA** como piso: corpo ≥ 4.5:1, texto grande ≥ 3:1 (inclui placeholders).
- **Status nunca só por cor** — sempre com rótulo/ícone além do tom (relevante para
  daltonismo na paleta de status recebida→em emissão→gerada→enviada→finalizada).
- **Modo escuro** e **densidade compacta** opcionais já existentes — manter ambos.
- **Atalhos de teclado** em todas as ações principais; navegação por Tab consistente.
- **Reduced motion** respeitado: toda animação tem alternativa para
  `prefers-reduced-motion: reduce` (crossfade ou transição instantânea).
