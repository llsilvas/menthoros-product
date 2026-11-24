## ADDED Requirements

### Requirement: Ciclo de desenvolvimento na aba Temporada

Quando o atleta não tem prova-alvo nem temporada, a aba Temporada SHALL oferecer duas ações: cadastrar
prova-alvo e criar ciclo de desenvolvimento. A criação SHALL pedir objetivo e duração.

Com temporada do tipo `DESENVOLVIMENTO`, o cabeçalho SHALL mostrar o objetivo e a data de fim no lugar
da prova, e a faixa de KPIs SHALL mostrar semana atual de N e dias até o fim, sem KPIs que dependem de
prova. A tela de ajuste SHALL NOT oferecer as fases de pico, polimento e semana da prova.

Com a flag `macrociclo.desenvolvimento.enabled` desligada, a ação de criar ciclo SHALL NOT aparecer.

#### Scenario: Sem prova-alvo, flag ligada
- **WHEN** o treinador abre a aba de um atleta sem prova-alvo e sem temporada
- **THEN** vê as ações de cadastrar prova-alvo e de criar ciclo de desenvolvimento

#### Scenario: Sem prova-alvo, flag desligada
- **WHEN** o treinador abre a aba com a flag desligada
- **THEN** vê apenas a ação de cadastrar prova-alvo

#### Scenario: Ciclo ativo
- **WHEN** o atleta tem um ciclo de desenvolvimento `ATIVO`
- **THEN** o cabeçalho mostra objetivo, data de fim e versão, e o mapa mostra as fases BASE e BUILD sobre o volume semanal

### Requirement: Minha temporada sem prova

Com ciclo de desenvolvimento `ATIVO`, o bloco `Minha temporada` do atleta SHALL mostrar objetivo do
ciclo, posição "semana N de M", data de fim, volume por semana e resumo da semana atual, sem contagem de
dias até prova. Com ciclo em `PROPOSTA`, o bloco SHALL NOT ser renderizado.

#### Scenario: Atleta com ciclo ativo
- **WHEN** o atleta abre o app com um ciclo de desenvolvimento `ATIVO`
- **THEN** vê o objetivo, a semana N de M, a data de fim e o volume por semana

#### Scenario: Ciclo em proposta
- **WHEN** o ciclo ainda não foi aprovado
- **THEN** o bloco não é renderizado
