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

- [ ] 1.1 Escrever teste de caracterização (golden) para `geraPlanoSemanalAvancado` com 2-3
      cenários representativos (intervalado, longo, regenerativo), fixando o `PlanoSemanalLlmDto`
      de saída — o LLM mockado/stub para tornar a saída determinística. **Não incluir** cenários de
      fartlek/parser-de-repetições/lote no golden estático — esses vão mudar de propósito nas
      seções 3-6 e ganham teste TDD dedicado lá, não aqui.
- [ ] 1.2 Rodar `./mvnw clean test` e confirmar baseline verde

## 2. Extrair construção do JSON Schema

- [ ] 2.1 Criar `LlmJsonSchemaBuilder` com `buildSchemaTightInlineOrDefs` + `enforceAllRequired`, `putMin`, `putMax`, `putEnum`
- [ ] 2.2 `IaServiceImpl` injeta `LlmJsonSchemaBuilder`; `defaultJsonSchemaOptions` passa a delegar
- [ ] 2.3 Teste unitário de `LlmJsonSchemaBuilder` (schema gerado contém required/min/max/enum esperados)
- [ ] 2.4 `./mvnw clean test` verde

## 3. Extrair normalização de treino (intervalado/etapas) — inclui fix IA-03

- [ ] 3.1 **TDD vermelho (IA-03):** escrever teste de `detectarRepeticoesNaDescricao`/
      `extrairDistanciaUnitariaDaDescricao` com os casos reproduzidos do relatório —
      `"5 x 10 min forte + 2 min leve"` (não deve casar como padrão de distância) e `"4x1.5km"`
      (deve extrair `1.5`, não `1`) — confirmar que falha no código atual (prova do bug).
- [ ] 3.2 **Fix IA-03 — regex verificada isoladamente (não é só a ideia, é a regex exata):**
      `REPETICOES_PATTERN` atual é
      `(\d{1,2})\s*[xX×]\s*(\d+)(?!\s*min)\s*(m|km)?` — o problema é que `(\d+)` faz backtrack
      pro dígito errado pra satisfazer o `(?!\s*min)` (ex.: em "10 min", falha com "10" mas passa
      com "1"). Trocar o grupo do número por **atômico**, que não permite esse backtrack:
      `(\d{1,2})\s*[xX×]\s*(?>(\d+(?:\.\d+)?))(?!\s*min)\s*(m|km)?` — testado (`javac`/`java`
      isolado) contra os 5 casos: `"5 x 10 min forte + 2 min leve"` → sem match (correto);
      `"4x1.5km"` → grupo 2 = `"1.5"` (correto, antes extraía `"1"`); `"6x400m"`, `"8-12× 400m"`,
      `"10-15× 200m"` → continuam batendo como antes.
