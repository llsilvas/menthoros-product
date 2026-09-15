## 0. Pré-requisitos

- [x] 0.1 6 rodadas de DoR (spec-reviewer + codex exec pré-mortem, 2026-09-15). Rodada 1: NOT READY
      (premissa de skeleton-shadow desatualizada). Rodada 2: spec-reviewer READY, codex NOT READY
      (loop por treino inexistente, gates privados, TSS mal contado, recuperação sem zona, atleta
      sem FC sem fallback). Rodada 3: arquitetura corrigida em cima do fluxo real de uma única
      chamada semanal (design.md §0-§1). Rodada 4: codex NOT READY (validação precisava rodar dentro
      de `validar`, não `gerar` — escapava do retry F3; gates aplicados por família, não
      universalmente). Rodada 5: spec-reviewer READY; codex NOT READY (`gateBalanceamento` omitido
      permitia intervalado sem nenhuma recuperação — fechado com `gateRecuperacaoEntreTiros` novo;
      `FamiliaTreino` real corrigido para os 4 valores reais). Rodada 6: spec-reviewer READY; codex
      NOT READY com 1 MAJOR final (`validarDuracaoTiros`, limites fisiológicos 0,3-10 min por tiro,
      omitido do dispatch — a LLM ainda escolhe `quantidadePorRepeticao` livremente em v2, sem
      garantia determinística de faixa plausível) — corrigido nesta versão (task 6.1).
- [x] 0.2 DoR final: rodada 7 — `spec-reviewer` READY e `codex exec` READY, ambos confirmando a
      correção de `validarDuracaoTiros` sem nova inconsistência. 7 rodadas ao todo (histórico
      completo na task 0.1). Liberado para task 1.
- [ ] 0.3 Confirmar com produto/coach: matriz de estrutura obrigatória por tipo (herdada de
      `fix-cold-start-calibration-plan-generation` §13.2) vale para v2. Sem confirmação, a task 6
      usa a matriz como está e documenta a suposição.
- [x] 0.4 Ler o ponto exato de cálculo de TSS por treino. **Resolvido**: `TssCalculatorService.
      calcularTssEstimado(Duration duracaoMin, Integer rpe): int` (`services/helper/
      TssCalculatorService.java:52-56`) já é o pipeline canônico RPE→IF→TSS
      (`h × IF² × 100`, RPE default 5), compartilhado entre planejado e realizado de propósito
      (comentário cita BUG-CONF-001 — duas fórmulas divergindo 2,4×-6× antes da unificação).
      `SessionResolver` **reusa esse método** para `tssPlanejado` — duração total resolvida +
      `percepcaoEsforcoEsperada` (RPE, já calculado, task 0.5) — em vez de inventar uma fórmula
      nova. `converterRpeParaIf(double rpe): double` (linha 370, `private`) é o mesmo pipeline que
      dá `intensidadePlanejada` (o IF); precisa virar package-private (mesmo padrão de visibilidade
      cirúrgica da task 6.1, mas em `TssCalculatorService`) para `SessionResolver` reusar em vez de
      duplicar a tabela RPE→IF.
- [ ] 0.5 **Reduzida (achado durante a implementação):** pace por zona não precisa mais de
      calibração nova — `ZoneResolver` delega para `ZonaTreinoService.calcularZonasPace`, já
      calibrado e já usado por `PaceZoneCalculator`/`PlanoLlmValidator` (FC) hoje (design.md Decisão
      6). Só falta calibrar o lookup zona→RPE de `percepcaoEsforcoEsperada` (design.md Decisão 4,
      sem precedente no código) com produto/fisiologia. Sem isso, task 4 usa o lookup estimado
      documentado no design e o piloto (task 12.3) serve de segunda camada — não bloqueia início da
      implementação, mas bloqueia o piloto com tenants reais.

## 1. DTOs v2 — família paralela

