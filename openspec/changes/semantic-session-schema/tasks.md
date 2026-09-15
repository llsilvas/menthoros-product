## 0. Pré-requisitos

- [ ] 0.1 Confirmar com produto/coach a Open Question do proposal.md: a matriz de estrutura
      obrigatória por tipo (INTERVALADO ≥6 blocos AQUEC→...→DESAQ, contínuo 3 blocos na ordem,
      FARTLEK/FACIL/SUBIDA/PROVA sem estrutura obrigatória — herdada de
      `fix-cold-start-calibration-plan-generation` §13.2) vale como está para v2, ou precisa de
      ajuste antes da task 4. Sem essa confirmação, a task 4 usa a matriz como está e documenta a
      suposição.
- [ ] 0.2 DoR: `spec-reviewer` (READY antes de iniciar task 1).

## 1. `ZoneResolver` — extrai zona→absoluto de `TreinoNormalizador`, sem mudar comportamento de v1

- [ ] 1.1 `services/helper/ZoneResolver.java` novo: `bpmDaZona(String zona, List<ZonaFC> zonas):
      FaixaFc` (mover lógica de `TreinoNormalizador.zonaParaFc:341-357`) e `paceDaZona(String zona,
      BigDecimal paceLimiar): FaixaPace` (extrair de `FATOR_PACE_Z1/Z2`, `TreinoNormalizador:38-41`
      e uso inline). Records `FaixaFc(int min, int max)`, `FaixaPace(BigDecimal min, BigDecimal
      max)` novos ou reaproveitados se já existir tipo equivalente.
      `verify:` `ZoneResolverTest` — mesmos casos que cobriam `zonaParaFc` hoje (Z1–Z5, fallback
      sem `ZonaFC`), sem mock.
- [ ] 1.2 `TreinoNormalizador` passa a chamar `ZoneResolver` em vez da lógica inline — refatoração
      pura, nenhum teste de `NormalizacaoDeTreino`/`TreinoNormalizadorTest` muda de expectativa.
      `verify:` suíte de `NormalizacaoDeTreino`/`TreinoNormalizador` existente continua 100% verde
      sem alteração de assertions.

## 2. `SessionResolver` — domínio puro, resolve blocos v2 em etapas absolutas

- [ ] 2.1 `record AthleteZones(List<ZonaFC> zonasFc, BigDecimal paceLimiar)` — mapeamento de
      `Atleta`/`ZonaFC` para este record fica no service layer (mapper dedicado, sem `@Entity`
      cruzando para o domínio — mesma regra de Skills Architecture do `CLAUDE.md`).
- [ ] 2.2 `domain/planner/SessionResolver.java` (ou pacote equivalente definido no início da
      implementação): `resolver(SessionOutputV2 saida, AthleteZones zonas): List<EtapaResolvida>`.
      Para cada `BlocoDto`, resolve `zona` → `FaixaFc`/`FaixaPace` via `ZoneResolver`, calcula
      duração/distância a partir de `quantidade`/`unidade` (MIN/KM/M/REP — REP delega para a mesma
      regra de expansão de tiros que `NormalizacaoDeTreino.expandirEtapasAgregadas` usa hoje, mas
      sem a etapa de correção — a contagem já vem certa do bloco).
      `verify:` `SessionResolverTest` — 1 bloco por unidade (MIN/KM/M/REP), zona Z1–Z5/LIMIAR,
      bloco com `recuperacao` presente/ausente, sem mock (domínio puro).
- [ ] 2.3 `EtapaResolvida` (ou reaproveitar `EtapaTreinoLlmDto` se o shape bater) carrega os mesmos
      campos absolutos que `TreinoMapper` já consome de v1 — confirmar com um teste de
      "shape-compat" que o output de `SessionResolver` alimenta `TreinoMapper` sem adaptação extra.
      `verify:` teste de composição `SessionResolver` → `TreinoMapper` (fixture v2) produz
      `TreinoPlanejadoOutputDto` válido, mesmos campos que um `TreinoPlanejadoLlmDto` v1 equivalente
      produziria.