- [ ] 3.3 Mover `normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `reordenarEtapas`, `reconciliarDistanciaComEtapas` e helpers de parsing de descrição (`detectarRepeticoesNaDescricao`, `extrairDistanciaUnitariaDaDescricao`, `detectarFartlekNaDescricao`, `extrairZonaDaDescricao`) — já corrigidos — para um colaborador em `services/helper`
- [ ] 3.4 Teste unitário do normalizador (entrada de etapas agregadas → etapas expandidas/reordenadas esperadas), incluindo os casos IA-03 movidos para o novo colaborador
- [ ] 3.5 `./mvnw clean test` verde

## 4. Extrair validação de FC por zona — inclui fix IA-02

- [ ] 4.1 **TDD vermelho (IA-02):** teste de `zonaEsperadaFC("INTERVALADO", "FARTLEK", zonas)`
      esperando a faixa de fartlek (Z2-Z4, mesma regra de `zonaParaEtapaPrincipal` pra
      `tipoTreino=FARTLEK`), não Z4-Z5 fixo — confirmar que falha no código atual.
- [ ] 4.2 **TDD vermelho (IA-02b, achado do Codex na 2ª rodada de DoR):** teste de
      `zonaEsperadaFC("RECUPERACAO", "FARTLEK", zonas)` esperando faixa Z1-Z2 (a recuperação do
      fartlek já é computada com zona explícita em `expandirEtapasAgregadas` via
      `zonaParaFc(fp.zonaRecuperacao(), zonas)`, ex. Z2) — confirmar que falha hoje (força Z1 fixo).
- [ ] 4.3 **Fix IA-02 (completo — INTERVALADO + RECUPERACAO):** `zonaEsperadaFC` passa a resolver
      a zona esperada de etapas `tipoEtapa=INTERVALADO` **e** `tipoEtapa=RECUPERACAO` também
      considerando `tipoTreino`: `INTERVALADO` via `zonaParaEtapaPrincipal(tipoTreino, zonasFC)`
      (mesma função já usada para `PRINCIPAL`); `RECUPERACAO` continua Z1 pra todo `tipoTreino`
      **exceto** `FARTLEK`, que aceita Z1-Z2. Confirmar que um treino `tipoTreino=INTERVALADO` de
      verdade continua exigindo Z4-Z5 na etapa `INTERVALADO`, e que fartlek passa a exigir Z2-Z4 na
      aceleração e Z1-Z2 na recuperação.
- [ ] 4.4 Mover `validarFcEtapa`, `zonaEsperadaFC` (corrigida), `zonaParaEtapaPrincipal`, `parseFcRange`, `bpmDaZona`, `zonaParaFc` para um colaborador (avaliar reuso de `ZonaTreinoService`/`PaceZoneCalculator` já existentes em `services/helper`)
- [ ] 4.5 Teste unitário cobrindo etapa dentro/fora da faixa de FC esperada (BVA nas bordas da zona), incluindo os dois casos IA-02 (fartlek aceleração e recuperação) migrados pro novo colaborador
- [ ] 4.6 `./mvnw clean test` verde

## 5. Extrair validadores por tipo de treino + distribuição de carga — inclui fix IA-04, IA-05, IA-06

- [ ] 5.1 **TDD vermelho (IA-04):** dois testes de `validarEstrutura3Etapas` com
      `AQUECIMENTO → RECUPERACAO → DESAQUECIMENTO` (etapa central que não é `PRINCIPAL`) esperando
      `LLMException` — um para `validarOrdem=true` (REGENERATIVO/CONTINUO/TEMPO_RUN) e **um para
      `validarTreinoLongo` especificamente** (achado do Codex na 2ª rodada: meu 1º fix só cobria
      `validarOrdem=true`, e `validarTreinoLongo` chama com `validarOrdem=false`) — confirmar que
      os dois passam incorretamente hoje.
- [ ] 5.2 **Fix IA-04 (completo — inclui LONGO):** a checagem de que `etapas.get(1).tipoEtapa()`
      é `PRINCIPAL` passa a ser **incondicional**, independente do parâmetro `validarOrdem` —
      `PlanoEstruturaReparador` já trata os 4 tipos "3 etapas" (REGENERATIVO/CONTINUO/TEMPO_RUN/
      LONGO) identicamente (`TIPOS_3_ETAPAS`), sem razão de domínio pra LONGO ser exceção.
      `validarOrdem` continua controlando só a checagem de posição 0/2 (AQUECIMENTO/DESAQUECIMENTO).
- [ ] 5.3 **TDD vermelho (IA-05):** teste de `clampDistanciaPorTipo`/`distribuirDeltaPorTipo` com
      uma etapa que tem `ritmoAlvo` preenchido: after o clamp mudar `distanciaKm`, `duracaoMin`
      deve refletir `distanciaKm ÷ paceMedio(ritmoAlvo)` — hoje a etapa retorna com distância nova
      e duração antiga (inconsistente), o teste deve capturar isso antes do fix.
- [ ] 5.4 **Fix IA-05 — regra decidida (fechava um gap do spec-reviewer, sem decisão executável
      antes):** `ritmoAlvo` é a fonte de verdade quando presente na etapa. Após qualquer ajuste de
      `distanciaKm` em `clampDistanciaPorTipo`/`distribuirDeltaPorTipo`, recalcular
      `duracaoMin = distanciaKm ÷ paceMedio(ritmoAlvo)` (reusar `paceValidator.calcularPaceMedia`,
      já usado por `validarTrianguloPaceDuracaoDistancia`). Se `ritmoAlvo` for `null`, `duracaoMin`
      não é tocado (não há pace pra recalcular a partir dele). Manter
      `validarTrianguloPaceDuracaoDistancia` como rede de segurança (`warn`) para o que escapar.
- [ ] 5.5 **Fix IA-06 (fora da decomposição, em `PlanoServiceImpl` — pré-requisito funcional de
      IA-04):** adicionar `catch (DomainRuleViolationException e) { throw e; }` em
      `PlanoServiceImpl.gerarPlanoSemanal` (método privado), antes do `catch (Exception e)`
      genérico que hoje converte a exceção em `LLMException` — espelha o catch que já existe no
      método público `gerarPlanoTreino`. Sem esse fix, os planos que IA-04 passa a rejeitar
      corretamente chegariam ao treinador como 503 (indisponibilidade) em vez de 422 (erro de
      domínio).
  - `verify:` teste de `PlanoServiceImpl` confirmando que `DomainRuleViolationException` lançada
      por `iaService.geraPlanoSemanalAvancado` chega ao chamador de `gerarPlanoTreino` como
      `DomainRuleViolationException`, não `LLMException`.
- [ ] 5.6 Criar `PlanoLlmValidator` como orquestrador; mover `validarTreinoIntervalado`, `validarTreinoLongo`, `validarTreinoRegenerativo`, `validarTreinoContinuo`, `validarRepeticoes`, `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal` — já corrigidos
- [ ] 5.7 `validarENormalizarPlanoGerado` passa a delegar a `PlanoLlmValidator`
- [ ] 5.8 Testes unitários por tipo de treino (cada branch de violação dispara o erro esperado; cobertura de exceção conforme o padrão escolhido), incluindo os casos IA-04/IA-05 migrados
- [ ] 5.9 `./mvnw clean test` verde

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
