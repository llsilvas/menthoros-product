# Tasks — athlete-progress-questions

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build && npm run test:run`;
E2E novo `tests/e2e/athlete/progress.spec.ts`. Sequência: 0 → 1 → 2 → 3 → 4.

## 0. Pré-condições

- [x] 0.1 **Resolvido no DoR (Codex):** o PMC é diário e ordenado, só com dias que têm métrica
      (`AtletaProgressServiceImpl:94-99`) → tolerância ±3 d em D−28; `RecordRow` não tem `dataIso`
      (`data` é ISO cru repassado do DTO e a tela o mostra sem formatar — o gap é `dataFormatada`, não `dataIso`) → os dois campos entram; `ZoneDistributionInsight` é
      donut Recharts → bloco 2 com barras próprias; aderência vem ascendente só com semanas
      planejadas (`:280-290`) → preencher até 4; `zonesAdapter` arredonda sem normalizar → normalizar.
- [x] 0.2 **Aprovado pelo founder em 2026-08-26:** |ΔCTL| < 3 em 4 semanas = "ficou estável" (fora
      disso "subiu +N" / "caiu −N"); recorde "novo" = últimos 28 dias. Reabrir com os coaches do
      piloto quando existirem.

## 1. Adapter

- [x] 1.0 `recordsAdapter`: `RecordRow` com `dataIso` (cálculo) e `dataFormatada` (exibição);
      `zonesAdapter`: normalização para 100 (resto na maior zona). verify: testes dos dois adapters
      (99 → 100, 101 → 100; data ISO preservada e formatada).
- [x] 1.1 `buildProgressReadings` (D2) com constantes nomeadas; casos: CTL sobe/estável/cai, ponto
      D−28 ausente com vizinho a ±3 d, sem vizinho ("Ainda cedo para comparar"), PMC vazio,
      aderência com 2 semanas → 4 barras, semana corrente, recorde novo/antigo.
      verify: `buildProgressReadings.test.ts` verde, ≥ 12 casos; nenhuma string "Sim"/"Não".
      **Feito 2026-08-26.** Dois testes pré-existentes mudaram de propósito (zonas 33/33/33 → 34/33/33;
      `RecordRow` com `dataIso`/`dataFormatada`). A tela atual passou a exibir `dataFormatada` até a
      reescrita da 3.1. Também rebase da branch sobre o `develop` com o fix #95.

## 2. Blocos

- [x] 2.1 `StrongerBlock` (pergunta, leitura descritiva com número, sparkline SVG, chip de forma
      do backend, "Falar com o coach", "Ver o gráfico completo" expandindo o `PMCChart` lazy inline).
      verify: teste de componente; `PMCChart` renderiza ao expandir; nenhum "Sim"/"Não".
- [x] 2.2 `ZonesBlock` (barras Z1–Z5 com `activeTheme.zones`, frase da dominante); remover
      `ZoneDistributionInsight` se sem outro consumidor. verify: teste; barras somam 100.
- [x] 2.3 `AdherenceBlock` (N de M, 4 barras com "sem plano" apagadas, corrente marcada, "Falar com
      o coach" → `ROUTES.ATHLETE_COACH`). verify: teste; link `href="#/athlete/coach"` no router real.
- [x] 2.4 `RecordsBlock` (PRs com "novo", próxima prova). verify: teste.
      **Seção 2 feita 2026-08-26.** `ZoneDistributionInsight` ainda não removido — sai na 3.1 junto
      com a página (é o único consumidor). Lint do repo barrou um `rgba` cru na sparkline → token.

## 3. Página

- [x] 3.1 `AthleteProgressPage` sem `Tabs`: cabeçalho ("Últimas 12 semanas"), quatro blocos com
      estados independentes (D4), `Alert` consolidado se tudo falhar; remover `KpiCard`/`buildKpis`
      e os `rem` fora da escala. verify: `AthleteProgressPage.test.tsx` reescrito; nenhum
      `role="tab"`; nenhum texto CTL/ATL/TSB/pts fora do gráfico expandido.
      **Feito 2026-08-26.** `useManualTraining` saiu da tela (o KPI de volume de 28 dias era o único
      consumidor aqui). `ZoneDistributionInsight` removido. Aproveitado o `useAthleteHomeErrors` para
      o Alert consolidado. O `AthleteLayout` ganhou `maxWidth: 640` no desktop — dívida da
      `athlete-plan-agenda` (D1), quitada aqui porque é o mesmo container.

## 4. E2E

- [x] 4.1 `tests/e2e/athlete/progress.spec.ts` em 390×844: quatro blocos; sem abas; link expande o
      PMC (asserido pela presença do componente); varredura de fontes/tamanhos **fora** do gráfico
      expandido (não "fora do drawer" — não há drawer).
      **Feito 2026-08-26.** 3 specs; E2E do atleta 17/17. A varredura de fontes pegou um `0.6em`
      (14,4px) no "de N" da aderência — virou variante do tema. Smoke com dados reais no
      `localhost:5174` do founder: os quatro blocos com os números dele. verify: E2E do atleta verde (`smoke-tema` incluso).

## QA gate — 2026-08-26

Revisores: `frontend-reviewer`, `clean-code-reviewer` e Codex (`NEEDS-ATTENTION`, 4 MAJOR). Nenhum
Critical. Um bug real e três achados de design aceitos; o resto registrado.

Corrigido (commit único na branch):
- **Limiar sobre o Δ arredondado** (Codex, MAJOR — confirmado): 2,6 virava 3 e "subia" quando o
  design diz estável (|Δ| < 3). O limiar agora compara o Δ bruto; só a exibição arredonda. Teste
  unitário do caso 2,6 e E2E com valor exato (`+7`) em vez de `\+\d+`.
- **Provas fora do retry consolidado** (Codex, MAJOR — confirmado): "tentar novamente" não refazia a
  próxima prova. Entra no agregador; não conta para "tudo falhou". Teste cobre `fetchProvas`.
- **Vazio sem "Falar com o coach"** (Codex, MAJOR — confirmado, D1): o vazio agora é um
  `ProgressBlockCard`. Teste garante 4 links também no estado vazio.
- **Cor no delta era veredito implícito** (frontend-reviewer): verde/laranja em "subiu/caiu" julgava o
  que o texto evita. Delta em cor neutra, só o sinal.
- **Legenda do bloco 1 discrepante** (founder, no smoke): o card dizia "12 semanas" e a leitura
  comparava 4. Card: "hoje vs 4 semanas atrás"; sparkline mantém "12 sem atrás → hoje" (contexto
  longo, rótulo próprio); subtítulo da página deixou de prometer uma janela que só valia para o gráfico.
- `BlockState` substitui os quatro ternários (clean-code); bloco 4 documentado como exceção (nunca vazio).
- `useAthleteHomeErrors` → `useAggregatedFetchErrors` (segundo consumidor); `aria-controls` no botão
  de expansão; `alpha()` na sparkline em vez de concatenar hex.

Registrado, sem ação:
- `AthleteLayout` `maxWidth: 640` no desktop (Codex e frontend-reviewer): é a dívida D1 da
  `athlete-plan-agenda`, decisão explícita da proposta desta change; smoke de Home/Plano/Perfil feito
  nesta sessão, E2E das rotas passa (17/17).
- `buildProgressReadings.ts` com 4 leituras (clean-code): mantido, justificativa no topo do arquivo —
  dividem os limiares e a página consome em bloco.
- Imports relativos `../../../../` (frontend-reviewer): padrão do diretório (`PMCChart`); follow-up de
  higiene, fora do escopo.

Validação após as correções: `lint` · `build` · `test:run` 272/272 · `test:e2e tests/e2e/athlete` 17/17.
