## R. Revisão dos achados — antes de qualquer implementação

Relatório: [review.md](review.md), avaliação de 2026-09-05, achados IA-01 a IA-10. **Reverificado
contra `develop` real em 2026-09-14, em duas rodadas de DoR** (spec-reviewer + Codex adversarial —
a 2ª achou 3 fixes incompletos na 1ª versão desta tabela, ver histórico no proposal.md). Disposição
final completa na tabela do [proposal.md](proposal.md) ("Decisão de escopo").

- [x] R.1 Revisado achado a achado contra `IaServiceImpl.java`/`PlanoServiceImpl.java`/
      `PlanoEstruturaReparador.java` em `develop` (2026-09-14, 2 rodadas): IA-01 (BLOCKER) já
      resolvido; IA-02 confirmado em duas frentes (INTERVALADO e RECUPERACAO do fartlek); IA-03,
      IA-05, IA-10 confirmados presentes, reproduzidos onde aplicável; IA-04 confirmado mais
      abrangente que a 1ª análise (afeta LONGO também, via `PlanoEstruturaReparador` tratando os
      4 tipos "3 etapas" identicamente); IA-06 confirmado como pré-requisito funcional de IA-04
      (não achado independente); IA-07 é escopo já coberto pela seção 1; IA-08 sem reprodução,
      risco por inspeção; IA-09 é o próprio objetivo da change.
- [x] R.2 Decisão (usuário, 2026-09-14): **corrigir IA-02/03/04/05/10 dentro da extração de cada
      colaborador afetado, e IA-06 como fix isolado de 3 linhas**, tudo na mesma change — não
      separar em change própria. Só IA-08 fica **adiado** (exige decisão de política de
      concorrência própria, sem bug reproduzido).
- [x] R.3 Sem impacto em schema LLM novo (as correções mudam validação/normalização
      pós-resposta, não os campos do schema); sem mudança de vínculo prova/tenant (IA-01 já
      resolvido antes desta change); contrato HTTP 422/503 **melhora** com o fix de IA-06 (estrutura
      inválida passa a chegar como 422, não 503). `proposal.md` atualizado com Tamanho L · Trilha
      Full, tabela de decisão por achado, métrica de sucesso e rollback.
- [x] R.4 Estratégia de caracterização (seção 1): golden sobre `geraPlanoSemanalAvancado`
      cobrindo os cenários que NÃO mudam (congelados como estão) e testes TDD dedicados por
      correção (seções 3-6) que capturam o comportamento CORRETO antes de mover o código —
      vermelho evidencia o bug atual, verde prova a correção. Nenhum defeito conhecido é
      congelado como golden.
- [x] R.5 Revisão concluída (2 rodadas de DoR), implementação autorizada com o escopo final da
      tabela do proposal.md. `./mvnw clean verify` (não só `test`) é a validação final (tarefa 7.2).

## Pré-requisitos

- [x] 0.1 `debito-tecnico-camada-ia` já está mergeada em `develop` (confirmado em 2026-09-14 via
      SPRINTS.md — arquivada). Sem conflito de sequenciamento a gerenciar.
- [ ] 0.2 Criar branch `feature/refactor-iaservice-decomposition` em `apps/menthoros-backend`

## 1. Rede de segurança (caracterização)

- [x] 1.1 `IaServiceImplCaracterizacaoTest` — testa `validarENormalizarPlanoGerado` (não
      `geraPlanoSemanalAvancado`; o fluxo público exige o `ChatClient` fluente do Spring AI,
      inviável em unit test, mesmo padrão já usado por `IaServiceImplComplianceEstagio1Test`) via
      reflexão, 3 cenários (intervalado, longo, regenerativo) parametrizados, atleta sem FC
      cadastrada (fora do escopo desta rede — coberto isoladamente na seção 4). Cenários de
      fartlek/parser-de-repetições/lote ficam fora do golden estático — TDD dedicado nas seções 3-6.
