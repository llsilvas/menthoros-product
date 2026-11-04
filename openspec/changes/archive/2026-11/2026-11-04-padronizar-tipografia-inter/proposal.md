# Proposal: padronizar-tipografia-inter

**Tamanho:** M · **Trilha:** Full (um repositório, mas muda o visual de todas as telas logadas do app,
mexe nos três temas MUI e reverte uma decisão de tipografia tomada em change anterior; na dúvida, sobe)

> **Natureza:** polimento visual de baixo custo, sem ligação direta com aceitação de plano ou com o
> piloto. Teto de esforço: as tasks abaixo; o que exigir redesenho de tela vira outra change.

## Why

O protótipo das zonas (`coach-cadastro-ancoras-zonas`) usa **só Inter**, de 400 a 700, com
`tabular-nums` nas colunas numéricas e tamanhos de 11 a 20px. O founder achou essa tipografia mais
legível que a do app e pediu a padronização.

Hoje o app tem três regimes tipográficos:

| Onde | Texto | Títulos (h1–h4) |
|---|---|---|
| Tema global `appTheme` (shell legado: `pages/`, `components/features/`) | **Syne** | Syne |
| Shell do coach (`coachTheme`, aninhado no `CoachLayout`) | Inter | **Syne** |
| Shell do atleta (`athleteTheme`, aninhado no `AthleteLayout`) | Inter | **Space Grotesk** (`font.display`) |

E três agravantes:

- O `index.html` carrega a Syne **só nos pesos 700/800**. Todo texto em Syne no shell legado sai em
  bold ou com um 400 sintetizado pelo navegador.
- Cinco componentes fixam `fontFamily: 'Syne, sans-serif'` no `sx` e furam qualquer tema:
  `CoachInboxPage`, `HomePage`, `AtletasList`, `DetalheTreinoDialog`, `AtletaDialog`.
- O `CoachDialog`, que abre a maior parte dos fluxos de decisão do treinador, tem o título em Syne
  800 (lê `typography.h4.fontFamily`).

Syne é fonte de display: larga, de traço irregular, ruim em label e número. A tela do treinador é
quase toda label e número.

## What Changes

1. **`appTheme`:** família padrão passa a `font.text` (Inter). Títulos h1–h6 também em Inter, com a
   hierarquia dada por **tamanho e peso**, não por família.
2. **`coachTheme` e `athleteTheme`:** títulos h1–h4 deixam Syne / Space Grotesk e passam a Inter. A
   escala de tamanhos de cada shell não muda (`ESCALA_TIPOGRAFICA` do coach, os sete níveis de
   `shared/design-tokens/typography` no atleta).
3. **Token:** `font.display` em `theme.premium.ts` passa a apontar para Inter no app logado. A landing
   tem tema próprio e não consome esse token para a família (ver Non-goals).
4. **Overrides fixos:** os 5 `fontFamily: 'Syne, sans-serif'` saem; o componente herda do tema.
5. **Números:** `font-variant-numeric: tabular-nums` nas tabelas e colunas numéricas em Inter (card e
   diálogo de zonas, tabelas de métricas), como no protótipo.
6. **`index.html`:** a Syne deixa de ser carregada se nenhum consumidor sobrar. Inter passa a carregar
   300/400/500/600/700/800: o 300 continua em uso (`PlanoDetalhePanel`) e o 800 cobre os títulos.
7. **Exceção mono:** `font.mono` (JetBrains Mono) continua permitida em dados de estrutura de treino e
   rótulos de gráfico. Consumidores hoje: `theme.premium.ts` (tokens `badge`, `axisTick`, `zoneAxis`,
   `bracketLabel`, `tooltipData`), `PlanoPendenteItem`, `PlanoDetalhePanel`, `Sparkline`, editor de
   etapas, `TreinoCard`, `TreinoPlanejadoCard`.

## Non-goals

- **Landing e waitlist** (`src/landing/`, `WaitlistPage`): têm tema e identidade de marketing
  próprios (`landingTheme`, Space Grotesk). Ficam como estão; Space Grotesk continua carregada para
  elas.
- **Fonte mono** (`font.mono`, JetBrains Mono) nos editores de etapa e cards de treino: ver Q2.
- Redesenhar telas, mudar cores, espaçamento ou a escala de tamanhos.
- Renomear `font.display` ou remover o token (o consumo continua o mesmo; só o valor muda).
- Copy, contraste de cor e outras correções de acessibilidade.
- Tamanhos dos tokens de gráfico (`theme.premium.ts`, 9–10px em `ProfilePlot`): o invariante de
  11px vale para as variantes de texto dos temas, não para rótulo de eixo.

