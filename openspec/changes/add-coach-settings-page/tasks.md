# Tasks — add-coach-settings-page

**Tamanho:** XS · **Trilha:** Fast

Branch: `feature/add-coach-settings-page`. Só iniciar após `add-coach-lgpd-consent` estar mergeada
em `develop` — a tabela `tb_usuario_lgpd_consent`, a entidade, o repository e a `V73` vêm de lá.

---

## 1. Backend — expor os campos do perfil

- [ ] **1.1 `UsuarioMeOutputDto` — expor o último consentimento**
  - Campos `Instant lgpdConsentedAt`, `String lgpdAcceptedPolicyVersion` e
    `String lgpdAcceptedTermsVersion`, todos nullable com `@Schema` (o DTO já tem
    `@JsonInclude(NON_NULL)`, então somem do JSON quando não há aceite).
  - Origem: `UsuarioLgpdConsentRepository.findTopByUsuarioIdOrderByConsentedAtDesc` — o **último**
    aceite. Não confundir com as versões **vigentes** (`lgpdCurrentPolicyVersion`), que já vêm da
    config em `add-coach-lgpd-consent`: exibir a aceita é o ponto, e ela pode ser mais antiga.
  - Conferir se `avatarUrl` já está exposto no DTO; se não, adicionar junto (`Usuario.avatarUrl`).
  - Atualizar o mapeamento em `UsuarioServiceImpl.getCurrentUser()`.
  - **Teste:** `UsuarioServiceImplTest` — propaga data e versões do último aceite quando existe;
    com **duas** linhas, retorna a mais recente; sem nenhuma, os três campos vêm nulos sem quebrar
    (CA4); `avatarUrl` propagado.
  - **Validação:** `./mvnw clean test`

## 2. Frontend

- [ ] **2.1 Regenerar o cliente OpenAPI**
  - Trazer `lgpdConsentedAt`, `lgpdAcceptedPolicyVersion`, `lgpdAcceptedTermsVersion` (e
    `avatarUrl`, se adicionado) para o tipo de `/users/me`.
  - Não editar tipos gerados à mão.
  - **Validação:** `npm run lint && npm run build`

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
- [ ] **3.3** Data e versão do último aceite exibidas corretamente; coach sem aceite não quebra a
  tela (CA3, CA4).
- [ ] **3.4** Links de política, DPO e exclusão funcionam (CA5).
- [ ] **3.5** Página responsiva em telas pequenas e grandes (CA6).
- [ ] **3.6** `./mvnw clean test` e `npm run lint && npm run build && npm test` verdes.
