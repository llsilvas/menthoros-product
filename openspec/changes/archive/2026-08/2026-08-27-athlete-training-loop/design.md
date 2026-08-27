# Design — athlete-training-loop

## D0 — Duas fatias, uma change

A (execução) e B (registro/feedback) formam o ciclo que o atleta percorre num dia e compartilham o
hero da Home como ponto de estado e a mesma E2E. Não se separam: B sem A deixa o registro
pré-preenchido sem origem; A sem B fecha o treino e não pergunta nada. A fatia "o coach reagiu"
foi retirada na criação da change — não há entidade de ajuste no backend; nasce completa depois
de `add-athlete-coach-messaging`.

## D1 — Estado do dia no hero (máquina de estados)

| Estado | Condição | Hero mostra |
|---|---|---|
| `PLANEJADO` | treino hoje, sem realizado | treino de hoje + "Ver etapas e começar" / "Registrar treino" |
| `FEITO_SEM_FEEDBACK` | realizado hoje, `feedbackRegistradoEm == null` | "Treino feito" + "Como foi?" (pré-preenchido com o RPE se existir) |
| `FEITO` | realizado hoje, `feedbackRegistradoEm != null` | resumo do feito + feedback |
| `PULADO` | planejado de hoje `PERDIDO` com `puladoEm` | "Hoje você pulou" + "Registrar mesmo assim" |
| `DESCANSO` | sem treino planejado | "Descanso" + registro opcional |

"Feedback" na tabela é o **carimbo** (D3), nunca o texto ou o RPE — RPE legado sem carimbo é
`FEITO_SEM_FEEDBACK` (DoR 2026-08-27, Codex).

**Fonte do estado (DoR 2026-08-27, spec-reviewer):** `useAthleteHome` devolve só
`proximoTreino` + `metricasChave` — não há de onde tirar "realizado de hoje" no front. O contrato
de `me/home` passa a trazer `hoje` (D2b) e `realizadoHoje?: { id, origem, percepcaoEsforco?,
feedbackRegistradoEm?, duracaoMin, distanciaKm? }` — um fetch só, o hero não chama `GET
/me/treinos` para descobrir o dia. Selector puro `selectTodayState(home)` com testes por linha
da tabela.

## D2 — Alvos de FC/pace vêm resolvidos do backend

`GET /me/treinos/hoje` devolve por etapa `{ duracaoSeg, zona, alvoPrimario: 'FC' | 'PACE' | 'NENHUM',
fcAlvoMin?, fcAlvoMax?, paceAlvo?, textoSecundario?, descricao }`. A FC vem de
`IntervalsIcuTargetParser` (parse do `fcAlvoEtapa` declarado) → `IntervalsIcuFcAlvoResolver.resolver(bruto,
atleta)` → `HrTarget` — a mesma cadeia que o push ao relógio usa. O front não calcula zona → bpm.