- [x] 1.1 `dto/llm/v2/Zona.java` — enum `Z1..Z5, LIMIAR` com `indice()` (`LIMIAR` → 4, mesmo índice
      de `Z4`). `dto/llm/v2/Papel.java` (`AQUEC/PRINCIPAL/RECUP/DESAQ`),
      `dto/llm/v2/UnidadeQuantidade.java` (`MIN/SEG/KM/M`) — tipos auxiliares, só v2.
- [x] 1.2 `dto/llm/v2/PlanoSemanalLlmDtoV2.java`, `dto/llm/v2/TreinoPlanejadoLlmDtoV2.java`,
      `dto/llm/v2/BlocoDto.java`, `dto/llm/v2/RecuperacaoDto.java` — records, mesmo padrão de
      `@JsonInclude(NON_NULL)` + `@Schema` que os DTOs v1. Sem Bean Validation (`@NotNull`/`@Min`) —
      **consistente com v1**: `TreinoPlanejadoLlmDto`/`EtapaTreinoLlmDto` também não têm; a
      validação real é o JSON Schema `strict` (task 2) + `validarEstruturaV2` (task 6), não Bean
      Validation em DTO de saída de LLM.
      `verify:` `./mvnw -o compile` verde.

## 2. `LlmJsonSchemaBuilder` v2

- [x] 2.1 `LlmJsonSchemaBuilder.buildSchemaV2()`/`v2JsonSchemaOptions()` — mesmo padrão de
      `buildSchemaTightInlineOrDefs`, refletindo via `BeanOutputConverter` sobre
      `PlanoSemanalLlmDtoV2.class`. `zona`/`papel`/`unidade` são enums Java reais nos DTOs v2 (não
      `String` como em v1) — o `BeanOutputConverter` já gera `enum` no schema por reflexão, sem
      `putEnum` manual para eles. `recuperacao` (opcional) usa `anyOf` com objeto/null, mesmo padrão
      de `ritmoAlvo` nullable em v1.
      `verify:` `LlmJsonSchemaBuilderTest$BuildSchemaV2` — 4 testes novos, 8/8 verde no arquivo
      (4 v1 existentes + 4 v2 novos): `blocos` array `minItems=1` sem campos absolutos no treino,
      `zona`/`papel` viram enum no schema, `required` cobre treino e bloco, `v2JsonSchemaOptions()`
      envolve em `ResponseFormat` `strict:true`.

## 3. `ZoneResolver` v2

- [x] 3.1 `services/helper/ZoneResolver.java` — `@Component`, injeta `ZonaTreinoService` (não mexe
      em `TreinoNormalizador`). `bpm(Zona, Integer fcMaxima, Integer fcLimiar): FaixaFc` delega para
      `calcularZonasFC` — **`fcMaxima`/`fcLimiar` devem vir de `Atleta.getFcMaximaCalculada()`/
      `getFcLimiarCalculada()`, que nunca retornam `null`** (achado durante a implementação: essas
      duas accessor methods já têm fallback por idade/percentual embutido — não existe caso de FC
      ausente em `ZoneResolver`, diferente do que o design supunha). `pace(Zona, @Nullable
      BigDecimal paceLimiar): FaixaPace` delega para `calcularZonasPace` — `paceLimiar` (campo cru
      de `Atleta`, sem accessor com fallback) pode ser `null` de verdade; nesse caso usa
      `PACE_LIMIAR_FALLBACK_MIN_KM=5.83` (implícito pelos defaults fixos que v1 já tinha:
      `PACE_Z2_DEFAULT_MIN_KM=7.0 ÷ FATOR_PACE_Z2=1.20`) e delega para o mesmo
      `calcularZonasPace` — sem tabela separada. `Zona.indice()` mapeia `Z1..Z5=1..5`, `LIMIAR=4`.
      `verify:` `ZoneResolverTest`, 6/6 verde — `bpm`/`pace` batem exatamente com
      `ZonaTreinoService` chamado direto para as 5 zonas; `LIMIAR` == `Z4`; `pace` sem `paceLimiar`
      nunca lança e mantém Z5 mais rápido que Z1 (coerência do fallback). `ZonaTreinoService` real
      (não mock) — é puro e barato, mesmo padrão de `ZonaTreinoServiceTest`.
