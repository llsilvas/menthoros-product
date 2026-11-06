**Tamanho:** S · **Trilha:** Full (dois repos + contrato de API)

# Proposal — coach-alterar-data-treino

## Why

O treinador não consegue mover um treino de dia. O `TreinoEditDialog` mostra o dia só como chip
de leitura, e `TreinoPlanejadoPatch` / `TreinoPlanejadoPatchDto` não têm `dataTreino`. Para trocar
o dia hoje ele exclui o treino e recria em outro dia (só em revisão; em plano aprovado nem isso,
porque excluir é proibido) — perde etapas, zonas e observação, e o atleta vê o treino sumir e
voltar.

Validado no backend (2026-11-06): **não existe regra que amarre a data do treino aos
`diasDisponiveis` do atleta** — o campo só alimenta o prompt da IA
(`DisponibilidadePromptFormatter`). A única regra de data é a da adição: dentro de
`[semanaInicio, semanaFim]` do plano (`TreinoPlanejadoServiceImpl:271`). Então "mover para um dia
fora da disponibilidade" não precisa de exceção nova: basta o PATCH aceitar a data.

## What Changes

- **Backend** — `TreinoPlanejadoPatchDto.dataTreino` (`LocalDate`, opcional). Quando presente e
  diferente da atual: valida que está dentro da semana do plano (mesma regra da adição, extraída
  para um ponto único); em plano `APROVADO`, a nova data deve ser hoje ou futura no mesmo critério
  que o coordinator já aplica ao treino editado; grava `dataTreino` e deriva `diaSemana`
  (`Utils.converterDayOfWeekParaDiaSemana`); remove o descanso do dia de destino
  (`removerDescansoDoDia`, como na adição) e registra se o dia de origem ficou sem prescrição
  (`avisarSeDiaFicouSemPrescricao`, como na exclusão). Em plano aprovado o reenvio ao relógio já
  acontece (`reiniciarSincronizacao`), e o novo evento sai na nova data.
- **Frontend** — `TreinoEditDialog` troca o chip do dia por um `Select` com os sete dias da semana
  do plano (`"Seg 03/11"`); mudar o dia entra no PATCH como `dataTreino`. Sem date picker: a
  semana é fechada, sete opções bastam e não há lib de data-picker no projeto. Dia fora da
  disponibilidade do atleta aparece com marcação discreta ("fora dos dias do atleta"), sem
  bloquear.

## Non-Goals

- Mover treino para outra semana / outro plano.
- Trocar dois treinos de lugar (swap) ou mover vários de uma vez.
- Alterar `diasDisponiveis` do atleta a partir do dialog.
- Date picker livre ou calendário.

## Capabilities

### Modified Capabilities

- `coach-approved-plan-edit`: a edição de treino (em revisão e em plano aprovado) passa a cobrir
  a data, com as regras de semana fechada e de dia não passado.

## Impact

- `apps/menthoros-backend`: `TreinoPlanejadoPatchDto`, `TreinoPlanejadoServiceImpl.editarTreino`
  / `aplicarPatch`, `PostApprovalEditCoordinator` (snapshot inclui a data), testes de service e
  controller. Sem migration: `data_treino` e `dia_semana` já existem.
- `apps/menthoros-front`: `types/PlanoReview.ts` (`TreinoPlanejadoPatch.dataTreino`),
  `TreinoEditDialog` (select do dia, precisa de `semanaInicio`/`semanaFim` — nova prop ou derivada
  do plano nos três chamadores: `CoachPlanReviewPage`, `CurrentWeekPlan`, `planosDialog`),
  `useTreinoPlanejado`; E2E `plan-review-edicao.spec.ts` e `editar-treino-aprovado.spec.ts`.
- Ordem: backend primeiro (front novo mandando `dataTreino` para backend antigo seria ignorado em
  silêncio — Spring ignora propriedade desconhecida — e o treinador acharia que moveu).

## Critérios de aceite

1. **Contrato** — Given PATCH com `dataTreino` dentro da semana do plano, Then o treino grava a
   nova data e `diaSemana` coerente; o GET devolve os dois.
2. **Semana fechada** — Given `dataTreino` fora de `[semanaInicio, semanaFim]`, Then 422
   (`DomainRuleViolationException`, mesmo handler da adição) com mensagem começando por "Data do
   treino fora do intervalo do plano" e nada muda.
3. **Disponibilidade não bloqueia** — Given atleta com `diasDisponiveis = [SEG, QUA, SEX]`, When o
   treino é movido para sábado, Then 200 e o treino fica no sábado.
4. **Descanso do destino** — Given dia de destino marcado como descanso no plano, Then o descanso
   daquele dia sai (`coach-substituiu-descanso-por-treino` no log).
5. **Origem sem prescrição** — Given o treino era o único do dia de origem e não há descanso lá,
   Then o log/contador `plano_dia_sem_prescricao` registra, e a edição é aceita.
6. **Plano aprovado** — Given plano `APROVADO`, When a nova data é dia passado no fuso do atleta,
   Then 422 `PAST_DAY`; When é hoje e o atleta tem relógio conectado, Then 422 `TODAY_ON_WATCH`;
   When é futura (ou hoje sem relógio) e o treino é editável, Then 200, a edição conta como
   pós-aprovação e a sincronização reinicia (reenvio na nova data). Origem de dia passado ou já
   realizada continua recusada como hoje.
6b. **Sem duplicata no relógio** — Given evento criado no intervals.icu mas sem `eventId` gravado
   (resposta perdida), When o treino é movido e reenviado, Then o adapter encontra o evento pelo
   `externalId` na semana do plano e o atualiza; exatamente um evento no fim. Garmin já cobre
   (`GarminTrainingAdapter.garantirSchedule` procura em ±14 dias e apaga o workout se o schedule
   falhar) — só teste de regressão, sem mudança.