**Precedência é parte do contrato (achado Codex #5).** No `IntervalsIcuWorkoutConverter`, quando a
etapa tem FC e pace, **FC vence e o pace desce para o texto** (`:379-391`). O endpoint reproduz isso:
`alvoPrimario = 'FC'`, `paceAlvo` vai em `textoSecundario`, e a tela mostra o pace como
informação, não como alvo operacional — o atleta segue o que o relógio vai controlar. O teste da
A.1 compara contra o `WorkoutStep` efetivo do converter, não contra o parse dos campos brutos.
`descartadoPorFaltaDeDado` → `alvoPrimario = 'NENHUM'`, campos ausentes (o mesmo "não sei" que o
perfil desenha hachurado). Não se deriva pace de zona.

## D2b — "Hoje" é do atleta e vem do backend (achado Codex #3)

`Atleta.timezone` existe, mas `getHome` usa `LocalDate.now(clock)` e listagens recentes usam
`LocalDate.now()` sem clock; no front convivem `date-fns format` (local) e `toISOString()` (UTC).
Nesta change, **os endpoints novos resolvem `hojeDoAtleta = LocalDate.now(clock.withZone(ZoneId.of(
atleta.timezone)))`** (fallback `America/Sao_Paulo`, documentado) e o devolvem no contrato
(`hoje: "2026-08-26"`); o front usa essa data para o estado do hero, nunca a do aparelho.
`me/home` passa a devolver o mesmo campo. Testes backend com clock fixo às 23:50 e 00:10 num fuso
diferente do servidor.

## D3 — Feedback é do `TreinoRealizado`, uma vez

`TreinoRealizado` já tem `percepcaoEsforco` (RPE, lido por `TssCalculatorService.calcularTssRpe` e
pelo readiness) e `feedbackAtleta` (texto livre, exposto em `TreinoRealizadoOutputDto`). A change
adiciona `sensacoes` (enum set, `ElementCollection`) e `feedbackRegistradoEm`; o comentário do
"Como foi?" grava em `feedbackAtleta` — **não se cria um segundo campo de texto nem um segundo
RPE**. Migration aditiva, sem backfill.

**Semântica de completude (achado Codex #4):** feedback completo ⇔ `feedbackRegistradoEm != null`.
O endpoint exige RPE no payload (sensações e comentário opcionais), grava os campos e carimba a
data; segundo POST substitui tudo (idempotente por último-vence). Política de rollout: realizado de
hoje com RPE mas sem carimbo mostra "Como foi?" **pré-preenchido** com o RPE existente — não
repede às cegas, não considera completo. A métrica conta só carimbados.

Rejeitado: `@Embedded feedback` com RPE próprio — criaria dois RPEs e uma migração de dado que o
TSS depende; rejeitada entidade `FeedbackTreino` separada — 1:1 obrigatório, sem ciclo de vida.

## D4 — "Não vou conseguir hoje"

**Sem status novo (achado Codex #1).** `TreinoExecucaoStatus` não tem `PULADO`, e adicionar um
valor ao enum atravessa queries de aderência, encerramento de semana, DTOs e UI do coach. O pulo é
modelado como **`status = PERDIDO` + `motivoPulo` (nullable) + `puladoEm`** em `TreinoPlanejado`:
a aderência já conta `PERDIDO`, o encerramento da semana já o trata, e o motivo é o dado novo.

**O que o coach vê, honestamente:** o pulo aparece no mesmo dia no drilldown do atleta e no Plano
(com motivo). A **fila de atenção** só conta `PERDIDO`/`PARCIAL` e corta severidade abaixo de ALTA
(`CoachAttentionSignalEvaluator:107-117`) — um pulo isolado **não** entra na fila, por desenho da
fila. A change não cria sinal novo; o CA4 foi reescrito para prometer o que existe. Se "pulo com
motivo" merecer sinal próprio, é decisão da fila de atenção, não desta change (Open Question).

**Reversão (achado Codex #2, corrigido no DoR de 2026-08-27):** o match do registro manual já
vincula planejados `PENDENTE` ou `PERDIDO` (`TreinoServiceImpl:561-565`) e os leva a `REALIZADO`;
o sync do intervals.icu passa por `CandidateSelector` (não filtra status, logo `PERDIDO` é
candidato) → `ReconciliationDecisionExecutor:118-124`; a reconciliação manual vincula em
`ManualReconciliationServiceImpl:82`. **Esses são os três caminhos que vinculam.** O que a versão
anterior deste parágrafo chamava de "FIT/sync" está errado pela metade: o upload `.fit`
(`FitTreinoPersister:87`) e o Strava (`StravaActivityServiceImpl`, `StravaWebhookServiceImpl`)
chamam só `IngestaoTreinoRealizadoService.registrar` — dedup, TSS, carga do dia — e **nunca
vinculam um `TreinoPlanejado`**, hoje nem antes desta change. A A.2 testa a reversão nos três
caminhos que vinculam, limpando `motivoPulo`/`puladoEm`. O `.fit`/Strava fica a cargo da decisão
0.4 (tasks): ou entra na reconciliação nesta change (task própria, escopo sobe), ou o CA4 nomeia
os caminhos e o resto vira follow-up no Radar.

## Riscos e mitigações

- **Alvos divergirem do relógio** (front e push calculando diferente): D2 elimina — mesma fonte.
- **Feedback virar formulário e ser ignorado**: um envio, RPE + chips em dois toques; frase
  opcional. Métrica de sucesso mede exatamente isso.
- **Estado do hero errado por fuso**: D2b — "hoje" vem do backend no fuso do atleta; testes com
  clock fixo perto da meia-noite.
- **Pré-mortem Codex (2026-08-26, needs-attention, 5 achados, todos confirmados no código):**
  #1 `PULADO` não existe e a fila não veria um pulo → D4 sem status novo e CA4 honesto; #2 reversão
  não bateria no match → `PERDIDO` reaproveita o match, A.2 testa os três caminhos; #3 fuso → D2b;
  #4 `feedback == null` ambíguo → completude por carimbo, política de rollout; #5 pace como alvo
  quando o push o rebaixa → `alvoPrimario` no contrato, teste contra o `WorkoutStep` do converter.
- **RPE de sync ausente até o feedback**: o TSS por RPE desses treinos só existe depois do "Como
  foi?" — hoje já é assim (sync sem RPE cai em outro cálculo de TSS); B.1 testa que gravar o RPE
  depois recalcula o que depender dele, ou registra explicitamente que não recalcula.
- **Escopo M**: duas fatias com E2E própria cada; `/implement run --step`.
- **Rollback (DoR 2026-08-27):** migrations são aditivas e nulas (`motivo_pulo`, `pulado_em`,
  `sensacoes`, `feedback_registrado_em`) — reverter o código não exige reverter dado. Sem feature
  flag: a rota `/athlete/workout/today` e o hero por `selectTodayState` saem num PR front só;
  revert do PR devolve o hero anterior, e os endpoints novos ficam órfãos sem efeito colateral.
  `me/home` com `hoje`/`realizadoHoje` é aditivo — o front anterior ignora os campos.

## Drilldown do coach (DoR 2026-08-27, Codex)

`AtletaPerfilCoachOutputDto` traz só `TreinoPlanejadoResumoDto` da semana — **não há lista de
realizados nem feedback no perfil do coach hoje**, e `CoachAthleteProfilePage` não tem seção de
"treinos recentes". O "feedback aparece no drilldown" da proposta é, portanto, escopo novo nos dois
repos: o DTO ganha `realizadosRecentes` (últimos 7 dias: data, tipo, origem, `percepcaoEsforco`,
`sensacoes`, `feedbackAtleta`, `feedbackRegistradoEm`), e a página ganha uma `SectionCard`
"Treinos recentes" que renderiza o feedback quando carimbado. B.2 e B.5 foram reescritas.
