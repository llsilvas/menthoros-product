**Tamanho:** S · **Trilha:** Fast (só front; sem contrato novo; layout de duas regiões já medidas)

# Proposal — inbox-barra-unica-sem-rodape

## Why

Crítica de design do `/coach/inbox` (2026-11-07, `ui-ux-pro-max` + `design-critique`, artboard
`Coach Inbox — crítica e proposta`), com captura real em 1366×625: dois achados críticos para a
rotina do treinador em triagem.

1. **Cabeçalho + KPIs globais custam ~136px antes da lista** (eyebrow "Assistente do Treinador",
   título "Fila, plano e calendário", descrição, faixa de 4 KPIs de 85px). Dos quatro números, só
   "Em atenção" é triagem; "Atletas exibidos" repete o "10 de 23" do header da lista e "Treinos
   planejados" é contexto. Em 625px úteis, sobram 120–220px para o diagnóstico.
2. **Rodapé com ações simuladas.** "Enviar mensagem" e "Marcar como prioridade" só chamam
   `setFeedback` com um toast que dá a entender que algo foi feito; "Abrir editor do plano" duplica
   "Ajustar plano". Ação que não faz nada ao lado do CTA que decide o plano corrói a confiança no
   botão real, e custa 46px em qualquer altura.

A change `coach-inbox-notebook-height` (M · Full, 0/25) já descreve os dois (D2 e D4), mas o D2
só vale em `TELA_BAIXA` e a change carrega mais seis blocos (faixa muito baixa, KPIs do atleta,
lista densa, paginação, gate com o treinador). Esta change entrega os dois críticos em **todas as
alturas**, pequena e mergeável sozinha: a redundância não depende da tela.

## What Changes

Só `apps/menthoros-front`, `CoachInboxPage` e testes.

- **Barra única de cabeçalho**, em todas as alturas: título "Inbox" (mantém
  `data-testid="inbox-titulo"`, ≤ 17px: o e2e exige nome do atleta maior que o título), resumo em
  linha ao lado — "N ativos de T", "M em atenção" (contagem de `attentionQueue`, não do `resumo`:
  na captura o KPI dizia 0 com 3 na fila), "K treinos esta semana", "atualizado HH:MM" — e a busca
  à direita. Saem: eyebrow, descrição, `KpiStrip` do resumo e o KPI "Atletas exibidos".
- **Rodapé sai**, em qualquer altura. "Ajustar plano" vira botão secundário visível no cabeçalho do
  atleta, depois do CTA e do "Rejeitar". Saem "Enviar mensagem", "Marcar como prioridade", "Abrir
  editor do plano", o `Menu` e seus estados. O toast de "Rascunho copiado" (contato assistido)
  continua: é ação real.

## Non-Goals

- Filtro "Em atenção" clicável: o `GET /coach/dashboard` filtra por um status só (`warning` ou
  `danger`), não por "tem sinal na fila". Fica para a change da lista de triagem.
- Busca na coluna da lista, linha de 46px, contraste `surface-400`, paginação em PT-BR: change da
  lista de triagem (prioridade 2 da crítica).
- Faixas de altura (`TELA_MUITO_BAIXA`), KPIs do atleta compactos, lista densa, gate com o
  treinador: continuam em `coach-inbox-notebook-height`, que ao ser retomada marca 3.x e 4.2 como
  entregues por esta change.
- Implementar de verdade "Enviar mensagem" e "Marcar como prioridade": follow-up já listado na
  change de altura (Q2). Decisão de tirá-las da tela: dono do produto, 2026-11-07 ("vamos para os
  2 críticos").

## Impact

- `src/features/coach/pages/CoachInboxPage.tsx`: cabeçalho, remoção do `KpiStrip` do resumo e do
  rodapé, "Ajustar plano" no cabeçalho do atleta.
- `src/features/coach/adapters/inboxSummaryKpis.ts`: sai, ou vira adapter do resumo em linha
  (`buildInboxSummaryLine`). `KpiStrip` continua em uso no Diagnóstico.
- `CoachInboxPage.test.tsx`, `tests/e2e/coach/inbox.spec.ts`, `notebook-viewport.spec.ts`.
- Sem backend, sem contrato.

## Critérios de aceite

1. **Barra única** — Given o inbox carregado em qualquer viewport, When a tela renderiza, Then o
   cabeçalho é uma barra de no máximo 56px com título, resumo em linha e busca; não existe faixa
   `inbox-kpi-*` nem os textos "Assistente do Treinador" e "Revisão rápida, ajuste de plano…".
2. **Resumo honesto** — Given `attentionQueue` com 3 itens e `resumo.emAtencao = 0`, Then a barra
   mostra "3 em atenção".
3. **Rodapé fora** — Given um atleta selecionado, Then não há botão "Enviar mensagem", "Mais ações"
   nem "Marcar como prioridade"; "Ajustar plano" está no cabeçalho do atleta, visível sem rolar, e
   abre a aba Plano.
4. **CTA preservado** — Given plano aguardando revisão, Then a ordem no cabeçalho é CTA primário
   (lime), "Rejeitar", "Ajustar plano"; sem plano pendente, CTA contextual e "Ajustar plano".
5. **Altura devolvida** — Given 1366×625 e um atleta selecionado, Then a área rolável do detalhe
   (`data-testid="inbox-detalhe-conteudo"`) ocupa ≥ 45% da altura da janela (hoje ~35%; a meta de
   55% é da change de altura, com os KPIs do atleta compactos).
6. **Regressão** — lint, build, `test:run` e E2E (`inbox.spec.ts`, `notebook-viewport.spec.ts`)
   verdes; o teste "o nome do atleta é maior que o título da página" continua valendo.

## Métrica de sucesso

- Em 1366×625: detalhe rolável de ~35% para ≥ 45% da janela; 136 + 46 = 182px devolvidos ao
  conteúdo.
- Rotina: nenhum botão na tela que não faça o que diz.

## Riscos e mitigações

- **Teste de hierarquia** (`inbox-titulo` ≤ 17px e menor que o nome): o novo título fica em
  `1.0625rem` (17px); o nome do atleta já é 1,25–1,55rem.
- **"Ajustar plano" + CTA + Rejeitar + próxima prova em 1093px**: o contêiner já tem
  `flexWrap: 'wrap'`; a quebra custa uma linha de ~40px, menos que os 46px do rodapé que sai.
- **Alerta de erro do dashboard** continua entre a barra e a grade; sem mudança.
- **Rollback:** reverter o PR. Sem contrato, sem estado persistido.

## Open Questions & Assumptions

- **Premissa:** o treinador não precisa de "Atletas exibidos" como número: o header da lista já diz
  "10 de 23 · página 1/3".
- **Premissa:** "atualizado HH:MM" em linha substitui a linha "Atualizado em dd/mm/aaaa, HH:MM"
  (mesmo dado, uma linha a menos; data completa no `title`).
- **Decidido:** ações simuladas saem (dono do produto, 2026-11-07).

## Status

- draft (2026-11-07), a partir da crítica de design.
