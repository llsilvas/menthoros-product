# Tasks — add-coach-lgpd-consent

## Backend (3 tasks)

- [ ] 1.1 **Migração Flyway:** criar `V??__add_consentimento_usuario.sql` com `ALTER TABLE tb_usuario ADD COLUMN aceite_lgpd BOOLEAN NOT NULL DEFAULT false` + `ADD COLUMN aceite_lgpd_em TIMESTAMPTZ`. Renumerar `??` conforme última migração existente.
- [ ] 1.2 **Entidade `Usuario.java`:** adicionar campos `aceiteLgpd` (boolean, default false) e `aceiteLgpdEm` (Instant, nullable). Mapear colunas via `@Column`.
- [ ] 1.3 **Endpoint `POST /api/v1/me/consentimento`:**
  - Criar `ConsentimentoInputDto` record com `aceiteTermos` e `aceitePrivacidade` (boolean, `@NotNull`).
  - Adicionar método `registrarConsentimento()` no `UsuarioService` — seta `aceiteLgpd = true`, `aceiteLgpdEm = Instant.now()`.
  - Adicionar endpoint no `UsuarioController` — `@PostMapping("/me/consentimento")`, retorna 200 ou 409 se já aceitou.
  - **Teste:** `UsuarioControllerTest` — POST com aceite, verifica 200; POST duplicado, verifica 409.

## Frontend (5 tasks)

- [ ] 2.1 **DTO `UsuarioMeOutputDto`:** adicionar campo `aceiteLgpd: boolean` no tipo retornado pelo `GET /api/v1/me`.
- [ ] 2.2 **`CoachConsentDialog`:**
  - Criar `src/features/coach/components/CoachConsentDialog.tsx` — modal MUI `Dialog` full-screen bloqueante, sem botão de fechar.
  - 2 checkboxes: "Aceito os Termos de Uso" (link `#` placeholder), "Consinto com o tratamento dos meus dados conforme a Política de Privacidade" (link `/privacidade`).
  - Botão "Aceitar e continuar" desabilitado até ambos checkboxes marcados.
  - Chama `POST /api/v1/me/consentimento` via `UsuarioService`.
  - Estados: loading (spinner no botão), error (Alert com mensagem).
  - **Teste:** `CoachConsentDialog.test.tsx` — renderiza modal, checkboxes desabilitam botão, submit chama API.
- [ ] 2.3 **`CoachSettingsPage`:**
  - Criar `src/features/coach/pages/CoachSettingsPage.tsx`.
  - Seção "Dados pessoais": nome (TextField disabled), email (TextField disabled), avatar (Avatar atual).
  - Seção "Privacidade": link para `/privacidade`, data do aceite (`aceiteLgpdEm` formatado), contato DPO (`mailto:contato@menthoros.com`), botão "Solicitar exclusão de conta" (`mailto:contato@menthoros.com?subject=Exclusão de conta`).
  - **Teste:** `CoachSettingsPage.test.tsx` — renderiza seções, links funcionam.
- [ ] 2.4 **`CoachLayout` — interceptar consentimento:**
  - No `CoachLayout.tsx`, após carregar `me`, verificar `!me.aceiteLgpd`.
  - Se `false`, renderizar `CoachConsentDialog` em overlay (não renderizar sidebar/conteúdo normal).
  - Após aceite, revalidar `me` (refetch) e liberar navegação.
  - **Teste:** `CoachLayout.test.tsx` — mostra modal quando `aceiteLgpd=false`, esconde após aceite.
- [ ] 2.5 **`CoachSidebar` — adicionar link "Configurações":**
  - Adicionar item "Configurações" (ícone `Settings`) no final da sidebar, link para `/coach/settings`.
  - **Rota no `App.tsx`:** adicionar `{ path: 'settings', element: <CoachSettingsPage /> }` dentro do children do coach.

## Verificação (P0)

- [ ] 3.1 **Migração aplica sem erro** em banco com dados existentes (`./mvnw flyway:migrate`).
- [ ] 3.2 **Coach existente aceita consentimento** — login → modal → aceitar → dashboard liberado.
- [ ] 3.3 **Coach novo aceita consentimento** — mesmo fluxo, sem regressão.
- [ ] 3.4 **Página de perfil acessível** via sidebar → `/coach/settings`.
- [ ] 3.5 **Links de privacidade funcionam** — modal e settings apontam para `/privacidade` e `mailto:contato@menthoros.com`.
- [ ] 3.6 **Segurança:** `POST /me/consentimento` é tenant-scoped (JWT); coach A não pode aceitar pelo coach B.

## Sizing: S (~8 tasks)
