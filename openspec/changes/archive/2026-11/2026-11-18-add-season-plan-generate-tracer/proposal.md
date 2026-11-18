**Tamanho:** M · **Trilha:** Full

> **Ticket 2** do épico `add-season-plan-macrocycle` — o **tracer bullet**: o caminho mais curto e
> completo (banco, motor, API, aba) de "o treinador gera uma temporada e a vê". Proposal, design e
> decisões amplas vivem no épico; as decisões deste ticket estão abaixo (DoR de 2026-11-16).

## Status

- ready-for-agent (2026-11-16): ticket 1 (`add-season-plan-model-integrity`) entregue no PR #239
  (squash `51cf493`). DoR de 2026-11-16 voltou NOT READY (spec-reviewer + Codex); as lacunas foram
  decididas com o usuário na mesma data e estão em "Decisões do DoR".

## Why

Até aqui o treinador não vê nada da temporada. Este ticket entrega a primeira volta inteira, com o motor
na versão mais simples, para que cada ticket seguinte só acrescente comportamento a um caminho que já
funciona e já é testado de ponta a ponta.

## What Changes

Tasks do épico: **1.3b, 2.1, 2.2, 2.3 (rampa, sem descargas),
2.6 (sem o caso de calibração), 4.1, 4.2, 4.12, 4.12a, 4.12b, 4.13, 4.14, 7.1, 7.3, 7.4, 7.7, 7.12,
7.13, 7.15**, e a parte da seção 9 que cabe à aba. Onde o épico diz "perfil do atleta", este ticket usa
a aba no inbox do treinador (D6).

- **Backend**
  - V118: só índices — `(tenant_id, prova_id)` em `tb_plano_treino` (herdado do ticket 1) e índice
    único parcial de uma temporada `PROPOSED` por atleta (D2). Sem tabela de template (D14)
  - `SeasonPlanner` puro em `domain/planner` (motor mínimo: fases + rampa, D3/D9–D11), com o template
    default como constante (D14); `SeasonPlanService` orquestra repositórios, `Clock` e lock
  - `nome`, `descricao` e `objetivo` do `PlanoTreino` preenchidos a partir da prova (épico 1.3b)
  - Endpoints (D1) com guard de papel, filtro por assessoria e flag `season-plan.enabled` (D5)
  - Desmarcar a prova-alvo sem substituta arquiva a temporada aberta (D7)
- **Frontend**
  - Service e tipos escritos à mão em `src/api`, hook próprio
  - Aba **Temporada** no painel do atleta em `/coach/inbox`, logo depois de **Diagnóstico** (D6)

## Decisões do DoR (2026-11-16)

- **D1 — Contrato.**
  - `POST /api/v1/atletas/{atletaId}/season-plans` gera a temporada da prova-alvo → **201** com a
    temporada.
  - `GET /api/v1/atletas/{atletaId}/season-plans/current` → **200** com a temporada `ACTIVE` ou, se não
    houver, a `PROPOSED` mais recente; **204** quando não há nenhuma.
  - Resposta (`SeasonPlanResponseDto`), com os nomes das entidades do ticket 1: `id`, `seasonStatus`,
    `provaId`, `provaNome`, `provaData`, `shortPreparation`, `totalWeeks`, `initialCtl`,
    `peakVolumeKm`, `weeks[]` com `weekIndex`, `weekStart` (segunda-feira), `phase`, `targetVolumeKm`,
    `targetTss`, `deload` (sempre `false` aqui), `longRunKm` (sempre `null` aqui) e `valueSource`
    (sempre `ENGINE` aqui).
- **D2 — Gerar de novo.** Já existe `PROPOSED` para a mesma prova → **200** com ela, sem criar outra.
  Já existe `ACTIVE` → **409** (gerar sobre ativa é replanejamento, ticket 10). Duplo clique concorrente:
  o índice único parcial da V118 garante uma só `PROPOSED`; a violação vira 409.
- **D3 — Horizonte.** Semanas de segunda a domingo, da segunda-feira da semana corrente até a semana
  da prova, inclusive; fuso `America/Sao_Paulo`; `Clock` injetado. Exemplo canônico: hoje segunda
  2026-11-16, prova domingo 2027-04-04 → 20 semanas (a 20ª começa em 2027-03-29). Menos semanas que o
  mínimo (8/10/12/16) → gera mesmo assim com `shortPreparation = true`, cortando conforme D9.
  **422** quando: sem prova-alvo, prova `CANCELADA`, sem data, passada, ou a menos de 2 semanas.
- **D4 — Baseline e rampa.** Sem conversão km↔TSS: TSS e volume têm bases próprias (D11) e a mesma
  curva (D10). Atleta em calibração gera normalmente (gate no ticket 4). Arredondamento: km com 1 casa,
  TSS inteiro. Descargas ficam para o ticket 3.
