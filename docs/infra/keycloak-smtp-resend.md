# Keycloak SMTP — Envio de email via Resend

> **Contexto:** o envio de email do Keycloak (verificação de conta, reset de senha,
> notificações) deve usar um provedor transacional dedicado, nunca um SMTP self-hostado
> nem um upgrade de tier do Railway. Este doc descreve como apontar o Keycloak para o
> Resend e remover a dependência do plano Pro.

## Por que Resend

- **Free tier: 3.000 emails/mês** — cobre o volume transacional atual do Menthoros.
- **SPF + DKIM gerenciados** pelo Resend (basta colar os registros DNS no Cloudflare).
- O SMTP do Keycloak funciona em **qualquer tier pago do Railway (Hobby, $5)** — o
  upgrade para Pro nunca foi necessário. Porta 25 é bloqueada no Railway; usar 465/587.

## Pré-requisitos no Resend

1. Criar conta em <https://resend.com>.
2. Adicionar e **verificar o domínio** `menthoros.com` (Dashboard → Domains → Add Domain).
   O Resend gera os registros SPF + DKIM — colar no Cloudflare.
3. Criar a **API key** (Dashboard → API Keys). Começa com `re_` e é a **senha** do SMTP.

## Config no Keycloak (admin console)

**Realm Settings → Email**, no realm do Menthoros:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| From | `no-reply@menthoros.com` |
| From Display Name | `Menthoros` |
| Reply To | *(vazio, ou `suporte@menthoros.com`)* |
| Enable SSL | ✅ ON |
| Enable StartTLS | ⬜ OFF |
| Enable Authentication | ✅ ON |
| Username | `resend` |
| Password | `re_XXX...XXXX` (API key) |

### Pegadinha: SSL e StartTLS são excludentes

Usar **um** dos dois, nunca ambos:

| Porta | Mecanismo | Enable SSL | Enable StartTLS |
|---|---|---|---|
| **465** | SMTPS implícito *(recomendado)* | ✅ ON | ⬜ OFF |
| 587 | STARTTLS explícito | ⬜ OFF | ✅ ON |

## Config via realm JSON (IaC)

O realm é versionado em `menthoros-realm.json` e sincronizado via `sync-realm.sh`
(keycloak-config-cli) — mesmo mecanismo usado na change `customize-keycloak-login-theme`.
Adicionar o bloco `smtpServer` na raiz do realm:

```json
"smtpServer": {
  "host": "smtp.resend.com",
  "port": "465",
  "from": "no-reply@menthoros.com",
  "fromDisplayName": "Menthoros",
  "replyTo": "",
  "replyToDisplayName": "",
  "envelopeFrom": "",
  "ssl": "true",
  "starttls": "false",
  "auth": "true",
  "user": "resend",
  "password": "re_XXX...XXXX"
}
```

⚠️ **Quirks do Keycloak no realm JSON:**

- `port`, `ssl`, `starttls` e `auth` são **strings** (`"465"`, `"true"`), não número/booleano.
  Booleano/numérico quebra o import.
- O campo `password` é exportado em **texto puro**. **Não commitar a API key** — injetar
  via secret do Railway / variável no `sync-realm.sh`, não no arquivo versionado.

## Testar

1. Admin console → Realm Settings → Email → **Test connection** (enviar para um email real).
2. Dashboard do Resend → logs de envio / seção de teste.

## Rollback

- Remover o bloco `smtpServer` do realm JSON e rodar `sync-realm.sh`, **ou** limpar os
  campos no admin console. O Keycloak volta a não enviar email (sem efeito em login).

## Notas de infra

- Keycloak roda como serviço `menthoros-keycloak` no Railway (imagem
  `quay.io/keycloak/keycloak:26.6`; ver `docker-compose.yml` do backend e
  `railway.keycloak.toml`).
- **SMTP não é configurável via env vars `KC_*`** — é setting de realm (admin console ou
  realm JSON). Não existe `KC_SMTP_*`.
- Após configurar, o downgrade **Railway Pro → Hobby ($5)** fica liberado (o SMTP só
  precisa de egress de rede, disponível em tier pago).
