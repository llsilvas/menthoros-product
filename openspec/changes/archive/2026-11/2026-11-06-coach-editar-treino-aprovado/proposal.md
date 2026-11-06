**Tamanho:** M · **Trilha:** Full

# Proposal — coach-editar-treino-aprovado

O treinador passa a editar um treino **pendente** de um plano **já aprovado**, na aba Plano do perfil
do atleta, com o mesmo dialog "Editar treino" da revisão. Ao salvar, o treino é reenviado ao relógio
do atleta (Garmin Connect ou intervals.icu).

Protótipo: https://claude.ai/artifact/Tg5fFzr1Sxq8EL2mkK8mQD

## Status

- draft (2026-11-03): aberta a partir do protótipo. Desacoplada de `garmin-reenvio-plano` (ver
  "Dependências").
- Revisão de produto (2026-11-03, `product-reviewer`): **Refine**. Incorporados: métrica de adoção e
  confiança (exploratória, sem baseline), custo de LLM zero, edições fora da taxa de aceitação da IA,
  422 para resultado não exportável. Decisões pendentes em "Open Questions".
- Pre-mortem (2026-11-03, Codex): **NO-GO no design inicial**, 2 bloqueadores (push concorrente
  sobrescrevendo a edição; duplicata no Garmin sem `externalId`). Incorporados no `design.md` (D1,
  D2): 409 com envio em andamento, claim condicional, intenção de envio decidida no PATCH, `PERDIDO`
  travado, "hoje" no fuso do atleta, exportabilidade do resultado completo. Hipótese do Garmin vira a
  task 0.1.
