# ADR 0011 - Composicao deterministica de sessoes por fase do planner

## Status
Aceito

## Data
2026-09-09

## Decisores
Founder (Leandro), via grilling (grill-with-docs) + pre-mortem cross-model (Codex)

## Contexto

A change `planner-engine-enforcement` torna o `WeekPlanSkeleton` **prescritivo**: o `PlannerEngine`
passa a preencher `SessionSlot`s (dia, tipo, TSS, zona, duracao) que o compliance valida e o prompt
injeta como bloco mandatorio. A parte 1 (deterministic-planner-engine) so rodava em shadow e nao
prescrevia sessoes.

Ao implementar a secao 2, descobriu-se uma lacuna: a `WeeklyDistributionSkill` **so redistribui
sessoes que ja existem** — ela nao decide QUANTAS sessoes nem de QUAIS tipos. O `PlannerEngine` (que
hoje passa `sessions=List.of()`) precisava de uma regra para **gerar** a composicao da semana antes de
alocar dias. Essa regra nao estava especificada, e um primeiro rascunho recebeu NO-GO do Codex por
furos fisiologicos e logicos (formula TSS/duracao circular, composicao nao-deterministica, PROVA sem
contrato, retorno pos-lesao inseguro, polarizacao nao provada).

O contrato foi fechado num grilling e vive em detalhe na change
`openspec/changes/planner-engine-enforcement/design.md` Decisao 4b. Este ADR registra as decisoes
duras de reverter.

## Decisao

1. **`fatorImpacto` e uma taxa de carga relativa por hora, nao um IF.** A repartição usa um modelo
   **linear** `TSS_slot = fatorImpacto × TAXA_BASE × horas` (TAXA_BASE ≈ 50 TSS/h, calibravel), e a
   duracao e derivada dele. O `IF²` da formula classica de TSS foi **descartado** porque os
   `fatorImpacto` do enum sao >1 (INTERVALADO 1.4, TIRO 1.5, SUBIDA 1.6) e ao quadrado inflariam a
   carga das sessoes duras de forma fisicamente incorreta.
2. **`targetTss` (do `WeeklyLoadTarget`) e a ancora**; a duracao dos slots e o output. Isso quebra a
   circularidade da formula (a duracao dependia do TSS ainda nao repartido, e vice-versa).
3. **Composicao por fase deterministica** via lista ordenada de prioridade (chave → duras → resto),
   `sessionCount = min(dias disponiveis, maxSessoesPorSemana)`, sessoes duras limitadas por um teto
   por fase E pela faixa-alvo de polarizacao. Tabela por fase na Decisao 4b.
4. **Polarizacao (~80/20) e soft**, medida pela **fracao da carga (TSS) em zona alta**
   (INTERVALADO/TIRO/TEMPO_RUN/SUBIDA/FARTLEK), com PROVA excluida da razao. Nao e invariante hard: um
   desvio nao torna o plano "quebrado", segue a matriz fail-open.
5. **PROVA e ancora fixa no dia real dela**, conta no `sessionCount`, tem TSS estimado da distancia e
   reservado do alvo primeiro, com janela de protecao (sem dura 48h antes; dia seguinte regenerativo).
6. **RETURN_TO_TRAINING/RECOVERY dependem de capacidade recente**, nao so de disponibilidade: sem
   sessoes duras e LONGO condicionado a evidencia (`longoesRealizados21d>0`), conservador sem historico.

## Alternativas consideradas

- **Manter o `IF²` tratando `fatorImpacto` como IF** — rejeitado: fisicamente errado com valores >1.
- **Ancorar em duracoes fixas por tipo e escalar para o alvo** — rejeitado: o `targetTss` e o dado de
  entrada canonico; ancorar em duracao inverteria a fonte da verdade.
- **Teto de sessoes por fase (frequencia artificial)** — rejeitado: a fase governa o mix e a carga (o
  `LoadTargetResolver` ja corta o alvo nas fases de contencao); um teto de frequencia seria redundante
  e nao-deterministico com poucos dias.
- **Polarizacao como invariante hard (422)** — rejeitado: dose, nao estrutura; bloquear geraria 422 em
  planos utilizaveis. Fica soft/revisavel.
- **Zonas numericas por atleta no slot** — adiado: exigiria trazer `fcLimiar`/`paceLimiar` ao snapshot
  do planner; o slot carrega a string canonica `TipoTreino.zonaFcAlvo` e os numeros reais entram no
  prompt pelos servicos existentes.

## Consequencias

- Os numeros (TAXA_BASE, faixas de TSS alta por fase, tetos de duras, limites de duracao) sao
  **calibraveis com o shadow** (porta 1 do rollout) — o ADR fixa a forma, nao os valores finais.
- A composicao e determinista → testavel por **golden set** (requisito da task 2.5).
- SUBIDA/FARTLEK ficam fora do mix automatico ate decisao explicita.
- `fix-cold-start-calibration-plan-generation` (§13) estende as invariantes **hard**; a composicao aqui
  e a base prescritiva sobre a qual o cold-start assenta.
