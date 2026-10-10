# Tasks — add-waitlist-status-lifecycle

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final).

## 1. Modelo

- [x] 1.1 Migration `V102__add_status_lifecycle_to_tb_waitlist.sql` (design D1): `invited_at`,
      `activated_at`, `discarded_at` (timestamptz, nullable), `assessoria_id` (uuid, nullable, sem
      FK) — todas nullable, sem backfill.
- [x] 1.2 `Waitlist`: campos `invitedAt`, `activatedAt`, `discardedAt`, `assessoriaId`.
- [x] 1.3 Novo enum `WaitlistStatus` (`NEW`/`INVITED`/`ACTIVE`/`DISCARDED`) + `Waitlist.getStatus()`
      derivando dos timestamps (design D2, precedência `discardedAt > activatedAt > invitedAt`).
      Teste unitário puro cobrindo os 4 casos + a precedência do descarte (`WaitlistTest`).

## 2. `NEW → INVITED`

- [x] 2.1 `FoundingInviteServiceImpl.invite()`: carimba `inscrito.invitedAt` depois do e-mail sair
      com sucesso, no mesmo bloco onde `convite.sentAt` já é carimbado (design D3).
      - verify: critério 1.
- [x] 2.2 Teste cobrindo que falha no `emailSender.send(...)` não avança `invitedAt` (critério 2).

## 3. `INVITED → ACTIVE`, com compensação

- [x] 3.1 `CoachSignupServiceImpl` ganha `WaitlistRepository` no construtor.
- [x] 3.2 `consumirConvite(invite, assessoriaId, desfazer)`: carimba `activatedAt`/`assessoriaId`
      no `Waitlist` correspondente a `invite.getWaitlistId()` (design D4, `ifPresent`, não
      `orElseThrow`).
      - verify: critério 3.
- [x] 3.3 `reabrirConvite(invite)`: reverte `activatedAt`/`assessoriaId` para `null` simetricamente.
      - verify: critério 4.
- [x] 3.4 Teste de integração/unit cobrindo o caminho de compensação completo (consumir → falha
      posterior → reabrir → `Waitlist` volta a `INVITED`).

### 3.5 Achados do QA gate (code-reviewer) — aplicados

- **Important:** `desfazer.push(() -> reabrirConvite(invite))` estava sendo empilhado pelo
  chamador *depois* que `consumirConvite()` retornava. Se o save do `Waitlist` dentro de
  `consumirConvite` lançasse, a exceção propagava antes da linha empilhar a compensação — o
  `FoundingInvite` já comitado como convertido nunca entrava na pilha, ficando travado para
  sempre (sem reabrir, sem `RECONCILIATION_REQUIRED`). Corrigido: `consumirConvite` agora recebe
  o `Deque<Runnable> desfazer` e empilha a própria compensação imediatamente após o save do
  convite ter sucesso, antes de tocar o `Waitlist`. Teste novo:
  `falhaAoAtivarOLeadAindaReabreOConvite`.
- **Important:** o carimbo de `Waitlist.invitedAt` em `invite()` não tinha tratamento de falha —
  se lançasse, o chamador trataria `invite()` como falho e reemitiria, invalidando um convite já
  enviado com sucesso e mandando um segundo e-mail. Corrigido: try/catch só-log, nunca relança
  (é um carimbo secundário; a fonte de verdade do envio continua em `FoundingInvite.sentAt`).
  JavaDoc de classe e de `invite()` atualizados. Teste novo:
  `falhaAoCarimbarInvitedAtNaoPropaga`.
- **Minor:** JavaDoc de `cadastrar()` (Side Effects) passou a mencionar a escrita em
  `tb_waitlist` no modo convite.

## 4. Validação final

- [x] 4.1 `./mvnw clean verify` completo — 0 falhas, sem regressão nos módulos tocados.
- [x] 4.2 Checklist BE-02 atualizado em `instagram-conversao-specs-backend.md` — marcado como
      entregue (parcial), exclusão LGPD anotada como pendência própria.

---

**Mergeado em `develop` via PR #178 (`feat/add-waitlist-status-lifecycle`), 2026-10-10.**
