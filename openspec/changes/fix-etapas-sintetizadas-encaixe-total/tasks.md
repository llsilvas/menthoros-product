# Tasks — fix-etapas-sintetizadas-encaixe-total

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean test`.
Sequência: 0 (descobrir) → 1 (corrigir) → 2 (fechar a matriz). A matriz vem antes do fix para catalogar
todos os cenários divergentes, não só o relatado.

## 0. Matriz de cenários — invariante "card = editor"

- [ ] 0.1 `NormalizacaoDeTreinoInvarianteTotalTest` (novo, JUnit `@ParameterizedTest` + `@MethodSource`,
      sem dependência nova), pela interface `NormalizacaoDeTreino#normalizar` com colaboradores reais,
      no molde de `NormalizacaoDeTreinoCaracterizacaoTest`. Grade:
      - tipo: REGENERATIVO, CONTINUO, LONGO, TEMPO_RUN;
      - total: 1,5 · 2 · 3 · 5 · 8 · 12 · 21 km;
      - estrutura: completa, sem aquec, sem desaq, sem os dois;
      - ritmo: na PRINCIPAL, só no `ritmoAlvo` do treino, nenhum;
      - paceLimiar: 4,0 · 5,0 · 6,0 min/km;
      - duração da LLM: coerente com ritmo × distância e incoerente (±50%).
      Invariante, para todo cenário que a normalização aceita (sem `LLMException`):
      `|Σ distância das etapas − distanciaKm| ≤ 10%` e `|Σ duração das etapas − duracaoMin| ≤ 10%`
      (o mesmo limiar de `registrarDivergenciaMantida`).
      verify: roda em develop e lista os cenários que violam; nomes dos casos legíveis no relatório.
- [ ] 0.2 Catalogar as violações por causa raiz no fim deste arquivo ("Achados da matriz"): quantas,
      quais dimensões, qual passo da receita produz. As de causa "sobra ≤ 0 com etapa sintetizada" são
      o bloco 1. **Outras causas não entram nesta change**: viram exceção nomeada na matriz
      (`excecoesConhecidas`, com o motivo e a change de follow-up) e uma linha em "Follow-ups".
      verify: a matriz passa a falhar só nos cenários do bloco 1.

## 1. Encaixe com sobra ≤ 0

- [ ] 1.1 Teste (vermelho) em `TreinoNormalizadorCorrigirDistanciasTest`: total 2,0 km, aquec 10 min e
      desaq 5 min sintetizados com distâncias que somam > 2,0 km, PRINCIPAL com ritmo 6:30–7:00 →
      bloco único de 2,0 km com duração pelo pace (CA1). Caso sem pace derivável continua vazio (CA3).
      verify: falha em develop.
- [ ] 1.2 `TreinoNormalizador.encaixarPrincipalNoTotal`: com `sobra <= 0` e pace derivável, devolver o
      bloco único (mesmo ramo da sessão curta); sem pace, manter `Optional.empty()`.
      verify: 1.1 verde; testes de encaixe existentes intactos (CA4).
- [ ] 1.3 Teste da receita TRES_ETAPAS (normalização completa) com o caso relatado: `duracaoMin` = soma
      das etapas e contador `plano_etapas_total_divergente` não incrementado (CA2).
- [ ] 1.4 Validação: `./mvnw clean test`; esperados de caracterização alterados registrados (CA5).

## 2. Fechamento

- [ ] 2.1 Matriz verde: todo cenário aceito respeita a invariante, salvo `excecoesConhecidas` (CA6).
- [ ] 2.2 Validação: `./mvnw clean test`.

## Achados da matriz

(preenchido na 0.2)

## Follow-ups

(preenchido na 0.2)