- [x] 1.2 `./mvnw clean test` verde (3/3 na suíte nova; 1131/1131 em `services.impl` — 1 falha
      transitória de OAuth não relacionada, não reproduziu numa 2ª rodada).

## 2. Extrair construção do JSON Schema

- [x] 2.1 Criado `LlmJsonSchemaBuilder` (`services/prompt`) com `buildSchemaTightInlineOrDefs` + `enforceAllRequired`, `putMin`, `putMax`, `putEnum` — movidos verbatim de `IaServiceImpl`.
- [x] 2.2 `IaServiceImpl` injeta `LlmJsonSchemaBuilder`; o único call site real de
      `defaultJsonSchemaOptions()` passa a `llmJsonSchemaBuilder.defaultJsonSchemaOptions()`.
      `IaServiceImplSchemaTest` removido (conteúdo migrado pro teste do novo colaborador); os
      outros 6 testes que instanciam `IaServiceImpl` diretamente ganharam
      `new LlmJsonSchemaBuilder()` no construtor.
- [x] 2.3 `LlmJsonSchemaBuilderTest` novo (TDD vermelho→verde): as 3 asserções que existiam em
      `IaServiceImplSchemaTest` (provaId/descricao/zonaAlvo fora do schema, campos reais presentes,
      CA10 teto de treinos) + 1 nova (`defaultJsonSchemaOptions` monta o `ResponseFormat`).
- [x] 2.4 `./mvnw clean test`: 1216/1216 verdes em `services.impl` + `services.prompt` (nenhuma
      regressão nos 6 testes que dependiam da assinatura antiga do construtor).

## 3. Extrair normalização de treino (intervalado/etapas) — inclui fix IA-03

- [x] 3.1 **TDD vermelho (IA-03):** `IaServiceImplRepeticoesPatternTest` (depois migrado pro
      colaborador — ver 3.4) com os casos do relatório: `"5 x 10 min forte + 2 min leve"` (não
      deve casar como padrão de distância) e `"4x1.5km"` (deve extrair `1.5`, não `1`) —
      confirmado vermelho (2/4 falhas) antes do fix.
- [x] 3.2 **Fix IA-03 — regex verificada isoladamente:** `REPETICOES_PATTERN` trocou o grupo do
      número por **atômico**: `(\d{1,2})\s*[xX×]\s*(?>(\d+(?:\.\d+)?))(?!\s*min)\s*(m|km)?` —
      testado (`javac`/`java` isolado) contra os 5 casos: os 2 quebrados corrigidos, os 3 que já
      funcionavam (`6x400m`, `8-12× 400m`, `10-15× 200m`) preservados.
- [x] 3.3 Criado `TreinoNormalizador` (`services/helper`) com `normalizarTreinoIntervalado`,
      `expandirEtapasAgregadas`, `reordenarEtapas`, `reconciliarDistanciaComEtapas`,
      `corrigirDistanciasEtapasTemporais`, `garantirDistanciaContinuo`,
      `detectarRepeticoesNaDescricao`, `extrairDistanciaUnitariaDaDescricao`,
      `detectarFartlekNaDescricao`, `extrairZonaDaDescricao`, `bpmDaZona`, `zonaParaFc`,
      `recalcularDuracaoTreino`, `somarDuracoesMin` e os helpers de distribuição de distância
      (`clampDistanciaPorTipo`, `distribuirDeltaPorTipo`, `maxTirosPorNivel`,
      `adicionarTiroERecuperacao`) — todos movidos verbatim (já com o fix do IA-03).
      `bpmDaZona`/`zonaParaFc`/`adicionarTiroERecuperacao` ficaram package-private (testáveis
      direto, sem reflexão). `IaServiceImpl` injeta o colaborador e delega nos 7 call sites reais.
- [x] 3.4 Testes unitários migrados/criados no pacote `services/helper` (sem reflexão, chamando o
      colaborador direto): `TreinoNormalizadorRepeticoesPatternTest` (IA-03),
      `TreinoNormalizadorFartlekExpansaoTest`, `TreinoNormalizadorIntervaladoTest`,
      `TreinoNormalizadorDistanciaContinuoTest`, `TreinoNormalizadorZonaHelpersTest`,
      `TreinoNormalizadorCorrigirDistanciasTest` — substituem 5 arquivos antigos de
      `services/impl` que reflexionavam sobre métodos privados de `IaServiceImpl`.
