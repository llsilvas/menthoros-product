# Tasks — add-coach-settings-page

**Tamanho:** XS · **Trilha:** Fast

Branch: `feature/add-coach-settings-page`. Só iniciar após `add-coach-lgpd-consent` estar mergeada
em `develop` — os campos `lgpdConsentGranted`/`lgpdConsentedAt` e a `V73` vêm de lá.

---

## 1. Backend — expor os campos do perfil

- [ ] **1.1 `UsuarioMeOutputDto` — adicionar `lgpdConsentedAt`**
  - Campo `Instant lgpdConsentedAt` com `@Schema(description = ...)`; nullable (o DTO já tem
    `@JsonInclude(NON_NULL)`, então some do JSON quando ausente).
  - Conferir se `avatarUrl` já está exposto no DTO; se não, adicionar junto (`Usuario.avatarUrl`).
  - Atualizar o mapeamento em `UsuarioServiceImpl.getCurrentUser()`.
  - **Teste:** `UsuarioServiceImplTest` — `getCurrentUser()` propaga `lgpdConsentedAt` e
    `avatarUrl`; com `lgpdConsentedAt` nulo o campo vem nulo sem quebrar (CA4).
  - **Validação:** `./mvnw clean test`

## 2. Frontend

- [ ] **2.1 Regenerar o cliente OpenAPI**
  - Trazer `lgpdConsentedAt` (e `avatarUrl`, se adicionado) para o tipo de `/users/me`.
  - Não editar tipos gerados à mão.
  - **Validação:** `npm run lint && npm run build`

- [ ] **2.2 `CoachSettingsPage`**
  - `src/features/coach/pages/CoachSettingsPage.tsx`, consumindo o hook de usuário atual já
    existente (`useCurrentUser`).
  - **Seção "Dados pessoais":** avatar, nome e e-mail — somente leitura (CA2).
  - **Seção "Privacidade":**
    - link para `/privacidade`;
    - data do aceite formatada em pt-BR a partir de `lgpdConsentedAt`, com fallback explícito
      quando nulo (CA3, CA4);
    - contato do DPO (`mailto:`);
    - ação "Solicitar exclusão de conta" (`mailto:` com assunto pré-preenchido) (CA5).
  - Layout responsivo — seções empilham em viewport pequeno, sem overflow horizontal (CA6).
  - Estados de `loading` e de erro no carregamento de `me`.
  - **Teste:** `CoachSettingsPage.test.tsx` — renderiza as duas seções com os dados do usuário
    (CA2); exibe a data formatada quando há aceite (CA3); renderiza sem erro com
    `lgpdConsentedAt` nulo (CA4); os `href` de política, DPO e exclusão estão corretos (CA5).
  - **Validação:** `npm run lint && npm run build && npm test`

- [ ] **2.3 Rota e navegação**
  - `App.tsx`: adicionar `{ path: 'settings', element: <CoachSettingsPage /> }` dentro dos
    children de `coach` (rota final `/coach/settings`), seguindo o padrão de `lazy` das demais
    páginas do shell do coach.
  - `CoachSidebar.tsx`: item "Configurações" (ícone `Settings`) ao final, apontando para
    `/coach/settings`.
  - **Teste:** `CoachSidebar.test.tsx` — o item aparece e navega para `/coach/settings` (CA1).
  - **Validação:** `npm run lint && npm run build && npm test`

## 3. Verificação (P0)

- [ ] **3.1** Sidebar → "Configurações" abre `/coach/settings` (CA1).
- [ ] **3.2** Nome, e-mail e avatar corretos e não editáveis (CA2).
- [ ] **3.3** Data do aceite exibida corretamente; coach sem aceite não quebra a tela (CA3, CA4).
- [ ] **3.4** Links de política, DPO e exclusão funcionam (CA5).
- [ ] **3.5** Página responsiva em telas pequenas e grandes (CA6).
- [ ] **3.6** `./mvnw clean test` e `npm run lint && npm run build && npm test` verdes.
