# Runbook — Infra Menthoros: Email, Keycloak, Railway e Ambientes

> Migração em fases, da fundação (email) à organização (ambientes). Cada fase tem
> "Concluído quando" e rollback. Estado de partida: DNS no Cloudflare (proxied),
> email na GoDaddy, Railway Pro (1 ambiente), Keycloak 26.6.

## Trilhas

- **Trilha A (resolve o custo, ~1–2 dias):** Fases 1 → 3. Derruba o plano Pro de R$190.
- **Trilha B (organização):** Fases 4 → 5. Separação de domínios + ambientes dev/prod.

---

## Fase 1 — Email (Resend + Cloudflare Email Routing)

### 1.1 Resend — conta e domínio

1. Criar conta em <https://resend.com>.
2. **Domains → Add Domain** → `menthoros.com`.
3. O dashboard mostra os registros DNS a adicionar (SPF + DKIM). Copiar.

### 1.2 Cloudflare — SPF e DKIM do Resend

1. No Cloudflare (DNS → Records), **ADICIONAR** (não substituir ainda):
   - **SPF**: TXT `menthoros.com` → `v=spf1 include:secureserver.net include:spf.resend.com -all`
     *(mantém GoDaddy por enquanto; remove o `secureserver.net` na Fase 1.5)*
   - **DKIM**: os registros CNAME gerados pelo Resend (`resend._domainkey.menthoros.com`).
   - **Atenção:** DKIM deve ficar **cinza (DNS only)**, nunca proxied.
2. Voltar no Resend e clicar **Verify**.

### 1.3 Cloudflare Email Routing (recebimento de `contato@`)

> `contato@menthoros.com` é o canal LGPD (DPO). **Não pode morrer** — por isso o
> routing vem antes de cancelar a GoDaddy.

1. Cloudflare → **Email → Email Routing** → ativar.
2. Regra: `contato@menthoros.com` → encaminhar para o email pessoal (Gmail).
3. O Cloudflare fornece os **MX records**. Substituir os MX atuais (GoDaddy) por eles.
4. Testar: enviar um email de fora para `contato@menthoros.com` e confirmar chegada.

### 1.4 Testar envio + recebimento

- Resend → **Dashboard → Send Test Email** (ou a seção de teste) → confirmar recebimento.

### 1.5 Cancelar GoDaddy + limpar DNS

1. **Backup/exportar** emails antigos da caixa GoDaddy que queira manter.
2. Cancelar a conta de email na GoDaddy.
3. Cloudflare — **remover** os registros GoDaddy órfãos:
   - MX `smtp.secureserver.net` / `mailstore1.secureserver.net` (já trocados em 1.3)
   - SPF: voltar para `v=spf1 include:spf.resend.com -all` (remove `secureserver.net`)
   - DKIM `secureserver1/2._domainkey` (remover)
   - SRV `autodiscover.secureserver.net` (remover)
   - CNAME `email.menthoros.com` (remover)
4. DMARC: manter `p=reject`, trocar `rua` para um email que você leia.

**Concluído quando:** envio do Resend chega + `contato@` recebe via routing + GoDaddy cancelada.

**Rollback:** religar os registros GoDaddy (MX/SPF/DKIM) se algo quebrar.

---

## Fase 2 — Keycloak SMTP → Resend

1. **Realm Settings → Email** (realm `menthoros`):

   | Campo | Valor |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | From | `no-reply@menthoros.com` |
   | Enable SSL | ✅ ON (StartTLS OFF) |
   | Enable Authentication | ✅ ON |
   | Username | `resend` |
   | Password | `re_XXX...` (API key) |

2. **Test connection** → enviar para um email real.
3. Testar fluxo real: solicitar reset de senha / verificação.

> Detalhe completo (SSL vs StartTLS, realm JSON `smtpServer`, quirk de string-boolean)
> em [`keycloak-smtp-resend.md`](keycloak-smtp-resend.md).

**Concluído quando:** email de reset/verificação chega de `no-reply@menthoros.com`.

---

## Fase 3 — Railway: downgrade Pro → Hobby

1. Confirmar que o email do Keycloak funciona em tier pago.
2. Railway → **Plans/Billing → Hobby ($5)**.
3. Verificar na próxima fatura que caiu para ~$6–7 (uso $1,27 + taxa Hobby).