- DoR (2026-11-04, `/implement init`; `spec-reviewer` + DeepSeek, Codex sem cota): premissas
  atualizadas contra `develop`. `garmin-reenvio-plano` teve o backend mergeado antes (PR #213), então
  esta change reusa `conexaoCanal`, `reiniciarSincronizacao`, `JANELA_SINCRONIZANDO` e `CLAIM_PERDIDO`
  em vez de criar `canalConectado` e método de domínio (D2, D6). Migration vira `V109`, identificadores
  novos em inglês (ADR-0007), retenção LGPD do registro por cascata (D7), conexão revogada conta como
  relógio para o treino de hoje (D1), trava do 409 limitada à janela de 10 min (R3). Do DeepSeek,
  rejeitados após checar o código: corrida PATCH × push (coberta por `@Version` + claim condicional),
  exportabilidade "cega ao canal" (o processor usa o mesmo converter nos dois canais).

## Why

Depois da aprovação, o plano fica congelado. O lápis do `CurrentWeekPlan` só aparece com o plano em
`AGUARDANDO_REVISAO` (`CurrentWeekPlan.tsx:193`), e o backend recusa o PATCH em qualquer outro status
(`TreinoPlanejadoServiceImpl.java:262-265`: "Treino só pode ser editado quando o plano está aguardando
revisão").

A semana real muda depois da aprovação: o atleta avisa de uma dor, troca o dia do longão, o
treinador quer baixar a carga de um intervalado. Hoje a saída é excluir e gerar o plano de novo, o
que perde as edições já feitas (coach-in-the-loop) e gasta uma geração de IA. A outra saída é mandar
a mudança por mensagem, e aí o relógio do atleta mostra um treino e o treinador pediu outro.

## What Changes

- **Backend — regra de edição (D1):** `editarTreino` passa a aceitar plano `APROVADO` quando o
  treino está `PENDENTE` e a data é futura **no fuso do atleta** (`AtletaHojeResolver`). O treino de
  hoje só é editável para atleta **sem** relógio conectado: com relógio, o atleta pode já ter a versão
  antiga e não há aviso a ele no v1. Realizado, perdido (inclusive pulado hoje pelo atleta), de dia
  passado ou de hoje com relógio → 422. Resultado do patch
  que deixa de ser exportável ao relógio (descanso, sem duração e sem distância) → 422. Envio ao
  relógio em andamento → 409. Plano `AGUARDANDO_REVISAO` segue como hoje; `REJEITADO` segue
  bloqueado.
- **Backend — reenvio do treino editado (D2):** a intenção de envio é decidida no PATCH. Com canal
  conectado, o treino volta a `AGUARDANDO_RETRY` (tentativas zeradas, `externalId` mantido) e um
  evento novo dispara o push só dele depois do commit; o scheduler de retry cobre a falha do evento.
  Sem canal, os campos de sincronização não mudam.
- **Backend — claim condicional:** o processor de push deixa de reclamar treino já `SINCRONIZANDO`.
  Evita dois envios do mesmo treino ao mesmo tempo (no Garmin, um workout duplicado).
- **Backend — marca e editabilidade no perfil:** `TreinoPlanejado` ganha `editedAfterApprovalAt`
  (nullable). O item de treino do perfil do atleta expõe esse campo e `editable`, calculado no
  backend. O canal vem da `conexaoCanal` que o perfil já expõe (`garmin-reenvio-plano`); nenhum
  campo de canal novo.
- **Backend — registro da edição (sinal de aprendizado, D7):** cada PATCH em plano `APROVADO` grava
  uma linha em `tb_planned_workout_post_approval_edit` com o treino antes e depois (JSONB), quem editou,
  quando, e o motivo opcional (`PAIN_INJURY`, `SCHEDULE`, `LOAD`, `OTHER`). O PATCH ganha o campo
  opcional `editReason`. Sem tela de leitura nesta change.
- **Frontend:**
  - `CurrentWeekPlan`: o lápis aparece também em plano aprovado, só em treino editável (mesma regra
    do backend). Treino realizado mostra um cadeado com rótulo acessível "Treino realizado — não
    editável".
  - `TreinoEditDialog` ganha um aviso opcional de "plano já aprovado", com o canal do atleta:
    - com canal: "O treino já está no <canal> de <atleta>. Ao salvar, a versão anterior é
      substituída…" e botão "Salvar e reenviar";
    - sem canal: "A mudança aparece só no app" e botão "Salvar";
    - motivo opcional de um toque (Dor/lesão, Agenda, Carga, Outro).
  - Treino de hoje de atleta com relógio: sem lápis, com indicador "Treino de hoje já está no
    relógio".
  - Card: selo "Editado após aprovação" quando `editedAfterApprovalAt` existe. O chip de
    sincronização mostra o reenvio em andamento e depois o resultado (recarga do perfil após salvar).
- **Fora de escopo (non-goals):** adicionar ou excluir treino em plano aprovado; mover treino de
  dia; editar treino de dia passado, realizado ou de hoje com relógio conectado; notificar o atleta
  da mudança (push/mensagem); tela de histórico das edições; uso do motivo/diff pela IA; polling do
  status de sincronização após salvar; edição pela tela de Revisão de planos; chip de sincronização
  neutro de canal (fica em `garmin-reenvio-plano`).

## Dependências

- **`garmin-reenvio-plano`** (revisado 2026-11-04): o backend dela está em `develop` (PR #213) e esta
  change reusa o que ela entregou (D6). O front dela é o PR #188, aberto, e também mexe em
  `CurrentWeekPlan` e `SyncStatusChip`: o front desta change só começa depois do merge do #188.

## Impact

- **Backend:** `TreinoPlanejadoServiceImpl` (regra e reenvio), `TreinoPlanejado` (campo novo; reusa
  `reiniciarSincronizacao`), evento `WorkoutEditedAfterApprovalEvent` + listener que
  chama `IntervalsIcuPushProcessor.processar` para um treino, `AtletaPerfilCoachOutputDto` (campos
  novos no item), entidade e repositório de `PlannedWorkoutPostApprovalEdit`, migration `V109` (coluna
  nullable sem backfill + tabela nova com `tenant_id`).
- **Contrato de API:** PATCH existente com regra mais permissiva (422/409 em casos novos) e campo
  opcional `editReason`; campos novos `editedAfterApprovalAt` e `editable` (item). Tudo additive.
- **Frontend:** `CurrentWeekPlan`, `TreinoEditDialog` (props do aviso), `TreinoPlanejadoCard`
  (selo), tipos curados em `src/types`, E2E do fluxo.
- **Multi-tenancy:** o PATCH já busca plano e treino por tenant; o evento carrega `tenantId` e o
  listener reusa o processor, que valida tenant por treino.

## Critérios de aceite

- **CA1 — Edição em plano aprovado.** Given plano `APROVADO` e treino de amanhã sem treino
  realizado, When o treinador envia o PATCH, Then 200, os campos mudam e `editedAfterApprovalAt` é
  preenchido.
- **CA2 — Treino realizado ou perdido travado.** Given plano `APROVADO` e treino com `statusTreino`
  `REALIZADO`, ou `PERDIDO` por `pularHoje` no dia de hoje, When PATCH, Then 422 e nada muda.
- **CA3 — Dia passado travado, no fuso do atleta.** Given plano `APROVADO`, atleta com fuso
  `America/Sao_Paulo` e treino de ontem nesse fuso, When PATCH, Then 422 e nada muda; e Given 23h30 em
  São Paulo (02h30 UTC do dia seguinte) e treino de amanhã em São Paulo, When PATCH, Then 200.
- **CA3a — Treino de hoje.** Given treino de hoje (fuso do atleta) em plano `APROVADO`, When PATCH,
  Then 422 se o atleta tem conexão de canal, ativa ou revogada, e 200 se nunca conectou.
- **CA3b — Resultado não exportável.** Given plano `APROVADO`, When o patch troca o tipo para
  descanso ou remove duração e distância, Then 422 e nada muda.
- **CA3c — Envio em andamento.** Given treino `SINCRONIZANDO`, When PATCH, Then 409 e nada muda.
- **CA4 — Plano rejeitado.** Given plano `REJEITADO`, When PATCH, Then 422 (comportamento atual).
- **CA5 — Revisão inalterada.** Given plano `AGUARDANDO_REVISAO`, When PATCH, Then o comportamento
  atual se mantém: nenhum evento de push e `editedAfterApprovalAt` continua nulo.
- **CA6 — Reenvio só do treino editado.** Given plano `APROVADO` com 4 treinos `SINCRONIZADO`, When
  o treinador edita 1, Then depois do commit só esse treino é empurrado ao canal (mesmo `externalId`,
  atualizado no lugar) e os outros 3 não são tocados.
- **CA7 — Canal pela conexão.** Given atleta Garmin e atleta intervals.icu, When cada um tem um
  treino editado, Then o push vai pelo canal da conexão ativa de cada um.
- **CA8 — Atleta sem canal.** Given atleta sem conexão de canal (inclusive treino com `externalId`
  de uma conexão revogada), When o treinador edita, Then 200, nenhum push é tentado, nenhum evento é
  publicado e os campos de sincronização não mudam.
- **CA8b — Sem duplicata no primeiro envio.** Given atleta Garmin, plano recém-aprovado com treino
  ainda sem `externalId`, When o treinador edita esse treino e os pushes da aprovação e da edição
  concorrem, Then o Garmin recebe um único workout, com o conteúdo editado.
- **CA9 — Tenant.** Given treino de outro tenant, When PATCH, Then 403/404 e nenhum evento.
- **CA10 — Lápis e cadeado.** Given plano aprovado com um treino realizado, um de ontem sem
  realizado e um de amanhã, When o treinador abre a aba Plano, Then só o de amanhã tem o botão
  "Editar treino"; o realizado mostra o cadeado acessível; e o treino de hoje de atleta com relógio
  não tem lápis e mostra "Treino de hoje já está no relógio".
- **CA11 — Aviso no dialog.** Given plano aprovado e atleta com Garmin, When o treinador abre a
  edição, Then vê o aviso de plano aprovado citando Garmin Connect, o motivo opcional e o botão
  "Salvar e reenviar"; sem canal, vê o texto "só no app" e o botão "Salvar".
- **CA11b — Registro da edição.** Given PATCH em plano `APROVADO` com `editReason = LOAD`, Then
  `tb_planned_workout_post_approval_edit` ganha uma linha do tenant com o treino antes e depois, o usuário
  e o motivo; sem motivo, a linha é gravada com motivo nulo; PATCH em `AGUARDANDO_REVISAO` não grava
  linha; PATCH recusado (409/422) não grava linha.
- **CA12 — Depois de salvar.** Given edição salva com sucesso, When o perfil recarrega, Then o card
  mostra os valores novos e o selo "Editado após aprovação".
- **CA13 — E2E.** Um spec Playwright cobre: abrir plano aprovado → editar treino pendente → salvar →
  card com o selo; e confirma que o treino realizado não tem lápis.

## Métrica de sucesso

Exploratória: não há baseline medido de exclusão e regeneração de plano aprovado, e a demanda vem do
protótipo, não de um pedido registrado de treinador do pilot. O `editedAfterApprovalAt` é o
instrumento que valida a hipótese.

- **Adoção:** % de planos aprovados com ≥1 edição pós-aprovação, e edições por plano (via
  `editedAfterApprovalAt`).
- **Confiança no relógio:** % dos treinos editados após aprovação que terminam `SINCRONIZADO`.
- **Secundário:** exclusões de plano aprovado seguidas de nova geração na mesma semana e atleta,
  antes e depois. Medir o baseline das últimas semanas antes do merge, se possível.

Custo de LLM marginal zero: a edição não chama IA e evita uma geração de plano.

Edições pós-aprovação ficam **fora** do cálculo de taxa de aceitação de propostas da IA, para não
misturar ajuste da semana real com rejeição da proposta.

## Open Questions & Assumptions

- **Resolvido (pre-mortem):** `PERDIDO` pode ser de hoje (atleta pulou pelo app). Fica travado;
  editar não reabre treino pulado.
- **Resolvido (pre-mortem):** "hoje" é o dia do atleta (`AtletaHojeResolver`), não o da JVM.
- **Premissa corrigida (pre-mortem):** o upsert sem duplicata só vale com `externalId` gravado; o
  Garmin cria workout novo sem ele. A regra do 409 e o claim condicional (D2) cobrem o primeiro
  envio.
- **Hipótese a validar (task 0.1):** atualizar o workout no Garmin faz o relógio receber a versão
  nova na mesma data. O adapter não mexe no schedule existente; se o relógio não atualizar, recriar
  o schedule entra nesta change.
- **Follow-up fora do escopo:** recuperar treino preso em `SINCRONIZANDO` (processo caiu entre claim
  e marcação). Já afeta a aprovação hoje; com esta change, o treino fica não editável (409) até ser
  destravado.
- **Premissa:** o atleta vê a versão nova no app assim que o PATCH é salvo; não há aviso ativo a ele.
- **Premissa:** o snapshot antes/depois é o `TreinoPlanejadoOutputDto` serializado (com etapas), não
  a entidade; mudanças futuras no DTO não migram linhas antigas.
- **Decidido (2026-11-03):** treino de hoje de atleta com relógio fica bloqueado no v1. Gatilho para
  liberar: existir aviso ao atleta da mudança (change própria, coach-in-the-loop).
- **Revisado (2026-11-04):** a decisão de 2026-11-03 ("desacoplada; `canalConectado` nasce aqui")
  caducou: `garmin-reenvio-plano` mergeou o backend antes e já expõe `conexaoCanal`. Ver D6.
- **Decidido (2026-11-04, DoR):** atleta com conexão de canal revogada conta como "com relógio" para
  o treino de hoje: a conexão caída não tira o treino antigo do aparelho.
- **Decidido (2026-11-03):** diff antes/depois e motivo opcional entram nesta change (D7), só
  gravados; leitura e uso pela IA ficam fora.
- **Aberto:** origem da demanda (pedido de treinador do pilot ou hipótese do protótipo) não
  informada; a métrica segue exploratória.
- **Aberto:** o selo "Editado após aprovação" também aparece para o atleta? Proposta: não nesta
  change (só treinador).
- **Aberto:** editar treino de hoje depois de o atleta já ter começado (atividade em andamento, sem
  `treinoRealizado` ainda) é permitido. Aceito como está; o alerta do dialog cobre.
