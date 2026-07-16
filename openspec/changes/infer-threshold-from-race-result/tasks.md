# Tasks — infer-threshold-from-race-result

## Bloco 1 — Query de prova válida mais recente

- [ ] 1.1 `ProvaRepository`: novo método via `@Query` explícito (NÃO derived-name — `Prova` não
      tem propriedade `tenantId`, só `assessoria`; mesmo padrão de `findByIdAndTenantId`):
      ```
      @Query("""
          SELECT p FROM Prova p
          WHERE p.atleta.id = :atletaId AND p.assessoria.id = :tenantId
            AND p.foiRealizada = true AND p.tempoRealizado IS NOT NULL
            AND p.distanciaKm BETWEEN :distanciaMinKm AND :distanciaMaxKm
            AND p.dataProva >= :dataMinima
          ORDER BY p.dataProva DESC
          """)
      List<Prova> findProvasValidasRecentes(atletaId, tenantId, distanciaMinKm, distanciaMaxKm, dataMinima);
      ```
      (retorna lista ordenada; o caller pega o primeiro elemento — evita depender de
      `Pageable`/`Top1` do Spring Data para um `@Query` explícito.) Constantes de chamada:
      `distanciaMinKm=5`, `distanciaMaxKm=21.1` (cobre a distância oficial de meia-maratona,
      21,097km — achado do pre-mortem: `21` sem tolerância excluiria toda meia real).
      TDD: teste de repositório (`@DataJpaTest` + Testcontainers, padrão do módulo) cobrindo:
      prova válida retornada; prova de 21,097km (meia oficial) incluída (não excluída pelo corte);
      prova fora da faixa de distância excluída; prova fora da janela de dias excluída; prova sem
      `foiRealizada` excluída; cross-tenant (prova de outro tenant nunca retornada); múltiplas
      provas válidas → lista ordenada por data desc (mais recente primeiro).
      Verify: `./mvnw clean test` — teste novo passa, suíte completa verde.

## Bloco 2 — Fórmula prova→limiar (D2)

- [ ] 2.1 Novo método em `ThresholdInferenceService`: `inferirPaceLimiarDeProva(Prova
      provaValida)` — **NÃO chama `RiegelCalculator.calculate()`** (exige `RegressionResult` do
      pipeline de projeção, não é função pura reaproveitável aqui — achado do pre-mortem, ver
      design.md D2). Implementa a fórmula de Riegel isolada, com constante própria
      `EXPONENTE_RIEGEL = 1.06` (mesmo valor de `RiegelCalculator.DEFAULT_EXPONENT`, duplicado
      deliberadamente — comentário citando D2 do design.md e o motivo de não reusar): normaliza
      `provaValida` para pace-equivalente de 10K (`t_10k = t_prova * (10000 /
      distancia_prova_m) ^ 1.06`), depois soma `OFFSET_LIMIAR_SEC_KM = 8`.
      TDD: teste unitário cobrindo: prova de exatamente 10K (sem normalização, offset direto);
      prova de 5K (normalização + offset); prova de 21,1K (normalização + offset); resultado
      determinístico e sem dependência de mocks (função pura).
      Verify: `./mvnw clean test`.

## Bloco 3 — Integração com `atualizarLimiareInferidos` (D3, precedência)

- [ ] 3.1 `TsbServiceImpl.atualizarLimiareInferidos`: antes de chamar `inferirPaceLimiar`
      (quintil), consulta `ProvaRepository.findProvasValidasRecentes(...)` (pega o primeiro da
      lista, já ordenada por `dataProva DESC`); se presente, usa `inferirPaceLimiarDeProva` para
      `paceLimiarEstimado` e **pula** o quintil só para pace (mantém `inferirFcLimiar` por quintil
      normalmente, D1 — `fcLimiar` não muda nesta change). Se ausente, comportamento atual
      inalterado para os dois.
      TDD: teste cobrindo os critérios de aceite 1-5 do proposal.md — prova válida recente tem
      precedência sobre quintil; sem prova válida, fallback idêntico ao atual para pace E FC (sem
      regressão); prova fora da janela de 90 dias é ignorada; prova fora da faixa 5K-21.1K é
      ignorada; prova de meia-maratona oficial (21,097km) é considerada válida.
      Verify: `./mvnw clean test` — suíte completa verde, incluindo os testes pré-existentes de
      `TsbServiceImplTest`/`atualizarLimiareInferidos` (não podem regredir).
- [ ] 3.2 Log de sinalização de outlier (D5 do design.md — métrica revisada, substitui o log
      comparativo simples da v1): ao computar `paceLimiarEstimado` a partir de uma prova, calcula
      `Δ = novo - antigo` (valor anterior de `PlanoMetaDados.paceLimiarEstimado`, se existia); se
      `|Δ| > 20s/km`, log WARN com `atletaId`, `paceAntigo`, `paceNovo`, `delta`, `provaId` (para
      revisão manual do founder/coach); log INFO normal para deltas menores.
      Verify: teste cobrindo os dois ramos (delta grande → WARN; delta pequeno → INFO) +
      `./mvnw clean test`.

## Bloco 4 — Visibilidade da fonte para o coach (D4)

- [ ] 4.1 `AtletaPerfilCoachOutputDto`: novo campo `fonteLimiarEstimado` (enum
      `PROVA_REGISTRADA` | `MEDIA_TREINOS`) — `@Schema` com descrição, `@JsonInclude(NON_NULL)`
      (padrão já usado no restante do DTO). Mapper correspondente preenche com base em qual
      caminho gerou o `paceLimiarEstimado` atual (Bloco 3).
      TDD: teste do mapper/service cobrindo os dois valores do enum.
      Verify: `./mvnw clean test`.

## Bloco 5 — Validação final

- [ ] 5.1 `./mvnw clean test` — suíte completa.
- [ ] 5.2 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer, trilha Full).
- [ ] 5.3 `/pr infer-threshold-from-race-result` → merge via CI → `/done`.
