# Tasks — notify-waitlist-docs-site

Validação por bloco: `./mvnw clean test` em `apps/menthoros-backend`. Branch
`feat/notify-waitlist-docs-site` (ou `chore/`, se preferir) antes de qualquer código — ver
"Branches" no `CLAUDE.md` do workspace.

## 1. Schema

- [ ] 1.1 Migration `Vxx__add_docs_notified_at_to_tb_waitlist.sql` — confirmar o próximo número
      livre em `src/main/resources/db/migration/` no momento da implementação (era `V99` quando
      este proposal foi escrito; pode já estar ocupado). `ALTER TABLE tb_waitlist ADD COLUMN
      docs_notified_at TIMESTAMPTZ NULL;`.
      *verify:* IT de migração (contexto Spring sobe limpo); `./mvnw clean test`.
- [ ] 1.2 Campo `docsNotifiedAt` em `Waitlist` (`Instant`, nullable).
      *verify:* compila; teste de entidade existente continua verde.

## 2. Repository e service

- [ ] 2.1 `WaitlistRepository.findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist perfil)` +
      `reivindicar(id, agora)` / `liberar(id, agora)` (`@Modifying @Query`, design D2/D3).
      *verify:* teste de repositório — `findAll` retorna só TREINADOR sem `docsNotifiedAt`;
      `reivindicar` retorna 1 na primeira chamada e 0 numa segunda chamada para o mesmo id
      (CA8 — corrida).
- [ ] 2.2 `WaitlistDocsNotificationService` (interface) + `WaitlistDocsNotificationServiceImpl`
      (design D3, pós pre-mortem: claim-antes-de-enviar, libera em caso de falha) +
      `WaitlistDocsNotificationResultDto` (record `elegiveis, enviados, falhas`). Property
      `app.docs.url` (design D6) em `application.yml`/`application-cloud.yml` =
      `https://docs.menthoros.com`.
      *verify:* CA1, CA2, CA3, CA4, CA5, CA7 — `EmailSender` mockado (sucesso, falha parcial,
      lista vazia, perfil ATLETA excluído, chamada repetida não reenvia); CA8 — duas chamadas ao
      serviço processando o mesmo inscrito, só uma invoca `EmailSender.send`.

## 3. Template de e-mail

- [ ] 3.1 `templates/email/waitlist-docs-site.html` e `.txt` (design D5), placeholders `nome`,
      `docsUrl`, `assetsUrl`.
      *verify:* teste de renderização — todos os placeholders preenchidos, sem
      `IllegalArgumentException`.

## 4. Endpoint admin

- [ ] 4.1 `WaitlistDocsNotificationAdminController` — `POST /api/admin/waitlist/notificar-docs`,
      `@PreAuthorize("hasRole('ADMIN')")` (design D4).
      *verify:* CA6 — IT sem role ADMIN retorna 403; IT com ADMIN retorna 200 e o corpo com as
      três contagens.

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
