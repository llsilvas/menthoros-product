# Design — athlete-progress-questions

## D1 — Quatro perguntas, um scroll

Sem `Tabs`: o atleta abre a tela e lê quatro leituras de cima para baixo. Cada bloco é um card
(`elevation.card` + `surface[700]`, raio 12) com: pergunta (`h6`), leitura descritiva em display
(`h3`, sempre com o número), gráfico simples, "Falar com o coach" e, quando há, o gráfico completo
expansível. **A UI descreve; o coach interpreta** — nenhum bloco diz "sim", "não", "bem" ou "mal".

Rejeitado: manter abas com títulos-pergunta — a aba esconde a resposta que a pergunta promete.

## D2 — Respostas derivadas de deltas, com limiares fora do componente

Adapter puro `buildProgressReadings(pmc, zones, aderencia, recordes, provas, hoje)` em
`features/athlete/adapters/`, com as constantes nomeadas no topo (`CTL_DELTA_ESTAVEL = 3`,
`CTL_JANELA_DIAS = 28`, `CTL_TOLERANCIA_DIAS = 3`, `RECORDE_NOVO_DIAS = 28`).

- Bloco 1: `ctlHoje − ctlBase`, onde `ctlBase` é o ponto do PMC mais próximo de D−28 dentro de
  ±3 dias (a série é diária, mas só tem dias com métrica — `AtletaProgressServiceImpl:94-99`);
  sem ponto na janela → "Ainda cedo para comparar". |Δ| < 3 → "ficou estável"; senão "subiu +N" /
  "caiu −N". Forma: `FAIXA_APRESENTACAO[statusForma]` do backend — **sem** régua de cansaço por
  ATL/CTL (contradiria a `FaixaTsb`). Sparkline: CTL dos últimos 84 dias em SVG simples.
- Bloco 2: percentuais de `buildZoneDistributionPercent` **normalizados**: arredondar e atribuir a
  diferença para 100 à maior zona (hoje pode somar 99/101 — `zonesAdapter:21-29`). Dominante =
  maior percentual.
- Bloco 3: `buildAderenciaResumo` + as semanas do DTO, **preenchendo** até 4 com `{ semplano }` —
  o backend só devolve semanas com treino planejado (`AtletaProgressServiceImpl:280-290`). A
  corrente é a que contém `hoje`.
- Bloco 4: `buildRecordRows` passa a expor `dataIso` (o `RecordeDto.data` é `LocalDate`); "novo"
  se `hoje − dataIso ≤ 28 d`.

Testado com tabela de casos (`buildProgressAnswers.test.ts`).

## D3 — O gráfico completo continua na tela

`PMCChart` (recharts, lazy) **expande inline** abaixo do bloco 1 pelo link "Ver o gráfico
completo" — não vai para drawer (perderia a inspeção imediata de CTL/ATL/TSB que o atleta que
entende do assunto quer). Fechado por padrão; o estado expandido é local. `ZoneDistributionInsight`
é um donut Recharts, não serve ao CA das barras: o bloco 2 desenha as próprias barras e o insight
é removido se a task 0.1 não achar outro consumidor.

## D4 — Estados

Cada bloco tem loading (skeleton do card), erro (`Alert` com retry, como hoje) e vazio (frase
honesta) **independentes** — um bloco com erro não derruba os outros. Falha em todos → um `Alert`
consolidado (padrão de `useAthleteHomeErrors`).

## Riscos e mitigações

- **Frase que julga**: retirada por desenho — só leitura descritiva com o número ao lado, e
  "Falar com o coach" em cada bloco. Limiar único (estável) validado na 0.2 e reaberto com coaches.
- **Régua paralela ao backend**: retirada (cansaço por ATL/CTL); forma vem só de `statusForma`.
- **Perder o PMC por engano**: CA 7 e E2E abrem o drawer e asserem o gráfico.
- **Escopo crescer para o backend** (alvo de fase, treinos perdidos): non-goals explícitos e
  follow-ups no Radar.
