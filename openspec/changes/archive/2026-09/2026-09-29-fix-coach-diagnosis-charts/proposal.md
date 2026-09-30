**Tamanho:** M · **Trilha:** Full

# fix-coach-diagnosis-charts

Um só repositório e nenhum contrato novo, mas reescreve o `PMCChart` (compartilhado com as telas do
atleta) e carrega incerteza de design (limiar de lacuna, confiança do ACWR). Mantida como change
única: KPIs, gráfico semanal e PMC entregam valor juntos na mesma aba e compartilham
`detectDataGaps`; o risco do componente compartilhado fica isolado na task 2.3.

Origem: revisão no Claude Design (`artifacts/Revisão gráficos atleta.zip`) e handoff em
`artifacts/handoff/fix-coach-diagnosis-charts/` (código do front e `PATCHES.md` prontos, não validados).
Foram três rodadas de handoff; só a última, `artifacts/handoff 3/`, é versionada — ela traz a imagem
final da Proposta e o `PATCH-v2.md`. As anteriores e o zip eram versões superadas do mesmo pacote,
com código que hoje está nos repositórios.

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

> **Não faz parte desta change.** Registrada aqui só como cotação de ROI para decisão futura; vira
> change própria se passar pelo Gate-3. Nenhuma task desta change a implementa.

A lacuna hoje é rotulada de forma neutra porque o front não sabe a causa. O perfil já expõe `statusSincronizacao` e `atletaConectadoIntervalsIcu` por treino planejado, e existe `SyncStatusChip`. Com um `ultimaSincronizacaoEm` por atleta no perfil, a lacuna vira:

- "Sem sincronização desde dd/MM" → ação: pedir reconexão (retenção do atleta, problema técnico).
- "Sem treinos desde dd/MM" → ação: contato (retenção do atleta, engajamento).

E a fila de atenção separa `INATIVIDADE` de um novo motivo `SEM_SINCRONIZACAO`, que hoje se confundem.

- Impacto 4 (ação certa para cada causa; reduz falso "atleta parou")
- Confiança 50% (hipótese: parte relevante das lacunas é sync; sem dado ainda — medir contando lacunas com integração desconectada)
- Esforço 3 (campo novo no backend + motivo novo na fila)
- **ROI = 4 × 0,5 ÷ 3 = 0,67 → Fazer em seguida.** Rascunho; precisa de Gate-3.

## Critérios de aceite

Cada critério tem cenário correspondente em `specs/coach-athlete-diagnosis/spec.md`.

- **CA1 — Lacuna:** Given série PMC com treino em 15/07 e o próximo em 14/09, When o coach abre o
  Diagnóstico, Then os dois gráficos marcam "Sem treinos registrados de 16/07 a 13/09 (60 dias)" e não
  há barra de carga nas semanas inteiramente dentro dela. Given 9 dias sem treino, Then nada é marcado.
- **CA2 — Aderência coerente:** Given 5 realizados de 16 planejados nas últimas 4 semanas civis
  completas, When o perfil carrega, Then o tile mostra "31%" e "5 de 16 · 4 sem. completas" e as barras
  usam as mesmas entradas; a semana em curso não entra no KPI e aparece neutra no gráfico;
  plano já gerado para a próxima semana não entra na conta.
- **CA3 — Semanas datadas:** When o coach passa o mouse numa semana, Then vê a data de início, "X de Y"
  e TSS com número de dias com treino; 8 semanas em ordem cronológica.
- **CA4 — Delta de carga:** Given TSS 7d anteriores = 0, Then o tile Carga mostra "Sem base de
  comparação" em tom neutro; caso contrário, "TSS ±N% vs. 7d ant.".
- **CA5 — ACWR:** Given retorno após 8 semanas sem registro e ACWR 2.03, Then o tile mostra "2.03" neutro
  com "Baixa confiança" e sem "Risco" — também quando a pausa ficou fora do recorte e a
  série começa com zeros.
- **CA6 — PMC:** When o coach seleciona "4s", Then só os últimos 28 dias aparecem; eixo X com rótulo
  semanal; legenda no topo com valor atual; trecho dentro de lacuna tracejado.
- **CA7 — Sem duplicação:** When um atleta é selecionado, Then "Aderência geral" e "Carga semanal" não
  aparecem no cabeçalho; TSB exibido com 1 casa.

## Métrica de sucesso

- **Primária:** zero divergências entre KPI e gráfico na aba Diagnóstico, verificado pela mesma captura
  da auditoria (Leandro Silva, 28/09) antes/depois: das 8 inconsistências (RC1–RC8), 8 resolvidas.
- **Rotina do coach:** em conversa com os coaches da turma fundadora após o deploy, o coach consegue
  responder "o atleta está treinando menos ou parou?" olhando só a aba, sem abrir Plano ou Strava.
  Pergunta fechada (sim/não + motivo em uma linha) feita a ao menos 3 coaches até 2 semanas após o
  deploy, com as respostas registradas no `tasks.md` desta change antes do arquivamento.

## Open Questions & Assumptions

- **Resolvido:** `totalPlanejado` é contagem de treinos (`AderenciasSemanalDto`, "Total de treinos
  planejados na semana"). O texto "X de Y" está correto.
- **Premissa:** 10 dias sem TSS > 0 é lacuna. Pode marcar atleta lesionado em repouso; o rótulo neutro
  cobre o caso. Ajustável por constante única (`GAP_MIN_DAYS`).
- **Premissa:** a série PMC do backend pode ser densa (dias com `tss = 0`) ou esparsa; os adapters
  tratam as duas.
- **Premissa:** o valor dentro da lacuna vem do backend por decaimento; o front só o marca como estimado.
- **Aberto:** as telas do atleta que usam `PMCChart` (`StrongerBlock`, `CoachAthleteProfilePage`) mudam
  de comportamento (período passa a filtrar, Forma sai do lime). Aceito como efeito desejado; revisar
  visualmente na task 2.3.
- **Aberto:** o código do handoff não foi compilado nem testado; o TDD da implementação é quem valida.

## Fora de escopo

- Km por semana (o perfil não traz volume semanal histórico; follow-up de backend).
- Ampliar `aderenciaSemanal` do perfil para 12 semanas (follow-up de backend; o gráfico usa as 8 atuais).
- Faixas numéricas de TSB no front (backend é fonte única da classificação).
- Remover `loadTrend`/`adherenceTrend` do view model (follow-up de limpeza).
- Lime nas barras TSS do modo Simples do atleta (dívida existente, change própria).