- [x] 3.2 Confirmado: `git status` só lista `ZoneResolver.java`/`ZoneResolverTest.java` — nenhum
      arquivo de v1 (`TreinoNormalizador`, `PaceValidator`, `NormalizacaoDeTreino`) tocado.

## 4. `SessionResolver` — domínio puro, roda uma vez por tentativa, dentro de `gerar` (sem validar)

- [x] 4.1 `services/helper/AthleteZones.java` — `record AthleteZones(Integer fcMaxima, Integer
      fcLimiar, @Nullable BigDecimal paceLimiar)`. **Ajuste de assinatura durante a implementação**:
      não carrega `List<ZonaFC>` pré-computada — `ZoneResolver.bpm` recebe `fcMaxima`/`fcLimiar`
      crus e delega para `ZonaTreinoService` ele mesmo (task 3.1), então `AthleteZones` só precisa
      passar os 3 valores fisiológicos adiante. `fcMaxima`/`fcLimiar` devem vir de
      `Atleta.getFcMaximaCalculada()`/`getFcLimiarCalculada()` (nunca `null`); mapeamento
      `Atleta`→`AthleteZones` fica no service layer (task 9).
- [x] 4.2 `services/helper/SessionResolver.java` (**pacote ajustado**: `services/helper`, não
      `domain/planner` — consistente com `ZoneResolver`/`TssCalculatorService`, mesmo pacote onde as
      visibilidades cirúrgicas das tasks 0.4/6.1 fazem efeito). `resolverPlano(PlanoSemanalLlmDtoV2,
      AthleteZones): PlanoSemanalLlmDto`. Itera `planoV2.treinosPlanejados()`; para cada bloco,
      resolve `repeticoes` etapa(s) — `PRINCIPAL` com `repeticoes>1` vira `INTERVALADO` por
      repetição (intercalado com `RECUPERACAO` quando `recuperacao != null`, sempre incluindo a
      última — design.md Decisão 5); `repeticoes==1` vira etapa única do tipo correspondente ao
      papel (`AQUEC→AQUECIMENTO`, `DESAQ→DESAQUECIMENTO`, `RECUP→RECUPERACAO`,
      `PRINCIPAL→PRINCIPAL`). Agrega os 7 campos de nível-treino: `duracaoMin`/`distanciaKm`
      (soma), `fcAlvo`/`ritmoAlvo` (união das faixas min/max de todos os blocos),
      `tssPlanejado`/`intensidadePlanejada` via `TssCalculatorService` reusado (task 0.4),
      `percepcaoEsforcoEsperada` via lookup zona-dominante→RPE (a maior RPE entre os blocos, task
      0.5) — nunca nulos. **`resolverPlano` não valida nada** — não lança para estrutura
      insuficiente, só produz o resultado aritmético possível (design.md Decisão 3, BLOCKER de
      retry fechado). **Achado durante a implementação**: durações sub-minuto (ex. tiro de 90 SEG)
      arredondam para 0 min sem piso — corrigido com `Math.max(1, ...)`, mesma convenção de
      `TreinoNormalizador.expandirEtapasAgregadas:115`.
      `verify:` `SessionResolverTest`, 17/17 verde — `repeticoes=1` sem expansão; `repeticoes=6` com
      `recuperacao` (12 etapas, última repetição também com recuperação); `repeticoes=6` sem
      `recuperacao` (6 etapas); os 4 papéis resolvem o `tipoEtapa` certo; cada `unidade`
      (`@CsvSource` com quantidade realista por unidade, não um valor genérico — evita o
      falso-negativo de duração sub-minuto); cada `zona` incluindo `LIMIAR`; `repeticoes`
      insuficientes não lança, só produz menos etapas; os 7 campos de nível-treino corretos
      (incluindo RPE dominante = zona mais intensa); plano com múltiplos treinos resolve todos
      preservando campos de nível-plano. Sem mock — `ZonaTreinoService`/`ZoneResolver`/
      `TssCalculatorService` reais.
