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
- [ ] 0.4 Ler o ponto exato de cálculo de TSS por treino no código atual (não mapeado ainda) —
      necessário antes da task 4 (`SessionResolver` calcula `tssPlanejado`).
- [ ] 0.5 Calibrar com produto/fisiologia (ou dado histórico de treinos intervalados já registrados)
      a tabela de fatores pace por zona Z3-Z5/LIMIAR (design.md Decisão 6 — hoje só estimada) e o
      lookup zona→RPE de `percepcaoEsforcoEsperada` (design.md Decisão 4). Sem isso, tasks 3 e 4
      usam os valores estimados documentados no design e o piloto (task 12.3) serve de segunda
      camada de validação — não bloqueia início da implementação, mas bloqueia o piloto com
      tenants reais.

## 1. DTOs v2 — família paralela

- [ ] 1.1 `enum Zona { Z1, Z2, Z3, Z4, Z5, LIMIAR }` — novo tipo, só v2.
- [ ] 1.2 `dto/llm/v2/PlanoSemanalLlmDtoV2.java`, `dto/llm/v2/TreinoPlanejadoLlmDtoV2.java`,
      `dto/llm/v2/BlocoDto.java`, `dto/llm/v2/RecuperacaoDto.java` — records. `BlocoDto(papel,
      repeticoes: int, quantidadePorRepeticao: BigDecimal, unidade: MIN/SEG/KM/M, zona: Zona,
      recuperacao: RecuperacaoDto?)`. `RecuperacaoDto(quantidade: BigDecimal, unidade: MIN/SEG/KM/M)`
      — sem `zona` própria (resolve sempre em `Z1`, design.md Decisão 2).
      `verify:` compila; Bean Validation básica (`@NotNull`/`@Min`) onde fizer sentido.

## 2. `LlmJsonSchemaBuilder` v2

- [ ] 2.1 Método novo (mesmo arquivo, mesmo padrão de `buildSchemaTightInlineOrDefs`) refletindo via
      `BeanOutputConverter` sobre `PlanoSemanalLlmDtoV2.class`, com o mesmo pós-processamento manual
      que v1 já tem (min/max, enums, `required` forçado) adaptado aos campos de `BlocoDto`.
      `verify:` teste snapshot/estrutural do schema gerado — confirma que `blocos` é array com
      `minItems` coerente, `zona`/`unidade`/`papel` viram enum no JSON Schema, `required` cobre os
      campos obrigatórios.

## 3. `ZoneResolver` v2

- [ ] 3.1 `services/helper/ZoneResolver.java` (novo arquivo, não mexe em `TreinoNormalizador`):
      `bpm(Zona zona, @Nullable List<ZonaFC> zonas): FaixaFc` (fallback percentual **herdado de v1**,
      `TreinoNormalizador.java:351-355`, cobre Z1-Z5 sem gap). `pace(Zona zona, @Nullable BigDecimal
      paceLimiar): FaixaPace` — fatores **Z1/Z2 herdados de v1** (`FATOR_PACE_Z1=1.35`,
      `FATOR_PACE_Z2=1.20`), **Z3/Z4/Z5/LIMIAR são tabela nova, greenfield** (design.md Decisão 6 —
      valores estimados até a calibração da task 0.5: Z3=1.10, Z4=1.00, Z5=0.92, LIMIAR=1.00).
      `verify:` `ZoneResolverTest` — Z1–Z5, `LIMIAR`, com/sem `paceLimiar`/`zonas` (fallback), sem
      mock (domínio puro).
- [ ] 3.2 Confirmar que `TreinoNormalizador.java` e `PaceValidator.java` não são tocados;
      `NormalizacaoDeTreino.java` só ganha o método novo da task 6.1 (nenhuma visibilidade mudada).
      `verify:` `git diff --stat` restrito ao que as tasks 4.x/6.x preveem.

## 4. `SessionResolver` — domínio puro, roda uma vez por tentativa, dentro de `gerar` (sem validar)

- [ ] 4.1 `record AthleteZones(List<ZonaFC> zonasFc, BigDecimal paceLimiar)` — mapeamento de
      `Atleta`/`ZonaFC` fica no service layer.
- [ ] 4.2 `domain/planner/SessionResolver.java`: `resolverPlano(PlanoSemanalLlmDtoV2 planoV2,
      AthleteZones zonas): PlanoSemanalLlmDto`. Itera `planoV2.treinosPlanejados()`; para cada
      treino, resolve cada `BlocoDto` em `EtapaTreinoLlmDto`(s) via `ZoneResolver` (`repeticoes`
      vira pares tiro+recuperação quando `recuperacao != null`, sempre incluindo a última
      repetição — design.md Decisão 5), depois agrega **todos** os campos de nível-treino que v1
      tem — `duracaoMin`, `distanciaKm`, `fcAlvo`, `ritmoAlvo` (soma/combina etapas, mesmo padrão de
      `NormalizacaoDeTreino.recalcularDuracaoTreino`), **mais** `tssPlanejado` (soma do TSS por
      etapa, fórmula da task 0.4), `intensidadePlanejada` (média ponderada por duração, fator de
      zona da task 0.5), `percepcaoEsforcoEsperada` (lookup zona→RPE, task 0.5) — **nunca deixa
      esses 3 campos nulos/default silenciosos**, achado da 4ª rodada de pré-mortem.
      **`resolverPlano` não valida nada** — não lança para estrutura insuficiente, só produz o
      resultado aritmético possível (design.md Decisão 3, correção do BLOCKER de retry).
      `verify:` `SessionResolverTest` — treino com bloco `repeticoes=1` (sem expansão), `repeticoes=6`
      com `recuperacao` (12 etapas), `repeticoes=6` sem `recuperacao` (6 etapas), cada `unidade`,
      cada `zona` incluindo `LIMIAR`, todos os 7 campos de nível-treino (incl. `tssPlanejado` etc.)
      calculados corretamente — sem mock. Caso `repeticoes` insuficiente para a estrutura mínima:
      **não lança**, só produz um treino com menos etapas (será pego na task 6, não aqui).
- [ ] 4.3 Teste de composição: `resolverPlano` com fixture de `PlanoSemanalLlmDtoV2` completa (2+
      treinos) produz `PlanoSemanalLlmDto` que passa por `NormalizacaoDeTreino.validarEstruturaV2`
      (task 6.1) sem erro de shape.
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
