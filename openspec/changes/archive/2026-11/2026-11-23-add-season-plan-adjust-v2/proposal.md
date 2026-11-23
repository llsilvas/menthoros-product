**Tamanho:** M · **Trilha:** Full

> **Ticket 6** do épico `add-season-plan-macrocycle`. Proposal, design (Decisão 4) e decisões vivem no
> épico. Refinado no DoR de 2026-11-22 (spec-reviewer + Codex, ambos NOT READY) com o vocabulário que os
> tickets 1–5 deixaram no código e quatro decisões do founder (abaixo).

## Status

- ready-for-agent (2026-11-22): `add-season-plan-approve-athlete-view` (ticket 5) arquivado em 2026-11-21.

## Why

O treinador precisa mudar a temporada aprovada quando a realidade muda, sem reescrever o que já foi
executado e registrando o porquê.

## What Changes

Tasks do épico: **3.1 (rascunho, salvar, arquivar), 3.2, 3.3, 3.4 (arquivar a anterior, adiada pelo ticket
5), 3.8, 4.4, 4.5, 4.8, 4.10 (v2), 7.8 (sem parâmetros), 7.10, 7.14** e a parte da seção 9 que cabe à tela.

**Vocabulário real** (ADR-0007): temporada = `PlanoTreino` com `seasonStatus` (`PROPOSED`, `ACTIVE`,
`ARCHIVED`, `COMPLETED`), `version` e `versionReason`; semana = `SeasonWeek` (`weekIndex` a partir de 1,
`weekStart` segunda-feira, `phase`, `targetTss`, `targetVolumeKm`, `longRunKm`, `deload`, `keySessions`,
`valueSource`); serviço `SeasonPlanService`; rotas sob `/api/v1/atletas/{atletaId}/season-plans`; flag
`season-plan.enabled`. Nada de `macrociclo`, `ordem` ou `ATIVO`.

### Modelo da v2 (decisão: PROPOSED com version + 1)

- **Rascunho** = um novo `PlanoTreino` `PROPOSED` com `version = ativa.version + 1`, mesma prova-alvo,
  `baseSeasonPlanId` = id da ativa e cópia de **todas** as semanas da ativa (`valueSource` preservado).
  Sem enum novo: o índice único de PROPOSED por atleta (V118) já garante um rascunho por vez, e o de
  ACTIVE (V116) não é tocado enquanto a ativa existir.
- **Migration V120** (aditiva, sem backfill): `tb_plano_treino.base_season_plan_id UUID NULL REFERENCES
  tb_plano_treino(id) ON DELETE SET NULL`. `PlanoTreino.baseSeasonPlanId`.
- **Aprovar a v2** (mesma rota `approve`, numa transação):
  1. trava a prova-alvo (`FOR UPDATE`, como hoje);
  2. exige que a base do rascunho ainda seja a ACTIVE do atleta e que `version` = `base.version + 1` —
     senão **409** (concorrência, decisão: versão-base + lock);
  3. exige motivo (`reason`): ausente, em branco ou com mais de 255 caracteres (o tamanho de
     `version_reason`, V116) → **422**, nenhuma versão criada;
  4. recopia da ativa as **semanas travadas na data da aprovação** (ver abaixo) — o passado nunca vem
     do rascunho, mesmo que a semana tenha virado entre o rascunho e a aprovação;
  5. recalcula `peakVolumeKm` e `maxLongRunKm` do rascunho a partir das semanas finais;
  6. arquiva a ativa (`ARCHIVED`, `saveAndFlush`) e só então ativa o rascunho (`ACTIVE`, `versionReason`,
     `approvedBy`, `approvedAt`, `saveAndFlush`) — a ordem respeita o índice único de ACTIVE.
  O gate de calibração do ticket 4 continua valendo na aprovação da v2. A v1 (sem base) segue o fluxo
  atual do ticket 5; motivo opcional ali.
- **Descartar o rascunho:** `DELETE .../{seasonPlanId}` num `PROPOSED` com base → `ARCHIVED` com
  `versionReason = "rascunho descartado"` (sem `DELETE` de linha), 204. Fora disso, 409.

### Concorrência (decisão: versão-base + lock)

