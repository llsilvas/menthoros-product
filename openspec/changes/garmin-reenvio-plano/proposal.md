**Tamanho:** M · **Trilha:** Full

# Proposal — garmin-reenvio-plano

Reenvio manual do plano aprovado ao canal de treinos (Garmin ou intervals.icu), pelo treinador, com
um botão no plano da semana. Complementa `garmin-training-push`: o push só dispara na aprovação e o
retry automático desiste depois de 5 tentativas, então hoje não há saída para um treino que falhou
de vez.

## Status

- draft (2026-11-01): aberta a partir do incidente de produção do envio ao Garmin. Sem dependência
  de outra change; depende de `garmin-training-push` mergeada em `main` (já está).
- Revisão de produto (2026-11-01, `product-reviewer`): **Refine**. Vale construir (pequena, sem
  migration, nasceu de incidente real). Ajustes incorporados abaixo: motivo legível do erro entra no
  mesmo escopo do botão (sem motivo, o botão vira roleta); botão desabilitado para atleta sem canal
  conectado em vez de 200 enganoso; orientação ao treinador em `ERRO_AUTENTICACAO`; métrica de
  taxa de reenvio que vira `SINCRONIZADO`. É feature de confiabilidade (paridade), não diferencial.

## Why

No primeiro envio real ao Garmin (2026-11-01), os 4 treinos do plano aprovado falharam por um bug do
client (o Garmin responde o `scheduleId` como número solto) e esgotaram as 5 tentativas do retry
antes da correção chegar à produção. Os treinos viraram `ERRO_PERMANENTE`, que o scheduler não pega
mais. O único jeito de reenviar foi um `UPDATE` direto no banco de produção, feito pelo
desenvolvedor.

O mesmo vale para qualquer causa que o treinador resolve depois da aprovação: o atleta conecta o
Garmin tarde, o app Garmin ganha a Training API V2 (hoje 412/403 vira `ERRO_AUTENTICACAO`, sem
retry), o atleta reautoriza a conexão. Excluir e gerar o plano de novo perde as edições do
treinador (coach-in-the-loop) e gasta uma geração de IA.

## What Changes

- **Backend:** novo `POST /api/v1/coach/planos/{id}/reenviar-sincronizacao`. Só aceita plano
  `APROVADO` do tenant. Zera as tentativas dos treinos do plano em `ERRO_*` e republica o
  `PlanoAprovadoEvent`, que o listener de push já trata (idempotente, escolhe o canal pela conexão
  do atleta). Resposta com a contagem de treinos reenviados.
- **Frontend:** botão "Reenviar ao relógio" no plano da semana (`CurrentWeekPlan`), visível quando
  ao menos um treino do plano está em `ERRO_*` e **desabilitado, com tooltip, quando o atleta não
  tem canal conectado**. O plano mostra o **motivo legível** do erro por tipo (autenticação,
  validação, limite, temporário, permanente) com a ação sugerida ao treinador. O `SyncStatusChip`
  deixa de assumir intervals.icu: textos neutros de canal e o estado "Não conectado" passa a
  considerar também a conexão Garmin do atleta.
- **Backend (contrato de leitura):** o item de treino do plano no perfil do atleta passa a expor
  `erroSincronizacao` (hoje só `statusSincronizacao` chega ao front; a mensagem fica no banco).
- **Fora de escopo (non-goals):** reenvio por treino individual; reenvio automático ao conectar o
  Garmin; mudar o limite de 5 tentativas ou a cadência do scheduler; tela de histórico de
  sincronização; reenvio de plano não aprovado.

## Impact

- **Backend:** `CoachPlanoReviewController` (endpoint), `PlanoReviewService`/`Impl` (método de
  reenvio, `@Transactional` para o evento `AFTER_COMMIT` disparar), `TreinoPlanejado` (método de
  reset de sincronização), `TreinoPlanejadoRepository` (busca dos treinos em erro do plano). Sem
  migration, sem mudança em `GarminClient` nem em `WorkoutChannel`.
- **Contrato de API:** endpoint novo (additive). O DTO do perfil do atleta ganha o sinal de conexão
  de canal Garmin (ver D4 do `design.md`).
- **Frontend:** `CurrentWeekPlan`, `SyncStatusChip`, hook de reenvio, cliente curado em `src/api`.
- **Multi-tenancy:** endpoint com `@RequireTenant` e busca do plano por `(id, tenantId)`; o evento
  carrega o `tenantId` e o listener já filtra por ele.

## Critérios de aceite