- [x] 3.5 `./mvnw clean test`: 3524/3524 verde (módulo inteiro), 1 skip pré-existente.

## 4. Extrair validação de FC por zona — inclui fix IA-02

- [x] 4.1 **TDD vermelho (IA-02):** `IaServiceImplZonaEsperadaFcTest` (por reflexão, provisório) —
      `zonaEsperadaFC("INTERVALADO", "FARTLEK", zonas)` esperando a faixa de fartlek (Z2-Z4, mesma
      regra de `zonaParaEtapaPrincipal` pra `tipoTreino=FARTLEK`), não Z4-Z5 fixo — confirmado
      vermelho antes do fix.
- [x] 4.2 **TDD vermelho (IA-02b, achado do Codex na 2ª rodada de DoR):** mesmo arquivo —
      `zonaEsperadaFC("RECUPERACAO", "FARTLEK", zonas)` esperando faixa Z1-Z2 (a recuperação do
      fartlek já é computada com zona explícita em `expandirEtapasAgregadas` via
      `zonaParaFc(fp.zonaRecuperacao(), zonas)`, ex. Z2) — confirmado vermelho (força Z1 fixo)
      antes do fix. 2/4 testes vermelhos no total (IA-02a + IA-02b), 2 regressões já verdes.
- [x] 4.3 **Fix IA-02 (completo — INTERVALADO + RECUPERACAO):** `zonaEsperadaFC` passou a resolver
      a zona esperada de etapas `tipoEtapa=INTERVALADO` **e** `tipoEtapa=RECUPERACAO` também
      considerando `tipoTreino`: `INTERVALADO` via `zonaParaEtapaPrincipal(tipoTreino, zonasFC)`
      (mesma função já usada para `PRINCIPAL`); `RECUPERACAO` continua Z1 pra todo `tipoTreino`
      **exceto** `FARTLEK`, que aceita Z1-Z2. Confirmado: treino `tipoTreino=INTERVALADO` de
      verdade continua exigindo Z4-Z5 na etapa `INTERVALADO`; fartlek passa a exigir Z2-Z4 na
      aceleração e Z1-Z2 na recuperação. Achado um teste pré-existente
      (`intervaladoEtapa_sempreZ4Z5`) que encodava o bug como comportamento esperado — corrigido e
      renomeado (`intervaladoEtapa_emTreinoIntervalado_z4z5`, agora usa `tipoTreino=INTERVALADO`).
- [x] 4.4 Criado `EtapaFcValidator` (`services/helper`) com `validarFcEtapa` (público),
      `zonaEsperadaFC`, `zonaParaEtapaPrincipal`, `parseFcRange` (package-private, testáveis sem
      reflexão) — movidos verbatim de `IaServiceImpl` (já com o fix IA-02). `bpmDaZona`/
      `zonaParaFc` **não** entraram aqui — já vivem em `TreinoNormalizador` desde a seção 3, de
      onde são consumidos pela expansão de fartlek; `EtapaFcValidator` não precisa deles.
      `IaServiceImpl` injeta o colaborador e delega no único call site real (dentro de
      `validarENormalizarPlanoGerado`).
- [x] 4.5 `EtapaFcValidatorTest` novo (`services/helper`, sem reflexão): consolida os testes de
      `parseFcRange`/`zonaEsperadaFC`/`zonaParaEtapaPrincipal`/`validarFcEtapa` antes espalhados em
      `IaServiceImplFcValidationTest` (nested `ParseFcRange`/`ValidarFcEtapa`/
      `ZonaEsperadaFcPorTipoTreino`/`BypassFcCorrigido`) + os 4 casos de
      `IaServiceImplZonaEsperadaFcTest` (IA-02a/b + 2 regressões) — 30 casos no total, cobrindo BVA
      nas bordas da zona. `IaServiceImplFcValidationTest` ficou só com `Estrutura3Etapas`
      (território da seção 5). `IaServiceImplZonaEsperadaFcTest` removido (conteúdo migrado).
