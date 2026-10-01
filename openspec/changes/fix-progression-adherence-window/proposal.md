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
- **Denominador:** todos os planejados desde `hoje − 21`, **sem filtro de tipo** — inclui os `DESCANSO` e
  qualquer coincidência de data com um avulso, vinculado ou não.

**Nota (correção da DoR, rodada 2):** a versão original deste texto descrevia o denominador como "sem
teto de data" — isso já foi corrigido por `fix-adherence-count-until-today` (PR #154, mergeado), que
migrou exatamente esta chamada para `findComRealizadoByAtletaAndPeriodoAteData(..., dataFim = hoje)`. O
teto já existe na baseline atual, mas ele cobre só o caso do **futuro** (dias depois de hoje). Dois
problemas continuam abertos, e são os que esta change resolve: (1) a janela `[hoje−21, hoje]` ainda inclui
o pedaço **já passado da semana em curso** — se hoje é quarta, segunda e terça desta semana entram no
denominador mesmo com a semana incompleta, e o treino de hoje conta como planejado antes do atleta ter
chance de fazê-lo (o caso "hoje só se feito"); (2) `DESCANSO`, extras e pendências de reconciliação dentro
da janela, que o teto de data não toca. D1 fecha (1) movendo a janela para 3 semanas ISO inteiras e
fechadas, sem nenhum dia da semana atual; D2 fecha (2).

Treino extra infla a razão (pode passar de 100%); `DESCANSO`, semana em curso e pendência de reconciliação
a derrubam indevidamente. A razão decide o estado do motor: < 60% → **REDUZIR** o volume (−5%) e o longão;
≥ 70% → PROGREDIR_LEVE; ≥ 80% (com 2 longões) → PROGREDIR. Um atleta em dia pode ter o próximo plano
reduzido por ruído de classificação, não por aderência real — e o coach recebe uma proposta de IA errada
para revisar, sem ver por quê.

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
- **Pendência de reconciliação** (planejado sem vínculo, mas com treino realizado avulso no mesmo dia que
  ainda não teve uma **triagem humana** de não-correspondência): fica **fora da conta** — nem cumprido nem
  falta (decisão do founder). Dado incompleto não reduz o plano. Se um coach já confirmou via reconciliação
  manual que aquele avulso **não corresponde** ao planejado, a ambiguidade foi resolvida de fato: o
  planejado conta como falta normal, não como pendência. **Atenção (correção da DoR, rodada 2):**
  `reconciliationStatus = NAO_PLANEJADO` sozinho **não** garante triagem humana — o motor de matching
  automático (`MatchingDecisionEngineImpl`) atribui o mesmo status quando não encontra candidato ou o
  melhor score é baixo, sem nenhum humano envolvido (`reconciledBy = "SYSTEM"` nesse caminho). Só conta
  como falta quando `reconciledBy` identifica uma pessoa, não o sistema. Se as pendências (as de verdade,
  ainda sem triagem humana) passarem de 25% dos planejados da janela, a aderência não decide.
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
- **CA11 — Triagem humana resolve a pendência.** Given um planejado sem vínculo com um realizado avulso no
  mesmo dia marcado `NAO_PLANEJADO` **por um coach** (`reconciledBy` ≠ `"SYSTEM"`), Then o planejado conta
  como falta, não como pendência.
- **CA12 — `NAO_PLANEJADO` automático continua pendente.** Given um planejado sem vínculo com um realizado
  avulso no mesmo dia marcado `NAO_PLANEJADO` **pelo motor de matching automático** (`reconciledBy =
  "SYSTEM"`), Then o planejado conta como pendência, não como falta.

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
- **DoR no `/implement init`, rodada 1 — Codex: NO-GO → incorporado (2026-10-01).** Vínculo cancelado
  contando como cumprido (CA10); avulso triado como não-correspondente contando como pendência (CA11, v1);
  D4 se autobloqueando no efeito de CA3; premissa de predicado "devido" compartilhado inexistente; gap de
  assinatura `AtletaHojeResolver`/`calcularHistorico`.
- **DoR no `/implement init`, rodada 2 — Codex: NO-GO → incorporado (2026-10-01).** CA11 v1 tratava
  `NAO_PLANEJADO` como prova de triagem humana, mas o motor de matching automático atribui o mesmo status
  sem nenhum humano — corrigido via `reconciledBy` (CA11 reescrito, CA12 novo). Narrativa do "Por quê"
  desatualizada sobre o teto de data (já corrigido por PR #154). Precedência do histórico mínimo sobre D3
  não estava documentada.
- **`/qa` antes do PR — Codex review + adversarial-review (dois runs independentes, convergência forte):
  NO-GO → incorporado (2026-10-01).** (1) `temTriagemHumanaDeNaoCorrespondencia` usava `anyMatch`: um
  avulso já triado por humano encobria outro avulso ainda PENDENTE/AMBIGUO no mesmo dia, resolvendo a
  ambiguidade prematuramente — trocado para `allMatch` (CA11/CA12 só resolvem o dia quando TODOS os
  avulsos candidatos foram descartados por um humano). (2) `hoje = atletaHojeResolver.hojeDe(atleta)`
  era usado incondicionalmente, inclusive nas janelas legadas de 42/21/7 dias e na regra antiga —
  explicitamente fora do escopo (ver "Fora do escopo") e quebrava CA8 quando servidor e atleta
  estivessem em datas-calendário diferentes; as janelas legadas voltaram a `LocalDate.now(clock)`, só a
  aderência por devidos usa o fuso do atleta. (3, achado só do review nativo) `avulsosPorData` não
  filtrava `contaNaCarga()` — um avulso CANCELADO no Strava (a linha nunca é apagada,
  `StravaWebhookServiceImpl.markAsCanceled`) podia virar candidato de pendência/falta por engano;
  adicionado o filtro. (4, achado só do review nativo) a flag estava com default `false` e comentário
  desatualizado mesmo com o gate de merge (2.1) já registrado como aprovado — D7 diz "ligada por padrão
  depois do gate"; default trocado para `true`, mantendo `PROGRESSAO_ADERENCIA_DEVIDOS_ENABLED=false`
  como rollback sem deploy. Os 3 cenários corrigidos não existiam nos dados reais usados no gate 2.1
  (nenhum avulso CANCELADO, nenhum dia com 2+ avulsos, fuso do atleta igual ao do relógio do harness) —
  o resultado do gate permanece válido. Testes de regressão para os 3 casos adicionados; suíte completa
  (4365 unitários + 204 de integração) verde com a flag já no novo default.
