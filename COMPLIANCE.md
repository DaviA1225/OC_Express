# COMPLIANCE.md — LGPD no SisLog LHG

Registro das operações de tratamento de dado pessoal do SisLog (art. 37 da
LGPD), dos prazos de retenção e de como atender pedido de titular.

Criado em 2026-08-09, a partir da auditoria LGPD do sistema. Referenciado por
`docs/SPEC-EMBARQUES.md`.

**Este documento descreve o que o sistema faz.** Ele não substitui parecer
jurídico, nem o contrato de operador (art. 39) com as transportadoras
parceiras, nem o aviso de privacidade aos titulares — os três continuam
pendentes e estão listados no fim.

---

## 1. Que dado pessoal o sistema trata

| Dado | Onde vive | Coletado em | Para quê |
|---|---|---|---|
| Nome, CPF, telefone do motorista | `motoristas`, `parceiro_motoristas` | Cadastro de motorista (interno e portal) | Identificar quem carrega: o CPF vai na OC e é conferido no pátio |
| Nome e telefone do solicitante | `solicitacoes.solicitante_nome/_telefone` | Nova solicitação | Retorno de contato sobre a carga |
| Nome, e-mail do usuário do parceiro | `parceiro_usuarios`, `auth.users` | Convite ao portal | Autenticação e vínculo com o parceiro |
| Nome do usuário interno | `perfis_usuarios`, `auth.users` | Cadastro de usuário | Autenticação e trilha de auditoria |
| Contato do parceiro (nome/tel/e-mail) | `parceiros.contato_principal_*` | Cadastro de parceiro | Contato comercial |
| CPF ou CNPJ de subcontratada | `subcontratadas.documento`, `parceiro_subcontratadas.documento` | Cadastro | Identificação fiscal (aceita PF) |
| IP, user-agent, e-mail tentado | `eventos_portal` | Automático no login do portal | Segurança: detectar acesso indevido |
| IP, user-agent, recurso acessado | `log_acesso` | Automático na exportação/abertura | Registro de acesso (art. 37) |
| Cópia de linhas alteradas | `log_auditoria` | Automático por trigger | Trilha de quem criou/alterou/apagou |
| Documentos anexados | bucket `solicitacoes-anexos` | Upload na solicitação | CRLV, comprovantes, prints |

**O sistema NÃO trata** dado sensível do art. 11 (saúde, biometria, religião,
opinião política, filiação sindical, origem racial) nem dado de criança e
adolescente. Não há campo de endereço de pessoa física, data de nascimento nem
dado bancário.

Duas frestas por onde dado sensível pode entrar sem estar mapeado, e que a
equipe precisa conhecer:

1. **Anexos** aceitam qualquer imagem ou PDF. Um atestado médico anexado por
   engano vira dado de saúde armazenado.
2. **Campos de observação** são texto livre. "Motorista afastado por problema
   de saúde" digitado ali é dado sensível, e vai para o CSV e para a auditoria.

---

## 2. Retenção

Decidido em 2026-08-09. Implementado em `supabase/migrations/0056` e `0059`.

| Tabela | Prazo | Por quê |
|---|---|---|
| `log_auditoria` | **5 anos** | Acompanha a guarda fiscal do transporte (CT-e / MDF-e). É o prazo com obrigação legal concreta por trás. |
| `eventos_portal` | **1 ano** | Log de acesso. O Marco Civil (art. 15) exige 6 meses; 1 ano dá margem para investigar incidente descoberto tarde. |
| `log_acesso` | **1 ano** | Mesma natureza da `eventos_portal`. |
| Cadastros e solicitações | **sem prazo automático** | São a operação em si. Saem por pedido do titular (seção 3) ou por decisão de negócio. |

**Como aplicar** (não está agendado — exclusão de trilha não roda sozinha):

```sql
-- Conferir o que sairia (não apaga nada):
SELECT * FROM purgar_dados_antigos();

-- Apagar de fato, depois de olhar os números:
SELECT * FROM purgar_dados_antigos(p_dry_run => false);
```

Sugestão de cadência: rodar o dry-run na revisão trimestral. **Até 2031 o
resultado será 0 em todas as linhas** — o dado mais antigo do sistema é de
abril de 2026. A função recusa prazo abaixo de 180 dias, para um parâmetro
errado não varrer a trilha inteira.

---

## 3. Direitos do titular (art. 18)

Implementado em `supabase/migrations/0057`. Ainda **sem tela** — as duas
funções rodam pelo SQL Editor.

