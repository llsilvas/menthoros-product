# Tasks — athlete-progress-questions

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build && npm run test:run`;
E2E novo `tests/e2e/athlete/progress.spec.ts`. Sequência: 0 → 1 → 2 → 3 → 4.

## 0. Pré-condições

- [x] 0.1 **Resolvido no DoR (Codex):** o PMC é diário e ordenado, só com dias que têm métrica
      (`AtletaProgressServiceImpl:94-99`) → tolerância ±3 d em D−28; `RecordRow` não tem `dataIso`
      (só `data` formatada; `RecordeDto.data` é `LocalDate`) → entra; `ZoneDistributionInsight` é
      donut Recharts → bloco 2 com barras próprias; aderência vem ascendente só com semanas
      planejadas (`:280-290`) → preencher até 4; `zonesAdapter` arredonda sem normalizar → normalizar.
- [ ] 0.2 Validar com o founder o único limiar novo: |ΔCTL| < 3 em 4 semanas = "ficou estável"
      (e "novo" = 28 d). Reabrir com os coaches do piloto quando existirem.
      verify: linha assinada nesta task.

## 1. Adapter

- [ ] 1.0 `recordsAdapter`: `RecordRow.dataIso`; `zonesAdapter`: normalização para 100 (resto na
      maior zona). verify: testes dos dois adapters (99 → 100, 101 → 100).
- [ ] 1.1 `buildProgressReadings` (D2) com constantes nomeadas; casos: CTL sobe/estável/cai, ponto
      D−28 ausente com vizinho a ±3 d, sem vizinho ("Ainda cedo para comparar"), PMC vazio,
      aderência com 2 semanas → 4 barras, semana corrente, recorde novo/antigo.
      verify: `buildProgressReadings.test.ts` verde, ≥ 12 casos; nenhuma string "Sim"/"Não".

## 2. Blocos

- [ ] 2.1 `StrongerBlock` (pergunta, leitura descritiva com número, sparkline SVG, chip de forma
      do backend, "Falar com o coach", "Ver o gráfico completo" expandindo o `PMCChart` lazy inline).
      verify: teste de componente; `PMCChart` renderiza ao expandir; nenhum "Sim"/"Não".
- [ ] 2.2 `ZonesBlock` (barras Z1–Z5 com `activeTheme.zones`, frase da dominante); remover
      `ZoneDistributionInsight` se sem outro consumidor. verify: teste; barras somam 100.
- [ ] 2.3 `AdherenceBlock` (N de M, 4 barras com "sem plano" apagadas, corrente marcada, "Falar com
      o coach" → `ROUTES.ATHLETE_COACH`). verify: teste; link `href="#/athlete/coach"` no router real.
- [ ] 2.4 `RecordsBlock` (PRs com "novo", próxima prova). verify: teste.

## 3. Página

- [ ] 3.1 `AthleteProgressPage` sem `Tabs`: cabeçalho ("Últimas 12 semanas"), quatro blocos com
      estados independentes (D4), `Alert` consolidado se tudo falhar; remover `KpiCard`/`buildKpis`
      e os `rem` fora da escala. verify: `AthleteProgressPage.test.tsx` reescrito; nenhum
      `role="tab"`; nenhum texto CTL/ATL/TSB/pts fora do drawer.

## 4. E2E

- [ ] 4.1 `tests/e2e/athlete/progress.spec.ts` em 390×844: quatro blocos; sem abas; link expande o
      PMC (asserido pela presença do componente); varredura de fontes/tamanhos **fora** do gráfico
      expandido. verify: E2E do atleta verde (`smoke-tema` incluso).
