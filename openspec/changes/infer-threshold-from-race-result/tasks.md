# Tasks — infer-threshold-from-race-result

## Bloco 0 — Migration: coluna de proveniência (D6)

- [x] 0.1 Migration `V56__add_fonte_limiar_pace_plano_metadados.sql` (confira `ls
      src/main/resources/db/migration/ | sort -V | tail -3` antes de criar — V56 é o próximo
      número livre no momento do DoR desta change, 2026-07-16): `ALTER TABLE tb_plano_metadados
      ADD COLUMN fonte_limiar_pace VARCHAR(20)` (nullable, sem backfill — `null` = nunca calculado
      por esta lógica, comportamento pré-existente à change). Sem down-migration (aditiva pura).
      Novo enum `FonteLimiarInferencia` (`PROVA_REGISTRADA`, `MEDIA_TREINOS`) em `enums/`.
      `PlanoMetaDados.fonteLimiarPace` novo campo (`@Enumerated(EnumType.STRING)`, `@Column(name =
      "fonte_limiar_pace", length = 20)` — mesmo padrão de `confiancaInferenciaPace`,
      `PlanoMetaDados.java:151-153`).
      Verify: `./mvnw clean test` — migration aplica limpo no Testcontainers, suíte verde.

## Bloco 1 — Query de provas realizadas recentes (D2b — sem filtro de distância em SQL)

- [x] 1.1 `ProvaRepository`: novo método via `@Query` explícito (NÃO derived-name — `Prova` não
      tem propriedade `tenantId`, só `assessoria`; mesmo padrão de `findByIdAndTenantId`):
      ```
      @Query("""
          SELECT p FROM Prova p
          WHERE p.atleta.id = :atletaId AND p.assessoria.id = :tenantId
            AND p.foiRealizada = true AND p.tempoRealizado IS NOT NULL
            AND p.dataProva >= :dataMinima
          ORDER BY p.dataProva DESC
          """)
      List<Prova> findProvasRealizadasRecentes(atletaId, tenantId, dataMinima);
      ```
      **Sem filtro de distância em SQL** (2º achado do pre-mortem, D2b do design.md):
      `Prova.distanciaKm` só é preenchido para distância customizada — uma prova cadastrada pelo
      caminho normal (enum `DistanciaProva`) tem `distanciaKm = null`, e um filtro `BETWEEN` só
      nesse campo ignoraria silenciosamente toda prova cadastrada do jeito padrão. A resolução de
      distância (e o filtro 5000-21097m) acontece em código (Bloco 2).
      TDD: teste de repositório (`@DataJpaTest` + Testcontainers, padrão do módulo) cobrindo:
      prova válida retornada (independente de `distanciaKm` ser nulo ou não); prova fora da janela
      de dias excluída; prova sem `foiRealizada` excluída; prova sem `tempoRealizado` excluída;
      cross-tenant (prova de outro tenant nunca retornada); múltiplas provas válidas → lista
      ordenada por `dataProva DESC` (mais recente primeiro).
      Verify: `./mvnw clean test` — teste novo passa, suíte completa verde.

## Bloco 2 — Resolução de distância + fórmula prova→limiar (D2, D2b)

- [x] 2.1 Novo método privado/pacote em `ThresholdInferenceService`:
      `resolverDistanciaMetros(Prova prova)` — duplica isoladamente
      `RaceProjectionServiceImpl.resolveDistanceM` (linhas 202-212): prioriza `prova
      .getDistanciaKm()` (custom, convertido para metros) quando presente, senão resolve o enum
      `prova.getDistancia()` via `switch` (`KM_5→5000, KM_10→10000, KM_21→21097, KM_42→42195`).
      Comentário citando D2b do design.md e o motivo de duplicar em vez de extrair/importar de
      `RaceProjectionServiceImpl` (método `private` lá, fora do escopo tocar esse arquivo).
      TDD: teste unitário cobrindo os 4 valores do enum + o caminho `distanciaKm` customizado
      (quando ambos presentes, `distanciaKm` vence — mesma prioridade do código original).
      Verify: `./mvnw clean test`.
- [x] 2.2 Novo método em `ThresholdInferenceService`: `inferirPaceLimiarDeProva(Prova
      provaValida)` — **NÃO chama `RiegelCalculator.calculate()`** (exige `RegressionResult` do
      pipeline de projeção, não é função pura reaproveitável aqui — achado do pre-mortem, ver
      design.md D2). Implementa a fórmula de Riegel isolada, com constante própria
      `EXPONENTE_RIEGEL = 1.06` (mesmo valor de `RiegelCalculator.DEFAULT_EXPONENT`, duplicado
      deliberadamente — comentário citando D2 do design.md e o motivo de não reusar): usa
      `resolverDistanciaMetros` (2.1) para obter a distância, normaliza para pace-equivalente de
      10K (`t_10k = t_prova * (10000 / distancia_prova_m) ^ 1.06`), depois soma
      `OFFSET_LIMIAR_SEC_KM = 8`.
      TDD: teste unitário cobrindo: prova de exatamente 10K (sem normalização, offset direto);
      prova de 5000m (normalização + offset); prova de 21097m (normalização + offset); resultado
      determinístico e sem dependência de mocks (função pura).
      Verify: `./mvnw clean test`.
