# Tasks — expand-waitlist-access-contract

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para os ITs).

## 1. Modelo

- [ ] 1.1 `PerfilWaitlist` ganha `PROPRIETARIO` (design, proposal "Decisão registrada" — não `OWNER`).
- [ ] 1.2 Novo enum `WatchBrand`: `GARMIN`, `COROS`, `POLAR`, `APPLE`, `OTHER`, `UNKNOWN`.
- [ ] 1.3 Migration `V101__expand_waitlist_access_contract.sql` (design D1): `watch_brand`,
      `landing_path`, `referrer`, `policy_version` — todas nullable, sem backfill.
- [ ] 1.4 `Waitlist`: campos `watchBrand`, `landingPath`, `referrer`, `policyVersion`; método
      `isTreinadorOuProprietario()` (design D2).
- [ ] 1.5 `WaitlistInputDto`: campos `watchBrand`, `landingPath`, `referrer` (todos opcionais, sem
      `@NotNull`). **Sem** campo `policyVersion` de propósito (design, proposta item 5 — vem do
      servidor).

## 2. Correção de alcance (os 5 pontos que hoje checam só TREINADOR)

- [ ] 2.1 `WaitlistServiceImpl.registrar`: `qtdAtletas` condicional vira
      `isTreinadorOuProprietario()`.
- [ ] 2.2 `WaitlistNotificationListener`: notificação ao founder e escolha de template de
      confirmação viram `isTreinadorOuProprietario()`.
- [ ] 2.3 `WaitlistFunnelServiceImpl`: `qualified` vira `isTreinadorOuProprietario()`.
- [ ] 2.4 `FoundingInviteServiceImpl.validar`: aceita `TREINADOR` **ou** `PROPRIETARIO` (mensagem de
      erro ajustada).
- [ ] 2.5 `WaitlistRepository.findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist)` vira
      `findAllByPerfilInAndDocsNotifiedAtIsNull(List<PerfilWaitlist>)`;
      `WaitlistDocsNotificationServiceImpl` chama com `List.of(TREINADOR, PROPRIETARIO)`.
- [ ] 2.6 Testes dos 5 pontos cobrindo `PROPRIETARIO` com o mesmo comportamento de `TREINADOR`
      (critério de aceite 1) — reaproveitar os testes existentes de `TREINADOR` como molde.

## 3. Upsert, policyVersion e segment

- [ ] 3.1 `WaitlistServiceImpl`: injeta `LgpdProperties`; `registrar` troca
      `existsByEmailNormalized` por `findByEmailNormalized` (repositório ganha o método) e, se
      presente, atualiza a linha em vez de só retornar `JA_INSCRITO` (design D4) — UTM preservado,
      resto sobrescrito, `policyVersion` sempre recarimbado de `lgpdProperties.getPolicyVersion()`.
      No caminho de criação, `policyVersion` também é carimbado (não só no upsert).
      - verify: critérios 4 e 5.
- [ ] 3.2 `WaitlistSegment` (enum) + função de derivação pura (design D3) — `ATLETA`/`QUALIFIED`/
      `OTHER_BRAND` a partir de `perfil`+`watchBrand` do DTO de entrada, sem reler o banco.
- [ ] 3.3 `WaitlistOutputDto` ganha `segment`; `WaitlistController.inscrever` computa e inclui nos
      dois ramos de resposta (`CRIADO`/`IGNORADO` → 201, `JA_INSCRITO` → 200).
      - verify: critério 3.

## 4. Validação final

- [ ] 4.1 `./mvnw clean verify` completo — registrar total de testes e falhas aqui.
- [ ] 4.2 Atualizar `instagram-conversao-specs-backend.md` (checklist BE-01) e
      `instagram-conversao-specs-frontend.md` (nota em FE-02) refletindo o novo contrato
      disponível, antes de arquivar.
