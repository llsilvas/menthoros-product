**Tamanho:** S · **Trilha:** Fast (só front; `KpiCell`/`AthleteKpiStrip` e o aviso de "sem dado"; sem contrato)

# Proposal — inbox-kpis-atleta-sem-dado

## Why

Achado #5 da crítica de design do `/coach/inbox` (2026-11-07, artboard "Coach Inbox — crítica e
proposta", quadro "Cabeçalho do atleta"): a faixa de KPIs do atleta tem 91px e, quando não há
treino na janela, diz "Sem dado na janela" **duas ou três vezes** (Forma, ACWR e, sem km no
backend, Carga), e logo abaixo o Diagnóstico repete o mesmo fato num banner ("Sem treinos
registrados na janela analisada…"). Até quatro avisos para um fato; o olho gasta leitura em
ausência, não em sinal. Em 1366×625 a faixa mede 93px (medido em `inbox.spec.ts`, 2026-11-07) e o
detalhe rolável fica com 57% da altura.

A change `coach-inbox-notebook-height` (D3) previa KPIs compactos só em `TELA_BAIXA`. Aqui
a faixa fica compacta em todas as alturas — a redundância não depende da tela — e a ausência
de dado passa a ser dita uma vez.

## What Changes

Só `apps/menthoros-front`.

- **`KpiCell` com modo `dense`** (prop em `KpiStrip`): rótulo (com qualificador) e valor na mesma
  linha, ~34px; a linha de apoio (`detail`) sai da tela e vai para `title` da célula **e** para
  um texto visualmente oculto (`visuallyHidden` do MUI, com `fontSize: '0.6875rem'` fixo — o
  E2E de 11px não ignora `clip`, só `display`/`visibility`). Leitor de tela continua ouvindo
  "Últimas 4 semanas", o delta de carga etc. Com `detail` vazio (`''`), nem `title` nem texto
  oculto — `KpiView.detail` continua `string`, sem mexer no contrato compartilhado. Selo
  (`badge`, ex.: "Baixa confiança") continua visível, ao lado do valor.
- **`AthleteKpiStrip` sempre `dense`**, com `data-testid="inbox-kpi-faixa"` (`KpiStrip` ganha
  `testId?`). `semDado()` passa a devolver `detail: ''`: células sem dado mostram só "—".
- **Um aviso só**, abaixo da faixa, **apenas quando `quickStats.hasWindowData` é falso** (a única
  condição em que as células diziam "Sem dado na janela") **e o perfil do atleta carregou sem
  erro** — a linha do roster usada enquanto o perfil carrega tem `hasWindowData: false` fixo
  (`coachInboxAdapters.ts`), e o aviso não pode aparecer durante o carregamento, em erro ou ao
  trocar de atleta (mesmo gate de `nextRaceHeader`). Linha de 11–12px em `surface-400`, citando
  só as células sem dado: "Sem treinos sincronizados na janela: forma e ACWR aparecem com o
  primeiro treino." — ou "…: carga, forma e ACWR aparecem…" quando também não há km. Fecha com
  "Confira a integração do atleta ou registre um treino manualmente." Com série na janela, nada:
  "Dado insuficiente" (ACWR sem ATL/CTL no último ponto) e "TSB não disponível" são fatos
  distintos, seguem no `title`/texto oculto da célula e não disparam o aviso.
- **Banner do Diagnóstico sai** (`EmptyMetricState` que substitui a grade de métricas quando
  `quickStats.hasWindowData` é falso): a linha abaixo da faixa já disse. No lugar da grade, nada.
  `EmptyMetricState.tsx` fica sem consumidor (era o único) — o componente e seu teste são
  removidos.
- O `KpiStrip` do resumo do Diagnóstico ("Carga aguda", "Monotonia", "Strain", "Forma
  prevista") continua no modo atual: ali a linha de apoio é evidência, não legenda.

## Non-Goals

- Mudar o cálculo ou a origem dos KPIs (`athleteKpiAdapters`, `buildDiagnosisMetrics`).
- `TELA_MUITO_BAIXA`, lista densa, gate com o treinador: seguem em `coach-inbox-notebook-height`
  (ao retomá-la, marcar 4.1 como entregue aqui).
- Tooltip em toque: `title` não abre no celular; o texto oculto cobre o leitor de tela e o
  celular está fora do escopo do inbox (decisão do founder).

## Impact

- `src/features/coach/components/KpiCell.tsx`, `KpiStrip.tsx` (props `dense`, `testId`),
  `AthleteKpiStrip.tsx` (+ `AthleteKpiStrip.test.tsx`).
- `src/features/coach/adapters/athleteKpiAdapters.ts` (`semDado` com `detail: ''`,
  `avisoSemDado`) e teste.
- `src/features/coach/pages/CoachInboxPage.tsx` (aviso abaixo da faixa, com gate de perfil) e teste.
- `src/features/coach/components/panels/DiagnosisTabPanel.tsx` (sem `EmptyMetricState` das
  métricas) e teste; `EmptyMetricState.tsx` e `EmptyMetricState.test.tsx` removidos.
- `tests/e2e/coach/inbox.spec.ts` (altura do detalhe em 1366×625 sobe; aviso único).
- Depende do merge de `inbox-proximo-em-atencao` (mesmos `CoachInboxPage.tsx` e
  `DiagnosisTabPanel.tsx`).

## Critérios de aceite

1. **Faixa compacta** — Given um atleta selecionado em 1366×625, Then a faixa de KPIs do atleta
   tem no máximo 40px e cada célula mostra rótulo e valor na mesma linha.
2. **Legenda acessível, não visível** — Given a célula Aderência com "Últimas 4 semanas", Then o
   texto não está visível, está no `title` da célula e num elemento visualmente oculto lido pelo
   leitor de tela.
3. **Aviso único** — Given `hasWindowData` falso e perfil carregado, Then "Sem dado na janela"
   não aparece nenhuma vez (nem como texto, nem em `title`), e há exatamente um aviso abaixo da
   faixa, que cita carga só quando não há km; Given série na janela (mesmo com ACWR "Dado
   insuficiente"), Then não há aviso; Given perfil carregando ou com erro, Then não há aviso.
4. **Diagnóstico sem repetição** — Given `hasWindowData` falso, Then o Diagnóstico não mostra o
   banner "Sem treinos registrados na janela analisada"; Given verdadeiro, Then a grade de
   métricas aparece como hoje.
5. **Selo continua** — Given ACWR de baixa confiança, Then o selo "Baixa confiança" segue visível
   ao lado do valor.
6. **Altura devolvida** — Given 1366×625 e atleta selecionado, Then `inbox-kpi-faixa` tem no
   máximo 40px (o aviso fica fora da faixa e não entra na conta) e `inbox-detalhe-conteudo` ocupa
   ≥ 62% da altura (medido em 2026-11-07: 57% hoje; −53px de faixa, +~16px de aviso ≈ +6%; o
   E2E atual só afirma ≥ 45%).
7. **Regressão** — lint, build, `test:run`, E2E verdes; `AthleteKpiStrip.test.tsx` ("não corta a
   linha de apoio em uma linha só") reescrito para o modo `dense`.

## Métrica de sucesso

- 93px → ~34px na faixa; até 4 avisos → 1 quando não há dado.
- 1366×625: detalhe rolável de 57% para ≥ 62%.

## Riscos e mitigações

- **Perda de informação na linha de apoio** (delta de carga "+12% vs. 7 dias anteriores"): fica
  no `title` e no texto oculto; se o treinador sentir falta, a change de altura previa o mesmo
  tratamento e o product-reviewer deu Go.
- **Teste "nenhum texto abaixo de 11px"** (`inbox.spec.ts:271`): ignora só `display: none` e
  `visibility: hidden`; o `visuallyHidden` do MUI usa `clip` e **conta**. O texto oculto recebe
  `fontSize: '0.6875rem'` explícito; aviso e rótulo ficam em `0.6875rem`+.
- **Aviso falso com dado parcial**: `buildAthleteKpis` mantém carga em km sem PMC e pode ter ACWR
  nulo com série presente. O aviso só olha `hasWindowData` e lista as células sem dado — nunca
  afirma "sem treino" com km na faixa.
- **Aviso durante carregamento**: gate pelo perfil carregado sem erro (ver "What Changes").
- **Rollback:** reverter o PR.

## Open Questions & Assumptions

- **Premissa:** o aviso abaixo da faixa cobre carga, forma e ACWR; aderência ausente continua com
  "—" sem aviso (já tem a regra própria: sem treino devido na janela).
- **Decidido (DoR 2026-11-07, spec-reviewer + Codex):** `detail` fica `string` (`''` = sem linha
  de apoio); `EmptyMetricState` é removido; CA6 passa de 55% para 62% após medição.
- **Decidido:** a grade de métricas do Diagnóstico não ganha substituto quando não há dado.

## Status

- draft (2026-11-07), a partir da crítica de design (#5).
- DoR 2026-11-07: NOT READY no spec-reviewer e no Codex; spec corrigida (aviso, `detail`, 11px, `EmptyMetricState`, CA6) e pronta.
