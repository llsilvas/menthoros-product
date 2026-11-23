**Tamanho:** M · **Trilha:** Full

> **Ticket 7** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 2, 4) e decisões vivem
> no épico. Escopo refeito em 2026-11-23, depois do DoR (spec-reviewer e Codex, ambos NOT READY): absorve
> o que o ticket 6 (`add-season-plan-adjust-v2`, arquivado em 2026-11-23) adiou para cá.

## Status

- ready-for-agent (2026-11-23): o ticket 6 está em `develop` (backend #261, front #234).

## Why

No ticket 6 o treinador só edita semana a semana. Ele não consegue mudar a estrutura do ciclo (quantas
semanas de Base, Construção, Pico e Polimento) nem a carga de partida sem refazer semana por semana, e não
vê o que mudou em relação à versão ativa antes de aprovar. Este ticket fecha o ajuste: parâmetros com
recálculo que preserva o que ele editou, diff contra a ativa e um 409 de aprovação que não o deixa perdido.

## What Changes

Tasks do épico: **3.5, 3.6, 3.7, 4.6 + 4.7 (num endpoint só), 4.9, 7.9, 7.10 (confirmação de recálculo),
7.11**. Endpoints sob o controller real, `/api/v1/atletas/{atletaId}/season-plans/{seasonPlanId}` — não
`/macrociclo` como no épico.

### Decisões (2026-11-23, do founder)

1. **Escopo:** absorve parâmetros com recálculo, contagem de semanas por fase e o 422 de soma de fases.
2. **Origem por semana.** `SeasonWeek.valueSource` (`ENGINE` | `COACH`) continua por semana, como o ticket 6
   grava. Semana editada pelo treinador fica **inteira** fora do recálculo. Sem origem por campo, sem
   migration para isso.
3. **Diff = rascunho × base.** Compara o ajuste aberto com a ACTIVE que ele copiou (`baseSeasonPlanId`).
   Sem histórico de versões arquivadas.
4. **Conflito = UX do 409.** O backend do ticket 6 já responde 409 quando a base deixou de ser a ACTIVE
   (ou outra versão foi aprovada antes) e o rascunho fica salvo no servidor. Aqui só a tela muda: mostra o
   conflito, mantém o motivo digitado e oferece descartar e recomeçar. Sem rebase.

### Backend

- **V121:** `tb_plano_treino.initial_volume_km NUMERIC(6,1)` nulo. A geração (ticket 2) passa a gravar o
  volume de partida que hoje é resolvido e descartado (`SeasonPlanServiceImpl.resolverVolume`). Temporadas
  anteriores ficam nulas: o flag `season-plan.enabled` está desligado em produção, então só há dados de dev.
  `SeasonPlanVersioning.criarRascunho` copia o valor da ativa para o rascunho, como já copia `initialCtl`.
  A resposta expõe `initialVolumeKm` para a tela pré-preencher o parâmetro.
- **`SeasonPlanner`:** sobrecarga de `plan` que recebe as semanas por fase explícitas (Base, Construção,
  Pico, Polimento; Semana da prova é sempre 1), sem o `ajustar` do template. Mesmo cálculo de TSS, volume,
  descarga, longão e marcos.
- **`POST /{seasonPlanId}/recalculate`** com `{ phaseWeeks: {BASE, BUILD, PEAK, TAPER}, startVolumeKm }`.
  Só sobre rascunho (PROPOSED com `baseSeasonPlanId`), sob o mesmo lock da prova
  (`SeasonPlanVersioning.travar`). Roda o motor a partir da segunda da semana 1 da temporada, com
  `initialCtl` da temporada, o `startVolumeKm` pedido e **os marcos já gravados no rascunho** (as
  preparatórias dos `milestoneRaceId` das semanas, inclusive as passadas). Os marcos não são buscados de
  novo: o recálculo fica determinístico, uma descarga adiada por marco passado continua adiada, e o
  `milestoneRaceId` de cada semana não muda (por isso ele fica fora do diff). Depois, semana a semana:
  - semana travada (`SeasonWeekLock`: concluída, em andamento, da prova) **não muda**;
  - semana com `valueSource = COACH` **não muda**;
  - as demais recebem fase, volume, TSS, longão, descarga e marco do motor, com `valueSource = ENGINE`;
    `keySessions` é preservado.
  - Grava `startVolumeKm` em `initial_volume_km` do rascunho e recalcula os picos (`recalcularPicos`).
  - Responde 200 com o rascunho atualizado.
- **422 do recálculo:**
  - soma de `phaseWeeks` + 1 diferente de `totalWeeks` do rascunho ("a soma das fases dá N semanas; o
    ciclo tem M") — é o 3.6 do épico, validado onde as fases mudam;
  - fase negativa; `startVolumeKm` ausente, ≤ 0, acima de 500 ou com mais de uma casa decimal (a
    coluna é `NUMERIC(6,1)`: o valor recalculado é o mesmo que se relê);
  - `initialCtl` do rascunho nulo ou ≤ 0 (o CTL de partida não é recalculado aqui);
  - a fase que o motor daria a uma semana travada difere da fase gravada nela (o passado não muda de fase);
  - a prova mudou de data e o número de semanas não bate mais ("descarte e comece de novo").
- **409 do recálculo:** não é rascunho (ACTIVE, ARCHIVED ou proposta v1 sem base).
- **`GET /{seasonPlanId}/diff`:** só para rascunho (409 caso contrário). Lista, por semana e por campo que
  mudou (`phase`, `targetVolumeKm`, `targetTss`, `longRunKm`, `deload`, `keySessions`), `weekIndex`,
  `field`, `before` (valor na base), `after` (valor no rascunho) e `source` (`valueSource` da semana do
  rascunho). Alinhamento por `weekIndex`. Lista vazia quando nada mudou.
- **Métrica:** o log `season-plan.version-approved` ganha `changedWeeks` (semanas com ao menos um campo no
  diff) e `coachWeeks` (semanas `COACH` no rascunho aprovado).
- Mesmo guard de papel (`TECNICO`/`ADMIN`), `@RequireTenant` e flag dos endpoints do ticket 6.

### Frontend

- **Bloco "Parâmetros"** na `CoachSeasonAdjustPage`: semanas por fase (Base, Construção, Pico, Polimento),
  com a soma contra o total ao vivo, e volume de partida (pré-preenchido com `initialVolumeKm`). Soma
  divergente desabilita "Recalcular" e mostra a diferença.
- **Confirmação de recálculo:** lista as semanas que serão regeneradas (as não travadas com origem do motor)
  e avisa que as editadas pelo treinador ficam como estão.
- **Valor anterior na tabela:** cada célula que mudou mostra o valor da ativa riscado ao lado do novo e a
  origem da semana ("motor" ou "treinador").
- **Bloco "Alterações":** a lista do diff, semana a semana, antes de aprovar.
- **409 na aprovação:** mensagem "A temporada ativa mudou depois que este ajuste começou", o motivo continua
  no campo, e a ação "Descartar e recomeçar" descarta o rascunho e cria outro a partir da ativa nova.

## Critérios de aceite

- **Dado** um rascunho de 12 semanas com a semana 1 concluída, a 2 em andamento e a 6 editada pelo
  treinador (`COACH`, volume 50 km), **quando** ele recalcula com Base 3, Construção 4, Pico 2, Polimento 2 e
  volume de partida 40 km, **então** as semanas 1, 2, 6 e 12 (prova) ficam iguais e as semanas 3–5 e 7–11
  vêm do motor com `valueSource = ENGINE`.
- **Dado** fases que somam 10 num ciclo de 12, **quando** ele recalcula, **então** recebe 422 com a soma e o
  total, e nada muda.
- **Dado** um recálculo que daria Construção à semana 1 (concluída como Base), **quando** ele recalcula,
  **então** recebe 422 e nada muda.
- **Dado** a semana 5 com `longRunKm` 18 na ativa e 20 no rascunho, editada pelo treinador, **quando** o diff
  é pedido, **então** inclui `{weekIndex: 5, field: longRunKm, before: 18, after: 20, source: COACH}`.
- **Dado** um rascunho igual à ativa, **quando** o diff é pedido, **então** a lista vem vazia.
- **Dado** a ACTIVE ou uma temporada de outra assessoria, **quando** recalcula ou pede o diff, **então**
  recebe 409 ou 403, respectivamente.
- **Dado** um campo alterado, **quando** a tabela renderiza, **então** mostra o valor anterior e a origem.
- **Dado** que outra sessão aprovou outra versão antes, **quando** o treinador aprova, **então** vê a mensagem
  de conflito, o motivo digitado continua no campo, e "Descartar e recomeçar" leva a um rascunho novo da
  ativa atual.

## Métrica de sucesso

Das versões v2+ aprovadas em 30 dias de piloto, a fração com `coachWeeks ≥ 1` e a mediana de
`changedWeeks`, lidas do log `season-plan.version-approved`. Sem alvo: é a linha de base para o ticket 10
(replanejamento), que precisa saber quanto o treinador mexe à mão.

## Não-objetivos

- Origem por campo e preservação parcial de uma semana.
- Diff entre versões arquivadas ou histórico de versões.
- Rebase do rascunho sobre uma ACTIVE nova.
- Recalcular semanas travadas, mudar a data da prova ou o CTL de partida.
- Editar a ordem das fases (o recálculo sempre gera Base → Construção → Pico → Polimento → Prova).

## Riscos e rollback

- **Recálculo sobrescrever edição do treinador:** coberto por teste dedicado (semana `COACH` intacta) e pelo
  aviso na confirmação.
- **Fase do passado divergente:** 422 em vez de reescrever.
- **Rollback:** o flag `season-plan.enabled` desliga tudo; V121 só acrescenta coluna nula. O rascunho pode
  ser descartado a qualquer momento sem afetar a ativa.

## Open Questions & Assumptions

- Assumido: o volume de partida é o único parâmetro de carga editável; o pico continua derivado do motor
  (+30% sobre a partida). Se o treinador pedir "volume de pico" como entrada, é ticket novo.
- Assumido: temporadas sem `initial_volume_km` (dados de dev anteriores à V121) recalculam com o volume que o
  treinador digitar; a tela deixa o campo vazio.

## Bloqueado por

- Nada. `add-season-plan-adjust-v2` (ticket 6) está em `develop`.
