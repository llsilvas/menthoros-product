**Tamanho:** M · **Trilha:** Full

# standardize-card-foundation

Só o frontend e nenhum contrato novo, mas cria a API de um componente compartilhado que ~16 telas do
coach e do atleta vão consumir — incerteza de design real (props, variantes, onde cada padrão de fundo
se aplica). Mantida como change isolada e mínima: cria `Card`/`CardHeader`, resolve a duplicidade do
token `radius` e corrige um bug de cor encontrado na auditoria, migrando só 2-3 cards como prova de que
a API funciona. A migração dos ~13 cards restantes é a change seguinte (`standardize-card-migration`),
que depende desta já mergeada.

Origem: crítica de design (`/design-critique`) sobre os cards do app, 29/09 — inventário completo em
16 componentes representativos.

## Por quê

O app tem ~16 componentes de "card" espalhados por `features/coach`, `features/athlete`,
`pages/home` e `pages/reconciliacao`, e nenhum deles compartilha implementação. Cada um decide de
novo: wrapper (`Box`, `Paper` ou `Card`), raio de borda, cor de borda, fundo, padding e formato de
cabeçalho. O token set (`elevation`, `glass`, `content`, `radius`) já cobre esses casos — o problema é
que ele não é consumido de forma consistente.

Achados concretos da auditoria:

| # | Sintoma | Causa |
|---|---|---|
| F1 | Raio de borda varia por card sem critério | Dois módulos exportam algo chamado `radius` com **formato diferente**: `theme/tokens.ts:79-84` (`number`, chaves `sm..xl`) e `shared/design-tokens/density.ts:7-14` (`string 'Npx'`, chaves `xs..full`). Fora dos dois, `KPICard`/`SectionCard`/`DiagnosisCard` usam `borderRadius: 1`/`2` (unidade MUI solta) |
| F2 | Cor de borda inconsistente para o mesmo papel visual | `content.cardBorder` (branco translúcido, `theme/tokens.ts:58`) em alguns cards, `surface[700]` (cinza opaco) em outros — sem regra de quando usar qual |
| F3 | Fundo de card vem de três famílias de token não relacionadas | `elevation.card` (flat), `glassSx`/`glassAzulSx` (blur), `overlayWhite[*]` (só em `AtividadePendenteCard`, terceira família usada em nenhum outro lugar) |
| F4 | `AssessmentInfoCard.tsx:125` tem `bgcolor: \`33\`` — string inválida como cor CSS, resto de um alpha-suffix (provavelmente `${primary[500]}33` truncado) | Bug real, não só inconsistência — o Chip renderiza com cor quebrada |
| F5 | 5 formatos distintos de cabeçalho (barra+divisor+label maiúsculo, título+subtítulo, ícone+h6, overline+chip, nenhum) sem componente compartilhado | Sem `CardHeader`, cada tela reinventa hierarquia, casing e posição de ícone |
| F6 | Hover aplicado a cards não-interativos | `AssessmentInfoCard.tsx:38` aplica `glassSxHover` mesmo sem `onClick`; `StatCard.tsx:35-37` faz certo (hover só quando há `onClick`) |
| F7 | Cor translúcida por concatenação de string em vez de `alpha()` do MUI | `TreinoCard.tsx:122-125,234` usa `` `${semantic.success[500]}40` ``; `alpha()` já é importado e usado em `TodayHeroCard.tsx`, `WorkoutAnalysisCard.tsx`, `AssessmentInfoCard.tsx` |

Sem um componente base, cada nova tela do coach ou do atleta adiciona mais uma variação, e o bug de
F4 mostra que a duplicação já custa qualidade visual real, não só manutenção.

## O que muda

1. **Resolver a colisão de `radius`** — decidir qual dos dois exports é o canônico (recomendação:
   manter `shared/design-tokens/density.ts`, que já tem `xs`/`full` e é a fonte mais completa) e
   remover ou apelidar o outro para não colidir por nome.
2. **Criar `src/shared/components/Card.tsx`** — wrapper único (`Box` com `sx` ou `MuiCard` com
   overrides, decisão de implementação) com props para as duas variantes reais encontradas na
   auditoria: `variant="flat"` (fundo `elevation.card`, borda opaca) e `variant="glass"` (fundo/borda
   via `glassSx`), raio único vindo do token resolvido em (1), padding consistente, `interactive?:
   boolean` que liga hover + cursor só quando presente (corrige o padrão de F6), `stateColor?` para
   indicar estado semântico (borda/fundo tingidos — cobre o padrão real de `TreinoCard`, ver
   `design.md` D2) e `component`/`aria-label` polimórficos (preserva landmarks de acessibilidade como
   o de `DiagnosisCard`, ver `design.md` D2).
