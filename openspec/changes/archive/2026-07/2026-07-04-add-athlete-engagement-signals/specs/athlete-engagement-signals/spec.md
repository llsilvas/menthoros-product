# Spec: athlete-engagement-signals

**Mudança vs versão anterior:** a Home do atleta ganha um indicativo de streak de consistência e
a tela de Progresso (tab Provas) ganha um indicativo de próxima prova/meta — ambos derivados de
dado real já existente, como fatia athlete-facing de baixo custo do discovery de retenção
(`prd/prd-retention-loop-90d.md`).

## Requirement: Home exibe streak de consistência

- **WHEN** um `ATLETA` abre `/athlete/home` e tem ao menos uma semana consistente (≥1 treino
  registrado) terminando na semana atual ou anterior
- **THEN** o sistema exibe o número de semanas consecutivas consistentes, calculado client-side a
  partir de `GET /api/v1/atletas/me/treinos`.

#### Scenario: Streak zerado

- **WHEN** a semana atual e a anterior não têm nenhum treino registrado
- **THEN** o card de streak fica oculto, não exibe "0 semanas" (evita reforçar quebra de hábito).

## Requirement: Progresso exibe próxima prova/meta

- **WHEN** um `ATLETA` abre a tab Provas em `/athlete/progress`
- **THEN** o sistema consulta `GET /api/v1/atletas/me/provas` (endpoint novo, espelha
  `GET /atletas/{atletaId}/provas` restrito a `ATLETA` via `resolverAtletaIdAtual()`) e exibe a
  prova futura mais próxima (nome + dias restantes).

#### Scenario: Nenhuma prova cadastrada

- **WHEN** a lista de provas vem vazia ou sem nenhuma prova futura
- **THEN** o sistema exibe um CTA honesto pedindo ao coach que cadastre a próxima meta, sem
  fabricar uma prova ou contagem de dias.

## Status: proposto — aguardando implementação (Sprint 9.7, após 9.6)
