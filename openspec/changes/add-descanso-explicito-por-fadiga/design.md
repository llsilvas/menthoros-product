# Design — add-descanso-explicito-por-fadiga

## Contexto (mapa do código, 2026-09-22)

- Schema: `LlmJsonSchemaBuilder` — `treinosPlanejados` 3..5 (v1 `:206`, v2 `:111`); `tipoTreino`
  sem DESCANSO (`:126`, `:231`); v1 exige `etapas` minItems 2, v2 `blocos` minItems 1; `strict` torna
  toda chave obrigatória (`:47`). `justificativaIa` maxLength 200.
- Validação de plano: `PlanoLlmValidator` (v1 `:60-100`, v2 `:111-138`) acumula `Violacao(key, msg)`
  e lança `PlanoNaoConformeException` → `PlanoResilienceService` (`:133`) → `RepairTurnMessageBuilder`
  (linhas `- [key] mensagem`). `MAX_TENTATIVAS = 2`; esgotado → 422.
- Dias efetivos: `IaServiceImpl:159-161` (SEMANA_ATUAL filtra; PROXIMA_SEMANA `null`). Em escopo no
  lambda `validar`, mas não chegam ao validador. **Materializar sempre**: em PROXIMA_SEMANA, os dias
  disponíveis do atleta (achado do Codex — com `null` a regra perderia os dias que deve cobrir).
- Sinais: `RecomendacaoIntervalado` (sealed: `Elegivel`/`Degradado`/`Substituido`) carrega só
  `motivo` em texto; calculado em `PlanoTreinoPromptBuilder:220`, antes da LLM, e não guardado.
- Consumidores que tratam todo treino planejado como treino a cumprir: `EncerramentoSemanaServiceImpl`
  (`:177` marca PENDENTE → PERDIDO), aderência em `CoachDashboardServiceImpl:268`, `RedistribuicaoTreinoHelper`
  (prioridade 99, pode ser descartado), `SkeletonComplianceChecker` (constraints duras, TSS),
  `PlannerShadowService.mapPlanoGerado`, `PlanQualityChecker.verificarMaxConsecutivos`.

## Decisão 1 — descanso é campo do plano, não item de `treinosPlanejados`

**Escolhido:** `restDays: [{dayOfWeek, reason}]` no nível do plano (`PlanoSemanalLlmDto` e
`PlanoSemanalLlmDtoV2`), persistido em `tb_plano_semanal.rest_days JSONB`. `dayOfWeek` é `String` com
o nome do enum (`SEGUNDA`…`DOMINGO`) no DTO da LLM, no JSONB e no DTO de saída — `DiaSemana`
serializa como objeto (`@JsonFormat(shape = OBJECT)`) e não serve de tipo de fio aqui; a conversão
para o enum acontece no validador. Nomes novos em inglês (ADR-0007).

**Rejeitado — DESCANSO em `treinosPlanejados`:** o enum `TipoTreino.DESCANSO` já existe, o que
tenta. Mas exigiria afrouxar `etapas`/`blocos` para um tipo só (o `strict` não tem `oneOf` por tipo
sem reescrever o schema) e tocar os seis consumidores acima — cada um com a regra "todo planejado é
treino". O raio de impacto é o sistema de aderência inteiro. Como campo do plano, nenhum consumidor
existente enxerga o descanso: CA9 vale por construção.

## Decisão 2 — regra de cobertura no validador do plano, dentro do retry

`PlanoLlmValidator.validarPlano`/`validarPlanoV2` ganham um `WeeklyCoverageContext(effectiveDays,
fatigueSignals, firstEffectiveDay, currentWeek)` — montado em `IaServiceImpl` no mesmo lugar dos dias
efetivos. Só é montado com `app.plano.weekly-coverage.enabled=true` e `skeleton == null`. A regra,
pura e testável (`WeeklyCoverageValidator` em `services/helper`):

1. `diasTreino` (multiconjunto) e `diasDescanso` (multiconjunto).
2. Repetição em qualquer um, ou dia em ambos → `COBERTURA_DIAS` (dia duplicado).
3. Dia fora de `diasEfetivos` → `COBERTURA_DIAS` (dia não disponível).
4. `diasEfetivos − (diasTreino ∪ diasDescanso)` não vazio → `COBERTURA_DIAS` nomeando os dias.
5. Descanso num dia sem sinal aplicável → `DESCANSO_SEM_SINAL`. Aplicável = sinal semanal
   (`TSB_BAIXO`, `RPE_ALTO`) em qualquer dia; `SEQUENCIA_ACIMA_DO_MAXIMO` em qualquer dia **dentro** da
   sequência longa; sinal agudo (`RECUPERACAO_INSUFICIENTE`, `DIAS_CONSECUTIVOS_LIMITE`,
   `READINESS_DESCANSAR`) só em SEMANA_ATUAL e só no `firstEffectiveDay` — o menor `DayOfWeek` entre
   os efetivos, calculado (a `@ElementCollection` de dias não tem ordem garantida).