- **D9 — Distribuição de fases do template default** (proporções de Pfitzinger, *Advanced
  Marathoning*; polimento pela janela do `TaperStrategy`, alinhada a Bosquet 2007). O seed guarda a
  contagem de semanas por fase na duração mínima:

  | Distância | Mín. | Base | Construção | Pico | Polimento | Semana da prova |
  |---|---|---|---|---|---|---|
  | KM_5 | 8 | 3 | 2 | 2 | 0 | 1 |
  | KM_10 | 10 | 4 | 3 | 2 | 0 | 1 |
  | KM_21 | 12 | 4 | 3 | 3 | 1 | 1 |
  | KM_42 | 16 | 6 | 4 | 3 | 2 | 1 |

  `CUSTOMIZADA` usa a linha da faixa de `RacePreparationRule`. Semanas além do mínimo vão para a Base.
  Semanas a menos: se o CTL de partida (D11) for ≥ 40, corta Base → Construção → Pico; abaixo de 40,
  corta Construção → Pico → Base (atleta sem base não perde a base). Polimento só é cortado quando o
  resto acabou; a Semana da prova nunca.
- **D10 — Curva.** `S` = TSS de partida (D11); pico `P = S × 1,30` (fator `peakGrowth` do template,
  conservador frente aos +30–50% dos planos de Pfitzinger). Nas `n` semanas de Base+Construção+Pico, a
  semana `i` (1..n) tem `TSS_i = S + min((P − S) × i / n, 56 × i)` — 56 = `MAX_CTL_RAMP_PER_WEEK` × 7,
  teto e não meta. Polimento = `0,60 × TSS_n`; Semana da prova = `0,45 × TSS_n` (faixa de redução
  41–60% de Mujika/Bosquet; o ticket 3 troca pela curva do `TaperStrategy`). Volume da semana =
  volume de partida × `TSS_semana / S`. Exemplo: CTL 40 → `S = 280`, `P = 364`. Se o corte deixar
  `n = 0` (ex.: KM_42 a 3 semanas → Polimento 2 + Semana da prova), a referência é `S` no lugar de
  `TSS_n`: o polimento parte da carga atual.
- **D11 — Bases de partida.** Resolvidas cada uma por si; uma base só vale se for > 0. Faltando
  qualquer uma → **422** dizendo qual.
  - TSS: último `MetricasDiarias` do atleta, projetado até hoje com o decaimento do PMC,
    `CTL_hoje = CTL_último × e^(−dias/42)`, e `S = CTL_hoje × 7`. Vale só se o primeiro registro tem
    ≥ 42 dias e `CTL_hoje > 0`; senão `ctlEstimado` do `AthleteBaselineState` limitado a 40
    (`TETO_CTL_COLD_START`), se > 0.
  - Volume: soma de `TreinoRealizado.distanciaKm` (só `contaNaCarga()`, distâncias nulas ignoradas)
    das 4 semanas completas antes da corrente ÷ 4; se a soma for 0, `PerfilOnboardingAtleta
    .volumeSemanalMax`, se > 0.
- **D12 — 404 da flag com código.** O 404 da flag desligada leva `code: SEASON_PLAN_DISABLED` no corpo;
  o front só esconde a aba com esse código. Qualquer outro erro mostra o estado de erro. Atleta
  inexistente ou de outra assessoria responde **403**, não 404: o `@RequireTenant` barra o UUID antes do
  service, como em todos os endpoints com recurso no path (QA 2026-11-18). Por isso esse caso também
  não chega a revelar o estado da flag.
- **D13 — Corrida entre desmarcar a alvo e gerar.** Os dois lados travam a linha da prova
  (`PESSIMISTIC_WRITE`) **no início** da transação, antes de qualquer consulta: o `POST` revalida
  `provaAlvo` depois do lock; os caminhos que desmarcam, cancelam ou trocam a alvo (`ProvaServiceImpl`,
  `OnboardingServiceImpl`) carregam a prova com lock antes de `archiveOpenSeasons`. Quem chega depois
  vê o commit do outro: ou o `POST` recebe 422, ou o arquivamento encontra a proposta. Coberto por IT
  com duas threads.
- **D14 — Template como constante, não tabela (2026-11-16, revisão de reaproveitamento).** O ticket só
  usa o default global (Q7) e o seed é uma tabela fixa de 4 linhas (D9). Uma `tb_season_template` +
  entidade + repositório + seed seria código sem leitor diferente do motor. O template vira constante
  em `SeasonPlanner` (contagens de D9 + `peakGrowth`, fatores de Polimento e Semana da prova). Desvio
  consciente da Decisão 9 do épico ("versionado no banco, por assessoria"): continua sendo dado, não
  prompt, e a tabela entra quando o template por assessoria entrar. Tasks 1.5/1.6/1.9 do épico ficam
  adiadas para esse ticket.
- **D5 — Precedência e flag.** `@PreAuthorize` roda antes: `ATLETA` recebe **403** sempre. Para
  `TECNICO`/`ADMIN`, flag desligada → **404** lançado no service. Flag `season-plan.enabled`
  (`SEASON_PLAN_ENABLED`, default `false`). O front descobre a flag pelo 404 do GET e esconde a aba.
