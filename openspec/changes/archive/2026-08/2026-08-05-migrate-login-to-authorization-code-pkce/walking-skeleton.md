# Walking skeleton — migrate-login-to-authorization-code-pkce (bloco 4)

Roteiro do click-through manual. **É aqui que a change se prova**: nenhum destes passos é
substituível por teste com mock, e o precedente do repo é explícito — `athlete-onboarding-baseline`
passou a suíte inteira e o click-through achou três bugs; `add-coach-lgpd-consent` foi entregue com
762 testes verdes e dois bugs que só apareceram no navegador.

> Preencha o resultado de cada item **enquanto executa**, não no fim. "Passou tudo" escrito depois é
> a forma mais comum de um roteiro virar ficção.

---

## Ambiente (verificado em 2026-08-04)

| Peça | Estado | Endereço |
|---|---|---|
| Keycloak | ✅ no ar (HomeLab) | `http://192.168.15.24:8080`, realm `menthoros` |
| Postgres | ✅ container `menthoros-db` | `localhost:5432` |
| Backend | subir com `.env` do repo | `http://localhost:8099` |
| Frontend | `npm run dev` | `http://localhost:5174` |

**Client `menthoros-web` já configurado:** `standardFlowEnabled`, `post.logout.redirect.uris = +`,
`redirectUris` incluindo `http://localhost:5174/*`. O `directAccessGrantsEnabled` segue `true` de
propósito — o corte é a task 5.3, depois desta validação.

### Usuários disponíveis no realm

| Usuário | Roles | Organization | Serve para |
|---|---|---|---|
| `menthoros` | `ADMIN`, `TECNICO` | Assessoria Demo | fluxo do **coach** (itens 1–6, 8) |
| `leandro` | `ATLETA` | Assessoria Demo | fluxo do **atleta** (item 7) |

Ambos são membros da organization — é dela que vem o claim `organization`, de onde o backend extrai
o `tenant_id`. As senhas são as suas; não estão no repositório.

### Subir

```bash
# backend (a partir de apps/menthoros-backend)
set -a; . ./.env; set +a; ./mvnw spring-boot:run

# frontend (a partir de apps/menthoros-front)
npm run dev
```

---

## ⚠️ Acesso por IP na rede local não funciona (verificado 2026-08-04)

Tentar abrir o app de outro dispositivo por `http://<ip-da-lan>:5174` **falha no clique de entrar**,
com erro de *secure context*. A causa não é configuração do Keycloak:

**PKCE S256 depende de `crypto.subtle`, que o navegador só expõe em contexto seguro** — HTTPS ou
`localhost`. Um IP de LAN não é considerado seguro, então o `code_challenge` não chega a ser gerado.
Registrar o IP nos `redirectUris` é necessário mas **não suficiente**, e foi revertido justamente
para não sugerir que o caminho funciona.

Alternativas, se o teste em dispositivo real for necessário:

- **Android:** port forwarding do Chrome (`chrome://inspect` → Port forwarding, `5174`). O celular
  passa a ver `localhost:5174`, que **é** contexto seguro, e o `redirect_uri` já registrado continua
  valendo. É o caminho mais curto.
- **HTTPS ponta a ponta:** exige certificado no Vite **e no Keycloak**. Só o app em HTTPS não
  resolve: a troca do código por token é um `fetch` para o Keycloak, e HTTPS→HTTP vira mixed content
  bloqueado — troca-se um erro por outro, mais difícil de diagnosticar.
- **Layout apenas:** DevTools em 375px responde sem nenhum setup.

## Roteiro

### 1. Login do coach (task 4.1)

1. Abra `http://localhost:5174` numa **janela anônima** (garante ausência de sessão prévia).
2. Navegue para uma rota protegida, ex.: `http://localhost:5174/#/coach/inbox`.
3. Espera-se: redirecionamento para o Keycloak, com a tela **dele**, não a nossa.
4. Autentique como `menthoros`.

- [x] Voltou autenticado e **caiu em `#/coach/inbox`**, não na landing nem em `/inicio`.
      ⚠️ *Se cair na raiz, o destino no `state` não está sendo restaurado — é o risco do D4.*
- [x] A URL final **não** contém `code=` nem `state=`.
      ⚠️ *Se contiver, um reload reenviará um `code` já invalidado e o usuário verá erro sem motivo.*

**Na aba Network, na requisição de autorização:** confirme `code_challenge_method=S256` e
`scope` contendo `organization`.

- [x] `code_challenge_method=S256` presente.
- [x] `organization` no `scope`. ⚠️ *Sem ele o token sai sem `tenant_id` e **toda** chamada dá 403,
      com o login parecendo bem-sucedido.*

### 2. Nada de token no storage (task 4.8)

No DevTools → Application → Storage:

- [x] `localStorage` **vazio** de token; a chave `@Menthoros:token` não existe.
- [x] `sessionStorage` contém apenas o state do fluxo OIDC (`oidc.*`) — **nenhum access token**.

### 3. Reload mantém a sessão (task 4.2)

