## R. Revisão dos achados — antes de qualquer implementação

Relatório: [review.md](review.md), avaliação de 2026-09-05, achados IA-01 a IA-10. **Reverificado
contra `develop` real em 2026-09-14** (linhas do relatório original defasadas por commits
posteriores — cada achado foi conferido no código atual, não só nos números de linha antigos).
Disposição completa na tabela do [proposal.md](proposal.md) ("Decisão de escopo").

- [x] R.1 Revisado achado a achado contra `IaServiceImpl.java`/`PlanoServiceImpl.java` em
      `develop` (2026-09-14): IA-01 (BLOCKER) já resolvido (PR #101, `provaId`/`descricao`/
      `zonaAlvo` removidos do schema); IA-02, IA-03, IA-04, IA-05, IA-10 confirmados presentes,
      reproduzidos onde aplicável (regex de IA-03 testado isoladamente); IA-06 confirmado
      presente em forma diferente (moveu para o método privado `PlanoServiceImpl.gerarPlanoSemanal`);
      IA-07 é escopo já coberto pela seção 1; IA-08 sem reprodução, risco por inspeção; IA-09 é o
      próprio objetivo da change.
- [x] R.2 Decisão (usuário, 2026-09-14): **corrigir IA-02/03/04/05/10 dentro da extração de cada
      colaborador afetado**, na mesma change — não separar em change própria. IA-06 fica **fora**
      do escopo (o arquivo é `PlanoServiceImpl`, não `IaServiceImpl` — não faz parte da
      decomposição). IA-08 fica **adiado** (exige decisão de política de concorrência própria).
- [x] R.3 Sem impacto em schema LLM novo (as correções mudam validação/normalização
      pós-resposta, não os campos do schema); sem mudança de vínculo prova/tenant (IA-01 já
      resolvido antes desta change); sem mudança de contrato HTTP 422/503 (IA-06, o único achado
      com esse impacto, ficou fora do escopo). `proposal.md` atualizado com Tamanho L · Trilha Full
      e a tabela de decisão por achado.
- [x] R.4 Estratégia de caracterização (seção 1): golden sobre `geraPlanoSemanalAvancado`
      cobrindo os cenários que NÃO mudam (congelados como estão) e testes TDD dedicados por
      correção (seções 3-6) que capturam o comportamento CORRETO antes de mover o código —
      vermelho evidencia o bug atual, verde prova a correção. Nenhum defeito conhecido é
      congelado como golden.
- [x] R.5 Revisão concluída, implementação autorizada com o escopo da tabela acima.
      `./mvnw clean verify` (não só `test`) é a validação final (tarefa 7.2).

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
- [ ] 3.2 **Fix IA-03:** corrigir `REPETICOES_PATTERN` para não fazer backtrack pro dígito errado
      quando o número completo é seguido de `min` — exigir fronteira de número completa
      (`\b` ou lookahead que rejeite dígito/ponto decimal seguinte) em vez do `(?!\s*min)` atual,
      que só bloqueia a posição do match mais longo, não as tentativas mais curtas por
      backtracking. Confirmar que `"6x400m"` e `"4x1.5km"` continuam corretos.