- **CA1 — Reenvio de plano com treinos em erro.** Given plano `APROVADO` com 4 treinos em
  `ERRO_PERMANENTE` e `tentativasSincronizacao = 5`, When o treinador chama o reenvio, Then os 4
  treinos ficam com `tentativasSincronizacao = 0`, `erroSincronizacao = null` e o push é tentado
  logo após o commit; a resposta traz `reenviados = 4`.
- **CA2 — Só o que está em erro é reiniciado.** Given plano com 2 treinos `SINCRONIZADO` e 2
  `ERRO_AUTENTICACAO`, When reenvia, Then só os 2 em erro têm as tentativas zeradas e `reenviados = 2`.
  O listener reprocessa o plano inteiro (decisão de 2026-11-04, ver D1): os `SINCRONIZADO` são
  reenviados de forma idempotente e terminam com o mesmo `externalId` e status `SINCRONIZADO`
  (ou `SINCRONIZADO_PARCIAL`, se já estavam assim).
- **CA3 — Plano não aprovado.** Given plano `AGUARDANDO_REVISAO` ou `REJEITADO`, When reenvia, Then
  422 e nenhum evento é publicado.
- **CA4 — Isolamento de tenant.** Given plano de outro tenant, When reenvia, Then 403
  (`@RequireTenant`) e nenhum evento é publicado. Given id de plano inexistente, Then 404.
- **CA11 — Push em andamento.** Given plano com ao menos um treino em `AGUARDANDO_RETRY`, ou em
  `SINCRONIZANDO` com `ultimaTentativaSincronizacao` há menos de 10 min, When reenvia, Then 409,
  nenhum treino é reiniciado e nenhum evento é publicado. No front o botão aparece desabilitado com
  tooltip "Envio em andamento" só com treino em `AGUARDANDO_RETRY`; com `SINCRONIZANDO` o clique
  passa e o 409 mostra a mesma mensagem. `SINCRONIZANDO` mais antigo que 10 min é tratado como preso (processo
  caiu no meio do claim) e não bloqueia.
- **CA5 — Sem treinos em erro.** Given plano `APROVADO` sem nenhum treino em `ERRO_*`, When
  reenvia, Then `reenviados = 0` e nenhum evento é publicado.
- **CA6 — Canal pela conexão.** Given atleta Garmin e atleta intervals.icu, When cada um tem o plano
  reenviado, Then o push vai pelo canal da conexão ativa de cada atleta (sem lógica nova no
  endpoint).
- **CA7 — Botão no plano da semana.** Given plano com ao menos um treino em `ERRO_*`, When o
  treinador abre o plano da semana, Then vê o botão "Reenviar ao relógio"; sem treino em erro, o
  botão não aparece. Ao clicar, o botão fica desabilitado enquanto a chamada corre e o resultado
  (sucesso ou erro) é mostrado.
- **CA8 — Chip neutro de canal.** Given atleta com conexão Garmin e treino `SINCRONIZADO`, When o
  treinador vê o chip, Then o texto não cita intervals.icu; e o atleta Garmin conectado não aparece
  como "Não conectado".