6. `|diasDescanso| > 1` → `DESCANSO_ACIMA_DO_LIMITE` (`max(1, floor(d × 0,25))` = 1 para d ≤ 7).
7. Motivo vazio/branco/>200 → `DESCANSO_SEM_MOTIVO`.
8. Dois tipos de `TIPOS_ALTA_INTENSIDADE` em dias vizinhos → `INTENSOS_ADJACENTES`. O conjunto é o do
   `RedistribuicaoTreinoHelper:35` (LONGO, FARTLEK, TEMPO_RUN, INTERVALADO, TIRO, PROVA, SUBIDA —
   `fatorImpacto >= 1.15`), exposto como constante única e reusado pelos dois.

`SEQUENCIA_ACIMA_DO_MAXIMO` é calculado sobre os **dias efetivos** (não sobre o histórico): a maior
sequência de dias seguidos contra `calcularMaxDiasConsecutivos`. Entra na lista de sinais com
`scope = WEEK` e o intervalo da sequência.

As violações vão juntas (o validador já acumula), e cada mensagem diz a saída válida.

## Decisão 3 — sinais de fadiga calculados por completo, fora da recomendação

Os portões de `IntervaladoElegibilidadeService` retornam no primeiro que dispara (readiness em
`:140`, TSB crítico `:214`, TSB `:235`, RPE `:247`, recuperação `:272`, CTL `:281`) — usar a
recomendação como fonte perderia sinais. **Escolhido:** um `FatigueSignalsService` (ou método puro no
mesmo serviço) avalia **todos** os sinais de forma independente e devolve `List<FatigueSignal>`, cada um
com `type`, `value` e `threshold` (para o motivo citar número e régua):

| Sinal | Fonte | Libera descanso |
|---|---|---|
| `TSB_BAIXO` | mesmos limiares por nível do portão de TSB | sim |
| `RPE_ALTO` | RPE médio 7d ≥ 7,5 | sim |
| `RECUPERACAO_INSUFICIENTE` | horas desde o último intensivo < mínimo do nível | sim |
| `DIAS_CONSECUTIVOS_LIMITE` | `DisponibilidadePromptFormatter.calcularMaxDiasConsecutivos` atingido | sim |
| `READINESS_DESCANSAR` | check-in do dia = DESCANSAR (só com check-in e flag de readiness) | sim |
| `CTL_BAIXO` | CTL < mínimo do nível | **não** |

A recomendação do intervalado continua como está (não muda o comportamento da degradação). A lista é
calculada uma vez em `PlanoTreinoPromptBuilder` e segue no `PromptGerado` até o `IaServiceImpl`.
Cada sinal carrega `scope` (`WEEK` ou `ACUTE`), que o validador usa no item 5 da Decisão 2.

## Decisão 4 — schema e prompt

- `restDays`: array (pode ser vazio), itens `{dayOfWeek: enum de strings, reason: string maxLength
  200}`, `required` pelo `strict`. v1 e v2.
- `treinosPlanejados.minItems` 3 → 1 e `maxItems` 5 → 7 (a cobertura governa; decisão de
  2026-09-22 para atletas de 6-7 dias).