3. **Criar `src/shared/components/CardHeader.tsx`** — título, ícone opcional, subtítulo opcional, ação
   opcional (botão/link), cobrindo os casos reais de F5 sem inventar variantes não usadas hoje.
4. **Corrigir `AssessmentInfoCard.tsx:125`** (F4) — bug isolado, não depende do componente novo.
5. **Migrar 2-3 cards como prova** (walking skeleton) — um de cada variante (`flat` e `glass`) e um
   com `CardHeader`, para validar a API antes de migrar os ~13 restantes. `KPICard` migra só o
   wrapper (`flat`) — seu label com tooltip opcional continua como `children`, sem `CardHeader` (ver
   `design.md` D4). `StatCard` (`glass`). `WorkoutAnalysisCard` (`flat` + `CardHeader`, cobrindo o
   caso ícone+título da auditoria).
6. **Padronizar `alpha()`** no(s) card(s) migrados que hoje concatenam string (F7), se estiverem no
   escopo da migração-prova.

Os ~13 cards restantes (`SectionCard`, `DiagnosisCard`, `AIInsightCard`, `WeeklyReviewCard`,
`CurrentWeekPlan`, `ReadinessCard`, `TodayHeroCard`, `WeekOverviewCard`, `KudosCard`,
`ProgressBlockCard`, `AssessmentInfoCard`, `AtividadePendenteCard`, `TreinoCard`) ficam para
`standardize-card-migration`.

## Impacto

- Novo: `src/shared/components/Card.tsx`, `src/shared/components/CardHeader.tsx`.
- Alterado: `theme/tokens.ts` ou `shared/design-tokens/density.ts` (resolução da colisão de `radius`),
  `pages/home/components/AssessmentInfoCard.tsx` (fix + migração), `shared/components/KPICard.tsx`,
  `pages/home/components/StatCard.tsx`, `features/athlete/components/WorkoutAnalysisCard.tsx`.
- Nenhum contrato de API, nenhuma mudança de banco.

## ROI

`ROI = impacto × confiança ÷ esforço`

- **Impacto 2** — não muda comportamento nem decisão do coach; é debt de UI/consistência visual que
  reduz retrabalho em toda nova tela e corrige um bug de cor real (F4).
- **Confiança 80%** — auditoria concreta com file:line para cada achado; API do componente é pequena
  e os casos de uso já foram mapeados nos 16 cards existentes.
- **Esforço 2** — criação de 2 componentes + resolução de um conflito de token + migração de 3 cards
  como prova; ~1-2 dias.
- **ROI = 2 × 0,8 ÷ 2 = 0,8 → Fazer, mas não é bloqueante de roadmap de produto.**

## Riscos e mitigações