- [ ] 4.3 Teste de composição: `resolverPlano` com fixture de `PlanoSemanalLlmDtoV2` completa (2+
      treinos) produz `PlanoSemanalLlmDto` que passa por `NormalizacaoDeTreino.validarEstruturaV2`
      (task 6.1) sem erro de shape. **Depende da task 6.1** (ainda não implementada) — fica pendente
      até lá, não bloqueia o restante da seção 4.
      `verify:` teste de composição `SessionResolver` → `validarEstruturaV2`, fixture válida e
      inválida (estrutural).

## 5. (removida — validação de blocos pré-resolução não existe mais; ver task 6)

A versão anterior desta task (`BlocoEstruturaValidator`, pré-resolução) foi removida: validar
estrutura antes do `SessionResolver` rodar exigiria lançar fora do escopo protegido pelo retry
(mesmo BLOCKER da task 6 original). Toda validação estrutural agora roda pós-resolução (task 6),
dentro de `validar` — o `SessionResolver` (task 4) não valida nada, só resolve aritmeticamente.

## 6. Validação v2, pós-resolução — dentro de `validar`, dispatch por família, sem tocar visibilidade

- [x] 4.3 (movida para cá — dependia desta seção) Teste de composição `SessionResolver` →
      `validarEstruturaV2`: fixture válida (12 etapas, tiros==recuperações) não lança; fixture com
      estrutura insuficiente (1 bloco `PRINCIPAL` sem aquec/desaq) lança. `NormalizacaoDeTreinoValidarEstruturaV2Test$ComposicaoComSessionResolver`,
      2/2 verde.
- [x] 6.1 `NormalizacaoDeTreino.validarEstruturaV2(TreinoPlanejadoLlmDto, ContextoNormalizacao)` —
      package-private, despacha por `FamiliaTreino.de(treino.tipoTreino())` (enum real:
      `INTERVALADO_TIRO`, `FARTLEK`, `TRES_ETAPAS`, `PADRAO` — `FamiliaTreino.java:12-24`) para os
      gates corretos, chamando os métodos `private` existentes **internamente** (sem mudar
      visibilidade de nenhum):
      - `INTERVALADO_TIRO` → `gateExistencia`, `gateContagem`, `gatePresencaAquecDesaq`,
        `gateOrdemAquecDesaq`, **`gateBalanceamento`**, `gateSequencia`, `validarDuracaoTiros`.
        **Simplificação achada durante a implementação**: a versão anterior desta task propunha um
        gate novo (`gateRecuperacaoEntreTiros`) para fechar o MAJOR da 5ª rodada (intervalado sem
        recuperação nenhuma), assumindo que `gateBalanceamento` "valida proporção de texto livre,
        irrelevante em v2" sem ter lido o código. Lendo `gateBalanceamento` de verdade
        (`NormalizacaoDeTreino.java:234-245`): ele compara `|count(INTERVALADO) - count(RECUPERACAO)|
        > 1` — uma contagem simples sobre `tipoEtapa`, igualmente válida para etapas resolvidas
        deterministicamente. **Reusar em vez de escrever gate novo** — 6 tiros/0 recuperações
        (contraexemplo do pré-mortem) já falha `|6-0|=6 > 1`. Nenhum gate novo foi necessário.
      - `TRES_ETAPAS` → `validarEstrutura3Etapas(treino, treino.tipoTreino(), ctx.atletaId(),
        validarOrdem)`, `validarOrdem = !"LONGO".equals(treino.tipoTreino())` (assinatura real
        confirmada: `NormalizacaoDeTreino.java:381`, 4 parâmetros).
      - `FARTLEK`, `PADRAO` → sem estrutura obrigatória (mesmo comportamento de v1 — task 0.3
        segue aberta só para confirmação formal de produto, não bloqueia).
      Lança `LLMException` — mesmo contrato que os gates já lançam em v1.
      `verify:` `NormalizacaoDeTreinoValidarEstruturaV2Test`, 15/15 verde: INTERVALADO válido (com
      recuperação em todo tiro) passa; 6 tiros sem NENHUMA recuperação → `gateBalanceamento`
      rejeita; <6 etapas → `gateContagem` rejeita; tiro de 11 min → `validarDuracaoTiros` rejeita;
      REGENERATIVO válido de 3 etapas passa; REGENERATIVO fora de ordem rejeita; LONGO fora de
      ordem passa (`validarOrdem=false`); contagem errada de `TRES_ETAPAS` rejeita; FACIL/FARTLEK
      sem estrutura nunca lançam; 2 testes de composição com `SessionResolver` real. Suítes
      `NormalizacaoDeTreinoTest`/`FamiliaTreinoTest` (golden de ordem), 44/44 verde sem alteração de
      assertions — nenhuma receita de v1 muda.
