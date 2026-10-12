# Tasks — expand-waitlist-access-contract

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para os ITs).

## 1. Modelo

- [x] 1.1 `PerfilWaitlist` ganha `PROPRIETARIO` (design, proposal "Decisão registrada" — não `OWNER`).
- [x] 1.2 Novo enum `WatchBrand`: `GARMIN`, `COROS`, `POLAR`, `APPLE`, `OTHER`, `UNKNOWN`.
- [x] 1.3 Migration `V101__expand_waitlist_access_contract.sql` (design D1): `watch_brand`,
      `landing_path`, `referrer`, `policy_version` — todas nullable, sem backfill.
- [x] 1.4 `Waitlist`: campos `watchBrand`, `landingPath`, `referrer`, `policyVersion`; método
      `isTreinadorOuProprietario()` (design D2).
- [x] 1.5 `WaitlistInputDto`: campos `watchBrand`, `landingPath`, `referrer` (todos opcionais, sem
      `@NotNull`). **Sem** campo `policyVersion` de propósito (design, proposta item 5 — vem do
      servidor).

## 2. Correção de alcance (os 5 pontos que hoje checam só TREINADOR)

- [x] 2.1 `WaitlistServiceImpl.registrar`: `qtdAtletas`/`watchBrand` condicionais viram
      `isTreinadorOuProprietario()`.
- [x] 2.2 `WaitlistNotificationListener`: notificação ao founder e escolha de template de
      confirmação viram `isTreinadorOuProprietario()`.
- [x] 2.3 `WaitlistFunnelServiceImpl`: `qualified` vira `Waitlist::isTreinadorOuProprietario`.
- [x] 2.4 `FoundingInviteServiceImpl.validar`: aceita `TREINADOR` **ou** `PROPRIETARIO` (mensagem de
      erro ajustada).
- [x] 2.5 `WaitlistRepository.findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist)` virou
      `findAllByPerfilInAndDocsNotifiedAtIsNull(List<PerfilWaitlist>)`;
      `WaitlistDocsNotificationServiceImpl` chama com `List.of(TREINADOR, PROPRIETARIO)`.
- [x] 2.6 Testes dos 5 pontos cobrindo `PROPRIETARIO` com o mesmo comportamento de `TREINADOR`
      (critério de aceite 1) — um teste novo em cada: `WaitlistServiceImplTest`
      (`proprietarioTratadoComoTreinador`), `WaitlistNotificationListenerTest`
      (`proprietarioTratadoComoTreinador`), `WaitlistFunnelServiceImplTest`
      (`proprietarioContaComoQualified`), `FoundingInviteServiceImplTest`
      (`perfilProprietario`), `WaitlistRepositoryTest` (`aceitaMultiplosPerfis`).

## 3. Upsert, policyVersion e segment

- [x] 3.1 `WaitlistServiceImpl`: injeta `LgpdProperties`; `registrar` trocou
      `existsByEmailNormalized` por `findByEmailNormalized` (repositório ganhou o método) e, se
      presente, atualiza a linha em vez de só retornar `JA_INSCRITO` (design D4) — UTM preservado,
      resto sobrescrito, `policyVersion` sempre recarimbado de `lgpdProperties.getPolicyVersion()`.
      No caminho de criação, `policyVersion` também é carimbado (não só no upsert).
      - verify: critérios 4 e 5 — cobertos em `WaitlistServiceImplTest` (unit) e
        `WaitlistControllerIT.policyVersionVemDoServidor`/`reenvioAtualizaEPreservaUtm` (IT real).
- [x] 3.2 `WaitlistSegment` (enum) + função de derivação pura (design D3) — `ATLETA`/`QUALIFIED`/
      `OTHER_BRAND` a partir de `perfil`+`watchBrand` do DTO de entrada, sem reler o banco.
- [x] 3.3 `WaitlistOutputDto` ganhou `segment`; `WaitlistController.inscrever` computa e inclui nos
      dois ramos de resposta (`CRIADO`/`IGNORADO` → 201, `JA_INSCRITO` → 200).
      - verify: critério 3 — `WaitlistControllerIT.segmentNosTresCasos`/`perfilProprietarioEAceito`.

## 4. Validação final

- [x] 4.1 `./mvnw clean verify` completo — 0 falhas (fase de integração: 218 testes; suíte completa
      incluindo unitários, sem regressões nos módulos tocados).
- [x] 4.2 Checklists atualizados: BE-01 marcado como entregue em
      `instagram-conversao-specs-backend.md` (BE-02/BE-05 anotados como desbloqueados, não mais
      bloqueados no contrato); nota em FE-02/FE-05 em `instagram-conversao-specs-frontend.md`
      apontando que o contrato de backend já existe, falta só consumir.
