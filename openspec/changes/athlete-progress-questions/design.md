# Design — athlete-progress-questions

## D1 — Quatro perguntas, um scroll

Sem `Tabs`: o atleta abre a tela e lê quatro respostas de cima para baixo. Cada bloco é um card
(`elevation.card` + `surface[700]`, raio 12) com: pergunta (`h6`), resposta curta em display
(`h3`), número/gráfico simples, e um link quando há mais.

Rejeitado: manter abas com títulos-pergunta — a aba esconde a resposta que a pergunta promete.

## D2 — Respostas derivadas de deltas, com limiares fora do componente

Adapter puro `buildProgressAnswers(pmc, zones, aderencia, recordes, provas, hoje)` em
`features/athlete/adapters/`, com os limiares em constantes nomeadas no topo do arquivo
(`CTL_DELTA_MELHORA = 3`, `ATL_CTL_ALTO = 1.1`, `ATL_CTL_MUITO_ALTO = 1.3`, `RECORDE_NOVO_DIAS = 28`).

- Bloco 1: `ctlHoje − ctl(hoje − 28d)` sobre os pontos do PMC; sem ponto a 28 dias → "Ainda cedo
  para saber". Sparkline: CTL dos últimos 84 dias (SVG simples, sem recharts — o gráfico completo
  fica no `PMCChart`).
- Bloco 2: percentuais de `buildZoneDistributionPercent`; dominante = maior percentual.
- Bloco 3: `buildAderenciaResumo` + as 4 semanas do DTO; a corrente é a que contém `hoje`.
- Bloco 4: `buildRecordRows` + `dataIso` do recorde para a marca "novo".

Testado com tabela de casos (`buildProgressAnswers.test.ts`).

## D3 — O gráfico completo continua existindo

`PMCChart` (recharts, lazy) abre num `Drawer` bottom pelo link do bloco 1 — não some, muda de
lugar. `ZoneDistributionInsight` é avaliado na task 0.1: se o insight atual já é "barras + frase",
o bloco 2 o reaproveita; se não, o bloco 2 desenha as barras e o insight é removido.

## D4 — Estados

Cada bloco tem loading (skeleton do card), erro (`Alert` com retry, como hoje) e vazio (frase
honesta) **independentes** — um bloco com erro não derruba os outros. Falha em todos → um `Alert`
consolidado (padrão de `useAthleteHomeErrors`).

## Riscos e mitigações

- **Frase errada vale mais que número nenhum**: limiares no adapter com testes por caso e
  validação do founder (0.2); a resposta cita o número ao lado ("+6"), nunca sozinha.
- **Perder o PMC por engano**: CA 7 e E2E abrem o drawer e asserem o gráfico.
- **Escopo crescer para o backend** (alvo de fase, treinos perdidos): non-goals explícitos e
  follow-ups no Radar.
