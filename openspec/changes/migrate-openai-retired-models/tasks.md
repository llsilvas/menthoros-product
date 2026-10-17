# Tasks — migrate-openai-retired-models

Repos: `apps/menthoros-backend` (quase tudo), `apps/menthoros-front` (bloco 6), `menthoros-infra`
e `menthoros-product` (docs). Validação padrão: backend `./mvnw clean test`; front
`npm run lint && npm run build`. Bloco final `./mvnw clean verify`.

**Prazo externo:** merge em `main` até **2026-11-15** (modelos saem em 2027-01-14; a medição de 4
semanas precisa caber na janela de rollback). Gate 0 fechado até **2026-10-31**.

## 0. Gate 0 — fonte oficial (bloqueante, sem código)

- [ ] 0.1 Ler a página de deprecações da OpenAI e o guia de migração do aviso. Preencher "Decisão
      do gate 0" no `proposal.md`: sucessor, snapshots, reasoning padrão e valores aceitos,
      parâmetros rejeitados, suporte a `json_schema` no Chat Completions, preços.
      Verify: seção preenchida com link e data até 2026-10-31; se `json_schema` só na Responses
      API, parar, escalar ao founder no mesmo dia e voltar ao `/change` (non-goal).
- [ ] 0.2 Confirmar no painel do Railway (dev, develop, production) que nenhuma variável
      `APP_LLM_ROUTING_*` ou `SPRING_AI_OPENAI_*` sobrescreve o YAML (Open Question 4).
      Verify: registrado no proposal.
- [ ] 0.3 Confirmar que não há modelo fine-tunado na conta OpenAI (Open Question 5).
      Verify: registrado no proposal.

## 1. Contrato de opções por rota (design D1)

- [ ] 1.1 `LlmRoutingProperties.RotaLlm`: `temperature` opcional; novos `topP`, `reasoningEffort`,
      `verbosity` opcionais; validação por **esforço efetivo** (design D1): `none`/ausente permite
      amostragem; `low|medium|high` proíbe `temperature` e `topP`; modelo legado proíbe
      `reasoningEffort`/`verbosity`. Falha no boot nomeando rota e campo.
      Verify: teste de binding com os casos (a) `none` + temperatura sobe, (b) `low` + `topP`
      falha, (c) legado + reasoning falha (CA2).
- [ ] 1.2 `MultiModelConfig.opcoesOpenAi`: `maxCompletionTokens` no lugar de `maxTokens`; só envia
      o que a rota define.
      Verify: teste unitário — rota com reasoning produz opções sem `temperature`/`topP`/
      penalties/`maxTokens`; rota clássica produz `temperature` e sem `reasoningEffort`.
- [ ] 1.2b `modeloOpenAiComTimeout` instala `defaultOptions(opcoesOpenAi(rota))` no modelo
      derivado (design D1.1) — substitui o default do auto-config em vez de herdar. Registrar no
      javadoc que hoje a rota `plano` roda no default global por coincidência.
      Verify: teste com `RestClient` interceptado — `IaServiceImpl.chamarLlm` com
      `.options(schema)` envia o `model` e o `max_completion_tokens` da rota, não do default.
- [ ] 1.3 `./mvnw clean test` — rotas atuais (`gpt-4o`, `gpt-4o-mini`) seguem funcionando com
      `maxCompletionTokens`.

## 2. Default global fora do YAML (design D2)

- [ ] 2.1 `application.yml`: `spring.ai.openai.chat.options` fica só com `model` e
      `max-completion-tokens`; `temperature`, `top-p`, `frequency-penalty`, `presence-penalty`
      saem.
- [ ] 2.2 Remover `ChatClientConfig.chatClient` (`@Primary`, sem consumidor — `IaServiceImpl` usa
      o `ModelRouter`). Se o contexto acusar ponto de injeção, reconstruir com
      `opcoesOpenAi(props.getSimple())` e registrar o consumidor no design.
      Verify: `./mvnw clean test` sobe o contexto; `rg "ChatClient chatClient" src/main/java`
      só em assinaturas de método privado.
- [ ] 2.3 `EvalRunnerTest.construirChatClientReal` passa a montar as opções via
      `MultiModelConfig.opcoesOpenAi(RotaLlm)` (sem `temperature(0.2)`/`maxTokens` fixos);
      juiz lê `EVAL_JUDGE_MODEL` (default `gpt-4o` até o gate 0), candidato lê `EVAL_MODEL`.
      Verify: teste `@Tag("eval")` com mocks continua verde; os dois env vars documentados no
      javadoc da classe.
- [ ] 2.4 Teste CA3 pelo **payload HTTP**: contexto real com `temperature 0.7` deixada de
      propósito no default global e `RestClient` interceptado; três caminhos (`IaServiceImpl` com
      schema, `EvalCandidateRunner`, `EvalLlmJudge`); assere `model`, `max_completion_tokens`,
      `response_format`, `reasoning_effort` da rota e ausência de `temperature`/`top_p` quando o
      esforço não é `none`.
- [ ] 2.5 `./mvnw clean test`.

## 3. Bake-off OpenAI → OpenAI (design D3)

- [ ] 3.1 `OpenAiSuccessorBakeoff` em `src/test` (tag `eval-real`, desligado no CI): N candidatos
      `(nome, OpenAiChatOptions)` + `ChatClient` do juiz; roda as fixtures de candidato; coleta
      grader, juiz, latência de parede, custo, `metadata.model`.
      Verify: teste unitário com `ChatClient` mocks (tag `eval`) gera o markdown com 1 linha por
      candidato e o juiz no cabeçalho (CA7 por nome).
