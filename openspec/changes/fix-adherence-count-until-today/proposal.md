**Tamanho:** M · **Trilha:** Full

# fix-adherence-count-until-today

Toca dois repositórios, muda a semântica de um endpoint do atleta (`/me/aderencia` deixa de devolver
semanas futuras) e acrescenta um campo ao perfil do coach (`aderencia4Semanas`), sem schema novo. Primeira de duas changes: a segunda,
`fix-progression-adherence-window`, leva a mesma regra ao motor de progressão e depende desta.

Origem: follow-up de `fix-coach-diagnosis-charts` (arquivada em 2026-09-29), que contornou o problema no
front tirando a semana em curso do KPI.

## Por quê

A aderência conta como "planejado" todo treino a partir do início da janela, **sem teto de data**. A
consulta compartilhada (`TreinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo`) só tem limite
inferior, e os dois cálculos que o coach vê herdam isso:

- **Roster** (`CoachDashboardServiceImpl.montarResumo`, 4 semanas): na segunda-feira de manhã, um atleta
  que cumpriu tudo nas três semanas anteriores aparece com a aderência derrubada pelos treinos da semana
  que ainda nem aconteceram — e a aderência sobe sozinha ao longo da semana.
- **Perfil do coach e `/me/aderencia`** (`AtletaProgressServiceImpl.getAderenciaSemanal`): a semana em
  curso sai com "0 de 4" na segunda, e semanas futuras já planejadas voltam como entradas próprias.

Dias de descanso gravados como `TreinoPlanejado` do tipo `DESCANSO` também entram no denominador: um
descanso "não realizado" derruba a aderência de quem descansou como mandado.

Para o coach, o efeito é **alerta falso**: a tela diz que o atleta está falhando quando ele está em dia.
É o tipo de erro que ensina o coach a desconfiar do número — e ele passa a abrir o perfil de cada um para
conferir, que é exatamente a rotina que o painel existe para evitar.

## O que muda

Regra única de "treino devido", aplicada onde a aderência é contada para o coach e para o atleta:

- **Denominador:** treinos planejados que **não são `DESCANSO`** e que já venceram — data **anterior a
  hoje**, ou **hoje com treino realizado vinculado**. O treino de hoje ainda não feito não conta: o atleta
  pode fazê-lo mais tarde.
- **Numerador:** os devidos com treino realizado vinculado (regra atual, `treinoRealizado != null`).
- **Semanas sem nada devido** (futuras, ou a atual antes do primeiro treino vencer) não aparecem em
  `aderenciaSemanal`.

Onde:

- Backend: a consulta ganha teto de data; `getAderenciaSemanal` (perfil do coach e `/me/aderencia`) e o
  resumo do roster aplicam a regra. A janela de 4 semanas é **a atual + as 3 anteriores**, calculada numa
  função só, que alimenta o roster e um campo novo do perfil, `aderencia4Semanas` (realizado, planejado,
  percentual) — roster e perfil concordam por construção, não por dois relógios (servidor e navegador).
- Front do coach: a célula "Aderência · 4 sem" usa `aderencia4Semanas` (sai o contorno de
  `buildAdherenceWindow`, que excluía a semana em curso); o fallback do roster vale só enquanto o perfil
  não carregou. O tooltip da semana em curso sem entrada diz "Nada vencido ainda nesta semana", em vez de
  "Sem plano na semana".
- Front do atleta: a semana corrente sem entrada deixa de aparecer como "Sem plano" na tela de progresso
  (`buildAdherenceReading`).

## Fora do escopo

- **Motor de progressão** (`ProgressaoTreinoServiceImpl`): usa a mesma consulta e tem o mesmo defeito, mas
  a correção muda decisões de progredir/reduzir o plano. Vai em `fix-progression-adherence-window`, com
  validação própria.
- **`MetricasAdesaoService`** (widgets legados da home, calibração do onboarding): cálculo próprio, semana
  de domingo a sábado, sem `Clock`. Radar.
- **Revisão semanal** (`RevisaoSemanalServiceImpl`): já recorta pela `semanaFim` do plano e roda com a
  semana fechada.
- **Fila de atenção**: já conta só até hoje (PERDIDO/PARCIAL em 14 dias).
- Definição de "realizado" pelo `statusTreino` (hoje é o vínculo com o realizado).
- Vínculo planejado↔realizado (reconciliação): treino feito e não vinculado conta como não feito — já é
  assim hoje; esta change não mexe na reconciliação.
- N+1 do `montarResumo` (várias consultas por atleta do roster): anterior e independente desta change.

## Critérios de aceite

- **CA1 — Treino futuro não conta.** Given um atleta com 4 treinos na semana atual, todos com data depois
  de hoje, When a aderência é calculada, Then a semana atual não aparece em `aderenciaSemanal` e não entra
  no resumo do roster.
- **CA2 — Treino de hoje só conta feito.** Given um treino hoje sem realizado, When a aderência é
  calculada, Then ele não entra no denominador; Given o mesmo treino com realizado vinculado, Then entra
  no denominador e no numerador.
