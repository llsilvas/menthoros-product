## Pré-requisitos

- [ ] 0.1 Confirmar que `debito-tecnico-camada-ia` está mergeada em `develop` (esta change toca a mesma classe); rebase de `develop` antes de iniciar
- [ ] 0.2 Criar branch `feature/refactor-iaservice-decomposition` em `apps/menthoros-backend`

## 1. Rede de segurança (caracterização)

- [ ] 1.1 Escrever teste de caracterização (golden) para `geraPlanoSemanalAvancado` com 2-3 cenários representativos (intervalado, longo, regenerativo), fixando o `PlanoSemanalLlmDto` de saída — o LLM mockado/stub para tornar a saída determinística
- [ ] 1.2 Rodar `./mvnw clean test` e confirmar baseline verde

## 2. Extrair construção do JSON Schema

- [ ] 2.1 Criar `LlmJsonSchemaBuilder` com `buildSchemaTightInlineOrDefs` + `enforceAllRequired`, `putMin`, `putMax`, `putEnum`
- [ ] 2.2 `IaServiceImpl` injeta `LlmJsonSchemaBuilder`; `defaultJsonSchemaOptions` passa a delegar
- [ ] 2.3 Teste unitário de `LlmJsonSchemaBuilder` (schema gerado contém required/min/max/enum esperados)
- [ ] 2.4 `./mvnw clean test` verde

## 3. Extrair normalização de treino (intervalado/etapas)

- [ ] 3.1 Mover `normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `reordenarEtapas`, `reconciliarDistanciaComEtapas` e helpers de parsing de descrição (`detectarRepeticoesNaDescricao`, `extrairDistanciaUnitariaDaDescricao`, `detectarFartlekNaDescricao`, `extrairZonaDaDescricao`) para um colaborador em `services/helper`
- [ ] 3.2 Teste unitário do normalizador (entrada de etapas agregadas → etapas expandidas/reordenadas esperadas)
- [ ] 3.3 `./mvnw clean test` verde

## 4. Extrair validação de FC por zona

- [ ] 4.1 Mover `validarFcEtapa`, `zonaEsperadaFC`, `zonaParaEtapaPrincipal`, `parseFcRange`, `bpmDaZona`, `zonaParaFc` para um colaborador (avaliar reuso de `ZonaTreinoService`/`PaceZoneCalculator` já existentes em `services/helper`)
- [ ] 4.2 Teste unitário cobrindo etapa dentro/fora da faixa de FC esperada (BVA nas bordas da zona)
- [ ] 4.3 `./mvnw clean test` verde

## 5. Extrair validadores por tipo de treino + distribuição de carga

- [ ] 5.1 Criar `PlanoLlmValidator` como orquestrador; mover `validarTreinoIntervalado`, `validarTreinoLongo`, `validarTreinoRegenerativo`, `validarTreinoContinuo`, `validarRepeticoes`, `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal`
- [ ] 5.2 Avaliar (no design) se a validação por tipo de treino vira `DomainSkill` — se o input couber em record, seguir o padrão de `skills/` (ver CLAUDE.md "Skills Architecture Standards")
- [ ] 5.3 `validarENormalizarPlanoGerado` passa a delegar a `PlanoLlmValidator`
- [ ] 5.4 Testes unitários por tipo de treino (cada branch de violação dispara o erro esperado; cobertura de `SkillResult`/exceção conforme o padrão escolhido)
- [ ] 5.5 `./mvnw clean test` verde

## 6. Reduzir IaServiceImpl a orquestrador

- [ ] 6.1 Confirmar que `IaServiceImpl` só monta prompt → chama LLM (via `ModelRouter`) → delega validação → retorna DTO
- [ ] 6.2 Conferir LOC bem abaixo de ~400 e nenhum método acima de ~80 linhas (ver CLAUDE.md "Service Size & Decomposition")
- [ ] 6.3 Revisar JavaDoc de idempotência/side effects/tenant nos métodos públicos remanescentes

## 7. Validação final

- [ ] 7.1 `./mvnw clean test` verde (incluindo o golden de caracterização do passo 1)
- [ ] 7.2 `./mvnw verify`
- [ ] 7.3 Diff de comportamento: rodar geração de plano nos cenários do passo 1.1 e confirmar saída idêntica ao baseline
- [ ] 7.4 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar a change conforme regra do CLAUDE.md raiz
