**Tamanho:** S · **Trilha:** Fast

> Fast porque reaproveita a rota `simple` (OpenAI) que já existe: troca a rota de dois chamadores,
> sem mecanismo novo, sem migration e só no backend. O texto da política de privacidade é gate de
> ativação, não entrega desta change (ver "Dependências").

**Status:** proposta, reescrita após review ponytail (2026-11-15)
**Criado:** 2026-11-15
**Depende de:** `migrate-openai-retired-models` (modelo sucessor da rota `simple` e texto da
política de privacidade). Não pode mergear antes dela.
**Change irmã:** `migrate-workout-analysis-to-openai` — rota `complex` e, se necessário, o fallback
entre providers. Esta change não depende dela.

## Por que

Tradução da análise de treino e classificação do bloco do atleta rodam hoje na rota `standard`
(`claude-haiku-4-5`). As duas são exatamente o que a rota `simple` declara no `application.yml`
("tradução, extração, classificação simples"), e a `simple` já é OpenAI. Mover os dois chamadores
para ela reduz custo sem código novo. O ganho estimado é ~R$ 0,29 por atleta/mês (premissa de
`docs/ia/custo-por-atleta.md`, a medir).

## O que muda

1. `WorkoutAnalysisTranslator` (4 chamadas por análise, uma por campo) e `AthleteMessageClassifier`
   passam de `TaskComplexity.STANDARD` para `TaskComplexity.SIMPLE`.
2. Testes dos dois chamadores e o Javadoc ("Claude Haiku") acompanham a troca.

## Fora de escopo (non-goals)

- `RaceProjectionNarrativeGenerator`: fica em Haiku. É raro, barato e o único chamador da
  `standard` com `AnthropicChatOptions` por chamada; mexer nele custa mais que economiza.
- Fallback entre providers, métrica de fallback, validação de boot do fallback: vão para
  `migrate-workout-analysis-to-openai`, se lá forem necessários.
- Rota `complex` e rota `standard` em si (ela continua existindo, com Haiku, para a narrativa).
- Grader automático de tradução; circuit breaker; migration.

## Critérios de aceite

- **CA1 (roteamento)** — GIVEN o tradutor e o classificador, WHEN chamados, THEN usam
  `TaskComplexity.SIMPLE` (teste unitário de cada um, com `eq(TaskComplexity.SIMPLE)`).
- **CA2 (qualidade)** — GIVEN ~10 análises em inglês, WHEN traduzidas pelo Haiku e pelo modelo da
  rota `simple`, THEN, lado a lado, o coach não aponta perda de sentido, número ou unidade, e nenhum
  campo sai vazio ou em inglês.
- **CA3 (privacidade, gate de ativação)** — GIVEN o deploy em `main`, THEN a política de privacidade
  já diz que a análise pós-treino também usa a OpenAI. Sem isso a change não vai para `main`.
- **CA4 (custo)** — GIVEN a consulta de `docs/ia/custo-por-atleta.md` antes e depois, THEN o custo
  de tradução + classificação por atleta/mês cai.

## Métrica de sucesso

- Análise traduzida continua chegando ao coach: nenhuma alta visível de `translationFailed` em
  `tb_analise_workout` na primeira semana (amostra do pilot é pequena para teste estatístico).
- Custo por atleta/mês de tradução + classificação cai, medido em `tb_llm_call`.

## Dependências

- **Política de privacidade (front):** `politicaPrivacidadeConteudo.ts` atribui a análise pós-treino
  só à Anthropic (parágrafo de IA, tabela de bases legais e tabela de subprocessadores). Com a
  tradução na OpenAI, o texto da análise pós-treino (com métricas do treino) passa a ir também à
  OpenAI. `migrate-openai-retired-models` já edita esse parágrafo (tirar `GPT-4o`, CA8); o ajuste
  entra lá se ela ainda não tiver mergeado, ou numa change de front própria se tiver.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Modelo da `simple` traduz pior que Haiku | CA2 antes do merge; rollback = reverter o commit (2 linhas) |
| 4 traduções seguidas estouram o timeout de 20 s da `simple` | Listener é `@Async`; cada chamada tem seu teto; medir latência no CA2 |
| Atleta consentiu "análise pós-treino por IA (Anthropic)" | Founder decidiu (2026-11-15): atualizar a política basta |

## Open Questions & Assumptions

- **Decidido (coach-fundador, 2026-11-16, CA2):** `gpt-6-luna` com `reasoning-effort: none` na rota
  `simple` (melhor em 26/40 campos, pior em 3/40; Haiku 5/40 e 22/40). Registro em
  `docs/ia/traducao-simple-vs-haiku-2026-11-15.md`. A configuração do modelo da `simple` é feita em
  `migrate-openai-retired-models` (decisão 3.3 daquela change).
- **Follow-up (decidido 2026-11-16):** glossário travado no prompt de tradução e pós-processador de
  números e unidades vão na change `add-translation-glossary`; não bloqueiam esta.

- **Resolvido 1 (founder, 2026-11-15):** basta atualizar a política de privacidade; sem reaviso nem
  reconsentimento.
- **Assumido:** o sucessor da rota `simple` (decisão 3.3 de `migrate-openai-retired-models`) roda
  tradução e classificação SIM/NÃO sem reasoning.
- **Histórico:** a versão anterior desta change (M · Full) criava fallback por rota, métricas,
  validação de boot e eval com grader próprio. O review de produto deu Reconsider e o review
  ponytail mostrou que a rota `simple`, o ledger (`CostTrackingAdvisor` já grava o modelo
  retornado) e as métricas `llm.*{model,route}` cobrem o necessário. O design de fallback foi
  movido para `migrate-workout-analysis-to-openai/design.md`.