- [x] `F5` na rota protegida: continua autenticado, sem novo prompt de credenciais.
- [x] Não pisca a tela de login no meio do caminho.
      ⚠️ *Piscar indica que o guard está agindo antes de o estado ser conhecido — o `carregando`.*

### 4. Aba nova (task 4.3)

- [x] Abra `http://localhost:5174/#/coach/inbox` em **outra aba** da mesma janela: autentica
      sozinho, sem pedir credenciais.
      ℹ️ *Como o token vive em memória, a aba nova conversa com o Keycloak. Um redirect rápido é
      esperado; pedir senha de novo não é.*

### 5. Chamadas de API com tenant (task 4.6b)

Com o inbox aberto, na aba Network, escolha uma chamada para `localhost:8099`:

- [x] Header `Authorization: Bearer ...` presente.
- [x] Header `X-Tenant-ID` presente **e** não vazio.
      ⚠️ *Os dois saem da mesma leitura; um sem o outro é o bug que o pré-mortem previu.*
- [x] Cole o token em jwt.io: tem `tenant_id` (ou claim de organization) **e** `realm_access.roles`
      com `TECNICO`. *O backend só lê `realm_access.roles`.*

### 6. Gate LGPD e escrita real (task 4.6)

Abrir `/me` não basta: o interceptor de consentimento age sobre **escrita**.

- [x] Execute uma ação de escrita do coach (ex.: aprovar ou editar um plano, registrar um kudo).
- [x] A ação conclui, ou falha por regra de negócio legítima — **não** com `403 LGPD_CONSENT_REQUIRED`
      inesperado nem `503`.
      ℹ️ *O enforcement está em `report-only`, então não deve bloquear. Se bloquear, a mudança de
      claims quebrou a resolução do usuário.*

### 7. Login do atleta (task 4.7)

Em janela anônima, entre como `leandro`:

- [x] Após autenticar, vai para `#/athlete/home` — não para `/inicio` nem para o shell do coach.

### 8. Logout encerra a sessão no provedor (task 4.4)

- [x] Clique em sair. Espera-se redirecionamento ao Keycloak e volta à aplicação deslogado.
- [x] Acesse `#/coach/inbox` de novo: **pede credenciais**.
      ⚠️ *Se entrar direto, o logout não encerrou a sessão no Keycloak — exatamente o defeito que
      existia antes (o usuário achava que tinha saído e não tinha).*

### 9. Renovação durante o uso (task 4.5)

O token do Keycloak costuma durar 5 min; a renovação dispara 60 s antes.

- [x] Fique na aplicação além do tempo de vida do token e faça uma ação.
- [x] A sessão se renova sem pedir credenciais.
      ℹ️ *A renovação é por **redirect** (decisão 0.2): uma ida e volta rápida ao Keycloak é o
      comportamento esperado, não um bug.*
- [x] Depois da renovação, o destino é preservado — você continua na tela em que estava.
- [x] Nenhum laço de redirecionamento.

### 10. Sessão legada derrubada (task 4.9)

- [x] Com a aplicação fechada, injete `localStorage['@Menthoros:token'] = 'qualquer-coisa'` pelo
      console, recarregue e confirme que a chave **some** e o app não fica em estado híbrido.

---

## Registro

**Data:** 2026-08-04 (itens 1–5, 7) e 2026-08-05 (itens 6, 8, 9)
**Executado por:** founder (Leandro), contra o Keycloak do HomeLab

**Resultado:** todos os itens do roteiro executados e aprovados.

**Falhas encontradas:**

- **Item 3 (reload), 2026-08-04 — bug real, corrigido.** A tela piscava e voltava ao login. Sem token
  persistido, o `getUser()` volta vazio no reload e o bootstrap **desistia**, concluindo "anônimo": o
  design previa a sessão vir do cookie do Keycloak, mas nada no código perguntava a ele. Corrigido
  com `prompt=none` por redirect, com guarda contra laço (commit `9c04d86`).
- **Achado fora do roteiro:** não havia ação de logout em nenhum dos dois shells — `logout()` existia
  e não era chamado por ninguém. A correção do reload tornou isso crítico (sem sair, não havia como
  trocar de usuário). Entrou em `ac08e00` e `da130e6`.

**Itens 2 e 10 — cobertos por E2E, não por inspeção manual.** Os specs "nenhum token fica no
localStorage" e "token do mecanismo antigo é descartado no bootstrap" fazem o mesmo e rodam a cada
PR; o segundo planta `@Menthoros:token` antes do carregamento e afirma que some.

**Limite desta validação:** tudo foi exercitado contra o **HomeLab**. Railway (dev) e produção não
receberam o sync do realm, então o bloco 4 ainda precisa ser repetido em produção — é a task 5.2, e
ela continua pendente.

---

## O que o roteiro provou

Dos dois defeitos desta change que chegaram a existir, **os dois foram achados aqui** — nenhum por
teste automatizado. O do reload passava por 831 testes verdes; a ausência de logout não tinha teste
que pudesse falhar, porque não havia código a exercitar. É o mesmo padrão de
`athlete-onboarding-baseline` e `add-coach-lgpd-consent`, agora com um terceiro caso.
