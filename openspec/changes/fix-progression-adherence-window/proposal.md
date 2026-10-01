**Tamanho:** M · **Trilha:** Full

# fix-progression-adherence-window

Um repositório (backend), sem contrato nem schema — mas muda uma entrada do motor que decide REDUZIR /
MANTER / PROGREDIR o volume do próximo plano. Full pelo risco: o efeito aparece no plano que o coach
revisa e no treino do atleta, e um plano gerado não se corrige revertendo o PR. **Depende de
`fix-adherence-count-until-today`** (PR #154, mergeado em `develop` em 2026-10-01) — reusa a consulta com
teto de data (`findComRealizadoByAtletaAndPeriodoAteData`). **Correção da DoR (2026-10-01):** o "predicado
de treino devido" citado nas versões anteriores deste documento **não existe** no código — a change
anterior só adicionou o teto de data, sem filtro de `DESCANSO`. Esta change **constrói** esse predicado
(task 1.7), não o reaproveita; CA9 foi reescrito para refletir isso.

## Por quê

`ProgressaoTreinoServiceImpl.calcularHistorico` mede a aderência de 21 dias com duas pontas que não
conversam:

- **Numerador:** todos os treinos realizados em 21 dias (`treinos21d.size()`), inclusive os extras fora
  do plano.
- **Denominador:** todos os planejados desde `hoje − 21`, **sem teto de data** — inclui os treinos ainda
  por vir da semana (e o plano seguinte, se já existir) e os `DESCANSO`.

Treino extra infla a razão (pode passar de 100%); treino futuro e descanso a derrubam. A razão decide o
estado do motor: < 60% → **REDUZIR** o volume (−5%) e o longão; ≥ 70% → PROGREDIR_LEVE; ≥ 80% (com 2
longões) → PROGREDIR. Um atleta em dia pode ter o próximo plano reduzido porque a semana dele ainda não
terminou — e o coach recebe uma proposta de IA errada para revisar, sem ver por quê.

Depois de `fix-adherence-count-until-today`, o painel mostra a aderência certa e o motor continua com a
errada: o coach vê um número e a IA decide com outro. Corrigir isso limpa o sinal de aderência que
alimenta toda proposta de plano — base do moat de propostas que o coach aceita sem editar.

## O que muda

- **Janela:** as **3 semanas ISO fechadas antes da atual** (decisão do founder, 2026-09-30). A semana em
  curso fica de fora: o plano da semana seguinte pode ser gerado antes de ela terminar, e uma semana
  parcial não pode liberar progressão antes do longão pendente nem reduzir pelo que ainda vai acontecer.
  A decisão fica a mesma gerando o plano na sexta ou no domingo.
- **Denominador:** planejados da janela que não são `DESCANSO` e **não estão pendentes de reconciliação**.
- **Numerador:** os do denominador com treino realizado vinculado **que conta na carga**
  (`TreinoRealizado.contaNaCarga()` — exclui `statusSincronizacao = CANCELADO`). Um vínculo para um
  realizado cancelado pelo atleta/Strava não é cumprimento: vira falta. Treino extra continua na carga e
  no volume, não na aderência.
- **Pendência de reconciliação** (planejado sem vínculo, mas com treino realizado avulso no mesmo dia cujo
  `reconciliationStatus` ainda não foi triado pelo coach — ou seja, **diferente de** `NAO_PLANEJADO`): fica
  **fora da conta** — nem cumprido nem falta (decisão do founder). Dado incompleto não reduz o plano. Se o
  coach já confirmou via reconciliação manual que aquele avulso **não corresponde** ao planejado
  (`reconciliationStatus = NAO_PLANEJADO`), a ambiguidade já foi resolvida: o planejado conta como falta
  normal, não como pendência. Se as pendências (as de verdade, ainda não triadas) passarem de 25% dos
  planejados da janela, a aderência não decide.
- **Aderência ausente** (sem planejado na janela, ou pendências acima do teto): não libera progressão e não
  força redução — REDUZIR só por fadiga comprovada (TSB, RPE); o resto é MANTER (tabela em D3).
- **Histórico mínimo** (3 treinos em 21 dias) continua contando todos os realizados.
- **Flag** `menthoros.progressao.aderencia-devidos.enabled`: desligada, volta à regra antiga sem deploy.
- Os limiares (60/70/80%) **não mudam** nesta change; a recalibração tem gatilho definido (abaixo).

## Fora do escopo

- Recalibrar limiares (só se o gatilho disparar — vira change própria).
- Expor ao coach o motivo da decisão e a aderência usada (follow-up registrado).
- `MetricasAdesaoService` / calibração do onboarding (Radar).
- Carga, volume, longões e RPE de `calcularHistorico`; o TSB nulo tratado como zero (anterior).

## Critérios de aceite

- **CA1 — Semana em curso fora.** Given a semana atual com 1 de 4 treinos feitos e as 3 anteriores 100%,
  When o histórico é calculado em qualquer dia da semana, Then a aderência é 100%.
- **CA2 — Descanso fora.** Given um `DESCANSO` na janela sem realizado, Then ele não entra no denominador.
- **CA3 — Extra não infla.** Given 6 planejados, 3 cumpridos e 4 realizados sem planejado na janela, Then a
  aderência é 50%.
- **CA4 — Pendência fora.** Given 6 planejados, 3 cumpridos, 1 sem vínculo com realizado avulso no mesmo
  dia, Then a aderência é 3/5 = 60%.
- **CA5 — Pendência demais.** Given pendências acima de 25% dos planejados da janela, Then a aderência não
  decide (tabela D3).
- **CA6 — Aderência ausente.** Given sem planejado na janela e histórico mínimo atendido, Then a decisão não
  é PROGREDIR nem PROGREDIR_LEVE, e só é REDUZIR por TSB/RPE.
- **CA7 — Histórico mínimo intacto.** Given 3 realizados em 21 dias, nenhum vinculado, Then o histórico não
  é "insuficiente".
- **CA8 — Flag.** Given a flag desligada, Then o resultado é o da regra antiga.
- **CA9 — Predicado de devido construído e testado.** (reescrito 2026-10-01 — a versão anterior assumia um
  predicado compartilhado com o painel que não existe) O predicado de "planejado devido" (exclui
  `DESCANSO`) construído nesta change tem teste próprio, isolado de `calcularHistorico`, cobrindo os casos
  de CA1–CA5.
- **CA10 — Vínculo cancelado não conta como cumprido.** Given um planejado vinculado a um `TreinoRealizado`
  com `statusSincronizacao = CANCELADO`, Then ele conta como falta, não como cumprido.
- **CA11 — Triagem do coach resolve a pendência.** Given um planejado sem vínculo com um realizado avulso
  no mesmo dia cujo `reconciliationStatus = NAO_PLANEJADO`, Then o planejado conta como falta, não como
  pendência.

## Gate de merge (D4)

Comparação regra antiga × nova, por atleta ativo do homelab, em **três dias de geração** (sexta, sábado e
domingo de uma mesma semana): todas as transições de estado, com o motivo.

**Correção da DoR (2026-10-01):** a redação anterior bloqueava qualquer transição "causada por treino
realizado sem vínculo" — mas é exatamente isso que CA3 pede (parar de inflar com extras), então uma
leitura literal do gate se autobloqueava no próprio efeito pretendido da change. O gate distingue:

- **Não bloqueia** (é o efeito esperado da correção): a aderência cai/transição para REDUZIR porque
  extras pararam de inflar o numerador (regra antiga tratava um extra como cumprimento; a nova, não) — ou
  seja, a aderência real (sem a inflação) já estava abaixo do limiar.
- **Bloqueia o merge:** transição em direção a REDUZIR (PROGREDIR/PROGREDIR_LEVE/MANTER → REDUZIR) causada
  por uma das duas falhas que a change promete evitar: (a) um planejado pendente de reconciliação sendo
  contado como falta em vez de ficar fora da conta (CA4/CA11), ou (b) um planejado da semana em curso
  entrando na janela (D1 já deveria impedir isso por construção; o gate serve de rede de segurança).
- **Registrar:** quantos atletas têm pendência de reconciliação na janela e quanto pesam.
- **Gatilho de recalibração** (change própria): mais de 20% das decisões mudando de estado **sem** causa
  identificada entre futuro, descanso, extra ou pendência.

## Métrica de sucesso

**Taxa de aceitação sem edição de volume das propostas de plano** (`WeekSuggestion`), baseline ~60–65%,
alvo de produto ~85%. Janela: 4 semanas antes vs. 4 depois do deploy, n mínimo de 20 propostas em cada
lado; queda de mais de 5 p.p. aciona a flag. Pré-deploy: o gate de merge acima.

## Open Questions & Assumptions

- **Teto de pendência (25%)** e **gatilho de recalibração (20%)**: valores iniciais, revistos com o
  resultado do gate.
- **Limiares calibrados com a regra antiga:** assumido que 60/70/80% seguem válidos até o gatilho disparar.
- **`PlannerShadowService` recalcula o histórico** por conta própria: a decisão e o shadow devem usar o
  mesmo histórico e o mesmo instante (D5) — conferir na DoR.
- **Decisões do founder (2026-09-30):** numerador = devidos cumpridos; janela = 3 semanas fechadas;
  pendência de reconciliação fora da conta.

## Revisões antes da implementação

- **product-reviewer: Refine → incorporado.** Gate numérico de merge para transições em direção a
  REDUZIR; quantificar atletas sem vínculo; CA6 fechado; métrica ancorada na aceitação do
  `WeekSuggestion` com n mínimo e tolerância; rollback rápido por flag; follow-up para expor o motivo da
  decisão ao coach.
- **Pré-mortem Codex: NO-GO → incorporado.** Semana aberta na geração antecipada (janela de semanas
  fechadas); vínculo pendente virando falta (pendência fora da conta, com teto); "sem devidos" ambíguo
  (tabela D3); comparar todas as transições e bordas (gate); histórico recalculado no shadow (D5);
  fixtures e golden set afetados (task 2.5).