- [x] 6.2 `NormalizacaoDeTreino.validarTssSlotV2(TreinoPlanejadoLlmDto, SessionSlot, ContextoNormalizacao)`
      — package-private, compara `treino.tssPlanejado()` (já calculado pelo `SessionResolver`, task
      4.2, não recalculado aqui) contra `SessionSlot.targetTss()`; `targetTss<=0` (sem alvo do
      skeleton) não compara, não lança; desvio > ±20% lança `LLMException` com a diferença exata.
      `verify:` `NormalizacaoDeTreinoValidarEstruturaV2Test$ValidarTssSlotV2`, 3/3 verde — dentro da
      faixa passa, fora rejeita com mensagem, slot sem alvo não lança.
- [x] 6.3 `PlanoLlmValidator.validarPlanoV2(PlanoSemanalLlmDto, Atleta, UUID, WeekPlanSkeleton)` —
      público, compõe `validarEstruturaV2` (6.1) + `validarTssSlotV2` (6.2) por treino (reusa
      `contexto()` privado existente para `ContextoNormalizacao`; resolve o `SessionSlot` do dia via
      novo helper privado `encontrarSlot`, usando `Utils.converterParaDayOfWeek`), substitui
      `validarENormalizarPlanoGerado` no caminho v2 dentro de `validar` (task 9.2) — retry-aware,
      igual v1 (design.md Decisão 3, ordem final).
      `verify:` `PlanoLlmValidatorTest$ValidarPlanoV2` (task 9.2) + `IaServiceImplGerarChamadaLlmV2Test`
      (turno de reparo) — violação estrutural v2 aciona o mesmo mecanismo de retry (F3) que v1.

## 7. Prompt v2

- [x] 7.1 `src/main/resources/prompts/plano-treino-system-v2.txt` novo (não sobrescreve v1) —
      preserva as seções de coaching (análise pré-planejamento, priorização por objetivo, matriz de
      variabilidade, regras de distribuição/progressão), remove o bloco de fórmulas de expansão
      etapa-por-etapa (`plano-treino-system.txt:183-337`, intervalado e fartlek) e os parâmetros de
      intensidade que a LLM não calcula mais (`intensidadePlanejada`/`percepcaoEsforcoEsperada`),
      substitui por uma seção "ESTRUTURA DO TREINO EM BLOCOS" descrevendo o schema (`papel`,
      `repeticoes`, `quantidadePorRepeticao`, `unidade`, `zona`, `recuperacao`) com 2 exemplos JSON
      completos. Enums/campos obrigatórios/checklist final atualizados para blocos. O bloco de
      skeleton do dia (`formatarBlocoSlots`) não muda — fora deste arquivo, injetado separadamente
      pelo `PlanoTreinoPromptBuilder` (igual em v1 e v2).
      `verify:` `PromptHashCalculatorTest$SchemaV2`, 2/2 novos verde (6/6 no arquivo) — v2 carrega
      via `PromptHashCalculator`/`ClassPathResource` sem afetar o hash de v1 (golden de v1
      continua batendo, `ArquivoDoGolden` inalterado); v2 contém o vocabulário de blocos e não
      contém as fórmulas de expansão de v1.