- `DisponibilidadePromptFormatter:110` ("Incluir dia de descanso completo ou regenerativo
  OBRIGATÓRIO") e `:116` ("Dia de descanso sugerido") passam a apontar para o campo `restDays` —
  coerentes com os sinais `DIAS_CONSECUTIVOS_LIMITE` e a regra.
- O bloco de cobertura do prompt lista os sinais ativos com valor, limiar e o(s) dia(s) em que cada um
  libera descanso — é assim que a LLM sabe o limite e onde pode usá-lo.
- System prompt: bloco "COBERTURA DA SEMANA" — todo dia disponível recebe treino ou descanso; sem
  sinal de fadiga, nunca descanso; a instrução do intervalado degradado ganha a frase do limite
  ("até N dia(s) pode(m) virar descanso, com motivo citando o sinal").
- Mudança em `resources/prompts/**` → gate de eval do CLAUDE.md (modo candidato) no PR.

## Decisão 5 — persistência e saída

- `V97__Add_rest_days_to_tb_plano_semanal.sql` (conferir o próximo número livre na hora de
  implementar): `ALTER TABLE tb_plano_semanal ADD COLUMN IF NOT EXISTS rest_days JSONB` (nulo = plano
  anterior à feature). Sem backfill, sem DROP.
- Entidade: `List<RestDay>` (record `dayOfWeek`, `reason`) com `@JdbcTypeCode(SqlTypes.JSON)` —
  precedente no próprio `PlanoSemanal:157` (lá como `String`); o teste `@DataJpaTest` cobre a lista de
  records de verdade, com Postgres (Testcontainers), não H2.
- `PlanoSemanalOutputDto.restDays` (`List<RestDayOutputDto>`, vazio quando nulo). Aditivo.
- SEMANA_ATUAL: dia de descanso que já passou não existe (os efetivos já filtram).

## Decisão 6 — integrações (achados do Codex)

- **v2:** `SessionResolver.resolverPlano` (`:60-68`) reconstrói o DTO v1 campo a campo — copiar
  `restDays`; teste v2 → v1 → persistência.
- **Redistribuição:** `PlanGenerationPersister.obterTreinosParaPlano` (`:325`) não redistribui quando
  a cobertura foi validada (contexto presente) — a redistribuição descarta treino por conflito de
  consecutivos e reabriria um dia omitido. O mapeamento dia→data (`:453`, `:588`) e o filtro de dias
  passados não dependem dela. O que ela fazia e precisa continuar:
  - âncora do LONGO (`RedistribuicaoTreinoHelper:217-227`) → `LongRunAnchor.swap(plano, context)`:
    troca de dias, nunca descarta. Roda **no lambda `validar` do `IaServiceImpl`, antes do
    `WeeklyCoverageValidator`** — dentro do retry, para o validador julgar o arranjo final. Não troca se
    o dia preferido tem descanso de sinal agudo. `diaPreferidoLongo` e o máximo de consecutivos
    (`DisponibilidadePromptFormatter.calcularMaxDiasConsecutivos`, público) entram no
    `WeeklyCoverageContext`, montado no `IaServiceImpl` — o validador não recebe `PlanoMetaDados`;
  - separação de intensos (`:251-265`) → item 8 da Decisão 2, no validador (reparável).
  Depois de `garantirProvasNaSemana` (`:340`), o persister remove o descanso de todo dia que ganhou
  prova e confere a cobertura de novo: se quebrar, lança `DomainRuleViolationException` e não persiste
  (fail-closed — não há turno de reparo ali).
- **Planner:** com `skeleton != null` a regra não roda (Fora de escopo no proposal).
- **Treino do treinador num dia de descanso:** `TreinoPlanejadoServiceImpl` (criação manual,
  `:195-210`) remove o descanso daquele dia do plano, na mesma transação, com log estruturado — é o
  treinador discordando.

## Testes

- `WeeklyCoverageValidatorTest`: tabela de cenários (cobertura exata, falta, sobra, repetição,
  dia inválido, sinal × sem sinal por tipo de sinal, BVA do limite 3/4/7/8 dias, motivo vazio/branco/
  201 chars, SEMANA_ATUAL × PROXIMA_SEMANA, 6-7 dias com o teto).
- `IntervaladoElegibilidadeServiceTest`: `sinais` por portão, inclusive combinações.
- `PlanoLlmValidatorTest`: violações chegam como `PlanoNaoConformeException` com as keys.
- `RepairTurnMessageBuilderTest`: mensagem de cobertura legível.
- Schema: asserções estruturais em `LlmJsonSchemaBuilderTest` (não há golden do schema hoje):
  `restDays` required, itens, enum de dias, `minItems`/`maxItems`; v1 e v2. Prompt: golden em
  `PlanoTreinoPromptBuilderGoldenTest` (`-Dgolden.update=true`).
- Persistência: `@DataJpaTest` do JSONB (ida e volta, nulo → vazio); controller `@WebMvcTest` do DTO.
- Encerramento de semana e aderência: teste de não-regressão (plano com descanso não gera PERDIDO).
- `SinaisFadiga`: cada sinal isolado e combinados (TSB + CTL, readiness sem check-in, flag off).
- `SessionResolver` com descansos; redistribuição com dia bloqueado; criação manual em dia de
  descanso remove o descanso; 6 e 7 dias com `maxItems` 7.