**Concluído quando:** fatura sem a taxa de $20 do Pro.

---

## Fase 4 — Separação de domínios (prod)

> Hoje: apex `menthoros.com` → Railway (nginx roteia `/`, `/api`, `/auth`).
> Alvo: subdomínios por serviço.

### 4.1 Railway — custom domains por serviço

Em cada serviço (backend, keycloak, front): **Settings → Networking → Custom Domain**.

| Serviço | Custom domain |
|---|---|
| front (SPA) | `app.menthoros.com` |
| backend | `api.menthoros.com` |
| keycloak | `auth.menthoros.com` |

### 4.2 Cloudflare — CNAMEs (todos laranja/proxied)

```
api.menthoros.com   CNAME  <api>.up.railway.app
auth.menthoros.com  CNAME  <auth>.up.railway.app
app.menthoros.com   CNAME  <app>.up.railway.app
```
+ Redirect Rule: `menthoros.com` e `www` → `https://app.menthoros.com`.

### 4.3 Frontend — env de build

```
VITE_API_BASE_URL = https://api.menthoros.com
VITE_KEYCLOAK_URL = https://auth.menthoros.com
```

O proxy `/auth` e `/api` do nginx deixa de ser necessário (browser chama os subdomínios direto).

### 4.4 Backend — CORS

Liberar origin `https://app.menthoros.com` no Spring Boot.

### 4.5 Keycloak — hostname e client

- `KC_HOSTNAME=auth.menthoros.com`
- `KC_PROXY_HEADERS=xforwarded` (atrás do Cloudflare + proxy do Railway)
- `KC_HTTP_ENABLED=false`
- Client `menthoros-web`: Web Origins `https://app.menthoros.com` + Redirect URIs `https://app.menthoros.com/*`

**Concluído quando:** login → token → refresh → logout funcionando pelos subdomínios.

---

## Fase 5 — Ambientes (staging + prod)

### 5.1 Criar staging

1. Railway → **`+ New Environment` → Duplicate Environment** (a partir de `production`).
2. Renomear para `staging`.
3. Apontar serviços do staging para a branch `develop` (auto-deploy).
4. Revisar e **aprovar os staged changes** antes de deployar.

### 5.2 Sobrescrever variáveis do staging (obrigatório)

O Duplicate copia variáveis/secrets de prod. Trocar **antes** do primeiro deploy:

- [ ] String de conexão do Postgres (staging tem o **próprio** banco)
- [ ] `KC_DB_PASSWORD` / secrets do Keycloak
- [ ] OAuth clients (Strava/Garmin/Intervals.icu) → apps separados ou callback `*.staging.menthoros.com`
- [ ] SMTP do Keycloak → Resend em **modo teste** (nunca email real em staging)
- [ ] `KC_HOSTNAME=auth.staging.menthoros.com`
- [ ] Redirect URIs → `https://app.staging.menthoros.com/*`
- [ ] `VITE_API_BASE_URL=https://api.staging.menthoros.com`
- [ ] `VITE_KEYCLOAK_URL=https://auth.staging.menthoros.com`

### 5.3 Cloudflare — domínios do staging

```
app.staging.menthoros.com   CNAME  <app-staging>.up.railway.app
api.staging.menthoros.com   CNAME  <api-staging>.up.railway.app
auth.staging.menthoros.com  CNAME  <auth-staging>.up.railway.app
```

### 5.4 PR environments

Project Settings → Environments → habilitar **PR Environments** (e **Focused PR Environments** se monorepo).

**Concluído quando:** staging estável com domínios próprios + PR environment subindo por PR.

---

## Convenção branch × ambiente × domínio

| Branch | Ambiente | Domínio |
|---|---|---|
| `main` | production | `app/api/auth.menthoros.com` |
| `develop` | staging | `app/api/auth.staging.menthoros.com` |
| `feature/*` | PR env (efêmero) | URL automática |

## Riscos transversais

- **`p=reject` + `-all`:** qualquer sender fora do SPF é descartado em silêncio. Sempre
  atualizar SPF/DKIM **junto** com qualquer mudança de provedor de email.
- **Staging apontando pra prod:** a variável errada (DB/secrets) é o erro nº 1 pós-Duplicate.
- **Keycloak hostname errado:** `issuer`/redirect com host errado quebra o login — testar o
  fluxo completo de auth após qualquer mudança de domínio.
