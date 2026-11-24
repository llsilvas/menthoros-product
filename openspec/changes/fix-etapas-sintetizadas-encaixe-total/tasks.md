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
      Segunda invariante, "total = prescrito": `|distanciaKm final − distanciaKm da LLM| ≤ 10%`.
      Contexto com zonas de pace (`ContextoNormalizacao.zonasPaceComDado`), como em produção — o molde
      de caracterização roda sem elas e não exercita `corrigir-pace-zona`.
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
      TEMPO_RUN com sobra ≤ 0 e pace derivável continua vazio (CA7).
      verify: falha em develop (o caso CA1; CA3 e CA7 já passam).
- [ ] 1.2 `TreinoNormalizador.encaixarPrincipalNoTotal`: com `sobra <= 0`, pace derivável e tipo
      REGENERATIVO, CONTINUO ou LONGO, devolver o bloco único (mesmo ramo da sessão curta); sem pace
      ou em TEMPO_RUN, manter `Optional.empty()`.
      verify: 1.1 verde; testes de encaixe existentes intactos (CA4).
- [ ] 1.3 Teste da receita TRES_ETAPAS (normalização completa) com o caso relatado: `duracaoMin` = soma
      das etapas e contador `plano_etapas_total_divergente` não incrementado (CA2).
- [ ] 1.4 Validação: `./mvnw clean test`; esperados de caracterização alterados registrados (CA5).

## 2. Fechamento

- [ ] 2.1 Matriz verde: todo cenário aceito respeita a invariante, salvo `excecoesConhecidas` (CA6).
- [ ] 2.2 Validação: `./mvnw clean test`.

## Achados da matriz

(preenchido na 0.2)

### Prévia — simulação de 2026-11-24

Grade da 0.1 (3.024 cenários) em `develop` `ca69ed3`, fix atrás de flag num worktree descartável, sem
restrição por tipo (anterior à A6). Etapas da LLM modeladas com o total concentrado na PRINCIPAL e
aquec/desaq em 0 km. Serve de referência para a 0.2, que refaz a contagem com o teste definitivo.

| Causa | Passo da receita | Hoje | Com fix |
|---|---|---|---|
| etapa sintetizada + sobra ≤ 0 | `reconciliar-distancia` (`encaixarPrincipalNoTotal`) | 486 | 0 |
| etapa sintetizada + sem pace | `reconciliar-distancia` | 252 | 252 |
| estrutura completa + PRINCIPAL sem ritmo | `reconciliar-distancia` (`principal-sem-ritmo`) | 240 | 240 |
| duração mantida da LLM (TEMPO_RUN ≤ 3 km, completa) | `recalcular-duracao` | 8 | 8 |
| invariante ok | | 2.038 | 2.524 |

- Nenhum cenário rejeitado (`LLMException`).
- Com a restrição por tipo (A6), os cenários TEMPO_RUN de sobra ≤ 0 (126 dos 486) voltam a violar e
  entram em `excecoesConhecidas`.
- "Total = prescrito": 290 cenários inflam e 97 encolhem mais de 10%, todos com a estrutura completa
  da LLM e pace derivável (`adotarSomaDasEtapas`), antes e depois do fix.
- Bloco único em TEMPO_RUN já existe em `develop`: 36 cenários de 3 km e 18 de 5 km (limiar 4:00).

## Follow-ups

(preenchido na 0.2)

Candidatos saídos da simulação:

- Total reconciliado pela soma com estrutura completa da LLM infla/encolhe o volume prescrito.
- PRINCIPAL sem pace: derivar o pace da zona do atleta, como já se faz no aquecimento (A9).
- TEMPO_RUN em bloco único no ramo da sessão curta: limiar sem aquecimento (A6).
- `tssPlanejado` não recalculado quando a normalização muda a duração (A7).
- `ritmoAlvo` do treino diverge do ritmo da etapa corrigido pela zona (card 5:00–5:30, etapa 5:59–6:40).
- Tolerância de duração em sessão curta: diferença de 2 min nos 8 casos de TEMPO_RUN (A5).
