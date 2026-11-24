## ADDED Requirements

### Requirement: Temporada de desenvolvimento sem prova-alvo

O sistema SHALL permitir uma temporada do tipo `DESENVOLVIMENTO`, sem prova, gerada por ação do
treinador a partir de objetivo do ciclo, duração em semanas, `TemplateMetodologia` e baseline do atleta.

A temporada do tipo `PROVA` SHALL continuar exigindo prova. A do tipo `DESENVOLVIMENTO` SHALL ter prova
nula, `objetivoCiclo` e `dataFim` preenchidos.

A geração SHALL ser determinística, SHALL NOT chamar LLM e SHALL nascer em `PROPOSTA`. Cada
`SemanaPlanejada` SHALL ter `fase` BASE ou BUILD; PEAK, TAPER e RACE_WEEK SHALL NOT ser aceitas neste
tipo, nem na geração nem no ajuste.

Aprovação, ajuste, versionamento, visibilidade ao atleta e bloqueio por calibração SHALL seguir as
mesmas regras da temporada de prova.

#### Scenario: Geração do ciclo
- **WHEN** o treinador gera um ciclo de 8 semanas com objetivo de base para um atleta sem prova-alvo
- **THEN** o sistema cria um `PlanoTreino` em `PROPOSTA`, do tipo `DESENVOLVIMENTO`, sem prova, com 8 `SemanaPlanejada`
- **THEN** todas as semanas têm fase BASE ou BUILD

#### Scenario: Geração reprodutível
- **WHEN** a geração roda duas vezes com o mesmo objetivo, duração, template e baseline
- **THEN** as duas execuções produzem os mesmos valores em todas as semanas

#### Scenario: Temporada de prova sem prova
- **WHEN** é pedida a geração de uma temporada do tipo `PROVA` sem prova
- **THEN** a resposta é 422 e nenhuma temporada é criada

#### Scenario: Fase inválida no ajuste
- **WHEN** o treinador tenta definir uma semana do ciclo como TAPER
- **THEN** a validação recusa a alteração com o motivo

#### Scenario: Atleta em calibração
- **WHEN** o treinador tenta gerar o ciclo para um atleta em calibração
- **THEN** a resposta é 422 com o motivo e nenhuma temporada é criada

### Requirement: Uma temporada ativa por atleta, de qualquer tipo

O sistema SHALL manter no máximo uma temporada `ATIVO` por atleta, considerando os dois tipos.

Aprovar uma temporada de prova para um atleta com ciclo de desenvolvimento `ATIVO` SHALL arquivar o
ciclo com `motivoVersao` indicando a substituição, preservando as `SemanaPlanejada` e os `PlanoSemanal`
vinculados.

#### Scenario: Prova aparece durante o ciclo
- **WHEN** o treinador aprova uma temporada de prova para um atleta na semana 5 de um ciclo de 8
- **THEN** o ciclo passa a `ARQUIVADO` com o motivo registrado
- **THEN** a temporada de prova é a única `ATIVO` do atleta e os planos semanais anteriores continuam consultáveis

#### Scenario: Proposta de prova em paralelo
- **WHEN** o treinador gera uma proposta de temporada de prova com um ciclo `ATIVO`
- **THEN** o ciclo continua valendo até a aprovação da proposta