- [x] 4.6 `./mvnw clean test`: 3526/3526 verde (módulo inteiro).

## 5. Extrair validadores por tipo de treino + distribuição de carga — inclui fix IA-04, IA-05, IA-06

- [x] 5.1 **TDD vermelho (IA-04):** dois testes de `validarEstrutura3Etapas` (então ainda em
      `IaServiceImpl`) com `AQUECIMENTO → RECUPERACAO → DESAQUECIMENTO` (etapa central que não é
      `PRINCIPAL`) esperando `LLMException` — um para `validarOrdem=true` (REGENERATIVO) e um para
      `validarOrdem=false` (LONGO, achado do Codex na 2ª rodada: o 1º fix só cobria
      `validarOrdem=true`) — confirmado vermelho (2/6 falhas) antes do fix.
- [x] 5.2 **Fix IA-04 (completo — inclui LONGO):** a checagem de que `etapas.get(1).tipoEtapa()`
      é `PRINCIPAL` passou a ser **incondicional**, independente do parâmetro `validarOrdem` —
      `PlanoEstruturaReparador` já trata os 4 tipos "3 etapas" (REGENERATIVO/CONTINUO/TEMPO_RUN/
      LONGO) identicamente (`TIPOS_3_ETAPAS`), sem razão de domínio pra LONGO ser exceção.
      `validarOrdem` continua controlando só a checagem de posição 0/2 (AQUECIMENTO/DESAQUECIMENTO).
      Teste pré-existente `longoSoContagem` (encodava a ausência da checagem) renomeado/ajustado
      pra `longoIgnoraOrdemDeAquecDesaqMasExigeMeioPrincipal`, com etapa central PRINCIPAL.
- [x] 5.3 **TDD vermelho (IA-05):** 3 testes em `TreinoNormalizadorIntervaladoTest` (nested
      `DuracaoConsistenteComRitmoAlvo`) cobrindo `clampDistanciaPorTipo` (AQUECIMENTO clamped de
      3.0→2.0km, ritmoAlvo="5:00-5:00/km", duracaoMin=99 deliberadamente errado) e
      `distribuirDeltaPorTipo` (tiros crescendo 0.8→0.9km, ritmoAlvo="4:00-4:00/km", duracaoMin=1
      deliberadamente errado) — confirmado vermelho (2/3 falhas; a 3ª é a regressão sem ritmoAlvo,
      que já passava).
- [x] 5.4 **Fix IA-05:** `TreinoNormalizador` passou a injetar `PaceValidator` (constructor
      explícito, novo — antes implícito sem-arg) e ganhou `recalcularDuracaoDePace(ritmoAlvo,
      distanciaKm, duracaoMinOriginal)`, chamado por `clampDistanciaPorTipo` e
      `distribuirDeltaPorTipo` sempre que a etapa muda de `distanciaKm`: com `ritmoAlvo` presente,
      `duracaoMin = round(distanciaKm × paceMedio(ritmoAlvo))` via
      `paceValidator.calcularPaceMedia`; sem `ritmoAlvo`, `duracaoMin` original é preservado.
      `validarTrianguloPaceDuracaoDistancia` mantida como rede de segurança (`warn`) inalterada.
      9 arquivos de teste que construíam `TreinoNormalizador`/`IaServiceImpl` diretamente ganharam
      `new PaceValidator()` no construtor (drift de assinatura, mesmo padrão das seções 2-4).
