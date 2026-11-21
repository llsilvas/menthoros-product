**Tamanho:** M · **Trilha:** Full

> **Ticket 5** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 3, 4) e decisões vivem
> no épico; as decisões abaixo (DoR de 2026-11-20) prevalecem sobre o texto do épico onde divergem.

## Status

- ready-for-agent (2026-11-20): tickets 2 e 3 arquivados (backend #245/#250, front #226/#227). O DoR de
  2026-11-20 voltou NOT READY (spec-reviewer + Codex, convergentes): o texto era de 2026-11-15, anterior
  aos nomes e ao contrato dos tickets 1–3. As lacunas foram decididas com o usuário na mesma data
  (A1–A9 abaixo).

## Why

Fecha a primeira volta do produto: o treinador aprova a proposta e o atleta passa a ver para onde a
preparação vai. A proposta nunca é visível ao atleta.

## What Changes

Tasks do épico: **3.1 (só aprovar a v1), 4.10 (v1), 4.11, 4.12b (caso do atleta), 8.1, 8.4, 8.7**, e a
parte da seção 9 que cabe ao bloco do atleta. Saem: 3.4 e o arquivamento da `ACTIVE` anterior (A4), 4.3 e
8.2/8.3 (A7, vão para o ticket 8), 8.5 e 8.6 (Q9 do épico).

- Aprovar a proposta: `PROPOSED` → `ACTIVE`, com `approvedBy` e `approvedAt`.
- Leitura do atleta: só `ACTIVE` e só a própria.
- Ação "Aprovar temporada" na aba Temporada do treinador.
- Card "Minha temporada" na home do atleta: prova-alvo, dias que faltam, fase atual, próximos marcos e a
  nota de previsão.
- **Sem migration:** `approved_by` e `approved_at` já existem em `tb_plano_treino` (V116), e o índice
  único parcial `uk_plano_treino_active_season` garante uma `ACTIVE` por atleta.
- **Rollback:** a flag `season-plan.enabled`. Desligada, a aba e o card somem; as temporadas `ACTIVE`
  continuam no banco, intactas.

## Decisões do DoR (2026-11-20)

- **A1 — Aprovar (treinador).** `POST /api/v1/atletas/{atletaId}/season-plans/{seasonPlanId}/approve`,
  `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` e `@RequireTenant`, como os endpoints do ticket 2.
  - 200 com `SeasonPlanResponseDto`, que ganha `approvedAt` (nulo em `PROPOSED`).
  - 404 quando a temporada não existe para aquele atleta no tenant; 404 `SEASON_PLAN_DISABLED` com a flag
    desligada; 403 para `ATLETA` e para outro tenant.
  - 409 quando a temporada está `ARCHIVED`/`COMPLETED`, ou quando o atleta já tem outra `ACTIVE`
    (inclusive se o índice parcial recusar).
  - 422 quando, depois do lock, a prova não é mais alvo ou está `CANCELADA` (defensivo: esses caminhos
    já arquivam a temporada, então na prática cai no 409).
  - `approvedBy` = `Usuario.id` do treinador, resolvido pelo `sub` do JWT no tenant
    (`UsuarioRepository.findByKeycloakIdAndAssessoria_Id`), não o id do Keycloak.
- **A2 — Leitura do atleta.** `GET /api/v1/atletas/me/season-plan`, `@PreAuthorize("hasRole('ATLETA')")`,
  sem `@RequireTenant` (padrão do `AtletaKudosController`); o atleta vem do
  `AuthenticatedAtletaResolver`, nunca de parâmetro.
  - 200 com `AthleteSeasonPlanDto` quando há `ACTIVE` e a prova ainda não passou.
  - 204 em todos os outros casos: só `PROPOSED`, `ARCHIVED`, nenhuma temporada, prova já passou, flag
    desligada (A6).
  - `AthleteSeasonPlanDto`: `raceName`, `raceDate`, `distance` (objeto de `DistanciaProva`),
    `daysToRace`, `currentPhase` (nulo fora do horizonte) e `upcomingMilestones[]`
    (`{name, date, distance}`, só com data ≥ hoje, ordenados). **Não** leva validações, CTL, TSS,
    `valueSource`, ids de usuário nem dados do treinador.
  - "Hoje" e a semana corrente seguem o fuso `America/Sao_Paulo` do `SeasonPlanServiceImpl`; a semana
    corrente é a de `weekStart ≤ hoje < weekStart + 7`.
- **A3 — Aprovar de novo é idempotente.** Aprovar uma temporada já `ACTIVE` devolve 200 com ela como está,
  sem reescrever `approvedBy`/`approvedAt` (duplo clique, duas abas).
- **A4 — Sem arquivar a `ACTIVE` anterior.** Gerar já devolve 409 quando há `ACTIVE`
  (`SeasonPlanServiceImpl`), então não há caminho para duas temporadas abertas até o replanejamento
  (ticket 10). Aprovar com outra `ACTIVE` é 409 (A1). A troca de versão fica para os tickets 6 e 7.
- **A5 — Concorrência (D13 do ticket 2).** A aprovação trava a prova
  (`ProvaRepository.findByIdAndTenantIdForUpdate`), relê a temporada depois do lock e só então decide
  entre 200, 409 e 422. É o mesmo protocolo de quem cancela, desmarca ou troca a alvo, então uma
  temporada arquivada nunca volta a `ACTIVE`.
- **A6 — Flag desligada.** O endpoint do treinador responde 404 `SEASON_PLAN_DISABLED` (como no
  ticket 2) e o do atleta responde 204; o atleta não precisa saber que existe flag. A autorização roda
  antes da flag.
- **A7 — Card do atleta com o escopo do proposal.** Prova-alvo, dias que faltam, fase atual, próximos
  marcos e a nota "As semanas futuras são uma previsão e podem mudar conforme seus treinos." Volume por
  semana, resumo da semana com CTA e a leitura da semana corrente (épico 4.3, 8.2, 8.3) vão para o
  ticket 8 (contexto semanal). O card fica no `AthleteHomePage`; com 204 ou erro de leitura ele não
  existe no DOM (a home não é bloqueada por ele).
- **A8 — Calibração fica com o ticket 4.** Aprovar vale para qualquer `PROPOSED`. Sem dependência entre
  os tickets 4 e 5.
- **A9 — Alertas não bloqueiam.** Os `validations[]` do ticket 3 não impedem aprovar. A soma das fases
  (épico 3.6) fica fora: sem edição, ela não diverge.

## Critérios de aceite

- **Dado** uma temporada `PROPOSED`, **quando** o treinador aprova, **então** a resposta é 200 com
  `seasonStatus = ACTIVE` e `approvedAt` preenchido, e no banco `approved_by` é o `Usuario.id` dele.
- **Dado** uma temporada já `ACTIVE`, **quando** o treinador aprova de novo, **então** a resposta é 200 e
  `approvedBy`/`approvedAt` não mudam.
- **Dado** uma temporada `ARCHIVED`, **quando** o treinador aprova, **então** a resposta é 409.
- **Dado** duas aprovações concorrentes da mesma temporada, **então** há exatamente uma `ACTIVE` e um só
  `approvedAt`. **Dado** aprovar e cancelar a prova concorrentes, **então** a temporada termina
  `ARCHIVED` ou a prova termina não cancelada; nunca `ACTIVE` com prova `CANCELADA` (`*IT`, PostgreSQL).
- **Dado** um usuário `ATLETA`, **quando** chama o endpoint de aprovar, **então** a resposta é 403.
- **Dado** uma temporada só `PROPOSED`, **quando** o atleta chama `GET /atletas/me/season-plan`,
  **então** a resposta é 204, e o card não existe no DOM.
- **Dado** a temporada `ACTIVE` do atleta B, **quando** o atleta A chama `GET /atletas/me/season-plan`,
  **então** recebe a própria (ou 204), nunca a de B; o mesmo para atleta de outro tenant.
- **Dado** a flag desligada, **então** aprovar responde 404 `SEASON_PLAN_DISABLED` e o atleta recebe 204.
- **Dado** uma temporada `ACTIVE`, **quando** o atleta abre a home, **então** vê a prova-alvo, os dias que
  faltam, a fase atual, os próximos marcos e a nota de previsão; a resposta não tem `validations`.
- **Dado** uma proposta na aba Temporada, **quando** o treinador clica "Aprovar temporada", **então** a aba
  passa a mostrar a temporada aprovada, sem o botão (E2E).

## Métrica de sucesso

Adoção do épico: ≥ 70% dos atletas com prova-alvo futura com temporada `ACTIVE`, por assessoria, lido 4
semanas depois de ligar a flag no piloto:

```sql
SELECT p.assessoria_id,
       count(DISTINCT t.atleta_id) FILTER (WHERE t.season_status = 'ACTIVE')::numeric
         / NULLIF(count(DISTINCT p.atleta_id), 0) AS adocao
FROM tb_prova p
LEFT JOIN tb_plano_treino t ON t.prova_id = p.id
WHERE p.prova_alvo AND p.status_prova <> 'CANCELADA' AND p.data_prova >= current_date
GROUP BY p.assessoria_id;
```

Secundária: tempo entre a geração e a aprovação (`approved_at` − `created_at`), mediana por assessoria.

## Non-goals

Edição e versão 2 (tickets 6 e 7), replanejamento (ticket 10), notificação ao atleta, volume por semana e
resumo semanal no card (ticket 8), gate de calibração (ticket 4).

## Open Questions & Assumptions

- Assumido: depois da data da prova o atleta recebe 204; concluir a temporada (`COMPLETED`) é de outro
  ticket.
- `created_at` de `tb_plano_treino` vem do default da V1 (não é mapeado na entidade).

## Bloqueado por

- Nada: ticket 2 arquivado em 2026-11-18 e ticket 3 em 2026-11-19.
