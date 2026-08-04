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

## Roteiro

### 1. Login do coach (task 4.1)

1. Abra `http://localhost:5174` numa **janela anônima** (garante ausência de sessão prévia).
2. Navegue para uma rota protegida, ex.: `http://localhost:5174/#/coach/inbox`.
3. Espera-se: redirecionamento para o Keycloak, com a tela **dele**, não a nossa.
4. Autentique como `menthoros`.

- [ ] Voltou autenticado e **caiu em `#/coach/inbox`**, não na landing nem em `/inicio`.
      ⚠️ *Se cair na raiz, o destino no `state` não está sendo restaurado — é o risco do D4.*
- [ ] A URL final **não** contém `code=` nem `state=`.
      ⚠️ *Se contiver, um reload reenviará um `code` já invalidado e o usuário verá erro sem motivo.*

**Na aba Network, na requisição de autorização:** confirme `code_challenge_method=S256` e
`scope` contendo `organization`.

- [ ] `code_challenge_method=S256` presente.
- [ ] `organization` no `scope`. ⚠️ *Sem ele o token sai sem `tenant_id` e **toda** chamada dá 403,
      com o login parecendo bem-sucedido.*

### 2. Nada de token no storage (task 4.8)

No DevTools → Application → Storage:

- [ ] `localStorage` **vazio** de token; a chave `@Menthoros:token` não existe.
- [ ] `sessionStorage` contém apenas o state do fluxo OIDC (`oidc.*`) — **nenhum access token**.

### 3. Reload mantém a sessão (task 4.2)

- [ ] `F5` na rota protegida: continua autenticado, sem novo prompt de credenciais.
- [ ] Não pisca a tela de login no meio do caminho.
      ⚠️ *Piscar indica que o guard está agindo antes de o estado ser conhecido — o `carregando`.*

### 4. Aba nova (task 4.3)

- [ ] Abra `http://localhost:5174/#/coach/inbox` em **outra aba** da mesma janela: autentica
      sozinho, sem pedir credenciais.
      ℹ️ *Como o token vive em memória, a aba nova conversa com o Keycloak. Um redirect rápido é
      esperado; pedir senha de novo não é.*

### 5. Chamadas de API com tenant (task 4.6b)

Com o inbox aberto, na aba Network, escolha uma chamada para `localhost:8099`:

- [ ] Header `Authorization: Bearer ...` presente.
- [ ] Header `X-Tenant-ID` presente **e** não vazio.
      ⚠️ *Os dois saem da mesma leitura; um sem o outro é o bug que o pré-mortem previu.*
- [ ] Cole o token em jwt.io: tem `tenant_id` (ou claim de organization) **e** `realm_access.roles`
      com `TECNICO`. *O backend só lê `realm_access.roles`.*

### 6. Gate LGPD e escrita real (task 4.6)

Abrir `/me` não basta: o interceptor de consentimento age sobre **escrita**.

- [ ] Execute uma ação de escrita do coach (ex.: aprovar ou editar um plano, registrar um kudo).
- [ ] A ação conclui, ou falha por regra de negócio legítima — **não** com `403 LGPD_CONSENT_REQUIRED`
      inesperado nem `503`.
      ℹ️ *O enforcement está em `report-only`, então não deve bloquear. Se bloquear, a mudança de
      claims quebrou a resolução do usuário.*

### 7. Login do atleta (task 4.7)

Em janela anônima, entre como `leandro`:

- [ ] Após autenticar, vai para `#/athlete/home` — não para `/inicio` nem para o shell do coach.

### 8. Logout encerra a sessão no provedor (task 4.4)

- [ ] Clique em sair. Espera-se redirecionamento ao Keycloak e volta à aplicação deslogado.
- [ ] Acesse `#/coach/inbox` de novo: **pede credenciais**.
      ⚠️ *Se entrar direto, o logout não encerrou a sessão no Keycloak — exatamente o defeito que
      existia antes (o usuário achava que tinha saído e não tinha).*

### 9. Renovação durante o uso (task 4.5)

O token do Keycloak costuma durar 5 min; a renovação dispara 60 s antes.

- [ ] Fique na aplicação além do tempo de vida do token e faça uma ação.
- [ ] A sessão se renova sem pedir credenciais.
      ℹ️ *A renovação é por **redirect** (decisão 0.2): uma ida e volta rápida ao Keycloak é o
      comportamento esperado, não um bug.*
- [ ] Depois da renovação, o destino é preservado — você continua na tela em que estava.
- [ ] Nenhum laço de redirecionamento.

### 10. Sessão legada derrubada (task 4.9)

- [ ] Com a aplicação fechada, injete `localStorage['@Menthoros:token'] = 'qualquer-coisa'` pelo
      console, recarregue e confirme que a chave **some** e o app não fica em estado híbrido.

---

## Registro

**Data:** ____  **Executado por:** ____

**Falhas encontradas** (uma linha por item, com o que se esperava e o que aconteceu):

**Itens não executados e por quê:** *(se algum não puder ser feito, registre — o silêncio é o que
deixou um fluxo quebrado passar antes)*
