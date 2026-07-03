# Spec: athlete-retention-quick-wins

**Mudança vs versão anterior:** a Home do atleta e o perfil do atleta (visão coach) ganham 3
features de retenção de baixo custo, sequenciadas por ROI: feedback pós-treino, kudos do coach,
e resumo semanal.

---

## Requirement A: Feedback pós-treino

- **WHEN** um `ATLETA` registra um treino manual via `POST /api/v1/atletas/me/treinos`
- **THEN** o sistema exibe um card de confirmação com resumo do treino (tipo, duração, distância,
  TSS) + feedback determinístico baseado em RPE, sem IA, sem endpoint novo.

#### Scenario: Treino com RPE alto (≥8)

- **WHEN** o atleta registra um treino com `percepcaoEsforco >= 8`
- **THEN** o feedback inclui "Grande esforco! Respeite a recuperacao." — além dos dados do treino.

#### Scenario: Treino com RPE baixo (≤4)

- **WHEN** o atleta registra um treino com `percepcaoEsforco <= 4`
- **THEN** o feedback inclui "Bom treino leve! Ativacao no ponto."

---

## Requirement B: Kudos do coach

- **WHEN** um `TECNICO` acessa o perfil de um atleta (`/coach/athletes/:id`)
- **THEN** o sistema exibe um botão "Reconhecer progresso" que, ao ser clicado, permite
  selecionar um motivo (`CONSISTENCIA`, `MELHORA`, `ESFORCO`, `SUPERACAO`, `VOLTA`) e submete
  `POST /api/v1/coach/atletas/{atletaId}/kudos`.

- **WHEN** um `ATLETA` abre a Home e tem kudos recebidos
- **THEN** o sistema exibe um card "Seu coach reconheceu sua {{motivo}}!" com os últimos 3 kudos.

#### Scenario: Sem kudos

- **WHEN** o atleta nunca recebeu kudos
- **THEN** nenhum card de kudos é exibido (estado vazio honesto).

---

## Requirement C: Resumo semanal na Home

- **WHEN** um `ATLETA` abre `/athlete/home`
- **THEN** o sistema exibe "Seu resumo da semana" com treinos realizados, volume total (km),
  streak de semanas consistentes, forma atual (TSB/statusForma) e próximo treino — todos
  derivados de hooks já existentes (9.5/9.6/9.7).

#### Scenario: Sem treinos na semana

- **WHEN** o atleta não registrou nenhum treino nos últimos 7 dias
- **THEN** o sistema exibe "Voce ainda nao registrou treinos esta semana — todo treino conta!",
  não um resumo fabricado.

---

## Status: proposto — aguardando implementação (Sprint 9.9, após 9.8)
