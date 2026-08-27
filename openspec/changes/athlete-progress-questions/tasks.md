# Tasks — athlete-progress-questions

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build && npm run test:run`;
E2E novo `tests/e2e/athlete/progress.spec.ts`. Sequência: 0 → 1 → 2 → 3 → 4.

## 0. Pré-condições

- [ ] 0.1 Ler `useAthletePmc` (pontos, range), `buildRecordRows` (tem data ISO?), `ZoneDistributionInsight`
      (é "barras + frase"?), `AderenciasSemanalDto` no front. Decidir D3 (reuso ou barras próprias).
      verify: notas com caminho:linha nesta task.
- [ ] 0.2 Validar com o founder os limiares de D2 (ΔCTL ±3; ATL/CTL 1,1 e 1,3; recorde novo 28 d).
      verify: linha assinada nesta task.

## 1. Adapter

- [ ] 1.1 `buildProgressAnswers` (D2) com constantes nomeadas; casos: CTL sobe/estável/cai, PMC curto,
      PMC vazio, zonas somando 100, semana corrente na aderência, recorde novo/antigo.
      verify: `buildProgressAnswers.test.ts` verde, ≥ 10 casos.

## 2. Blocos

- [ ] 2.1 `StrongerBlock` (pergunta, resposta, delta, sparkline SVG, chips forma/cansaço, link) +
      `PmcDrawer` com o `PMCChart` lazy. verify: teste de componente; `PMCChart` renderiza no drawer.
- [ ] 2.2 `ZonesBlock` (barras Z1–Z5 com `activeTheme.zones`, frase da dominante) — reuso ou não
      conforme 0.1. verify: teste; barras somam 100.
- [ ] 2.3 `AdherenceBlock` (N de M, 4 barras, corrente marcada, link "Falar com o coach" →
      `ROUTES.ATHLETE_COACH`). verify: teste; link com `href="#/athlete/coach"` no router real.
- [ ] 2.4 `RecordsBlock` (PRs com "novo", próxima prova). verify: teste.

## 3. Página

- [ ] 3.1 `AthleteProgressPage` sem `Tabs`: cabeçalho ("Últimas 12 semanas"), quatro blocos com
      estados independentes (D4), `Alert` consolidado se tudo falhar; remover `KpiCard`/`buildKpis`
      e os `rem` fora da escala. verify: `AthleteProgressPage.test.tsx` reescrito; nenhum
      `role="tab"`; nenhum texto CTL/ATL/TSB/pts fora do drawer.

## 4. E2E

- [ ] 4.1 `tests/e2e/athlete/progress.spec.ts` em 390×844: quatro blocos; sem abas; link abre o
      drawer com o PMC; varredura de fontes/tamanhos (isentando o gráfico recharts). verify: E2E do
      atleta verde (`smoke-tema` incluso).
