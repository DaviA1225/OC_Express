# E-mail de convite do Portal de Parceiros — template PT-BR

O convite de usuários do portal usa `auth.admin.inviteUserByEmail` (Edge Function
`convidar-parceiro-usuario`), que dispara o template **"Invite user"** do Supabase.
O idioma/conteúdo do e-mail **vem do Dashboard, não do código**.

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
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#1E40AF;color:#fff;
            border-radius:6px;text-decoration:none;font-weight:600;">
    Aceitar convite
  </a>
</p>
<p>Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
<p style="color:#666;font-size:12px;margin-top:24px;">
  Este convite é pessoal. Se você não esperava recebê-lo, ignore este e-mail.
</p>
```

`{{ .ConfirmationURL }}` é o link mágico do Supabase; com o `redirectTo` da Edge
Function, ele leva o convidado a `/aceitar-convite`, onde define a senha (mín. 12
caracteres).

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
