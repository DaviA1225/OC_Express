# E-mail de convite do Portal de Parceiros — template PT-BR

O convite de usuários do portal usa `auth.admin.inviteUserByEmail` (Edge Function
`convidar-parceiro-usuario`), que dispara o template **"Invite user"** do Supabase.
O idioma/conteúdo do e-mail **vem do Dashboard, não do código**.

## ⚠️ Use o link `token_hash`, NÃO o `{{ .ConfirmationURL }}`

`{{ .ConfirmationURL }}` é um link de uso único que passa pelo `/auth/v1/verify`
do Supabase — e é **consumido na primeira requisição GET**. Scanners de e-mail
corporativo (Outlook/Defender *Safe Links*, Mimecast, Proofpoint) **pré-clicam**
o link para checar segurança, consomem o token, e quando a pessoa clica de
verdade o Supabase responde "link expirado/inválido". Era a causa de alguns
parceiros não conseguirem entrar.

A correção (2026): o link aponta direto para o portal com `token_hash`, e o
`AceitarConvitePage` chama `supabase.auth.verifyOtp({ token_hash, type })` **no
JavaScript da página**. O scanner faz só um GET "burro" (não roda o JS do SPA),
então não consome mais o token. Por isso o `href` abaixo usa `{{ .TokenHash }}`.

## Onde aplicar
Supabase → **Authentication → Emails → Templates → "Invite user"**.

## Assunto
```
Você foi convidado para o Portal de Parceiros LHG
```

## Corpo (HTML)
```html
<h2>Convite para o Portal de Parceiros LHG</h2>
<p>Olá,</p>
<p>Você foi convidado a acessar o <strong>Portal de Parceiros da LHG</strong>,
onde sua transportadora cria e acompanha solicitações de carregamento.</p>
<p>Para ativar sua conta e definir sua senha, clique no botão abaixo:</p>
<p>
  <a href="https://oc-sislog-portal.vercel.app/aceitar-convite?token_hash={{ .TokenHash }}&type=invite"
     style="display:inline-block;padding:10px 18px;background:#1E40AF;color:#fff;
            border-radius:6px;text-decoration:none;font-weight:600;">
    Aceitar convite
  </a>
</p>
<p>Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p><a href="https://oc-sislog-portal.vercel.app/aceitar-convite?token_hash={{ .TokenHash }}&type=invite">https://oc-sislog-portal.vercel.app/aceitar-convite?token_hash={{ .TokenHash }}&amp;type=invite</a></p>
<p style="color:#666;font-size:12px;margin-top:24px;">
  Este convite é pessoal. Se você não esperava recebê-lo, ignore este e-mail.
</p>
```

> Se o portal mudar de domínio, troque o host nos dois `href` acima. Como
> alternativa ao host fixo, dá pra usar `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`
> (o `redirectTo` que a Edge Function passa já é `<PORTAL_URL>/aceitar-convite`),
> mas o host fixo é mais previsível.

O `AceitarConvitePage` aceita os dois formatos: o novo `?token_hash=…` (verifica
via `verifyOtp`) e o antigo link de hash (`#access_token=…`, via
`detectSessionInUrl`) — então convites antigos já enviados continuam funcionando.
Depois de verificar, o convidado define a senha (mín. 12 caracteres).

## Pré-requisitos para o convite chegar
- **SMTP próprio** configurado em Authentication → Emails → SMTP Settings
  (SendGrid, Resend, AWS SES…). O SMTP padrão do Supabase só entrega para a
  equipe do projeto e tem limite baixo — não serve para convidar um parceiro real.
- **Redirect URL** `…/aceitar-convite` na allowlist (Authentication → URL
  Configuration → Redirect URLs), tanto em produção quanto `http://localhost:5174`.

## Como enviar (app interno)
O primeiro usuário de um parceiro é convidado por um interno (ainda não há
`admin_parceiro`): **Cadastros → Parceiros → [parceiro] → Usuários → Convidar
usuário**. Convide um `admin_parceiro`, que depois convida os próprios operadores.