## Impact

- Frontend apenas (`apps/menthoros-front`). Sem contrato de API, sem schema.
- Visual de todas as telas logadas (coach, atleta, legado). Títulos perdem a "assinatura" da Syne.
- Testes que **afirmam** a família antiga mudam por definição de spec: `coachTheme.test.ts`
  ("mantém Syne nos títulos"), `athleteTheme.test.ts` ("títulos em font.display (Space Grotesk
  primeiro)" e "o global não muda"). Os E2E
  `smoke-tema`, `home` e `progress` do atleta já afirmam "sem Syne" e continuam valendo.
- Reverte a decisão de manter Syne nos títulos do coach (commit `aea904a`, "tipografia pelo tema,
  escopada ao shell do coach").

## Rollback

`git revert` do PR no front. Sem schema, sem contrato de API, sem migração de dado. O revert
restaura os três temas, os overrides e o link do Google Fonts com a Syne no mesmo commit, então não
há estado parcial possível entre "tema sem Syne" e "fonte não carregada".

## Critérios de aceite

- **CA1** — Given as rotas cobertas pelos smokes (coach, atleta e shell legado), com dados
  preenchidos na revisão de plano e no card/diálogo de zonas, When a tela renderiza, Then a
  **primeira família** da `font-family` computada de todo elemento visível com nó de texto próprio é
  `Inter` ou `JetBrains Mono` (a exceção mono se verifica pela própria família, sem allowlist de
  componente), e `document.fonts.check('400 16px Inter')` e `document.fonts.check('800 16px Inter')`
  são verdadeiros. Qualquer outra família (Syne, Space Grotesk, fallback do sistema) falha.
- **CA2** — Given o tema global, When se lê `appTheme.typography`, Then `fontFamily` e as variantes
  h1–h6 começam por `"Inter"`.
- **CA3** — Given `coachTheme` e `athleteTheme`, When se leem h1–h4, Then a família começa por
  `"Inter"`, o tamanho de cada variante é o mesmo de antes da change e o peso é ≥ 700 (D3).
- **CA4** — Given o código-fonte em `src/` fora de `src/landing/` e `WaitlistPage`, When se procura
  `Syne`, Then não há ocorrência em código executável (comentário histórico pode ficar).
- **CA5** — Given o card e o diálogo de zonas, When renderizam valores de bpm e pace, Then as células
  numéricas têm `font-variant-numeric: tabular-nums`. Outras tabelas de métricas ficam fora desta
  change (follow-up, se o founder pedir).
- **CA6** — Given o título de um `CoachDialog`, When abre (ex.: diálogo de zonas), Then o título está
  em Inter e continua sendo `heading` de nível 2.
- **CA7** — Given o `index.html`, When a change termina, Then a Syne não é mais pedida ao Google Fonts
  e a Inter é pedida com os pesos que o tema usa.

## Métrica de sucesso

- **Objetiva (gate):** CA1 verde nos smokes do coach e do atleta, e nenhuma variante de texto do
  `coachTheme` abaixo de 11px (invariante que já existe em `coachTheme.test.ts`; não se aplica aos
  tokens de gráfico).
- **Rotina do treinador:** na revisão de plano e no diálogo de zonas, o treinador lê números e labels
  sem esforço. **Gate manual:** aprovação escrita do founder sobre as screenshots da task 5.3. Não há
  métrica de rotina que esta change possa mover de forma mensurável; tempo por revisão e aceitação
  de plano não são gate e não são acompanhados por ela.

## Open Questions & Assumptions

- **Q1 — Space Grotesk nos títulos do atleta. DECIDIDO (2026-11-04, founder):** vira Inter. Os
  títulos do atleta seguem o resto do app; a escala de tamanhos do `athleteTheme` não muda.
- **Q2 — Mono nos dados de treino. DECIDIDO (2026-11-04, founder):** **fica** JetBrains Mono nos
  consumidores do item 7 (estrutura de treino e gráficos). Trocar por Inter + `tabular-nums` ali, se
  um dia desejado, é change à parte.
- **A1** — Inter 800 existe no Google Fonts e substitui o peso 800 usado nos títulos em Syne.
- **A2** — Nenhum E2E compara screenshot por pixel (verificado: não há `toHaveScreenshot`); o
  `smoke-tema` do atleta só anexa screenshots para inspeção.
- **A3** — Não existe smoke equivalente para o coach e o shell legado; esta change cria um (CA1),
  no molde de `tests/e2e/athlete/smoke-tema.spec.ts`.