## 3. DTO v2

- [ ] 3.1 `dto/llm/v2/SessionOutputV2.java`, `dto/llm/v2/BlocoDto.java` — records, `@Schema` por
      campo (Swagger, mesma disciplina de DTO & Records Standards do `CLAUDE.md` mesmo não sendo
      DTO de controller — documentação do contrato de saída da LLM).
      `verify:` compila; sem lógica, sem teste dedicado além do que a task 4/2 já exercitam via
      fixture.

## 4. `PlanoLlmValidatorV2` — estrutura de blocos + TSS do slot

- [ ] 4.1 `services/helper/PlanoLlmValidatorV2.java` novo (não um `if` dentro do validador v1 —
      Decisão 4 do design.md). Reusa `FamiliaTreino` e a matriz de estrutura obrigatória por tipo
      (task 0.1 confirma/ajusta) operando sobre `List<BlocoDto>`. Lança
      `PlanoNaoConformeException` com `List<Violacao>` — mesmo tipo que v1, sem mudança em
      `PlanoResilienceService`/turno de reparo (F3).
      `verify:` `PlanoLlmValidatorV2Test` — INTERVALADO com blocos insuficientes → violação;
      contínuo fora de ordem → violação; FARTLEK/FACIL sem estrutura → passa; 2 treinos inválidos
      no mesmo plano → 2 violações (mesma garantia da task 3.0 de F3, não regredir).
- [ ] 4.2 Checagem de TSS do slot: recebe `SessionSlot.targetTss` (do `WeekPlanSkeleton`) e o TSS
      resolvido (calculado **depois** de `SessionResolver` rodar — ordem documentada na assinatura
      pública, Decisão 5 do design.md); violação se desvio > ±20%.
      `verify:` teste com TSS resolvido dentro de ±20% → passa; fora → violação com a diferença
      exata na mensagem.

## 5. Skeleton real — `PlannerEngine` determina tipo/foco antes do prompt

- [ ] 5.1 O composer de `user` (v2) chama `PlannerEngine.planWeek` **antes** de montar o prompt e
      serializa `tipo`/`foco` de cada `SessionSlot` como contexto fixo — a LLM recebe o dia já
      classificado, não escolhe o tipo do zero. Caminho v1 não muda (skeleton continua shadow lá).
      `verify:` teste de composição do `user` v2 — dado um `WeekPlanSkeleton` fixture, o texto
      gerado contém tipo/foco de cada dia, na ordem da semana.
- [ ] 5.2 Confirmar que `SkeletonComplianceChecker` (hoje audita v1 contra o skeleton) não roda no
      caminho v2 — ficaria redundante (o skeleton virou a fonte, não há mais o que comparar).
      `verify:` `git diff --stat` não lista `SkeletonComplianceChecker.java`; teste de wiring
      confirma que o caminho v2 não o invoca.

## 6. Prompt v2

- [ ] 6.1 `src/main/resources/prompts/plano-treino-system-v2.txt` novo (não sobrescreve o v1) —
      remove o bloco de fórmulas de contagem/recuperação (`plano-treino-system.txt:183-337`),
      substitui por instruções sobre o schema de blocos (`papel`/`quantidade`/`unidade`/`zona`).
      `app.llm.plano.template` (precedente já existe, `PromptHashCalculator:31`) resolve qual
      arquivo usar por `schemaVersion`.
      `verify:` teste de `PromptHashCalculator`/composer confirma que v2 carrega o arquivo novo e
      v1 continua carregando o de sempre — sem regressão de hash em v1.

## 7. `IaServiceImpl` — wiring v1/v2

- [ ] 7.1 `schemaVersion` resolvido uma vez no início de `geraPlanoSemanalAvancado` (allowlist de
      tenant, task 8) — não recalculado a cada tentativa de retry.
