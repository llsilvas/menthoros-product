# Tasks — add-waitlist-status-lifecycle

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final).

## 1. Modelo

- [ ] 1.1 Migration `V102__add_status_lifecycle_to_tb_waitlist.sql` (design D1): `invited_at`,
      `activated_at`, `discarded_at` (timestamptz, nullable), `assessoria_id` (uuid, nullable, sem
      FK) — todas nullable, sem backfill.
- [ ] 1.2 `Waitlist`: campos `invitedAt`, `activatedAt`, `discardedAt`, `assessoriaId`.
- [ ] 1.3 Novo enum `WaitlistStatus` (`NEW`/`INVITED`/`ACTIVE`/`DISCARDED`) + `Waitlist.getStatus()`
      derivando dos timestamps (design D2, precedência `discardedAt > activatedAt > invitedAt`).
      Teste unitário puro cobrindo os 4 casos + a precedência do descarte.

## 2. `NEW → INVITED`

- [ ] 2.1 `FoundingInviteServiceImpl.invite()`: carimba `inscrito.invitedAt` depois do e-mail sair
      com sucesso, no mesmo bloco onde `convite.sentAt` já é carimbado (design D3).
      - verify: critério 1.
- [ ] 2.2 Teste cobrindo que falha no `emailSender.send(...)` não avança `invitedAt` (critério 2).

## 3. `INVITED → ACTIVE`, com compensação

- [ ] 3.1 `CoachSignupServiceImpl` ganha `WaitlistRepository` no construtor.
- [ ] 3.2 `consumirConvite(invite, assessoriaId)`: carimba `activatedAt`/`assessoriaId` no
      `Waitlist` correspondente a `invite.getWaitlistId()` (design D4, `ifPresent`, não
      `orElseThrow`).
      - verify: critério 3.
- [ ] 3.3 `reabrirConvite(invite)`: reverte `activatedAt`/`assessoriaId` para `null` simetricamente.
      - verify: critério 4.
- [ ] 3.4 Teste de integração/unit cobrindo o caminho de compensação completo (consumir → falha
      posterior → reabrir → `Waitlist` volta a `INVITED`).

## 4. Validação final

- [ ] 4.1 `./mvnw clean verify` completo — registrar total de testes e falhas aqui.
- [ ] 4.2 Atualizar checklist BE-02 em `instagram-conversao-specs-backend.md` — marcar como
      entregue (com a exclusão LGPD explicitamente deixada como pendência própria, não desta
      change) antes de arquivar.
