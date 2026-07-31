# Design — add-coach-lgpd-consent

## Arquitetura

### Backend: Usuario + consentimento

**Nova migração Flyway** (`V??__add_consentimento_usuario.sql`):

```sql
ALTER TABLE tb_usuario ADD COLUMN aceite_lgpd BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tb_usuario ADD COLUMN aceite_lgpd_em TIMESTAMPTZ;
```

**Endpoints:**

1. `POST /api/v1/me/consentimento` — Coach envia aceite dos termos
   - Input: `{ aceiteTermos: boolean, aceitePrivacidade: boolean }`
   - Atualiza `Usuario.aceiteLgpd = true`, `Usuario.aceiteLgpdEm = now()`
   - Retorna 200 OK ou 409 se já aceitou

2. `GET /api/v1/me` — Já existe (`UsuarioController`). Retorna `UsuarioMeOutputDto`.
   - Adicionar campo `aceiteLgpd: boolean` no DTO para o frontend decidir se mostra o modal

**Regra de negócio:**
- Coach só acessa a plataforma após aceitar (verificado no frontend via `me.aceiteLgpd`)
- Backend NÃO bloqueia — evita lock-out se o frontend tiver bug; o registro de consentimento existe mesmo se o modal falhar

### Frontend: Modal + Perfil

**CoachConsentDialog** (`src/features/coach/components/CoachConsentDialog.tsx`):
- Exibido no primeiro login quando `me.aceiteLgpd === false`
- 2 checkboxes:
  1. "Aceito os Termos de Uso" (link placeholder — documento ainda não existe)
  2. "Consinto com o tratamento dos meus dados pessoais (nome, e-mail, avatar, registro de acesso) conforme a Política de Privacidade" (link para `/privacidade`)
- Botão "Aceitar e continuar" — chama `POST /api/v1/me/consentimento`
- Não permite fechar/dismiss — bloqueia acesso até aceitar

**CoachSettingsPage** (`src/features/coach/pages/CoachSettingsPage.tsx`):
- Rota: `/coach/settings`
- Seções:
  1. **Dados pessoais** — nome, e-mail (read-only do Keycloak), avatar
  2. **Privacidade** — link para Política de Privacidade, data do aceite LGPD, contato DPO (`contato@menthoros.com`), botão "Solicitar exclusão de conta" (abre mailto)
- Item "Configurações" no CoachSidebar (ícone de engrenagem)

**App.tsx:**
- Nova rota: `/coach/settings` → `CoachSettingsPage`
- `CoachLayout` — intercepta `me.aceiteLgpd === false` e mostra `CoachConsentDialog` (modal bloqueante)

### Fluxo

```
Coach faz login (Keycloak)
        ↓
GET /api/v1/me → aceiteLgpd = false
        ↓
CoachLayout detecta → renderiza CoachConsentDialog (modal full-screen)
        ↓
Coach marca checkboxes → clica "Aceitar e continuar"
        ↓
POST /api/v1/me/consentimento → 200 OK
        ↓
CoachLayout revalida me.aceiteLgpd → true → libera navegação normal
```

## Impacto em entidades existentes

| Entidade | Mudança |
|---|---|
| `Usuario.java` | +2 campos: `aceiteLgpd` (boolean), `aceiteLgpdEm` (Instant) |
| `UsuarioMeOutputDto` | +1 campo: `aceiteLgpd` (boolean) |
| `UsuarioController` | +1 endpoint: `POST /me/consentimento` |

## Riscos

| Risco | Mitigação |
|---|---|
| Coach não consegue fechar modal (bug) | Backend não bloqueia; refresh da página re-carrega `me` e re-exibe modal |
| Dois coaches diferentes na mesma máquina | `me` endpoint é tenant-scoped via JWT — cada um vê seu próprio `aceiteLgpd` |
| Migração Flyway com `NOT NULL DEFAULT false` em tabela existente | Seguro — `DEFAULT false` preenche linhas existentes; coaches antigos terão que aceitar no próximo login |
