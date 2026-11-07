**Tamanho:** S · **Trilha:** Fast (só front; `KpiCell`/`AthleteKpiStrip` e o aviso de "sem dado"; sem contrato)

# Proposal — inbox-kpis-atleta-sem-dado

## Why

Achado #5 da crítica de design do `/coach/inbox` (2026-11-07, artboard "Coach Inbox — crítica e
proposta", quadro "Cabeçalho do atleta"): a faixa de KPIs do atleta tem 91px e, quando não há
treino na janela, diz "Sem dado na janela" **três vezes** (Carga, Forma, ACWR), e logo abaixo o
Diagnóstico repete o mesmo fato num banner ("Sem treinos registrados na janela analisada…").
Quatro avisos para um fato; o olho gasta leitura em ausência, não em sinal. Em 1366×625 esses
91px são um quarto do que sobra para o detalhe.

A change `coach-inbox-notebook-height` (D3) previa KPIs compactos só em `TELA_BAIXA`. Aqui
a faixa fica compacta em todas as alturas — a redundância não depende da tela — e a ausência
de dado passa a ser dita uma vez.

## What Changes

Só `apps/menthoros-front`.

- **`KpiCell` com modo `dense`** (prop em `KpiStrip`): rótulo (com qualificador) e valor na mesma
  linha, ~34px; a linha de apoio (`detail`) sai da tela e vai para `title` da célula **e** para
  um texto visualmente oculto (leitor de tela continua ouvindo "Últimas 4 semanas", o delta de
  carga etc.). Selo (`badge`, ex.: "Baixa confiança") continua visível, ao lado do valor.
- **`AthleteKpiStrip` sempre `dense`**. Células sem dado mostram "—" sem legenda.
- **Um aviso só**: abaixo da faixa, quando qualquer uma de Carga, Forma ou ACWR está sem dado, uma
  linha de 11–12px em `surface-400`: "Sem treinos sincronizados na janela: carga, forma e ACWR
  aparecem com o primeiro treino. Confira a integração do atleta ou registre um treino
  manualmente." Com dados em todas, nada.
- **Banner do Diagnóstico sai** (`EmptyMetricState` que substitui a grade de métricas quando
  `quickStats.hasWindowData` é falso): a linha abaixo da faixa já disse. No lugar da grade, nada.
- O `KpiStrip` do resumo do Diagnóstico ("Carga aguda", "Monotonia", "Strain", "Forma
  prevista") continua no modo atual: ali a linha de apoio é evidência, não legenda.

## Non-Goals

- Mudar o cálculo ou a origem dos KPIs (`athleteKpiAdapters`, `buildDiagnosisMetrics`).
- `TELA_MUITO_BAIXA`, lista densa, gate com o treinador: seguem em `coach-inbox-notebook-height`
  (ao retomá-la, marcar 4.1 como entregue aqui).
- Tooltip em toque: `title` não abre no celular; o texto oculto cobre o leitor de tela e o
  celular está fora do escopo do inbox (decisão do founder).

## Impact

- `src/features/coach/components/KpiCell.tsx`, `KpiStrip.tsx` (prop `dense`),
  `AthleteKpiStrip.tsx` (+ `AthleteKpiStrip.test.tsx`).
- `src/features/coach/pages/CoachInboxPage.tsx` (aviso abaixo da faixa) e teste.
- `src/features/coach/components/panels/DiagnosisTabPanel.tsx` (sem `EmptyMetricState` das
  métricas) e teste; `EmptyMetricState` continua usado pelo gráfico de adesão/carga.
- `tests/e2e/coach/inbox.spec.ts` (altura do detalhe em 1366×625 sobe; aviso único).
- Depende do merge de `inbox-proximo-em-atencao` (mesmos `CoachInboxPage.tsx` e
  `DiagnosisTabPanel.tsx`).

## Critérios de aceite

1. **Faixa compacta** — Given um atleta selecionado em 1366×625, Then a faixa de KPIs do atleta
   tem no máximo 40px e cada célula mostra rótulo e valor na mesma linha.
2. **Legenda acessível, não visível** — Given a célula Aderência com "Últimas 4 semanas", Then o
   texto não está visível, está no `title` da célula e num elemento visualmente oculto lido pelo
   leitor de tela.
3. **Aviso único** — Given carga, forma e ACWR sem dado, Then "Sem dado na janela" não aparece
   nenhuma vez, e há exatamente um aviso abaixo da faixa; Given todas com dado, Then não há aviso.
4. **Diagnóstico sem repetição** — Given `hasWindowData` falso, Then o Diagnóstico não mostra o
   banner "Sem treinos registrados na janela analisada"; Given verdadeiro, Then a grade de
   métricas aparece como hoje.
5. **Selo continua** — Given ACWR de baixa confiança, Then o selo "Baixa confiança" segue visível
   ao lado do valor.
6. **Altura devolvida** — Given 1366×625 e atleta selecionado, Then `inbox-detalhe-conteudo`
   ocupa ≥ 55% da altura (a meta da change de altura; hoje ≥ 45% desde `inbox-barra-unica`).
7. **Regressão** — lint, build, `test:run`, E2E verdes; `AthleteKpiStrip.test.tsx` ("não corta a
   linha de apoio em uma linha só") reescrito para o modo `dense`.

## Métrica de sucesso

- 91px → ~34px na faixa; 4 avisos → 1 quando não há dado.
- 1366×625: detalhe rolável de ≥ 45% para ≥ 55%.

## Riscos e mitigações

- **Perda de informação na linha de apoio** (delta de carga "+12% vs. 7 dias anteriores"): fica
  no `title` e no texto oculto; se o treinador sentir falta, a change de altura previa o mesmo
  tratamento e o product-reviewer deu Go.
- **Teste "nenhum texto visível abaixo de 11px"** (`inbox.spec.ts`): o aviso e o rótulo ficam em
  `0.6875rem`+; o texto oculto não é visível (`clip`), então não conta.
- **Rollback:** reverter o PR.

## Open Questions & Assumptions

- **Premissa:** o aviso abaixo da faixa cobre carga, forma e ACWR; aderência ausente continua com
  "—" sem aviso (já tem a regra própria: sem treino devido na janela).
- **Decidido:** a grade de métricas do Diagnóstico não ganha substituto quando não há dado.

## Status

- draft (2026-11-07), a partir da crítica de design (#5).