- [x] 5.5 **Fix IA-06 (fora da decomposição, em `PlanoServiceImpl`):** adicionado
      `catch (DomainRuleViolationException e) { throw e; }` em `PlanoServiceImpl.gerarPlanoSemanal`
      (método privado), antes do `catch (Exception e)` genérico que convertia a exceção em
      `LLMException` — espelha o catch já existente no método público `gerarPlanoTreino`. Sem esse
      fix, o `DomainRuleViolationException` que `PlanoResilienceService.gerarComResiliencia` lança
      ao esgotar o orçamento de retries (ex.: violações repetidas do IA-04) chegava ao treinador
      como 503 (indisponibilidade) em vez de 422 (erro de domínio).
  - `verify:` `domainRuleViolationDoIaServicePropagaSemVirarLlmException` em `PlanoServiceImplTest`
      — `iaService.geraPlanoSemanalAvancado` lançando `DomainRuleViolationException` chega ao
      chamador de `gerarPlanoTreino` como `DomainRuleViolationException`, não `LLMException`.
      Confirmado vermelho (revertendo o fix via `git stash` temporário) antes de reaplicar.
- [x] 5.6 Criado `PlanoLlmValidator` (`services/helper`) com `validarTreinoIntervalado`,
      `validarEstrutura3Etapas`, `validarTreinoLongo`, `validarRepeticoes`,
      `validarTrianguloPaceDuracaoDistancia`, `validarTreinoRegenerativo`, `validarTreinoContinuo`,
      `validarTreinoTempoRun`, `validarDistribuicaoCargaSemanal` (+ privados
      `contarViolacaoEstrutural`/`diaPorOrdem`) — movidos verbatim de `IaServiceImpl` (já com os
      fixes IA-04/05/06 aplicados). Injeta `MeterRegistry` + `PaceValidator`.
- [x] 5.7 `IaServiceImpl` injeta `PlanoLlmValidator` e `validarENormalizarPlanoGerado` delega nos
      8 call sites reais (nenhuma lógica de validação restante em `IaServiceImpl`).
- [x] 5.8 `PlanoLlmValidatorTest` novo (`services/helper`, sem reflexão): migra os 6 casos de
      `validarEstrutura3Etapas` (incl. os 2 de IA-04) que estavam em `IaServiceImplFcValidationTest`
      — arquivo removido (nada de IaServiceImpl restava nele). `IaServiceImplCaracterizacaoTest`/
      `IaServiceImplComplianceEstagio1Test` ganharam `PlanoLlmValidator` no construtor.
- [x] 5.9 `./mvnw clean test`: 3532/3532 verde (módulo inteiro).

## 6. Reduzir IaServiceImpl a orquestrador — inclui fix IA-10

- [ ] 6.1 **Fix IA-10:** `gerarPlanosEmLote` — confirmado sem consumidores em `src/main/java`
      (só a declaração na interface `IaService` e a implementação stub). A geração em lote real
      usa outro caminho (`coach-batch-plan-generation`, virtual threads chamando
      `geraPlanoSemanalAvancado` por atleta). **Remover o método de `IaService`/`IaServiceImpl`**
      (contrato obsoleto, não fallback silencioso) — não criar `UnsupportedOperationException`
      para um método que pode simplesmente não existir.
- [ ] 6.2 Confirmar que `IaServiceImpl` só monta prompt → chama LLM (via `ModelRouter`) → delega validação → retorna DTO
- [ ] 6.3 Conferir LOC bem abaixo de ~400 e nenhum método acima de ~80 linhas (ver CLAUDE.md "Service Size & Decomposition")
- [ ] 6.4 Revisar JavaDoc de idempotência/side effects/tenant nos métodos públicos remanescentes

## 7. Validação final

- [ ] 7.1 `./mvnw clean test` verde (incluindo o golden de caracterização do passo 1)
- [ ] 7.2 `./mvnw verify`
- [ ] 7.3 Diff de comportamento: rodar geração de plano nos cenários do passo 1.1 e confirmar
      saída idêntica ao baseline **exceto** nos 6 cenários de IA-02/03/04/05/06/10, onde a saída
      deve ser a corrigida — documentar as duas listas (idêntico vs. corrigido) no PR.
- [ ] 7.4 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar a change conforme regra do CLAUDE.md raiz