## 8. Versionamento de schema

- [x] 8.1 `SchemaVersion.V2 = "schema-v2"` — constante nova ao lado de `CURRENT` (não enum: mesmo
      padrão de `PromptVersion`/`PlannerVersion`, string simples). `PlanoLlmLedgerHook.Sessao` ganha
      overload `chamar(int tentativa, String schemaVersion, Supplier<T> chamada)` — o `chamar(int,
      Supplier)` existente (todo o caminho v1) delega para ele com `SchemaVersion.CURRENT`, **sem
      mudar assinatura nem comportamento**. O hash do prompt também varia por schema: `prompt_hash`
      resolve `promptHashV2.valor()` quando `schemaVersion=V2`, senão `promptHash.valor()` (v1,
      inalterado). `PromptHashCalculatorV2` novo (`ai/ledger/`) — gêmeo de `PromptHashCalculator`
      dedicado ao template v2, **sem tocar a classe/constructor de v1** (evita quebrar os testes
      existentes que a constroem direto com 2 args).
      `verify:` `PlanoLlmLedgerHookTest`, 14/14 (17/17 com `PlanoLlmLedgerHookAdvisorIntegrationTest`)
      — teste novo confirma `chamar(1, SchemaVersion.V2, ...)` grava `schema_version="schema-v2"` e
      `prompt_hash` de `promptHashV2`, sem tocar `promptHash` (v1); suíte v1 existente 100% verde
      sem alteração de assertions (`chamar(int, Supplier)` continua gravando `"schema-v1"`).

## 9. Wiring — `IaServiceImpl.gerarChamadaLlm`

- [x] 9.1 `usaV2 = schemaVersionResolver.usaV2(TenantContext.getRequiredTenantId())` resolvido uma
      vez no início de `geraPlanoSemanalAvancado` (allowlist de tenant, task 10) — não recalculado a
      cada retry; `schemaVersion` (`SchemaVersion.CURRENT`/`V2`) derivado junto.
      `promptBuilder.buildOptimizedPrompt(..., usaV2)` (novo overload, task 7) seleciona o template.
- [x] 9.2 `gerarChamadaLlmV2` novo (branch v2 de `gerarChamadaLlm`, função `gerar` — roda **fora** do
      escopo de retry): usa `llmJsonSchemaBuilder.v2JsonSchemaOptions()` na chamada, parseia a
      resposta em `PlanoSemanalLlmDtoV2` (`parsearPlanoV2`, espelho de `parsearPlano` — erro de
      parse continua sem retry), roda **só** `SessionResolver.resolverPlano` (task 4, sem validar,
      `AthleteZones` montado de `atleta.getFcMaximaCalculada()/getFcLimiarCalculada()/getPaceLimiar()`)
      — devolve `ChamadaLlm` com o `PlanoSemanalLlmDto` (v1-shaped) resultante; `jsonBruto` continua
      sendo o texto v2 cru (usado no turno de reparo como `AssistantMessage`, agnóstico a schema).
      Dentro de `validar` (protegida pelo retry): branch v2 chama
      `planoLlmValidator.validarPlanoV2(p, atleta, atleta.getId(), skeleton)` (task 6.3, novo método
      em `PlanoLlmValidator` — reusa `contexto()` privado existente, compõe `validarEstruturaV2` +
      `validarTssSlotV2` por treino, resolve o `SessionSlot` do dia via `Utils.converterParaDayOfWeek`)
      em vez de `validarENormalizarPlanoGerado`, depois `aplicarComplianceEstagio1` (nível de dia,
      inalterado) igual v1.
      `verify:` `IaServiceImplGerarChamadaLlmV2Test`, 5/5 verde — `SessionResolver` real (compõe
      `ZoneResolver`/`TssCalculatorService` reais) resolve um plano v2 completo (blocos) para o
      shape v1 (3 etapas, `duracaoMin`/`tssPlanejado`/`fcAlvo` calculados); usa
      `v2JsonSchemaOptions()`; `content()` nulo → entidade nula sem lançar; JSON malformado → lança
      sem retry; turno de reparo (2ª tentativa) acrescenta `assistant(jsonAnterior v2)` +
      `user(correção)`, `system`/`user` originais idênticos à 1ª. `PlanoLlmValidatorTest$ValidarPlanoV2`,
      4/4 verde — plano válido sem skeleton passa; 2 treinos com estrutura inválida → 2 `Violacao`;
      TSS fora/dentro de ±20% do slot rejeita/passa.
