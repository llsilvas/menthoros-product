**Tamanho · Trilha:** M · Full

## Why

A geração de plano semanal é o fluxo mais caro e mais crítico do Menthoros, e hoje está **sem rede de segurança de regressão**:

- `PlanoTreinoPromptBuilder.buildOptimizedPrompt` tem **533 linhas, 8 formatters e zero testes**. O prompt foi calibrado por tentativa-e-erro (as anotações "Fase 1/2/3/5", tetos de pace, penalidade de TSB são cicatrizes disso).
- Não existe nenhuma verificação determinística sobre a **saída** do LLM — não há como afirmar se um plano gerado respeita ou viola as constraints que o motor determinístico já calculou (decisão de intervalado, teto de pace, TSS alvo, restrições de lesão).

Toda a thread de IA do Bloco 1 vai **mutar o prompt e a interação com o LLM**: `debito-tecnico-camada-ia` (structured output), `add-llm-tool-use` (fim do prompt monolítico) e `llm-code-switching` (PT→EN). Cada uma muda o texto enviado ao modelo → muda a saída → muda a qualidade do plano. **Sem uma rede de medição, não há como saber se cada passo modernizou ou regrediu** — e o objetivo declarado ("organizado, testável, menos alucinação") fica sem prova.

Esta change cria essa rede **antes** de qualquer modernização: é o trilho sobre o qual o resto da thread de IA corre com segurança.

## What Changes

- **Camada A — Golden-master do prompt montado:** harness de caracterização que congela a saída de `buildOptimizedPrompt` para um conjunto de **arquétipos de atleta** (iniciante sem lesão, avançado com TSB baixo, lesão ativa, taper/semana de prova, dados ausentes/fallbacks). Determinístico (clock/data fixos via fixture). Qualquer mudança futura no prompt tem de manter o golden-master ou divergir **de propósito**, com diff revisado.
- **Camada B — Eval determinística de qualidade do plano:** um `PlanQualityChecker` que verifica a **saída** (plano JSON) contra as constraints determinísticas como oráculo:
  - respeita a decisão mandatória de intervalado (não prescreve INTERVALADO quando proibido/degradado)?
  - respeita o teto de pace por tipo? não inventa pace abaixo do teto?
  - fica dentro do TSS alvo semanal e do máximo de dias consecutivos?
  - respeita restrições de lesão?
  - Reusa os motores já existentes como verdade: `IntervaladoElegibilidadeService`, `TrainingPrescriptionGuardSkill`, lógica de teto de pace.
- **Eval offline (CI):** testes que rodam o `PlanQualityChecker` sobre planos-fixture ("bom" e "alucinado") para provar que o checker **detecta** as violações — sem chamar o LLM.
- **Eval ao vivo (opt-in, fora do CI unitário):** profile/flag que chama o LLM real para um atleta-fixture e pontua a saída — para uso manual/nightly, não no gate de build.

## Capabilities

### New Capabilities

- `plan-generation-quality`: caracterização do prompt de geração de plano (golden-master) e verificação determinística de aderência do plano gerado às constraints do motor determinístico (rede de regressão da thread de IA).

## Impact

**Backend (`apps/menthoros-backend`):**
- Novos fixtures/builders de arquétipos de atleta para teste de `buildOptimizedPrompt`.
- Golden-master em `src/test/resources/` + harness de captura/assert/regeneração documentada.
- `PlanQualityChecker` determinístico (reusável; pode no futuro virar guard de produção — fora do escopo aqui) + testes com fixtures "bom"/"alucinado".
- Profile opt-in de eval ao vivo (sem entrar no `./mvnw clean test` padrão).

**Sem impacto em:** o fluxo de geração em si (nenhuma mudança de comportamento em `IaServiceImpl`/`PlanoTreinoPromptBuilder` — esta change só **observa e mede**), DTOs, entidades, migrations, controllers, frontend.

**Posicionamento:** sequenciar **antes** de `debito-tecnico-camada-ia` no Bloco 1 — é a rede sobre a qual `debito-tecnico → add-llm-tool-use → llm-code-switching` vão se apoiar.