Criar ajuste, editar semana, descartar e aprovar começam travando a prova-alvo da temporada
(`findByIdAndTenantIdForUpdate`, como a aprovação do ticket 5) **antes** de ler a temporada, e só então
revalidam o status. Assim uma edição ou um descarte nunca grava sobre uma versão que acabou de virar
ACTIVE, e dois "Ajustar" simultâneos se serializam: o segundo encontra o rascunho do primeiro e recebe 200
com ele. 409 fica para base que deixou de ser ACTIVE, rascunho de outra base ou proposta v1 aberta.
Edições de semanas diferentes no mesmo rascunho: última escrita vence.

### Semanas travadas (somente leitura)

Com `hoje` em `America/Sao_Paulo` (o `FUSO` do serviço):

- **concluída:** `weekStart + 7 ≤ hoje`;
- **em andamento:** `weekStart ≤ hoje < weekStart + 7`;
- **da prova:** a semana que contém a data da prova-alvo. Provas preparatórias (marcos) **não** travam.

Editar semana travada → **422** com o motivo; na tela a linha não é editável e mostra o motivo.

### Edição por semana (decisão: só por semana)

`PATCH .../{seasonPlanId}/weeks/{weekIndex}` num `PROPOSED` (rascunho ou proposta v1), campos opcionais:
`phase` (só `BASE`, `BUILD`, `PEAK`, `TAPER` — `RACE_WEEK` é só da semana da prova, travada), `targetTss`,
`targetVolumeKm`, `longRunKm` (≥ 0), `deload`, `keySessions` (≤ 500 caracteres; string vazia limpa).
Campo ausente (nulo) não muda. Formato inválido (negativo, tamanho), semana travada, fase não permitida e
`RACE_WEEK` → **422** com `message`. Sem `@Valid` na rota: com `spring.mvc.problemdetails` ligado, o 400 do
Bean Validation sai sem `message` nem `fields` (precedente `CoachAthleteZonesController`); o serviço valida
tudo. A semana editada passa a `valueSource = COACH` (granularidade por
semana: a origem por valor fica para o diff do ticket 7), e `peakVolumeKm`/`maxLongRunKm` do rascunho são
recalculados. Responde o DTO completo, com as validações brandas recalculadas (épico 4.8, já existentes
na leitura). O DTO de semana passa a expor `keySessions`, para a tela reabrir o que salvou.

**Fora daqui (ticket 7):** editar parâmetros com recálculo, contagem de semanas por fase e o 422 de soma
de fases (épico 3.6, 4.6, 7.11), diff entre versões, origem por valor.

### Leitura

- `GET .../current` continua devolvendo a ACTIVE (ou a PROPOSED v1); ganha `openDraftId` (id do rascunho
  aberto, quando há) e `version`.
- `GET .../{seasonPlanId}` lê uma temporada do atleta por id (rascunho incluído), com `version`,
  `baseSeasonPlanId` e, por semana, `keySessions`, `locked` + `lockReason` (`COMPLETED`, `IN_PROGRESS`,
  `RACE_WEEK`).
- O atleta (`/atletas/me/season-plan`) só vê ACTIVE — o rascunho é invisível a ele, como hoje.

### Planos semanais já gerados (decisão: ficam na v1)

`PlanoSemanal.plano_treino_id`, `season_week_id` e `target_deviation_pct` gravados antes da v2 continuam
apontando para a v1 arquivada: são o histórico do que foi planejado naquela versão. Nenhuma linha é
reescrita. As gerações seguintes leem a ACTIVE (v2) pelo `SeasonWeekContextResolver`.

### Segurança

Todas as rotas novas: `hasAnyRole('TECNICO','ADMIN')`, flag desligada → 404 `SEASON_PLAN_DISABLED`,
consultas por `tenant_id`; atleta de outra assessoria → 403 (`@RequireTenant`); temporada de outro atleta
→ 404; `weekIndex` fora da temporada → 404; papel ATLETA → 403.

### Front

- Aba Temporada: com ACTIVE, botão **"Ajustar temporada"** (cria o rascunho) ou **"Continuar ajuste"**
  (com `openDraftId`).
- **`CoachSeasonAdjustPage`**: tabela das semanas; linhas travadas só leitura com o motivo; linhas futuras
  editáveis (fase, TSS, volume, longão, descarga, sessões-chave) salvas por linha; alertas das validações;
  **"Aprovar nova versão"** com motivo obrigatório (botão desabilitado sem motivo) e confirmação;
  **"Descartar ajuste"**. Erros 409/422 exibidos com a mensagem do backend.