- **Revisão de produto (`/menthoros-workflow:product-reviewer`, 29/09) — veredito Refine, não
  Reconsider:** o proposal já se classifica honestamente como debt de UI (Impacto 2, "não muda
  decisão do coach"). Recomendação: confirmar contra o roadmap/`SPRINTS.md` que nada de maior
  alavancagem para o cliente-piloto está competindo pelo mesmo slot de 1-2 dias antes de puxar esta
  change para a sprint — decisão de sequenciamento, não de escopo. Registrado como pendência em Open
  Questions.
- **Pré-mortem (`/codex:adversarial-review`, 29/09) — veredito `needs-attention` na primeira versão do
  design, 4 achados, todos verificados contra o código real e já incorporados no `design.md` (seção
  "Riscos e mitigações" lá tem a tabela completa):** terceira fonte de `radius` na landing (escopo de
  CA1 corrigido), `TreinoCard` muda cor por status (API ganhou `stateColor`), `DiagnosisCard` usa
  landmark de acessibilidade (`Card` ganhou `component`/`aria-label`), `KPICard` tem tooltip composto
  no header (`KPICard` saiu do escopo de `CardHeader` na migração-prova).

## Critérios de aceite

Cada critério tem cenário correspondente em `specs/design-system/spec.md`.

- **CA1 — Radius único entre os cards do app:** Given qualquer componente de card em
  `shared/components`, `features/coach`, `features/athlete`, `pages/home`, `pages/reconciliacao` ou
  `components/features/planos`, When ele importa `radius`, Then existe só uma fonte com esse nome
  exportando os valores de raio (`shared/design-tokens/density.ts`) — o export de `theme/tokens.ts`
  foi removido, e `npm run build` não aponta ambiguidade de import. `theme.premium.ts` (usado só por
  `src/landing/`) fica fora deste critério — é um sistema de design separado, ver `design.md` D1.
- **CA2 — Card flat:** Given `<Card variant="flat">`, When renderizado, Then usa `elevation.card` de
  fundo, o token de borda escolhido em CA1/F2, e o raio resolvido em CA1 — sem valores literais no
  componente que o consome.
- **CA3 — Card glass:** Given `<Card variant="glass">`, When renderizado, Then usa `glassSx` (fundo,
  borda, sombra) sem overrides manuais no componente que o consome.
- **CA4 — Hover condicional:** Given `<Card>` sem `interactive`/`onClick`, When renderizado, Then não
  há estilo de `:hover`. Given `interactive` (ou `onClick` presente), Then o hover aparece.
- **CA5 — CardHeader:** Given `<CardHeader title="X" icon={...} action={...}>`, When renderizado, Then
  título, ícone e ação aparecem na mesma posição relativa em qualquer card que o use.
- **CA6 — Bug corrigido:** Given `AssessmentInfoCard`, When renderizado, Then o Chip de papel/role usa
  uma cor válida (token real, não a string `"33"`).
- **CA7 — Prova de migração:** Given `KPICard`, `StatCard` e `WorkoutAnalysisCard` migrados, Then os
  três passam a usar `Card` (KPICard só o wrapper; StatCard e WorkoutAnalysisCard também `CardHeader`
  quando aplicável) e os testes existentes desses componentes continuam verdes sem mudança de
  asserção visual não intencional — incluindo o comportamento de `Tooltip` do `KPICard`.
- **CA8 — Estado semântico preservado:** Given a API de `Card` com `stateColor`, When usada com um
  valor de estado (ex.: `success`), Then borda e fundo refletem a cor semântica sem `sx` solto no
  componente consumidor — validado por teste unitário de `Card.tsx`, mesmo que `TreinoCard` só migre
  na change seguinte.
- **CA9 — Landmark preservado:** Given `<Card component="section" aria-label="X">`, When renderizado,
  Then `getByRole('region', { name: 'X' })` encontra o elemento — validado por teste unitário de
  `Card.tsx`, mesmo que `DiagnosisCard` só migre na change seguinte.

## Métrica de sucesso

- **Primária:** os dois exports de `radius` colapsam em um; `Card`/`CardHeader` existem com testes
  próprios; 3 cards migrados sem regressão (`npm run lint && npm run build && npm run test:run`
  verdes).
- **Habilitadora:** `standardize-card-migration` consegue migrar os ~13 cards restantes sem precisar
  alterar a API de `Card`/`CardHeader` — validado ao fim daquela change.

## Open Questions & Assumptions

- **Premissa:** manter `shared/design-tokens/density.ts` como fonte canônica de `radius` (mais
  completa: tem `xs` e `full`, usados em chips/avatares fora do escopo de cards). Ajustável na task 1
  se a implementação encontrar motivo para o inverso.
- **Premissa:** duas variantes (`flat`/`glass`) cobrem os casos reais da auditoria; `overlayWhite[*]`
  (usado só em `AtividadePendenteCard`, que é um `Accordion`, não um card comum) fica fora do
  componente — decisão de migração daquele card específico fica para `standardize-card-migration`.
- **Aberto:** `AIInsightCard`, `WeeklyReviewCard` e `CurrentWeekPlan` hoje não têm chrome próprio
  (dependem de um pai para dar moldura) — decidir na change de migração se eles passam a usar
  `Card` diretamente ou se essa composição "sem chrome" é um padrão válido a documentar.
- **Aberto:** conflito de fonte conhecido (`index.css` define Inter, tema MUI define Syne primeiro,
  Syne só carrega pesos 700/800) não faz parte desta change — registrado aqui para não ser confundido
  com escopo de `CardHeader`.
- **Aberto (do product-review):** confirmar com o dono do produto se há algo de maior alavancagem para
  o cliente-piloto disputando o mesmo slot de 1-2 dias antes de puxar esta change para a sprint —
  decisão de sequenciamento, não de escopo desta proposta.
- **Aberto (do product-review):** o bug de F4 (`AssessmentInfoCard.tsx:125`) é trivial e não depende
  da API de `Card` — se a decisão de sequenciamento acima adiar o resto da change, o fix de F4 pode
  sair sozinho antes, como correção isolada de bug. Mantido como task 4 desta change por ora; extrair
  é uma decisão de baixo custo se o sequenciamento pedir.

## Fora de escopo

- Migração dos ~13 cards restantes (`standardize-card-migration`).
- Resolver o conflito de fonte Inter/Syne.
- Mudar a paleta de cores ou os valores dos tokens existentes — só consolidar o *uso* deles.
- `AtividadePendenteCard` (usa `Accordion`, não `Card`/`Paper`) — decisão de padronização adiada.
