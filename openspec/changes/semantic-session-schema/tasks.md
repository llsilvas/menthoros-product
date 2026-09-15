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

- [ ] 6.1 Em `NormalizacaoDeTreino.java`: método novo, package-private,
      `validarEstruturaV2(TreinoPlanejadoLlmDto treino, ContextoNormalizacao ctx)` — despacha por
      `FamiliaTreino.de(treino.tipoTreino())` (enum real: `INTERVALADO_TIRO`, `FARTLEK`,
      `TRES_ETAPAS`, `PADRAO` — confirmado em `FamiliaTreino.java:12-24`) para os gates corretos,
      chamando os métodos `private` existentes **internamente** (sem mudar visibilidade de nenhum):
      - `INTERVALADO_TIRO` → `gateExistencia`, `gateContagem`, `gatePresencaAquecDesaq`,
        `gateOrdemAquecDesaq`, `gateSequencia`, `validarDuracaoTiros` (reusado sem mudança — já lê
        `treino.etapas()`, compatível com a saída do `SessionResolver`; achado da 6ª rodada de
        pré-mortem: geração determinística não garante tiro fisiologicamente plausível 0,3-10 min,
        a LLM ainda escolhe `quantidadePorRepeticao`/`unidade` livremente), **mais
        `gateRecuperacaoEntreTiros` (novo, não existe em v1)** — rejeita 2+ etapas `INTERVALADO`
        consecutivas sem `RECUPERACAO` entre elas (fecha o MAJOR da 5ª rodada: `gateBalanceamento`
        de v1 não é reusado por validar proporção de texto livre irrelevante em v2; este gate novo
        fecha o mesmo risco — intervalado sem nenhuma recuperação — direto sobre as etapas
        resolvidas).
      - `TRES_ETAPAS` → `validarEstrutura3Etapas(treino, treino.tipoTreino(), ctx.atletaId(),
        validarOrdem)`, com `validarOrdem = !"LONGO".equals(treino.tipoTreino())` (assinatura real
        confirmada: `NormalizacaoDeTreino.java:381`, 4 parâmetros).
      - `FARTLEK`, `PADRAO` → sem estrutura obrigatória (task 0.3 confirma a matriz).
      Lança `LLMException`/`PlanoNaoConformeException` — mesmo contrato que os gates já lançam em v1.
      `verify:` `NormalizacaoDeTreinoTest` (mesma classe, testes novos) — fixture INTERVALADO válida
      (com recuperação em todo tiro, tiros entre 0,3-10 min) passa; INTERVALADO com um `PRINCIPAL`
      sem recuperação (6 tiros consecutivos) → `gateRecuperacaoEntreTiros` rejeita; INTERVALADO com
      tiro de 11 min → `validarDuracaoTiros` rejeita (fronteiras 0,3/10 min testadas); TRES_ETAPAS
      válido de 3 etapas passa (não é mais rejeitado pelo gate de mínimo 6, que só roda para
      `INTERVALADO_TIRO` agora); LONGO sem ordem AQUEC/DESAQ passa (`validarOrdem=false`); FARTLEK/
      PADRAO sem estrutura passa sempre. Suíte `FamiliaTreinoTest` (golden de ordem) 100% verde sem
      alteração de assertions — nenhuma receita de v1 muda.
- [ ] 6.2 Checagem de TSS do slot: recebe `SessionSlot.targetTss` (já existe, threadado via
      `SkeletonPrePrompt`) e `tssPlanejado` já calculado pelo `SessionResolver` (task 4.2, não
      recalculado aqui); roda **depois** de `validarEstruturaV2` (task 6.1) — só se a estrutura
      passou; violação se desvio > ±20%.
      `verify:` teste com TSS dentro de ±20% → passa; fora → violação com a diferença exata na
      mensagem; estrutura inválida impede a checagem de TSS de rodar (ordem testada explicitamente).