- **CA9 — Motivo legível.** Given treino em `ERRO_AUTENTICACAO`, `ERRO_VALIDACAO`, `ERRO_LIMITE_RATE`,
  `ERRO_TEMPORARIO` ou `ERRO_PERMANENTE`, When o treinador abre o plano da semana, Then vê o motivo
  em português e a ação sugerida (ex.: autenticação → "peça ao atleta para reautorizar o Garmin
  Connect"; validação → "ajuste o treino"; limite/temporário → "o sistema tenta de novo; reenvie se
  persistir").
- **CA10 — Atleta sem canal.** Given atleta sem conexão de canal ativa, When o treinador vê o
  plano com treino em erro, Then o botão aparece desabilitado com tooltip "Atleta sem canal
  conectado" e nenhuma chamada é feita.

## Métrica de sucesso

Treino em `ERRO_PERMANENTE` ou `ERRO_AUTENTICACAO` volta a `SINCRONIZADO` por ação do treinador na
tela, sem acesso ao banco e sem excluir o plano: **0 intervenções manuais de banco** para reenviar
um plano e **1 clique** do treinador. Medido por: o log do endpoint (plano, tenant, `reenviados`) e
a taxa de treinos `ERRO_*` do plano antes e depois do clique. Sinal do lado do treinador: **% dos
reenvios cujos treinos terminam `SINCRONIZADO`** e a **reincidência** de erro após o reenvio; se a
reincidência for alta, o problema é estrutural (ex.: Training API V2 não habilitada) e o botão não é
a resposta.

## Open Questions & Assumptions

- **Premissa:** reenvio é **por plano**, não por treino. O listener já processa o plano inteiro e
  a idempotência do push (atualiza o workout, move ou recria o schedule) torna reenviar treinos
  já sincronizados seguro. Por treino ficaria para uma change própria se o treinador pedir.
- **Premissa:** o endpoint serve aos **dois canais** (Garmin e intervals.icu), porque o canal é
  escolhido pela conexão do atleta e `IntervalsIcuPushListener` é o mesmo código. Sem nome de marca
  no endpoint.
- **Premissa:** republicar o `PlanoAprovadoEvent` é seguro porque o `IntervalsIcuPushListener` é o
  único ouvinte hoje (verificado em 2026-11-01). Um ouvinte novo que notifique o atleta na aprovação
  passaria a notificar também no reenvio; a D2 do `design.md` registra a mitigação.
- **Resolvido (revisão de produto):** botão e motivo legível entram **juntos**; botão desabilitado
  para atleta sem canal (o endpoint continua devolvendo `reenviados` e nunca promete envio).
- **Gatilho para promover fora de escopo:** reenvio por treino e polling pós-clique viram change
  própria se o treinador reportar confusão após o reenvio.
- **Aberto:** a mensagem do botão e do tooltip ("relógio" x nome do canal). Assumido "Reenviar ao
  relógio" por ser neutro; o treinador pode preferir "Reenviar treinos".
- **Resolvido (DoR 2026-11-04):** o `SyncStatusChip` mostra "Não conectado" quando
  `atletaConectadoIntervalsIcu` é falso, o que esconde o status do atleta só-Garmin. A D4 fixa o
  campo novo no item de treino, ao lado do antigo.
- **Resolvido (DoR 2026-11-04):** reenvio reprocessa o plano inteiro (aceito, sem filtro no
  listener) e o botão bloqueia com push em andamento (CA11).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Clique duplo dispara dois pushes em paralelo | O processor já faz claim com `@Version`; o segundo perde o claim e não age (log existente). O botão também desabilita durante a chamada. |
| Reenviar para atleta sem conexão ativa | O listener registra "sem conexão ativa" e nada acontece; o treino segue em erro. A resposta ao treinador não promete envio, só `reenviados`. |
| Lote grande de treinos esbarra no rate limit do Garmin (429) | Training API V2 §2.3, Starter: **100 chamadas/min por app**, somando OAuth e API. Cada treino custa ≥ 2 chamadas (create/update do workout + schedule), mais refresh de token, e o reenvio custa **todos os treinos do plano** (≤ 7 por semana, não só os em erro: o listener reprocessa o plano inteiro), mais a listagem de `removerOrfaos`. Um atleta não chega perto (~15 chamadas por reenvio), mas reenviar (ou aprovar em lote, `BatchPlanDialog`) para ~10+ atletas de uma vez passa de 100/min. 429 cai no retry existente (`ERRO_LIMITE_RATE`, varredura a cada 15 min) — mas **consome** uma das 5 tentativas, porque o claim incrementa `tentativasSincronizacao` antes da chamada; como a janela do Garmin é de 1 min, as 4 tentativas seguintes quase certamente passam. Aceito nesta change, sem throttle próprio. Se o lote virar rotina, espaçar o push por app. |
| Reenvios repetidos esgotam a cota diária do atleta | Training API V2 §2.3, Starter: **200 chamadas/usuário/dia**, janela móvel de 24 h. Cada clique custa ~15 chamadas (plano inteiro, ver linha acima), e os treinos em erro voltam a consumir até 5 tentativas × 2 chamadas pelo retry; um treinador insistindo num plano com causa permanente queima a cota (~13 cliques/dia esgotam 200) e trava também o push dos outros treinos do atleta até a janela andar. Mitigação: o botão fica desabilitado e o backend devolve 409 enquanto houver push em andamento (CA11), e o motivo legível (CA9) indica quando reenviar não resolve (autenticação, validação). |
| Reset de tentativas esconde uma causa que sempre falha | O treino volta a `ERRO_*` e, em 5 tentativas, a `ERRO_PERMANENTE`. O log do client (mesmo erro, sem corpo) mostra a causa; o reenvio não mascara. |
| `ERRO_AUTENTICACAO` por falta de Training API V2 continua falhando | Esperado: o botão só reenvia. A mensagem do treino ("Autorize o envio de treinos no Garmin Connect") continua visível. |

## Referências

- `garmin-training-push` (mesma família; 4.2 spike registrado lá)
- Incidente 2026-11-01: PRs #199 (log), #201 (scheduleId numérico) no `menthoros-backend`
