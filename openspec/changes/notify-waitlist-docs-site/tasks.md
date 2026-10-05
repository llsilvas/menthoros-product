# Tasks — notify-waitlist-docs-site

Validação por bloco: `./mvnw clean test` em `apps/menthoros-backend`. Branch
`feat/notify-waitlist-docs-site` (ou `chore/`, se preferir) antes de qualquer código — ver
"Branches" no `CLAUDE.md` do workspace.

## 1. Schema

- [x] 1.1 Migration `V99__Add_docs_notified_at_to_tb_waitlist.sql` — `V99` confirmado livre na
      implementação. `ALTER TABLE tb_waitlist ADD COLUMN IF NOT EXISTS docs_notified_at
      TIMESTAMPTZ;`.
      *verify:* `./mvnw clean test` — suíte completa (4448 testes) verde, incluindo o boot do
      contexto Spring/Flyway.
- [x] 1.2 Campo `docsNotifiedAt` em `Waitlist` (`Instant`, nullable).
      *verify:* compila; `WaitlistServiceImplTest`/`WaitlistControllerIT` existentes continuam
      verdes.

## 2. Repository e service

- [x] 2.1 `WaitlistRepository.findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist perfil)` +
      `reivindicarAvisoDocs(id, agora)` / `liberarAvisoDocs(id)` (`@Modifying @Transactional
      @Query`, design D2/D3 — mesmo padrão de `AthleteInviteRepository#claim`/`liberarClaim`,
      achado durante a implementação). `liberarAvisoDocs` simplificado para incondicional por id
      (sem comparar `Instant` de volta — ver nota no design D3: evita risco de truncamento de
      precisão `Instant` vs. `TIMESTAMPTZ` do Postgres, desnecessário já que não há "reivindicação
      alheia" possível entre o claim e a falha).
      *verify:* `WaitlistRepositoryTest` (IT, Testcontainers) — `findAll` só retorna TREINADOR sem
      `docsNotifiedAt`; `reivindicarAvisoDocs` retorna 1 na primeira chamada e 0 na segunda para o
      mesmo id (CA8); `liberarAvisoDocs` reabre elegibilidade. Asserções por `contains`/
      `doesNotContain` do próprio registro, não por lista exata — a tabela é compartilhada com
      outras classes de teste no Postgres da suíte (`WaitlistControllerIT` etc. deixam linhas).
- [x] 2.2 `WaitlistDocsNotificationService` (interface) + `WaitlistDocsNotificationServiceImpl`
      (design D3, pós pre-mortem: claim-antes-de-enviar, libera em caso de falha) +
      `WaitlistDocsNotificationResultDto` (record `elegiveis, enviados, falhas`). Property
      `app.docs.url` (design D6) em `application.yml` = `${DOCS_URL:https://docs.menthoros.com}`,
      mesmo padrão de `app.frontend.url`.
      *verify:* `WaitlistDocsNotificationServiceImplTest` — CA1, CA2, CA3, CA4, CA5, CA8 — 6
      testes, `EmailSender`/`WaitlistRepository` mockados.

## 3. Template de e-mail

- [x] 3.1 `templates/email/waitlist-docs-site.html` e `.txt` (design D5), placeholders `nome`,
      `docsUrl`, `assetsUrl`. Texto ajustado durante a implementação (feedback do usuário): os
      treinadores já receberam o convite da turma fundadora — este e-mail é só o aviso da central
      de ajuda, sem framing de "aguardando vaga"; inclui linha de contato
      (`contato@menthoros.com`) para dúvidas.
      *verify:* coberto indiretamente pelo teste do service (CA1 — `EmailTemplateRenderer` real,
      sem mock, lançaria `IllegalArgumentException` se faltasse placeholder).

## 4. Endpoint admin

- [x] 4.1 `WaitlistDocsNotificationAdminController` — `POST /api/admin/waitlist/notificar-docs`,
      `@PreAuthorize("hasRole('ADMIN')")` (design D4).
      *verify:* `WaitlistDocsNotificationAdminControllerTest` — CA6 (`TECNICO`/`PROPRIETARIO` →
      403, `ADMIN` → 200 com as três contagens, sem JWT → 401).

## 5. Integração e encerramento

- [ ] 5.1 Confirmar `SmtpEmailSender` ativo no ambiente onde o endpoint será chamado
      (`app.docs.url` publicamente resolvendo para `https://docs.menthoros.com`, já publicado
      via PR #1 de `menthoros-docs`).
      *verify:* suíte completa verde; `/qa`.
- [ ] 5.2 Disparo manual único (via Apidog): chamar `POST /api/admin/waitlist/notificar-docs` em
      produção, conferir contagem na resposta e `docs_notified_at` gravado nos inscritos
      TREINADOR.
- [ ] 5.3 Nota de fechamento (não bloqueia `/done`): registrar no Kanban/backlog a change de
      hardening sugerida em design D7 (`ADMIN` inativo ainda passa em `/api/admin/**` —
      `JwtTenantFilter` isenta o prefixo inteiro antes de checar `Usuario.ativo`). Gap herdado de
      `FoundingInviteAdminController`, não introduzido aqui; fica como débito rastreado, não como
      task desta change.