- [x] 9.3 Branch v1 inalterado — `IaServiceImplComplianceEstagio1Test`/`IaServiceImplGerarChamadaLlmTest`
      (F3) precisaram só do novo arg no construtor (2 mocks a mais), nenhuma assertion mudou;
      assinaturas públicas de `geraPlanoSemanalAvancado`, `PlanoResilienceService.ChamadaLlm`,
      `TreinoMapper` não mudam.
      `verify:` 153 testes (todo o pacote `services/helper` + `services/impl` afetado) + 3
      (`PlanoLlmLedgerHookAdvisorIntegrationTest`) — 100% verde.

## 10. Flag — allowlist de tenant

- [x] 10.1 `services/helper/SchemaVersionResolver.java` — `app.llm.plano.schema-version-v2-tenants`
      (CSV de UUIDs, default vazio) parseado como `Set<UUID>` no construtor (`@Value`);
      `usaV2(UUID tenantId)` resolve contra o set. Token de CSV inválido é logado e ignorado
      (`log.warn`), não derruba o startup — só os tokens válidos entram no set.
      `verify:` `SchemaVersionResolverTest`, 6/6 verde — tenant no CSV → v2; fora → v1; CSV vazio
      (default) → todos v1; múltiplos tenants com espaços resolvem todos; `tenantId` nulo nunca usa
      v2 sem lançar; CSV com token inválido não derruba o construtor e mantém os tokens válidos.

## 11. Arquivamento de changes supersedidas

- [ ] 11.1 Confirmar (`git branch -a`, PRs abertos nos repos afetados) que
      `validate-interval-workout-standards` e `fix-cold-start-calibration-plan-generation` não têm
      trabalho em andamento antes de mover.
- [ ] 11.2 Mover as duas para `changes/archive/2026-XX/` com nota "superseded by
      semantic-session-schema" no topo do `proposal.md` de cada uma.
      `verify:` `openspec/changes/` não lista mais as duas pastas; `archive/` lista as duas com a
      nota.

## 12. Validação final

- [ ] 12.1 `./mvnw clean verify` verde (Surefire + Failsafe).
- [ ] 12.2 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer + Codex adversarial) —
      atenção a multi-tenancy da allowlist (task 10), dispatch por família em `validarEstruturaV2`
      (task 6.1, confirmar `gateBalanceamento` omitido é seguro), não-regressão do caminho v1
      (tasks 3.2, 9.3), retry funcionando para violação estrutural v2 (task 6.3).
- [ ] 12.3 Piloto: 2 tenants reais na allowlist por 2 semanas (fora desta sessão — requer
      produção/staging). Gate quantitativo: retry ≤ 10%, violações estruturais ≤ 5%, aceitação sem
      edição ≥ v1 + 10 p.p., p50 ≤ 20s (`tb_llm_call` filtrado por `schema_version`). Gate
      qualitativo: feedback direto dos 2 coaches sobre percepção de planos genéricos/destoantes.
      Registrar também % de treinos do piloto que caíram no fallback de `ZoneResolver` por falta de
      FC cadastrada (design.md, riscos).
- [ ] 12.4 `tasks.md` atualizado; `SPRINTS.md` (F4) marcado; arquivar via `/done` após merge.