- Cliente em `src/api/services/SeasonPlanService.ts` (escrito à mão no padrão do gerado, como os tickets
  2–5); tipos em `src/types/SeasonPlan.ts`.

## Critérios de aceite

- **Dado** uma temporada ACTIVE v1, **quando** o treinador cria o ajuste, **então** nasce um PROPOSED v2
  com `baseSeasonPlanId` = v1 e as mesmas semanas; criar de novo — inclusive duas chamadas simultâneas —
  devolve o mesmo rascunho (201 e depois 200, uma linha só); com uma proposta v1 de outra prova aberta →
  409.
- **Dado** um rascunho de v2, **quando** o treinador aprova sem motivo (ou em branco), **então** recebe 422
  e nenhuma versão muda.
- **Dado** uma temporada aprovada e hoje na semana 7 de 18, **quando** a v2 é aprovada, **então** as
  semanas 1 a 7 (concluídas + em andamento) e a da prova ficam idênticas às da v1, a v1 fica ARCHIVED e a
  v2 ACTIVE com `versionReason`.
- **Dado** uma semana concluída, em andamento ou a da prova, **quando** o treinador a edita, **então**
  recebe 422, e na tela a semana não é editável e mostra o motivo.
- **Dado** uma semana futura, **quando** o treinador muda o volume e as sessões-chave, **então** a semana
  fica com `valueSource = COACH`, as demais não mudam, `peakVolumeKm` reflete o novo máximo e reabrir o
  ajuste mostra as sessões-chave salvas.
- **Dado** uma aprovação em andamento, **quando** chega uma edição ou um descarte do mesmo rascunho,
  **então** a edição/descarte espera o lock e recebe 409, porque a temporada já é ACTIVE.
- **Dado** o atleta em calibração (gate do ticket 4 ativo), **quando** o treinador aprova a v2, **então**
  recebe 422 e a v1 continua ACTIVE.
- **Dado** que a ativa mudou depois de o rascunho nascer (outra aprovação), **quando** o treinador aprova o
  rascunho antigo, **então** recebe 409.
- **Dado** planos semanais já gerados com a v1, **quando** a v2 é aprovada, **então** eles continuam com o
  mesmo `plano_treino_id` e `season_week_id`.
- **Dado** um ATLETA, ou um treinador de outra assessoria, **quando** chama as rotas de ajuste, **então**
  recebe 403 / 404; o atleta continua vendo só a ACTIVE.
- **E2E:** abrir o ajuste, editar uma semana futura, aprovar com motivo e ver a v2 na aba.

## Non-goals

- Recálculo por parâmetros, contagem de fases e soma de fases, diff entre versões, origem por valor e
  conflito de edição por campo — ticket 7 (`add-season-plan-version-diff`)
- Reapontar planos semanais já gerados para a v2
- Sugestão da IA, notificação ao atleta, replanejamento automático (ticket 10)

## Métrica de sucesso

Temporadas ACTIVE com ao menos uma v2 por ciclo e dias desde a aprovação anterior, por tenant (log
`season-plan.version-approved` com `version` e `daysSincePreviousApproval`; `PlanoTreino` não guarda a
criação do rascunho) — acompanhamento, não alvo.

## Riscos e rollback

- **Troca de ACTIVE sem atleta sem plano:** arquivar e ativar na mesma transação; falha em qualquer passo
  faz rollback e a v1 continua ACTIVE.
- **Rascunho preso** bloqueia gerar outra proposta: o descarte resolve; o rascunho também é arquivado
  quando a prova-alvo é cancelada (`archiveOpenSeasons` já cobre PROPOSED).
- Rollback: `season-plan.enabled=false` desliga as rotas; a V120 é aditiva (coluna nula). Revert do PR
  remove o código.

## Open Questions & Assumptions

- **Decidido pelo founder no DoR (2026-11-22):** rascunho = PROPOSED com `version + 1` e base; planos
  semanais já gerados ficam na v1; edição só por semana (parâmetros e soma de fases no ticket 7);
  concorrência por versão-base + lock da prova.
- Assumido: o motivo tem até 255 caracteres (tamanho atual de `version_reason`, sem migration); "descartar"
  arquiva em vez de apagar.

## Bloqueado por

- Nada. `add-season-plan-approve-athlete-view` (ticket 5) arquivado em 2026-11-21.