- **CA3 — Descanso não conta.** Given um `TreinoPlanejado` `DESCANSO` já vencido e sem realizado, When a
  aderência é calculada, Then ele não entra no denominador.
- **CA4 — Semanas futuras somem do endpoint.** Given plano gerado para a próxima semana, When
  `/me/aderencia` e o perfil do coach são consultados, Then a próxima semana não aparece.
- **CA5 — Roster e perfil concordam.** Given o mesmo atleta, When o roster e o perfil são calculados no
  mesmo dia, Then `roster.aderenciaPercentual` é igual a `perfil.aderencia4Semanas.percentual` (mesma
  função, janela = semana atual + 3 anteriores).
- **CA6 — KPI com a semana em curso.** Given as 4 semanas mais recentes somando 13 de 16 devidos
  (incluindo a atual até hoje), When o coach abre o Diagnóstico, Then a célula mostra "81%" e "13 de 16
  treinos planejados".
- **CA7 — Semana em curso sem nada devido.** Given segunda-feira de manhã com o treino do dia ainda por
  fazer, When o coach passa o mouse na semana atual, Then o tooltip diz "Nada vencido ainda nesta semana";
  e a tela de progresso do atleta não mostra a semana corrente como "Sem plano".
- **CA9 — Janela de 4 semanas.** Given entradas em 5 semanas (a atual e as 4 anteriores), When a
  aderência de 4 semanas é calculada, Then entram só a atual e as 3 anteriores.
- **CA8 — Tenant.** Given um atleta de outro tenant, When a aderência é pedida, Then continua
  `DomainNotFoundException` (sem regressão).

## Métrica de sucesso

**Treino ainda não vencido nunca entra no denominador, e roster e perfil mostram o mesmo número.**
Medida automática: um teste de integração com dados do cenário de segunda-feira (plano na semana, nada
vencido) em que a aderência não cai, e a comparação roster × perfil (CA5) para todos os atletas do
homelab no dia do deploy — meta: 0 divergências. Sinal qualitativo pós-deploy: perguntar aos coaches
do piloto (o founder e os coaches das assessorias em homologação) se o número do painel bateu com o que
eles sabem do atleta. (A comparação "segunda vs. sexta" foi descartada: ela cai legitimamente quando uma
semana boa sai da janela.)

## Open Questions & Assumptions

- **Fuso do "hoje".** O dia do atleta (`AtletaHojeResolver`, padrão America/Sao_Paulo), não o do servidor
  (`Clock.systemDefaultZone()`): perto da meia-noite o servidor em UTC já estaria no dia seguinte. O
  resolver não consulta o banco (lê o `timezone` do atleta já carregado) — sem custo por atleta. O front
  não recalcula a janela com o relógio do navegador (D5).
- **"Realizado" continua sendo o vínculo** (`treinoRealizado != null`), não o `statusTreino`. Um treino
  PARCIAL vinculado conta como feito, como hoje.
- **DESCANSO como `TreinoPlanejado` é raro:** o fluxo normal grava descanso em `PlanoSemanal.restDays`;
  o tipo aparece quando o coach converte um treino em descanso. A regra vale para os dois casos.
- **Mudança de semântica do `/me/aderencia`:** semanas futuras deixam de vir. Assumido que nenhum consumidor
  depende delas (o front do atleta mostra só semanas passadas e a corrente). Conferir na DoR.
- **Descanso:** quando o coach converte um treino em `DESCANSO`, a aderência pode subir (sai um devido não
  feito). É a intenção — descanso prescrito não é falta —, confirmada pelo founder.
- **Treino de hoje feito à noite:** o dia inteiro ele não conta; só entra quando o realizado é vinculado.
- **Enquanto `fix-progression-adherence-window` não sair,** o motor de progressão usa a regra antiga: a
  aderência que o coach vê no painel pode divergir da usada nas sugestões da IA. A segunda change entra
  logo depois desta.
- **Decisões do founder (2026-09-30):** dividir em duas changes; treino de hoje conta só se feito; descanso
  sai do denominador; a semana em curso volta ao KPI.

## Revisões antes da implementação

- **product-reviewer: Go, com refinos** — métrica automática em vez de leitura manual de segunda-feira;
  descanso e treino noturno como premissas explícitas; texto do tooltip; divergência temporária com o
  motor de progressão registrada. Incorporados.
- **Pré-mortem Codex: NO-GO → incorporado.** Achados conferidos no código e aceitos: a janela do front
  viraria 5 semanas; front e backend ancoram "hoje" em relógios diferentes (CA5) → campo
  `aderencia4Semanas` no perfil, calculado pela mesma função do roster; a tela do atleta mostraria a
  semana corrente como "Sem plano"; fallbacks do inbox podiam exibir número fora da janela; o custo
  "por atleta" estava mal localizado (o resolver não consulta o banco); textos de tooltip. Registrado
  como fora do escopo: vínculo best-effort da reconciliação (anterior) e o N+1 do roster (anterior).