### Acesso e portabilidade (art. 18, II e V)

```sql
SELECT exportar_dados_titular('123.456.789-00');
```

Devolve um JSON com cadastro, solicitações em que a pessoa aparece, metadados
dos anexos e a trilha de auditoria do cadastro dela. Exige perfil **admin ou
gerente**. O conteúdo dos anexos não vai no JSON: baixar pelos `storage_path`
que ele lista.

### Correção (art. 18, III)

Pelos formulários do próprio sistema — sempre funcionou.

### Eliminação (art. 18, VI)

```sql
-- 1. Simular (não altera nada) e conferir os números:
SELECT anonimizar_titular('123.456.789-00');

-- 2. Aplicar:
SELECT anonimizar_titular('123.456.789-00', p_confirmar => true);
```

Exige perfil **admin**. Anonimiza em vez de apagar, e isso é deliberado: um
motorista aparece em dezenas de OCs já finalizadas que a empresa é obrigada a
guardar por prazo fiscal. Apagar a linha quebraria a FK ou levaria a OC junto.
A função troca nome, CPF, telefone e observações por marcadores, desativa o
cadastro, **preserva os IDs** (o histórico continua íntegro) e limpa o dado
pessoal da trilha de auditoria daquele cadastro.

Ela **recusa** se o titular tiver solicitação em andamento — anonimizar no meio
de uma viagem quebraria a OC e deixaria o pátio sem conferir quem chegou.
Finalize ou cancele antes.

**Limite conhecido:** `solicitacoes.solicitante_nome` e `.solicitante_telefone`
são texto livre sem vínculo com o cadastro; não dá para casar por CPF. Se o
titular também aparecer ali, a limpeza é manual — o procedimento está no rodapé
da migration 0057.

---

## 4. Registro de acesso (art. 37)

- **Escrita:** `log_auditoria`, por trigger em ~20 tabelas, desde a 0001.
  Registra autor, ação, tabela, registro e horário. Em UPDATE guarda só os
  campos que mudaram (0049).
- **Leitura:** `log_acesso`, desde a 0059. Registra as três operações em que
  dado pessoal sai do sistema: exportação de CSV, emissão do link do PDF da OC
  e abertura de anexo. IP, user-agent e origem (interno/portal) vêm dos headers
  no servidor — o cliente não os informa.
- **Segurança do portal:** `eventos_portal`, desde a 0021. Login, falha de
  login, logout, troca de senha.

Nenhuma das três é gravável direto: toda escrita passa por função
`SECURITY DEFINER`. Leitura restrita a admin, gerente e supervisor.

---

## 5. Medidas de segurança (art. 46)

- Senhas em `auth.users` (Supabase Auth). **Nenhuma senha em texto no banco**;
  nenhum segredo hardcoded no código.
- RLS em todas as tabelas, com isolamento entre parceiros validado por suíte de
  pentest (`scripts/pentest-rls.mjs`).
- Buckets `ocs-pdf` e `solicitacoes-anexos` **privados**; acesso só por URL
  assinada com validade curta.
- CAPTCHA (Turnstile) e rate limit no login; CSP enforced nos dois apps.
- MFA/TOTP disponível — **hoje opt-in**. A obrigatoriedade está prevista para
  o começo de setembro de 2026.
- O link do PDF da OC vale **5 dias**: o motorista não tem conta no sistema e
  leva de 1 a 4 dias para chegar ao carregamento. Não encurtar sem falar com a
  operação. O CPF vai mascarado na mensagem de WhatsApp e completo apenas
  dentro do PDF.

---

## 6. Pendências

| # | Pendência | Natureza |
|---|---|---|
| 1 | **Contrato de operador (art. 39)** com as transportadoras parceiras | Jurídica |
| 2 | **Aviso de privacidade** aos motoristas e usuários do portal | Jurídica |
| 3 | Definir formalmente **controlador × operador** em cada relação | Jurídica |
| 4 | Política de senha no Supabase Dashboard (mínimo 10 + letras e dígitos) | Técnica |
| 5 | MFA obrigatório para perfis internos | Técnica |
| 6 | Tela para `log_acesso` e para a fila de órfãos do storage | Técnica |
| 7 | Tela para os pedidos de titular (hoje só SQL Editor) | Técnica |

As pendências 1 a 3 são as que um pedido da ANPD cobraria primeiro, e nenhuma
delas se resolve em código.