7. **Patch sem data** — Given PATCH sem `dataTreino`, Then comportamento idêntico ao atual. Given
   PATCH **só** com `dataTreino` igual à atual, Then nada muda e a sincronização não reinicia;
   com outros campos junto, segue o fluxo atual (edição marcada, sincronização reinicia).
7b. **Retry na janela de push** — Given plano aprovado, treino `SINCRONIZANDO` com envio em
   andamento, When chega PATCH (inclusive o retry de um já aplicado), Then 409 como hoje; o front
   recarrega o treino e, se a data já é a nova, não reenvia.
8. **Dialog** — Given o dialog aberto, Then o dia é um select com os sete dias da semana do plano,
   o atual selecionado; When o treinador escolhe outro e salva, Then o PATCH leva `dataTreino`
   (ISO `yyyy-MM-dd`); sem mudar o dia, `dataTreino` fica fora do PATCH.
9. **Marcação de disponibilidade** — Given o atleta com `diasDisponiveis`, Then dias fora dela
   aparecem marcados no select, selecionáveis.
10. **Regressão** — `./mvnw clean verify`; `npm run lint && npm run build && npm run test:run`;
    E2E cobrindo CA8 em revisão e em plano aprovado.

## Métrica de sucesso

- Proxy mecânico: CA1–9 cobertos por teste; CA10 verde.
- Rotina do treinador: mover um treino de dia é uma edição (um select + salvar) em vez de excluir
  e recriar. Baseline antes do deploy: exclusões de treino gerado pela IA seguidas de adição no
  mesmo plano em < 2 min, por semana (log `Excluindo treino` + `adicionarTreino`), levantado nos
  logs do Railway (task 1.0) antes do deploy. Meta: a sequência cai pelo menos 80% nas quatro
  semanas seguintes e os PATCHes com `dataTreino` a substituem.
- Sinal de aprendizado: mover o dia é discordância com a proposta da IA; conta no diff
  proposta × edição (`editadoPeloCoach` / edição pós-aprovação), como qualquer outro campo.

## Rollback

Reverter o PR do front (o select some, o dia volta a chip) e, se preciso, o do backend (o campo
volta a ser ignorado). Sem migration e sem dado a desfazer: treinos já movidos ficam na data
nova, válida em qualquer versão; eventos já reenviados ao relógio ficam na data nova e o próximo
reenvio (se houver) os atualiza pelo `externalId`/`eventId` como hoje.

## Status

- draft (2026-11-06).
- Revisão de produto (2026-11-06, `product-reviewer`): **Go**, 4 refinamentos incorporados:
  (1) mudança de data entra no diff proposta-IA × edição do treinador (snapshot do coordinator e
  `editadoPeloCoach` já cobrem; registrar como sinal de aprendizado, não só log); (2) métrica
  ancorada em exclusões de treino da IA seguidas de recriação, com baseline antes do deploy;
  (3) atleta não é notificado do dia novo — segue o que a edição pós-aprovação já faz (sem
  notificação; o relógio recebe o evento novo); (4) fuso: ver pre-mortem.
- DoR (2026-11-06, `/implement init`): `spec-reviewer` NOT READY (rollback, status fixo, cenários,
  verify por task, split da 2.3) e Codex needs-attention (Garmin sem vínculo recuperável; retry
  recebe 409 na janela de push) — todos conferidos no código e fechados (Rollback, CA2/7/7b, D3,
  Riscos, tasks 1.0/1.5/2.3–2.7).
- Pre-mortem Codex (2026-11-06): **needs-attention**, 4 achados, todos conferidos no código e
  absorvidos: (1) duplicata no intervals.icu após resposta perdida — D7 e CA6b; (2) a premissa de
  fuso estava errada, o coordinator já usa `AtletaHojeResolver` — D3 reescrito; (3)
  `CurrentWeekPlan.toDialogTreino` não tem `dataTreino` — D6; (4) mover para hoje com relógio
  deixa PATCH repetido ambíguo — destino passa pela mesma política da origem (D3), CA6.

## Open Questions & Assumptions

- **Premissa:** a disponibilidade do atleta é sugestão para a IA, não restrição para o treinador.
  Confirmado no código: nenhuma validação de `diasDisponiveis` fora do prompt.
- **Premissa (corrigida no pre-mortem):** em plano aprovado o destino passa pela mesma
  `ApprovedWorkoutEditPolicy` da origem, com `hoje` do `AtletaHojeResolver` (fuso do atleta).
  Destino passado → 422; destino hoje com relógio conectado → 422 (D3).
- **Premissa:** mover para um dia que já tem treino é permitido (dois treinos no mesmo dia já
  existem na adição; sem constraint única).
- **Decisão:** o atleta não recebe notificação da mudança de dia em plano aprovado — mesmo
  comportamento da edição pós-aprovação atual; o relógio recebe o evento na nova data. Notificar
  o atleta é change à parte.
- **Origem (2026-11-06):** pedido de treinador do piloto.
- **Decisão (DoR, Codex):** duplicata no Garmin após persistência local perdida é gap do reenvio
  unitário, pré-existente e sem vínculo recuperável (só `workoutId`); fora de escopo, follow-up
  `garmin-reenvio-unitario-remover-orfaos`. Ver Riscos no design.
- **Decisão:** `contexto` do cabeçalho ("Bruno Dias · Ter 20/10") fica com o original até salvar
  — é o contexto de abertura; o select mostra o dia escolhido.