- [ ] 3.2 Rodar o bake-off real: baseline `gpt-4o` + sucessor em ≥ 2 níveis de reasoning (+
      `none`, se existir). Salvar `apps/menthoros-backend/docs/ia/bakeoff-openai-sucessor-<data>.md`.
      Verify: CA4 — grader ≥ baseline; custo marginal por atleta/mês (plano + simple + expert,
      tokens de reasoning incluídos) dentro de R$ 1,10; snapshots anotados.
- [ ] 3.3 Registrar a decisão por rota (`plano`, `expert`, `simple`) e o modelo do juiz pós-retirada
      (`EVAL_JUDGE_MODEL`) no `proposal.md`
      ("Decisão do gate 0" ganha subseção "Decisão do bake-off") e a Open Question 2.3 de
      `plan-llm-provider-bakeoff` como respondida (nota no proposal daquela change, sem reabri-la).
- [ ] 3.4 `simple`: smoke de 3 chamadas reais do `AthleteMessageGenerator`; confirmar que a mensagem
      continua passando pela ação do coach antes do atleta (coach-in-the-loop). `expert`: conjunto
      fixo de 5–10 casos reais anonimizados em `src/test/resources/eval/expert/`, respostas do
      modelo novo e do `gpt-4o` revisadas por humano. Latências no relatório.
- [ ] 3.5 Revisão humana cega (CA4b): 5–10 planos do vencedor × `gpt-4o`, revisados pelo
      coach-fundador sem rótulo; resultado anexado ao relatório. Bloqueia 7.3.

## 4. Troca de configuração + preço (design D4)

- [ ] 4.1 `application.yml`: modelos vencedores em `simple`, `expert`, `plano` e no default;
      `reasoning-effort`/`temperature` conforme a decisão; `timeout` recalibrado pelo p95 medido
      (margem de 1,5×). **Commit isolado, só YAML** — é a unidade de rollback (design D7).
- [ ] 4.2 `llm-pricing.yml`: alias + snapshots datados dos modelos novos (incluindo o do juiz),
      com os preços do gate 0; atualizar `vigencia`.
      Verify: CA5 — contexto sobe (`LlmPricingRegistry` valida as 5 rotas); teste do
      `EvalCostCalculator` com o snapshot real; relatório do bake-off falha se algum custo vier nulo.
- [ ] 4.3 `./mvnw clean test`.

## 5. Guard de modelos retirados (design D5)

- [ ] 5.1 `RetiredModelsGuardTest`: lê o `application.yml` real, falha se alguma rota ou o default
      estiver em `{gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini}` ou snapshots.
      Verify: CA6 — verde com a config nova; vermelho com `@TestPropertySource` apontando `plano`
      para `gpt-4o`.

## 6. Pontas documentais e refactor de nomes

- [ ] 6.1 Front: `politicaPrivacidadeConteudo.ts` sem "GPT-4o" (texto conforme Open Question 3).
      Verify: `npm run lint && npm run build`; `rg "GPT-4o" src` vazio (CA8).
- [ ] 6.2 (cortável se o prazo apertar) Refactor D6: beans `simpleClient`/`expertClient`/`planoClient`, qualifiers do
      `ModelRouter`; javadoc de `TaskComplexity`, `IaServiceImpl`, `AthleteMessageGenerator`,
      `MultiModelConfig` sem nome de modelo hardcoded.
      Verify: `rg -i "gpt-4o|gpt4o" src/main/java` vazio; `./mvnw clean test`.
- [ ] 6.3 `menthoros-infra/docs/llm-pricing-guide.md` e
      `menthoros-product/knowledge/engineering/integrations.md` com os modelos novos e a data de
      retirada.

## 7. Rollout (design D7)

- [ ] 7.0 Congelar o baseline: taxa de aceite sem edição de volume e volume semanal de planos das
      4 semanas anteriores (consulta do ledger, mesma de `eval-progression-adherence-rollout`);
      registrar no proposal com a data de corte do modelo.
- [ ] 7.1 Smoke no Railway dev: gerar 1 plano real por arquétipo, 1 chamada `simple`, 1 `expert`.
- [ ] 7.1b Ensaio do rollback no Railway dev: revert do commit 4.1 + `@Disabled` no guard (5.1) com
      motivo e data, deploy, gerar 1 plano com `gpt-4o`; depois reaplicar. Os dois lados precisam
      funcionar. Registrar no proposal o procedimento exato (lista de propriedades, não "trocar o
      modelo").
- [ ] 7.2 PR `<branch> → develop`; 1 semana de planos reais; comparar taxa de falha e p95 no
      ledger com a semana anterior (CA9).
- [ ] 7.3 PR `develop → main` até 2026-11-15 (depende de 3.5). Registrar no proposal a data do
      merge e o procedimento de rollback (revert de 4.1, ensaiado em 7.1b), com a ressalva de que expira em
      2027-01-14. Avisar as assessorias do pilot conforme a Open Question 7.
- [ ] 7.4 `./mvnw clean verify` no bloco final.
- [ ] 7.5 Pós-merge (4 semanas, até 2026-12-15): medir aceite vs baseline (n ≥ 20). Queda > 5 p.p.
      → revert do commit 4.1 (procedimento de 7.1b) e abrir o plano B (`plan-llm-provider-bakeoff`). Registrar
      o resultado no proposal antes de arquivar.