- **D6 — Onde aparece.** Aba **Temporada** no painel do atleta selecionado em `/coach/inbox`
  (`CoachInboxPage`), entre **Diagnóstico** e **Plano**, como no protótipo. Faixa "Proposta — ainda
  não visível ao atleta". KPIs: total de semanas, dias até a prova, fase da semana corrente, volume de
  pico. Tabela: Semana, Início, Fase, Volume (km), TSS.
- **D7 — Desmarcar a alvo sem substituta.** Arquiva a temporada `ACTIVE`/`PROPOSED` com o motivo
  "prova deixou de ser alvo", pelo mesmo `archiveOpenSeasons` do ticket 1.
- **D8 — Métrica.** % de atletas com prova-alvo futura que têm temporada gerada, por SQL documentada
  em `tasks.md`, sem instrumentação nova.

## Critérios de aceite

- **Dado** um atleta com prova-alvo a 20 semanas e sem temporada, **quando** o treinador clica "Gerar
  temporada", **então** nasce uma temporada `PROPOSED` com 20 semanas, cada uma com fase,
  `targetVolumeKm` e `targetTss`, e a aba mostra KPIs, faixa de proposta e tabela.
- **Dado** o mesmo atleta, template, baseline e `Clock`, **quando** a geração roda duas vezes,
  **então** os valores são idênticos.
- **Dado** prova-alvo KM_21 a 6 semanas (mínimo 12) e CTL de partida ≥ 40, **quando** gera, **então**
  nascem 6 semanas com `shortPreparation = true`: Construção 1, Pico 3, Polimento 1, Semana da prova 1;
  com CTL < 40: Base 4, Polimento 1, Semana da prova 1.
- **Dado** CTL de partida 40 e prova KM_42 a 20 semanas (Base 10, Construção 4, Pico 3, Polimento 2,
  Semana da prova 1), **quando** gera, **então** `targetTss` da semana 1 = 285, da última de Pico = 364,
  de cada semana de Polimento = 218 e da Semana da prova = 164.
- **Dado** último `MetricasDiarias` com 10 dias de idade, **quando** gera, **então** o CTL usado é o
  projetado com `e^(−10/42)`.
- **Dado** prova passada, cancelada, sem data ou a menos de 2 semanas, ou atleta sem prova-alvo,
  **quando** o `POST` roda, **então** responde 422 e nada é gravado.
- **Dado** atleta sem base de TSS ou sem base de volume (D11), **quando** gera, **então** 422 dizendo
  qual base falta.
- **Dado** um `POST` e a desmarcação da prova-alvo concorrentes, **quando** os dois terminam, **então**
  não sobra temporada aberta para prova que deixou de ser alvo.
- **Dado** uma `PROPOSED` existente para a prova, **quando** o `POST` roda de novo, **então** devolve 200
  com a mesma temporada e não cria outra; **dado** uma `ACTIVE`, devolve 409.
- **Dado** a prova-alvo desmarcada sem substituta, **quando** salva, **então** a temporada aberta fica
  `ARCHIVED` com "prova deixou de ser alvo".
- **Dado** um atleta sem prova-alvo, **quando** o treinador abre a aba, **então** vê o estado vazio que
  orienta a cadastrar a prova; com prova e sem temporada, vê "Gerar temporada".
- **Dado** um usuário `ATLETA`, **quando** chama a geração ou a leitura, **então** recebe 403, com a flag
  ligada ou desligada.
- **Dado** uma temporada da assessoria A, **quando** um treinador da assessoria B a consulta ou gera
  para o mesmo `atletaId`, **então** recebe 403 (`@RequireTenant`, padrão dos endpoints por atleta)
  e nada é gravado.
- **Dado** erro na consulta, **quando** abre a aba, **então** vê o erro com "Tentar de novo", nunca o
  estado vazio; durante a carga vê o skeleton.
- **Dado** `season-plan.enabled=false`, **quando** um treinador chama qualquer endpoint, **então**
  responde 404 com `code: SEASON_PLAN_DISABLED` e a aba não aparece; um 404 sem esse código mostra o
  estado de erro.

## Non-goals

Taper, longão, descargas, marcos e validações de proposta (ticket 3); gate de calibração (ticket 4);
aprovação e visão do atleta (ticket 5); edição pelo treinador; replanejamento; templates por
assessoria; geração automática.

## Métrica de sucesso

% de atletas com prova-alvo futura (`statusProva` ≠ `CANCELADA`) que têm temporada `PROPOSED` ou
`ACTIVE`, por assessoria; SQL em `tasks.md`. Primeiro passo da métrica de adoção do épico.

## Riscos e rollback

- Flag desligada por padrão: em produção nada aparece até ligar `SEASON_PLAN_ENABLED`.
- Rollback: desligar a flag. A V118 só cria índices, removíveis sem perda de dado.
- O motor mínimo gera alvos sem descargas; como a temporada fica `PROPOSED` e invisível ao atleta, não
  há impacto na prescrição até o ticket 5.

## Bloqueado por

- `add-season-plan-model-integrity` (ticket 1) — entregue.
