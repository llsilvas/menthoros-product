# fix-coach-diagnosis-charts

## Por quê

No Inbox do coach, ao clicar num atleta, a aba **Diagnóstico** mostra números que se contradizem e gráficos que não dizem o que medem. Auditoria feita sobre um atleta real (Leandro Silva, 28/09) e confirmada no código:

| # | Sintoma na tela | Causa no código |
|---|---|---|
| RC1 | "Tendência de carga" sem eixo, tooltip "Ponto 57 · Valor 12.07" | `loadTrend = pmc.map(p => p.ctl)` — plota **CTL diário** (condicionamento), não carga; `TrendCard` rotula por índice |
| RC2 | "+36.2%" três vezes, ao lado de km | `loadDelta = calcularLoadDelta()` = variação de **CTL** entre posições do array, exibida como "% vs semana anterior" junto de `roster.weeklyVolume` (km) |
| RC3 | Aderência 38% ≠ barras | KPI vem de `roster.aderenciaPercentual`; barras de `profile.aderenciaSemanal` — fontes e janelas diferentes |
| RC4 | Barras "S1…S7" sem data | `adherenceTrend` perde `semanaInicio` no adapter |
| RC5 | PMC com lacuna invisível, chips de período inertes, card dentro de card, Forma em lime | `PMCChart` não filtra `data` por `range`; título "Desempenho" dentro do `SectionCard`; linhas `monotone` atravessam a lacuna; TSB em `primary[500]` (viola `forbidden-uses.ts`) |
| RC6 | ACWR 2.03 "Risco" com 5 km na semana | `calcularAcwr` = ATL/CTL do último ponto, sem checar se a base crônica existe |
| RC7 | KPIs duplicados | Bloco "Aderência geral / Carga semanal" no cabeçalho repete os tiles |
| RC8 | "TSB -13.61" | TSB sem arredondamento |

O coach decide pelo diagnóstico. Número contraditório corrói a confiança no produto, que é o risco de retenção do lado coach.

## O que muda

1. **Adesão e carga por semana** — um gráfico só, em colunas cronológicas com data, dois painéis no mesmo eixo semanal: adesão (%) e carga (TSS). Substitui "Adesão nas últimas semanas" e "Tendência de carga".
2. **Lacunas de registro** — ≥10 dias seguidos sem treino são marcados como "Sem treinos registrados" nos dois gráficos; no PMC as linhas viram tracejadas no trecho.
3. **Forma (PMC)** — período funciona, rótulos semanais, legenda com valor atual, sem card aninhado, Forma fora do lime. Modo Simples mostra a Forma colorida pela faixa que o backend já resolve (`statusForma`).
4. **KPIs coerentes** — aderência derivada da mesma série do gráfico; delta de carga em TSS 7d vs 7d anteriores; ACWR com "Baixa confiança" quando a base crônica está incompleta; bloco duplicado removido; TSB com 1 casa.

Somente frontend. Nenhum contrato de API muda.

## Impacto

- `features/coach`: `DiagnosisTabPanel`, `CoachInboxPage` (tiles), `coachInboxAdapters`, `types/CoachInbox`, novo `diagnosisChartsAdapters`, novo `WeeklyAdherenceLoadChart`.
- `features/athlete`: `PMCChart` (compartilhado) e `pmcAdapter`. Efeito nas telas do atleta e no perfil do coach: o seletor de período passa a filtrar de fato, Forma deixa de ser lime, legenda mostra valores. Lacunas só aparecem onde `gaps` é passado (coach).
- `TrendCard` deixa de ser usado no Diagnóstico.

## ROI

`ROI = impacto × confiança ÷ esforço`

- **Impacto 4** — tela principal de decisão do coach; hoje exibe métricas erradas com aparência de certas.
- **Confiança 70%** — evidência: captura real com as 8 inconsistências e causa raiz confirmada no código (tabela acima). Não há ainda dado de uso da aba.
- **Esforço 2** — front-only, sem contrato novo; ~2–3 dias com testes.
- **ROI = 4 × 0,7 ÷ 2 = 1,4 → Fazer agora.**

## Proposta nova — distinguir "parou" de "não sincronizou"

A lacuna hoje é rotulada de forma neutra porque o front não sabe a causa. O perfil já expõe `statusSincronizacao` e `atletaConectadoIntervalsIcu` por treino planejado, e existe `SyncStatusChip`. Com um `ultimaSincronizacaoEm` por atleta no perfil, a lacuna vira:

- "Sem sincronização desde dd/MM" → ação: pedir reconexão (retenção do atleta, problema técnico).
- "Sem treinos desde dd/MM" → ação: contato (retenção do atleta, engajamento).

E a fila de atenção separa `INATIVIDADE` de um novo motivo `SEM_SINCRONIZACAO`, que hoje se confundem.

- Impacto 4 (ação certa para cada causa; reduz falso "atleta parou")
- Confiança 50% (hipótese: parte relevante das lacunas é sync; sem dado ainda — medir contando lacunas com integração desconectada)
- Esforço 3 (campo novo no backend + motivo novo na fila)
- **ROI = 4 × 0,5 ÷ 3 = 0,67 → Fazer em seguida.** Rascunho; precisa de Gate-3.

## Fora de escopo

- Km por semana (o perfil não traz volume semanal histórico; follow-up de backend).
- Faixas numéricas de TSB no front (backend é fonte única da classificação).
- Remover `loadTrend`/`adherenceTrend` do view model (follow-up de limpeza).
- Lime nas barras TSS do modo Simples do atleta (dívida existente, change própria).
