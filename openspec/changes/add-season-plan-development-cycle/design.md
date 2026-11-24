## Context

O épico `add-season-plan-macrocycle` modela a temporada como `PlanoTreino` + `SemanaPlanejada`, sempre
ligada a uma prova: `prova` é obrigatória, o número de semanas é derivado da data da prova e as fases vão
de BASE a RACE_WEEK. A decisão D5 do épico (2026-11-22) deixou a temporada sem prova fora do MVP e a
remeteu para esta change.

Na literatura de periodização, o período sem competição é planejado por objetivo e horizonte: o
preparatório geral da periodização clássica, a fase de base e os blocos de acumulação. Não há pico nem
polimento, e o fim do ciclo costuma ser marcado por um teste, não por uma prova.

## Goals / Non-Goals

**Goals:**

- Permitir temporada aprovada pelo treinador para atleta sem prova-alvo
- Reusar modelo, motor, validações, versionamento e telas do épico, sem segundo conceito de plano longo
- Manter a geração determinística, manual e em `PROPOSTA`
- Tornar previsível a passagem do ciclo para a temporada de prova

**Non-Goals:**

- Retorno de lesão como objetivo de ciclo — o motor semanal já produz `RETURN_TO_TRAINING`
- Renovação automática do ciclo ao fim da duração
- Encadeamento planejado de vários ciclos (plano anual)
- Mudar regra, fase ou tela da temporada de prova

## Decisions

### 1. Um tipo no `PlanoTreino`, não uma entidade nova

**Decisão:** `PlanoTreino` ganha `tipoTemporada` (`PROVA` | `DESENVOLVIMENTO`). `prova_id` passa a ser
anulável, com CHECK no banco: `PROVA` exige prova, `DESENVOLVIMENTO` exige prova nula, `objetivoCiclo` e
`dataFim` preenchidos. As linhas existentes recebem `PROVA` por default.

**Rationale:** é a mesma razão da Decisão 1 do épico — evitar dois conceitos de plano longo. Semanas,
versões, aprovação e vínculo com `PlanoSemanal` são idênticos nos dois tipos.

**Alternativa descartada:** criar uma "prova fictícia" para ancorar o ciclo. Polui `prova-crud`, a
atenção de prova e a projeção de resultado com um evento que não existe.

### 2. Âncora por data de fim escolhida pelo treinador

**Decisão:** o treinador informa objetivo e duração em semanas; `dataFim` é derivada do início. A
duração tem faixa e default vindos do template (proposta: 4 a 16, default 8 — em aberto).

**Rationale:** sem data externa, horizonte longo vira ficção. Ciclos curtos e revisáveis são o que a
prática recomenda quando não há prova.

### 3. Fases restritas a BASE e BUILD

**Decisão:** o ciclo usa apenas BASE e BUILD de `TrainingPhase`, com a flag `descarga`. PEAK, TAPER e
RACE_WEEK são inválidas para o tipo `DESENVOLVIMENTO` e rejeitadas na validação do rascunho. Manutenção
é BASE com volume estável.

**Rationale:** pico e polimento só fazem sentido com data de competição. Restringir no modelo impede
que o ajuste manual crie um taper sem prova.

### 4. Template por objetivo

**Decisão:** `TemplateMetodologia` ganha, por objetivo de ciclo, a proporção BASE/BUILD, a rampa
semanal e a cadência de descarga. O default global cobre os objetivos do primeiro corte.

**Rationale:** mantém a geração como dado, reprodutível, e deixa a assessoria ajustar a metodologia
como já faz na temporada de prova.

### 5. Exclusividade e conversão para temporada de prova

**Decisão:** vale o índice único parcial do épico: um `ATIVO` por atleta, de qualquer tipo. Com ciclo
ativo, o treinador pode gerar a proposta de temporada de prova em paralelo; ao aprová-la, o ciclo é
arquivado com `motivoVersao` indicando a substituição. As semanas já cumpridas e os planos semanais
vinculados são preservados. A temporada de prova parte do baseline atual do atleta, como qualquer
geração.

**Rationale:** o que foi construído no ciclo já está no baseline; não há o que migrar. Arquivar em vez
de converter mantém o histórico de cada decisão do treinador.

### 6. Fim do ciclo é decisão do treinador

**Decisão (proposta, em aberto):** ao chegar em `dataFim`, o ciclo é arquivado e a aba volta ao estado
sem temporada, com o resumo do ciclo encerrado e as ações de criar outro ciclo ou cadastrar prova. Não há
renovação automática.

**Rationale:** renovar sozinho publicaria ao atleta um plano que nenhum treinador revisou.

### 7. Marco final de teste é opcional

**Decisão:** quando `add-running-field-tests` existir, o ciclo pode ter um marco de teste na última
semana. Sem ela, o ciclo termina por data.

**Rationale:** não acoplar esta change a outra ainda não implementada.

## Risks / Trade-offs

- **`prova_id` anulável afrouxa uma invariante do épico.** Mitigação: CHECK por tipo no banco e
  validação na aplicação; teste que tenta criar `PROVA` sem prova.
- **Código do épico que assume prova não nula** (cabeçalho, KPIs, geração de nome e objetivo, projeção).
  Mitigação: task de varredura antes de implementar; regressão da temporada de prova.
- **Ciclo vira "plano eterno" renovado sem critério.** Mitigação: duração máxima e fim explícito
  (Decisão 6).
- **Baixa adoção:** o treinador pode não ver valor em planejar sem prova. Mitigação: flag própria e
  métrica de adoção no piloto antes de liberar para todos.

## Migration Plan

1. Migration aditiva: `tipo_temporada` (default `PROVA`), `objetivo_ciclo`, `data_fim`; `prova_id`
   anulável; CHECK por tipo.
2. Backend atrás de `macrociclo.desenvolvimento.enabled=false`.
3. Frontend atrás da mesma flag.
4. Ligar no piloto para uma assessoria; acompanhar a métrica.

Rollback: desligar a flag. As colunas ficam; nenhuma linha do tipo `PROVA` é afetada.

## Open Questions

1. Objetivos do primeiro corte: base e manutenção, ou também velocidade?
2. Faixa e default de duração.
3. Fim do ciclo: arquivar na data ou manter ativo até decisão do treinador?
4. Esperar `add-running-field-tests` ou sair com fim só por data?