- [x] 2.3 Filtro de validade (5000-21097m) aplicado sobre a lista de `findProvasRealizadasRecentes`
      (Bloco 1) usando `resolverDistanciaMetros` (2.1) — retorna a primeira prova válida da lista
      já ordenada por data, ou vazio se nenhuma.
      TDD: teste cobrindo: prova de 3K (fora da faixa) ignorada; prova de 21097m via enum
      `KM_21` (`distanciaKm=null`) considerada válida (achado do pre-mortem que quebrava esse
      caso); prova de 10K com `distanciaKm` customizado considerada válida; lista vazia retorna
      vazio sem erro.
      Verify: `./mvnw clean test`.

## Bloco 3 — Integração com `atualizarLimiareInferidos` (D3, precedência + persistência D6)

- [x] 3.1 `TsbServiceImpl.atualizarLimiareInferidos`: antes de chamar `inferirPaceLimiar`
      (quintil), consulta `ProvaRepository.findProvasRealizadasRecentes(...)` + filtro de
      validade (Bloco 2.3); se uma prova válida existe, usa `inferirPaceLimiarDeProva` para
      `paceLimiarEstimado` e seta `fonteLimiarPace = PROVA_REGISTRADA`, **pulando** o quintil só
      para pace (mantém `inferirFcLimiar` por quintil normalmente, D1 — `fcLimiar` não muda nesta
      change). Se ausente, comportamento atual inalterado para `paceLimiarEstimado`/`fcLimiar`, e
      `fonteLimiarPace = MEDIA_TREINOS`.
      TDD: teste cobrindo os critérios de aceite 1-6 do proposal.md — prova válida recente tem
      precedência sobre quintil e persiste `PROVA_REGISTRADA`; sem prova válida, fallback idêntico
      ao atual para pace E FC (sem regressão) e persiste `MEDIA_TREINOS`; prova fora da janela de
      90 dias é ignorada; prova fora da faixa 5000-21097m é ignorada; prova de meia-maratona via
      enum (`distanciaKm=null`) é considerada válida; prova de 10K customizada também é válida.
      Verify: `./mvnw clean test` — suíte completa verde, incluindo os testes pré-existentes de
      `TsbServiceImplTest`/`atualizarLimiareInferidos` (não podem regredir).
- [x] 3.2 Log de sinalização de outlier (D5 do design.md — métrica revisada, substitui o log
      comparativo simples da v1): ao computar `paceLimiarEstimado` a partir de uma prova, calcula
      `Δ = novo - antigo` (valor anterior de `PlanoMetaDados.paceLimiarEstimado`, se existia); se
      `|Δ| > 20s/km`, log WARN com `atletaId`, `paceAntigo`, `paceNovo`, `delta`, `provaId` (para
      revisão manual do founder/coach); log INFO normal para deltas menores.
      Verify: teste cobrindo os dois ramos (delta grande → WARN; delta pequeno → INFO) +
      `./mvnw clean test`.

## Bloco 4 — Visibilidade da fonte para o coach (D4, D6 — lê o campo persistido, não recomputa)

- [x] 4.1 `AtletaPerfilCoachOutputDto`: novo campo `fonteLimiarEstimado` (enum
      `FonteLimiarInferencia` — `PROVA_REGISTRADA` | `MEDIA_TREINOS`) — `@Schema` com descrição,
      `@JsonInclude(NON_NULL)` (padrão já usado no restante do DTO). Mapper lê **diretamente** de
      `PlanoMetaDados.fonteLimiarPace` (Bloco 0/3) — **sem recomputar** qual seria a fonte no
      momento da leitura (2º achado do pre-mortem: recomputar poderia divergir do que de fato
      gerou o valor salvo, ex. a prova saiu da janela de 90 dias entre o sync e a leitura).
      TDD: teste do mapper/service cobrindo os dois valores do enum lidos direto do campo
      persistido, e o caso `null` (atleta nunca teve o campo calculado — pré-existente à change,
      `@JsonInclude(NON_NULL)` omite o campo da resposta).
      Verify: `./mvnw clean test`.

## Bloco 5 — Validação final

- [x] 5.1 `./mvnw clean test` — suíte completa (1747 testes, 0 falhas).
- [x] 5.2 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer, trilha Full) — sem
      achados Critical/Important; 1 achado Low do security-reviewer (query sem filtro
      CANCELADA) e itens Minor do clean-code-reviewer corrigidos em commit separado.
- [ ] 5.3 `/pr infer-threshold-from-race-result` → merge via CI → `/done`.