- [ ] 7.2 Branch v2: monta prompt v2 (task 5+6), chama LLM, parseia `SessionOutputV2`, roda
      `PlanoLlmValidatorV2` (estrutura), `SessionResolver` (resolve), `PlanoLlmValidatorV2` (TSS,
      task 4.2), monta `TreinoPlanejadoOutputDto` via `TreinoMapper` — mesma saída para o front que
      v1 produziria.
      `verify:` teste de integração (fixtures, sem chamar LLM real) — plano v2 completo, do
      `SessionOutputV2` da LLM (mock) até o `TreinoPlanejadoOutputDto` final, mesmo shape que um
      plano v1 equivalente.
- [ ] 7.3 Branch v1 inalterado — nenhum teste de `IaServiceImpl` existente muda de expectativa.
      `verify:` suíte de `IaServiceImplTest`/`IaServiceImplGerarChamadaLlmTest` (F3) 100% verde sem
      alteração de assertions.

## 8. Flag — allowlist de tenant

- [ ] 8.1 `app.llm.plano.schema-version-v2-tenants` (CSV de UUIDs, default vazio) — resolução via
      `TenantContext.getRequiredTenantId()` contra a lista (Decisão 6 do design.md).
      `verify:` teste unitário do resolver de flag — tenant na lista → v2; fora → v1; lista vazia
      (default) → todos v1.

## 9. Ledger

- [ ] 9.1 `tb_llm_call.schema_version` (V94, já existe) passa a ser populado em toda chamada —
      `"1"` ou `"2"`, resolvido junto da task 7.1.
      `verify:` teste do ponto de registro do ledger (mesmo padrão de F1-F3) confirma
      `schema_version` não-nulo nas duas linhas (v1 e v2) de um teste de integração.

## 10. Arquivamento de changes supersedidas

- [ ] 10.1 Mover `validate-interval-workout-standards` e `fix-cold-start-calibration-plan-generation`
      para `changes/archive/2026-XX/` com nota "superseded by semantic-session-schema" no topo do
      `proposal.md` de cada uma (não apagar conteúdo — preserva o histórico de por que foram
      propostas e por que ficaram obsoletas).
      `verify:` `openspec/changes/` não lista mais as duas pastas; `archive/` lista as duas com a
      nota.

## 11. Validação final

- [ ] 11.1 `./mvnw clean verify` verde (Surefire + Failsafe).
- [ ] 11.2 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer + Codex adversarial) —
      atenção especial a multi-tenancy da allowlist (task 8) e a não-regressão do caminho v1
      (tasks 1.2, 7.3).
- [ ] 11.3 Piloto: 2 tenants reais na allowlist por 2 semanas (execução fora desta sessão — requer
      produção/staging). Gate quantitativo: retry ≤ 10%, violações estruturais ≤ 5%, aceitação sem
      edição ≥ v1 + 10 p.p., p50 ≤ 20s — medido via `tb_llm_call` filtrado por `schema_version`. SQL
      de comparação v1×v2 documentado no relatório desta task quando o piloto rodar.
      **Gate qualitativo (achado do `product-reviewer`):** "aceitação sem edição" não distingue
      "plano ótimo" de "coach não notou o problema" — coletar feedback direto dos 2 coaches do
      piloto sobre percepção de planos genéricos/destoantes do que esperavam, especialmente nos dias
      em que o `WeekPlanSkeleton` decidiu tipo/foco de forma diferente do que a LLM teria escolhido
      livremente (comparar contra o log de `SkeletonComplianceChecker` de v1 no mesmo tenant, se
      houver histórico). Sem esse feedback, o gate quantitativo sozinho não decide se o piloto vira
      default.
- [ ] 11.4 `tasks.md` atualizado; `SPRINTS.md` (F4) marcado; arquivar via `/done` após merge.