- [ ] 3.3 Mover `normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `reordenarEtapas`, `reconciliarDistanciaComEtapas` e helpers de parsing de descrição (`detectarRepeticoesNaDescricao`, `extrairDistanciaUnitariaDaDescricao`, `detectarFartlekNaDescricao`, `extrairZonaDaDescricao`) — já corrigidos — para um colaborador em `services/helper`
- [ ] 3.4 Teste unitário do normalizador (entrada de etapas agregadas → etapas expandidas/reordenadas esperadas), incluindo os casos IA-03 movidos para o novo colaborador
- [ ] 3.5 `./mvnw clean test` verde

## 4. Extrair validação de FC por zona — inclui fix IA-02

- [ ] 4.1 **TDD vermelho (IA-02):** teste de `zonaEsperadaFC("INTERVALADO", "FARTLEK", zonas)`
      esperando a faixa de fartlek (Z2-Z4, mesma regra de `zonaParaEtapaPrincipal` pra
      `tipoTreino=FARTLEK`), não Z4-Z5 fixo — confirmar que falha no código atual.
- [ ] 4.2 **Fix IA-02:** `zonaEsperadaFC` passa a resolver a zona esperada de etapas
      `tipoEtapa=INTERVALADO` também via `zonaParaEtapaPrincipal(tipoTreino, zonasFC)` (a mesma
      função já usada para `PRINCIPAL`), em vez do Z4-Z5 fixo que ignora `tipoTreino`. Confirmar
      que um treino `tipoTreino=INTERVALADO` de verdade continua exigindo Z4-Z5 (via
      `zonaParaEtapaPrincipal` para esse tipo) e que fartlek passa a exigir Z2-Z4.
- [ ] 4.3 Mover `validarFcEtapa`, `zonaEsperadaFC` (corrigida), `zonaParaEtapaPrincipal`, `parseFcRange`, `bpmDaZona`, `zonaParaFc` para um colaborador (avaliar reuso de `ZonaTreinoService`/`PaceZoneCalculator` já existentes em `services/helper`)
- [ ] 4.4 Teste unitário cobrindo etapa dentro/fora da faixa de FC esperada (BVA nas bordas da zona), incluindo o caso IA-02 (fartlek) migrado pro novo colaborador
- [ ] 4.5 `./mvnw clean test` verde

## 5. Extrair validadores por tipo de treino + distribuição de carga — inclui fix IA-04 e IA-05

- [ ] 5.1 **TDD vermelho (IA-04):** teste de `validarEstrutura3Etapas` com
      `AQUECIMENTO → RECUPERACAO → DESAQUECIMENTO` (etapa central que não é `PRINCIPAL`) esperando
      `LLMException` — confirmar que passa incorretamente hoje (a validação não olha a etapa do meio).
- [ ] 5.2 **Fix IA-04:** adicionar checagem explícita de que `etapas.get(1).tipoEtapa()` é
      `PRINCIPAL` quando `validarOrdem=true` (mesma flag que já distingue LONGO dos demais).
      Decidir e documentar a regra de LONGO (a spec original só valida contagem — manter assim ou
      unificar é decisão de escopo; **default: manter LONGO só com contagem**, pois já tem
      validação de etapas própria em outro ponto do fluxo — registrar a decisão no commit).
- [ ] 5.3 **TDD vermelho (IA-05):** teste de `clampDistanciaPorTipo`/`distribuirDeltaPorTipo`
      verificando que, ao ajustar `distanciaKm` de uma etapa, `duracaoMin` (ou o par
      pace×distância×duração) permanece consistente — hoje a etapa retorna com distância nova e
      duração/ritmo antigos, o teste deve capturar essa inconsistência antes do fix.
- [ ] 5.4 **Fix IA-05:** após qualquer ajuste de distância em `clampDistanciaPorTipo`/
      `distribuirDeltaPorTipo`, recalcular `duracaoMin` a partir de `ritmoAlvo`/pace da etapa (ou,
      se `ritmoAlvo` for null, deixar `duracaoMin` como fonte de verdade e não mexer nela — decidir
      qual grandeza governa cada etapa, conforme o proposal já recomendava). Manter
      `validarTrianguloPaceDuracaoDistancia` como rede de segurança (`warn`) para o que escapar.
- [ ] 5.5 Criar `PlanoLlmValidator` como orquestrador; mover `validarTreinoIntervalado`, `validarTreinoLongo`, `validarTreinoRegenerativo`, `validarTreinoContinuo`, `validarRepeticoes`, `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal` — já corrigidos
- [ ] 5.6 Avaliar (no design) se a validação por tipo de treino vira `DomainSkill` — se o input couber em record, seguir o padrão de `skills/` (ver CLAUDE.md "Skills Architecture Standards")
- [ ] 5.7 `validarENormalizarPlanoGerado` passa a delegar a `PlanoLlmValidator`
- [ ] 5.8 Testes unitários por tipo de treino (cada branch de violação dispara o erro esperado; cobertura de `SkillResult`/exceção conforme o padrão escolhido), incluindo os casos IA-04/IA-05 migrados
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
      saída idêntica ao baseline **exceto** nos 5 cenários de IA-02/03/04/05/10, onde a saída deve
      ser a corrigida — documentar as duas listas (idêntico vs. corrigido) no PR.
- [ ] 7.4 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar a change conforme regra do CLAUDE.md raiz
