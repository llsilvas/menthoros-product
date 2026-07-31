# Tasks — add-coach-settings-page

**Tamanho:** XS · **Trilha:** Fast

Branch: `feature/add-coach-settings-page` (backend `c53ad5b`, front `f915202`).

**Dependência satisfeita:** `add-coach-lgpd-consent` mergeada em `develop` em 2026-07-31 — a
tabela, a entidade, o repository e a `V73` já existem.

## Verificações do `init` contra o código real (2026-07-31)

Três premissas da spec estavam desatualizadas ou incompletas:

- **A assinatura do repository é outra.** A spec dizia
  `findTopByUsuarioIdOrderByConsentedAtDesc`; o método que existe é
  `findTopByUsuario_IdAndTenantIdOrderByConsentedAtDesc` — **tenant-scoped**, e é essa a correta.
  Usar uma versão sem tenant leria consentimento de outra assessoria.
- **`avatarUrl` NÃO está no `UsuarioMeOutputDto`.** A spec mandava "conferir"; conferido — está na
  entidade `Usuario`, mas não é exposto. Tem de ser adicionado.
- **O frontend descarta o avatar hoje.** `useCurrentUser` declara `avatarUrl?` em `CurrentCoach`,
  mas `setCoach` só preenche `id` e `name` — campo morto que a tela de perfil precisa ligar.

E um detalhe que a spec não previa:

- **`CoachRoute` é uma union de strings tipada** (`constants/routes.ts`). Adicionar o item na
  sidebar não compila sem estender esse tipo **e** adicionar `SETTINGS` em `ROUTES`. Não existe
  nenhuma rota `settings` no `App.tsx` hoje.

---

## 1. Backend — expor os campos do perfil

- [ ] **1.1 `UsuarioMeOutputDto` — expor o último consentimento**
  - Campos `Instant lgpdConsentedAt`, `String lgpdAcceptedPolicyVersion` e
    `String lgpdAcceptedTermsVersion`, todos nullable com `@Schema` (o DTO já tem
    `@JsonInclude(NON_NULL)`, então somem do JSON quando não há aceite).
  - Origem: `UsuarioLgpdConsentRepository.findTopByUsuario_IdAndTenantIdOrderByConsentedAtDesc`
    — o **último** aceite, tenant-scoped. Não confundir com as versões **vigentes**
    (`lgpdCurrentPolicyVersion`), que já vêm da config: exibir a aceita é o ponto, e ela pode ser
    mais antiga que a vigente — é justamente essa diferença que o coach precisa enxergar.
  - **`avatarUrl` precisa ser adicionado** ao DTO (verificado no `init`: existe em `Usuario`, não
    no `UsuarioMeOutputDto`).
  - `UsuarioMapper.toMeOutputDto` já tem 5 parâmetros; acrescentar os 4 novos elevaria para 9.
    **Passar um objeto** em vez de mais parâmetros posicionais — o `clean-code-reviewer` já
    sinalizou Data Clump nessa assinatura no QA da change anterior.
  - `verify:` `./mvnw clean test` verde e `GET /users/me` devolvendo os campos novos.
  - Atualizar o mapeamento em `UsuarioServiceImpl.getCurrentUser()`.
  - **Teste:** `UsuarioServiceImplTest` — propaga data e versões do último aceite quando existe;
    com **duas** linhas, retorna a mais recente; sem nenhuma, os três campos vêm nulos sem quebrar
    (CA4); `avatarUrl` propagado.
  - **Validação:** `./mvnw clean test`

## 2. Frontend

- [ ] **2.1 Portar o contrato no cliente curado**
  - **Não rodar o gerador por cima:** `src/api` é fachada curada à mão (ver `CLAUDE.md` do front,
    "API Client & Types"). O texto original desta task dizia "regenerar" e "não editar à mão" —
    está errado para este repo, e a change anterior já seguiu o porte manual.
  - Acrescentar `lgpdConsentedAt`, `lgpdAcceptedPolicyVersion`, `lgpdAcceptedTermsVersion` e
    `avatarUrl` a `UsuarioMeOutputDto` em `src/types/Usuario.ts`.
  - **Preencher `avatarUrl` no `useCurrentUser`** — hoje `CurrentCoach.avatarUrl` é declarado e
    nunca populado.
  - `verify:` `npm run lint && npm run build`

- [ ] **2.2 `CoachSettingsPage`**
  - `src/features/coach/pages/CoachSettingsPage.tsx`, consumindo o hook de usuário atual já
    existente (`useCurrentUser`).
  - **Seção "Dados pessoais":** avatar, nome e e-mail — somente leitura (CA2).
  - **Seção "Privacidade":**
    - link para `/privacidade`;
    - data do último aceite formatada em pt-BR a partir de `lgpdConsentedAt` **e a versão aceita**
      da Política, com fallback explícito quando não há registro (CA3, CA4);
    - contato do DPO (`mailto:`);
    - ação "Solicitar exclusão de conta" (`mailto:` com assunto pré-preenchido) (CA5).
  - Layout responsivo — seções empilham em viewport pequeno, sem overflow horizontal (CA6).
  - Estados de `loading` e de erro no carregamento de `me`.
  - **Teste:** `CoachSettingsPage.test.tsx` — renderiza as duas seções com os dados do usuário
    (CA2); exibe data e versão quando há aceite (CA3); renderiza sem erro quando não há aceite
    registrado (CA4); os `href` de política, DPO e exclusão estão corretos (CA5).
  - **Validação:** `npm run lint && npm run build && npm test`

- [ ] **2.3 Rota e navegação**
  - `constants/routes.ts`: adicionar `COACH_SETTINGS: '/coach/settings'` em `ROUTES` **e**
    `| '/coach/settings'` na union `CoachRoute` — sem isso o item da sidebar não compila.
  - `App.tsx`: adicionar `{ path: 'settings', element: <CoachSettingsPage /> }` dentro dos
    children de `coach`, seguindo o padrão das demais páginas do shell.
  - `CoachSidebar.tsx`: item "Configurações" (ícone `Settings`) ao final de `NAV_ITEMS`.
  - **Teste:** `CoachSidebar.test.tsx` — o item aparece e navega para `/coach/settings` (CA1).
  - **Validação:** `npm run lint && npm run build && npm test`

## 3. Verificação (P0)

- [ ] **3.1** Sidebar → "Configurações" abre `/coach/settings` (CA1).
- [ ] **3.2** Nome, e-mail e avatar corretos e não editáveis (CA2).
- [ ] **3.3** Data e versão do último aceite exibidas corretamente; coach sem aceite não quebra a
  tela (CA3, CA4).
- [ ] **3.4** Links de política, DPO e exclusão funcionam (CA5).
- [ ] **3.5** Página responsiva em telas pequenas e grandes (CA6).
- [ ] **3.6** `./mvnw clean test` e `npm run lint && npm run build && npm test` verdes.