- [ ] 6.3 Compor `validarEstruturaV2` (6.1) + checagem de TSS (6.2) num método público que
      substitui/complementa `validarENormalizarPlanoGerado` no caminho v2, chamado dentro de
      `validar` (a função passada para `PlanoResilienceService.gerarComResiliencia`) — retry-aware,
      igual v1 (design.md Decisão 3, ordem final).
      `verify:` teste de integração — 1ª tentativa v2 com violação estrutural aciona o turno de
      reparo (F3) exatamente como v1 aciona hoje (mesmo mecanismo, `AssistantMessage` com o JSON
      bruto v2 + `Violacao`); corrige o BLOCKER "validação fora do retry" da 4ª rodada.

## 7. Prompt v2

- [ ] 7.1 `src/main/resources/prompts/plano-treino-system-v2.txt` novo (não sobrescreve v1) —
      remove o bloco de fórmulas de contagem/recuperação (`plano-treino-system.txt:183-337`),
      substitui por instruções sobre o schema de blocos. O bloco de skeleton do dia
      (`formatarBlocoSlots`) não muda — igual em v1 e v2.
      `verify:` teste confirma que v2 carrega o arquivo novo e v1 continua carregando o de sempre —
      sem regressão de hash em v1 (`PromptHashCalculator`).

## 8. Versionamento de schema

- [ ] 8.1 `SchemaVersion` ganha um segundo valor (`"schema-v2"`) — enum ou equivalente.
      `PlanoLlmLedgerHook.Sessao.chamar` (`:67`) recebe o valor resolvido em vez de
      `SchemaVersion.CURRENT` fixo.
      `verify:` teste do ponto de registro do ledger confirma `schema_version = "schema-v1"` no
      caminho v1 (sem regressão) e `"schema-v2"` no caminho v2.

## 9. Wiring — `IaServiceImpl.gerarChamadaLlm`

- [ ] 9.1 `usaV2` resolvido uma vez no início de `geraPlanoSemanalAvancado` (allowlist de tenant,
      task 10) — não recalculado a cada retry.
- [ ] 9.2 Dentro de `gerarChamadaLlm` (função `gerar`, roda **fora** do escopo de retry): branch v2
      usa o schema v2 (task 2) na chamada, parseia a resposta em `PlanoSemanalLlmDtoV2` (novo
      `parsearPlanoV2`, espelho de `parsearPlano` — erro de parse continua sem retry, mesmo
      comportamento de v1), roda **só** `SessionResolver.resolverPlano` (task 4, sem validar) —
      devolve `ChamadaLlm` com o `PlanoSemanalLlmDto` (v1-shaped) resultante. Dentro da função
      `validar` (passada para `gerarComResiliencia`, protegida pelo retry): branch v2 chama
      `validarEstruturaV2` + checagem de TSS (task 6.3) em vez de `validarENormalizarPlanoGerado`,
      depois `aplicarComplianceEstagio1` (nível de dia, inalterado) igual v1.
      `verify:` teste de integração (fixtures, sem LLM real) — plano v2 completo, do
      `PlanoSemanalLlmDtoV2` (mock) até o `TreinoPlanejadoOutputDto` final, mesmo shape que um plano
      v1 equivalente produziria; violação estrutural na 1ª tentativa aciona o turno de reparo (F3).
- [ ] 9.3 Branch v1 inalterado — nenhum teste de `IaServiceImpl` existente muda de expectativa;
      assinaturas públicas de `geraPlanoSemanalAvancado`, `PlanoResilienceService.ChamadaLlm`,
      `TreinoMapper` não mudam.
      `verify:` suíte de `IaServiceImplTest`/`IaServiceImplGerarChamadaLlmTest` (F3) 100% verde sem
      alteração de assertions.

## 10. Flag — allowlist de tenant

- [ ] 10.1 `app.llm.plano.schema-version-v2-tenants` (CSV de UUIDs, default vazio) — parseado como
      `Set<UUID>`; resolução via `TenantContext.getRequiredTenantId()` contra o set.
      `verify:` teste unitário — tenant no set → v2; fora → v1; set vazio (default) → todos v1; CSV
      inválido não derruba o startup.

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
