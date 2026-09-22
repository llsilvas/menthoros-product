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

**Escolhido:** `descansos: [{diaSemana, motivo}]` no nível do plano (`PlanoSemanalLlmDto` e
`PlanoSemanalLlmDtoV2`), persistido em `tb_plano_semanal.descansos JSONB`.

**Rejeitado — DESCANSO em `treinosPlanejados`:** o enum `TipoTreino.DESCANSO` já existe, o que
tenta. Mas exigiria afrouxar `etapas`/`blocos` para um tipo só (o `strict` não tem `oneOf` por tipo
sem reescrever o schema) e tocar os seis consumidores acima — cada um com a regra "todo planejado é
treino". O raio de impacto é o sistema de aderência inteiro. Como campo do plano, nenhum consumidor
existente enxerga o descanso: CA9 vale por construção.

## Decisão 2 — regra de cobertura no validador do plano, dentro do retry

`PlanoLlmValidator.validarPlano`/`validarPlanoV2` ganham um `ContextoCobertura(diasEfetivos,
sinaisFadiga, limiteDescansos)` — montado em `IaServiceImpl` no mesmo lugar dos dias efetivos. A
regra, pura e testável (`CoberturaSemanalValidator` em `services/helper`):

1. `diasTreino` (multiconjunto) e `diasDescanso` (multiconjunto).
2. Repetição em qualquer um, ou dia em ambos → `COBERTURA_DIAS` (dia duplicado).
3. Dia fora de `diasEfetivos` → `COBERTURA_DIAS` (dia não disponível).
4. `diasEfetivos − (diasTreino ∪ diasDescanso)` não vazio → `COBERTURA_DIAS` nomeando os dias.
5. `|diasDescanso| > 0` sem sinal → `DESCANSO_SEM_SINAL`.
6. `|diasDescanso| > limite` → `DESCANSO_ACIMA_DO_LIMITE`. `limite = max(1, floor(|efetivos| × 0,25))`.
7. Motivo vazio/branco/>200 → `DESCANSO_SEM_MOTIVO`.

As violações vão juntas (o validador já acumula), e cada mensagem diz a saída válida.

## Decisão 3 — sinais de fadiga calculados por completo, fora da recomendação

Os portões de `IntervaladoElegibilidadeService` retornam no primeiro que dispara (readiness em
`:140`, TSB crítico `:214`, TSB `:235`, RPE `:247`, recuperação `:272`, CTL `:281`) — usar a
recomendação como fonte perderia sinais. **Escolhido:** um `SinaisFadigaService` (ou método puro no
mesmo serviço) avalia **todos** os sinais de forma independente e devolve `List<SinalFadiga>`, cada um
com `tipo`, `valor` e `limiar` (para o motivo citar número e régua):

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

## Decisão 4 — schema e prompt

- `descansos`: array (pode ser vazio), itens `{diaSemana: enum, motivo: string maxLength 200}`,
  `required` pelo `strict`. v1 e v2.
- `treinosPlanejados.minItems` 3 → 1 e `maxItems` 5 → 7 (a cobertura governa; decisão de
  2026-09-22 para atletas de 6-7 dias).
- `DisponibilidadePromptFormatter:110` ("Incluir dia de descanso completo ou regenerativo
  OBRIGATÓRIO") e `:116` ("Dia de descanso sugerido") passam a apontar para o campo `descansos` —
  coerentes com os sinais `DIAS_CONSECUTIVOS_LIMITE` e a regra.
- System prompt: bloco "COBERTURA DA SEMANA" — todo dia disponível recebe treino ou descanso; sem
  sinal de fadiga, nunca descanso; a instrução do intervalado degradado ganha a frase do limite
  ("até N dia(s) pode(m) virar descanso, com motivo citando o sinal").
- Mudança em `resources/prompts/**` → gate de eval do CLAUDE.md (modo candidato) no PR.

## Decisão 5 — persistência e saída

- `V97__Add_descansos_to_tb_plano_semanal.sql`: `ALTER TABLE tb_plano_semanal ADD COLUMN IF NOT EXISTS
  descansos JSONB` (nulo = plano anterior à feature). Sem backfill, sem DROP.
- Entidade: `List<DescansoPlanejado>` (record `diaSemana`, `motivo`) com `@JdbcTypeCode(SqlTypes.JSON)`.
- `PlanoSemanalOutputDto.descansos` (`List<DescansoOutputDto>`, vazio quando nulo). Aditivo.
- SEMANA_ATUAL: dia de descanso que já passou não existe (os efetivos já filtram).

## Decisão 6 — integrações (achados do Codex)

- **v2:** `SessionResolver.resolverPlano` (`:60-68`) reconstrói o DTO v1 campo a campo — copiar
  `descansos`; teste v2 → v1 → persistência.
- **Redistribuição:** `RedistribuicaoTreinoHelper` recebe os dias de descanso como bloqueados (não
  são `diasValidos`); `PlanGenerationPersister` revalida a cobertura depois de redistribuir e loga
  WARN se ela quebrar (a redistribuição roda depois do retry — não há reparo possível ali).
- **Planner:** com `skeleton != null` a regra não roda (Fora de escopo no proposal).
- **Treino do treinador num dia de descanso:** `TreinoPlanejadoServiceImpl` (criação manual,
  `:195-210`) remove o descanso daquele dia do plano, na mesma transação, com log estruturado — é o
  treinador discordando.

## Testes

- `CoberturaSemanalValidatorTest`: tabela de cenários (cobertura exata, falta, sobra, repetição,
  dia inválido, sinal × sem sinal por tipo de sinal, BVA do limite 3/4/7/8 dias, motivo vazio/branco/
  201 chars, SEMANA_ATUAL × PROXIMA_SEMANA, 6-7 dias com o teto).
- `IntervaladoElegibilidadeServiceTest`: `sinais` por portão, inclusive combinações.
- `PlanoLlmValidatorTest`: violações chegam como `PlanoNaoConformeException` com as keys.
- `RepairTurnMessageBuilderTest`: mensagem de cobertura legível.
- Schema: golden de `LlmJsonSchemaBuilder` (v1/v2); golden do prompt.
- Persistência: `@DataJpaTest` do JSONB (ida e volta, nulo → vazio); controller `@WebMvcTest` do DTO.
- Encerramento de semana e aderência: teste de não-regressão (plano com descanso não gera PERDIDO).
- `SinaisFadiga`: cada sinal isolado e combinados (TSB + CTL, readiness sem check-in, flag off).
- `SessionResolver` com descansos; redistribuição com dia bloqueado; criação manual em dia de
  descanso remove o descanso; 6 e 7 dias com `maxItems` 7.
