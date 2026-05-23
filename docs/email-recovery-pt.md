# E-mail "Reset password" do Portal de Parceiros — template PT-BR

Quando o admin do parceiro clica em **Reenviar** (UsuariosPage do portal),
a Edge Function `reenviar-convite-parceiro-usuario` gera um novo link via
`auth.admin.generateLink({ type: 'recovery' })`. Se o SMTP custom estiver
configurado no Supabase, esse fluxo também dispara o template
**"Reset Password"** (o conteúdo do e-mail vem do Dashboard, não do código).

> Hoje o login do portal não tem "Esqueci minha senha", então este template
> só é disparado pelo nosso reenvio de convite. Texto pode ser específico
> para esse caso.

## Onde aplicar
Supabase → **Authentication → Emails → Templates → "Reset Password"**.

## Assunto
```
Seu novo link para entrar no Portal de Parceiros LHG
```

## Corpo (HTML)
```html
<h2>Novo link para o Portal de Parceiros LHG</h2>
<p>Olá,</p>
<p>O administrador da sua transportadora reenviou seu convite para o
<strong>Portal de Parceiros da LHG</strong>. Use o link abaixo para definir
sua senha e entrar.</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;padding:10px 18px;background:#1E40AF;color:#fff;
            border-radius:6px;text-decoration:none;font-weight:600;">
    Definir senha e entrar
  </a>
</p>
<p>Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
<p style="color:#666;font-size:12px;margin-top:24px;">
  Este link expira em 1 hora. Se você não esperava recebê-lo, ignore este e-mail.
</p>
```

`{{ .ConfirmationURL }}` é o link mágico do Supabase; com o `redirectTo`
da Edge Function, ele leva a pessoa a `/aceitar-convite`, onde define a senha
(mín. 12 caracteres) e marca o convite como aceito.

## Pré-requisitos para o e-mail chegar
- **SMTP próprio** configurado em Authentication → Emails → SMTP Settings.
- **Redirect URL** `…/aceitar-convite` na allowlist (Authentication → URL
  Configuration → Redirect URLs), produção e `http://localhost:5174`.
- Sem SMTP, o reenvio ainda funciona — a UsuariosPage do portal mostra o
  link num dialog com botão **Copiar** e o admin manda manualmente.
