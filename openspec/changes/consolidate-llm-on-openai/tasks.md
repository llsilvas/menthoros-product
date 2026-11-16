# Tasks — consolidate-llm-on-openai

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean test`; bloco final `./mvnw clean verify`.

**Pré-requisito:** `migrate-openai-retired-models` mergeada em `develop`.
Branch: `feat/consolidate-llm-on-openai`, em worktree.

## 1. Baseline

- [ ] 1.1 Rodar a consulta de `docs/ia/custo-por-atleta.md` no `develop`, filtrando
      `route = 'standard'`. Registrar chamadas/semana e custo no documento, com data.
      Verify: documento atualizado; se não houver volume, registrar isso e seguir com a premissa.

## 2. Troca de rota

- [ ] 2.1 `WorkoutAnalysisTranslator` e `AthleteMessageClassifier`: `TaskComplexity.STANDARD` vira
      `TaskComplexity.SIMPLE`; Javadoc deixa de citar Claude Haiku.
      Verify: `WorkoutAnalysisTranslatorTest` e `AthleteMessageClassifierTest` stubam e verificam
      `route(eq(TaskComplexity.SIMPLE))` (CA1); `./mvnw clean test`.

## 3. Qualidade

- [ ] 3.1 ~10 análises em inglês (fixtures do `WorkoutAnalysisTranslatorTest` ou análises reais
      anonimizadas), traduzidas pelo Haiku e pelo modelo da `simple`, lado a lado num markdown.
      Anotar latência das 4 chamadas.
      Verify: arquivo em `docs/ia/traducao-simple-vs-haiku-<data>.md`.
- [ ] 3.2 Coach lê os pares (CA2). Bloqueia o merge.
      Verify: veredito anotado no mesmo arquivo.

## 4. Fechamento

- [ ] 4.1 Confirmar o gate de privacidade (CA3) e a Open Question 1 com o founder.
      Verify: registrado no proposal.
- [ ] 4.2 `./mvnw clean verify`; PR → `develop`.
- [ ] 4.3 Uma semana depois: repetir 1.1 e anotar o custo pós-troca (CA4).
