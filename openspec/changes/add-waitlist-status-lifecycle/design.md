# Design — add-waitlist-status-lifecycle

## D1 — Migration V102

```sql
ALTER TABLE tb_waitlist
    ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS assessoria_id UUID;
```

Nullable, sem FK (`assessoria_id` segue o mesmo padrão solto de `FoundingInvite.assessoriaId`),
sem backfill. Leads que já converteram antes desta change ficam com `activated_at IS NULL` —
`status` deles aparece como `NEW`/`INVITED` em vez de `ACTIVE`, mas o histórico real continua em
`FoundingInvite.convertedAt`/`assessoriaId`, que não se perde (ver proposal.md, Non-Goal de
backfill).

## D2 — `WaitlistStatus` enum derivado, não persistido

```java
// enums/WaitlistStatus.java
public enum WaitlistStatus { NEW, INVITED, ACTIVE, DISCARDED }

// entity/Waitlist.java
public WaitlistStatus getStatus() {
    if (discardedAt != null) return WaitlistStatus.DISCARDED;
    if (activatedAt != null) return WaitlistStatus.ACTIVE;
    if (invitedAt != null) return WaitlistStatus.INVITED;
    return WaitlistStatus.NEW;
}
```

`discardedAt` vence os outros dois de propósito: é terminal (mesmo se um lead descartado tivesse,
por algum motivo futuro, `invitedAt` preenchido de uma tentativa anterior, o descarte é a palavra
final). Essa precedência só importa no dia em que algo popular `discardedAt` — nesta change,
nenhuma rota o faz (ver proposal.md, Non-Goals); a coluna e o enum existem para não precisar de
outra migration quando esse dia chegar.

## D3 — `NEW → INVITED`: hook em `FoundingInviteServiceImpl.invite()`

```java
// depois do e-mail ter saído com sucesso, mesmo ponto onde sentAt já é carimbado
convite.setSentAt(OffsetDateTime.now(clock));
inviteRepository.save(convite);

inscrito.setInvitedAt(OffsetDateTime.now(clock));  // novo
waitlistRepository.save(inscrito);                 // novo
```

`inscrito` já está em mãos (carregado no início do método para `validar()`) — não precisa de novo
`findById`. Se `emailSender.send(...)` lançar antes deste ponto, o método já propagou a exceção
(ver JavaDoc de `invite()`: "se o SMTP recusar... a exceção sobe"), então este trecho nunca
executa e o lead continua `NEW` — exatamente o comportamento do critério de aceite 2. Reenvio
(`invite()` chamado de novo para o mesmo `waitlistId`) simplesmente re-carimba `invitedAt` com o
timestamp novo — idempotente na prática, sem necessidade de checagem condicional.

## D4 — `INVITED → ACTIVE`: hook em `CoachSignupServiceImpl.consumirConvite`/`reabrirConvite`

```java
private void consumirConvite(FoundingInvite invite, UUID assessoriaId) {
    invite.setConvertedAt(OffsetDateTime.now());
    invite.setAssessoriaId(assessoriaId);
    foundingInviteRepository.save(invite);

    waitlistRepository.findById(invite.getWaitlistId()).ifPresent(lead -> {
        lead.setActivatedAt(OffsetDateTime.now());
        lead.setAssessoriaId(assessoriaId);
        waitlistRepository.save(lead);
    });
    log.info("Convite de fundadora convertido: inviteId={}", invite.getId());
}

private void reabrirConvite(FoundingInvite invite) {
    invite.setConvertedAt(null);
    invite.setAssessoriaId(null);
    foundingInviteRepository.save(invite);

    waitlistRepository.findById(invite.getWaitlistId()).ifPresent(lead -> {
        lead.setActivatedAt(null);
        lead.setAssessoriaId(null);
        waitlistRepository.save(lead);
    });
    log.info("Convite de fundadora reaberto pela compensação: inviteId={}", invite.getId());
}
```

`ifPresent` (não `orElseThrow`) de propósito: o `Waitlist` correspondente **deveria** sempre
existir (é de onde o convite nasceu), mas se por algum motivo não existir mais, isso não pode
impedir o cadastro de completar ou a compensação de desfazer — a consequência de uma falha aqui é
só "o funil por lead fica incompleto para esse registro", não "o cadastro trava". `CoachSignupServiceImpl`
ganha `WaitlistRepository` como nova dependência do construtor.

## D5 — Por que não reaproveitar `FoundingInvite.convertedAt` como a fonte de `ACTIVE`

Alternativa considerada: em vez de duplicar o carimbo em `Waitlist.activatedAt`, derivar
`WaitlistStatus.ACTIVE` fazendo join com `FoundingInvite` por `waitlistId` toda vez. Rejeitada:
`WaitlistFunnelServiceImpl` já faz exatamente esse join, mas para agregados por UTM, lendo a
tabela inteira em memória (`findAll()` + `groupingBy`) — aceitável ali porque é uma tela de
funil/admin batch, não aceitável como custo de ler o status de **um** lead. Ter o carimbo na
própria linha (duplicação deliberada e barata — timestamp, não dado de negócio derivável de outra
forma dentro de `Waitlist`) é o mesmo trade-off que `FoundingInvite` já faz internamente com suas
próprias datas, só que agora refletido também no lead de origem.
