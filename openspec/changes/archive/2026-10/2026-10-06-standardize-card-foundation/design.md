# Design — standardize-card-foundation

## D1. Resolver a colisão de `radius` — escopo é o app, não a landing

**Existe uma terceira fonte que a auditoria original não pegou:** `theme/theme.premium.ts:278`
exporta `radius = { sharp: '4px', inner: '12px', outer: '16px', pill: '100px' }`, com semântica
própria por papel (`sharp`=controle, `inner`=caixa dentro de painel, `outer`=card/painel,
`pill`=chip). É consumida por `src/landing/{primitives,ProductUI,AccessForm,sections}.tsx` — a
landing de marketing, que roda sob `landingTheme` e tem seu próprio vocabulário visual (`radius.outer`
= 16px para os cards da landing), documentado e coerente ali. Não é a mesma árvore de componentes da
auditoria (`shared/components`, `features/coach`, `features/athlete`, `pages/home`,
`pages/reconciliacao`, `components/features/planos`).

**Decisão revisada:** o escopo desta change é o **radius dos cards do app** (coach/atleta), não um
único export global de `radius` na base inteira. `shared/design-tokens/density.ts` vira a fonte
canônica para `Card`/`CardHeader` e para os componentes que hoje importam `radius` de
`theme/tokens.ts`. `theme.premium.ts` **fica como está**, exclusivo da landing — misturar os dois
juntaria dois sistemas de design distintos (app dark-first vs. landing de marketing) numa mudança que
deveria ser só consolidação.

- CA1 é reescrito para dizer explicitamente "entre os componentes de card do app" — não "em toda a
  árvore de `src/`" (ver Critérios de aceite revisados no proposal).
- O export em `theme/tokens.ts:79-84` (`sm: 6, md: 8, lg: 12, xl: 16`, formato `number`) é removido;
  valores numéricos já coincidem com `density.ts` (6/8/12/16) — é eliminação de duplicidade, não
  mudança de valor. Se algum consumidor de `theme/tokens.ts` precisar do formato `number`, substituir
  por `parseInt(radius.md, 10)` no ponto de uso, não por um segundo export.
- Task 1.1 passa a levantar também os consumidores de `theme.premium.ts`'s `radius` só para confirmar
  que nenhum vive fora de `src/landing/` (se algum viver, ele entra no escopo desta change).

## D2. Duas variantes de `Card`, não mais

A auditoria achou fundo vindo de três famílias (`elevation.card` flat, `glassSx` blur,
`overlayWhite[*]`), mas `overlayWhite[*]` aparece em um único componente (`AtividadePendenteCard`),
que é um `Accordion` — uma primitiva MUI diferente, com semântica de expandir/colapsar que `Card` não
tem. Criar uma terceira variante para um único consumidor é over-engineering; a decisão de se
`AtividadePendenteCard` deveria deixar de ser `Accordion` fica para `standardize-card-migration`.

```ts
type CardVariant = 'flat' | 'glass';
type CardStateColor = 'success' | 'danger' | 'warning' | 'info'; // ver estado semântico abaixo

interface CardProps {
  variant?: CardVariant;        // default 'flat'
  interactive?: boolean;        // liga hover + cursor: pointer; default false
  onClick?: () => void;         // presença implica interactive, mesmo se não passado explicitamente
  stateColor?: CardStateColor;  // borda 2px + fundo tingido na cor semântica — ver TreinoCard abaixo
  component?: React.ElementType; // default 'div'; permite 'section' etc. para landmark semântico
  'aria-label'?: string;         // repassado ao elemento raiz — necessário quando component="section"
  padding?: 2 | 2.5 | 3;         // default 2 — ver contrato de padding abaixo
  children: React.ReactNode;
  sx?: SxProps<Theme>;          // escape hatch de layout (flex, height) — não para recriar cor/borda/raio
}
```

- `variant="flat"`: `bgcolor: elevation.card`, `border: 1px solid <token resolvido em D3>`,
  `borderRadius: radius.lg`, sem `boxShadow`. Cobre `KPICard`, `SectionCard`, `DiagnosisCard`,
  `ReadinessCard`, `TodayHeroCard`, `WeekOverviewCard`, `WorkoutAnalysisCard`, `ProgressBlockCard` (8
  dos 16 cards da auditoria — a maioria).
- `variant="glass"`: spread de `glassSx` (fundo + borda + `boxShadow` já inclusos no token),
  `borderRadius: radius.lg`. Cobre `StatCard`, `AssessmentInfoCard`, `KudosCard`, `TreinoCard`.
- `interactive`: quando `true` (ou `onClick` presente) e **sem `stateColor`**, adiciona
  `cursor: pointer` e `'&:hover': variant === 'glass' ? glassSxHover : { borderColor: <token hover, a
  definir na task 2> }`. Sem isso, nenhum estilo de `:hover` é aplicado — corrige F6 (hover em card
  não-clicável) por construção, não por convenção lembrada em cada consumidor.
- **Precedência `stateColor` × hover:** `glassSxHover` redefine `backgroundColor`/`border` para um
  neutro (`theme/tokens.ts:104-107`) — aplicado sem condição, ele apagaria a borda 2px e o fundo
  tingido de `stateColor` no hover. Quando `stateColor` está presente, `interactive`/`onClick` aplica
  **só** `cursor: pointer` (se houver), nunca o `background`/`border` de `glassSxHover` ou do hover
  flat — o estado semântico tem precedência sobre o hover em qualquer combinação. Nenhum consumidor da
  migração-prova ou de `standardize-card-migration` usa `stateColor` + `interactive` juntos hoje
  (`TreinoCard` não é clicável no nível do card), mas a API precisa definir o comportamento porque
  ambas as props coexistem na mesma interface.
- **Contrato de padding:** default `padding = 2` (mesmo valor de `StatCard`, `WorkoutAnalysisCard`,
  `ProgressBlockCard` etc. na auditoria). `KPICard` tem uma variante `isHero` (não capturada na
  auditoria original) com `p: 3` — vira `<Card padding={isHero ? 3 : 2}>` na migração-prova, prop
  explícita, não `sx` solto. Não existe padding "consistente" único porque o app já usa dois valores
  reais (2 e 3) para densidade normal vs. hero; a API aceita os dois como valores nomeados, não como
  número livre.
- `stateColor`: cobre o caso real que a auditoria original não capturou —
  `TreinoCard.tsx:119-125` muda borda (1px `glass.border` → 2px cor semântica) e fundo (`glass.background`
  → `${semantic.success[500]}40` ou `${semantic.danger[500]}14`) conforme o treino está
  REALIZADO/PERDIDO. Isso **não é um override ad-hoc**: é um estado suportado explicitamente pela API,
  usando `alpha()` do MUI internamente (corrige F7) em vez da concatenação de string do componente
  atual. `stateColor` funciona com as duas variantes (`flat`/`glass`); quando ausente, o card usa a
  aparência padrão da variante. CA3 ("sem overrides manuais") passa a significar "sem `sx` solto para
  cor/borda/fundo" — `stateColor` é a forma suportada de indicar estado semântico, não uma exceção a
  essa regra.
- `component`/`aria-label`: `DiagnosisCard.tsx:22-24` hoje usa `<Box component="section"
  aria-label={title}>`, criando uma landmark de acessibilidade (`role="region"`) que os testes do
  componente já dependem (`getByRole('region', { name: title })`). Substituir por `<Card>` sem essas
  props quebraria essa semântica silenciosamente — `Card` precisa ser polimórfico (aceitar
  `component`) e repassar `aria-label` ao elemento raiz para que `DiagnosisCard` (fora da
  migração-prova, mas parte da API que precisa estar certa agora) preserve o landmark quando migrar
  em `standardize-card-migration`.

`TodayHeroCard` usa gradiente (`elevation.panel` → `elevation.card`), que não é nem `flat` nem
`glass` puro. Fica fora da migração-prova desta change (não está na lista dos 3 cards do CA7); decidir
em `standardize-card-migration` se vira uma terceira variante (`hero`) ou um `sx` extra sobre `flat`.

## D3. Cor de borda única

**Decisão:** `content.cardBorder` (`theme/tokens.ts:58`, branco translúcido, `${surface[0]}26`) vira a
borda padrão de `variant="flat"`, porque já é o token pensado especificamente para "borda de card"
(o nome do objeto é `content`, e `cardBorder` é a chave). `surface[700]` (cinza opaco, usado antes em
`ReadinessCard`/`TodayHeroCard`/`WeekOverviewCard`/`WorkoutAnalysisCard`/`ProgressBlockCard`) foi
provavelmente escolhido por precedente local, não por um token dedicado a borda — não há indício de
que a opacidade tenha sido uma escolha deliberada para esse grupo de cards.

**Atualizado após a implementação:** `WorkoutAnalysisCard` acabou entrando na migração-prova desta
change (CA7) e já migrou para `content.cardBorder` — a mudança de borda nele é intencional e já
aconteceu, confirmada pelo QA (Codex adversarial + clean-code-reviewer, 29/09), sem asserção de cor
travada no teste porque não fazia parte do comportamento que o teste protegia. Os outros 4 cards
(`ReadinessCard`, `TodayHeroCard`, `WeekOverviewCard`, `ProgressBlockCard`) continuam em `surface[700]`
e ficam para `standardize-card-migration` — risco de mudança de contraste marcado como item de revisão
visual lá, não decidido aqui.

## D4. `CardHeader` — o que entra e o que não entra

Cobre os padrões reais encontrados (F5), sem inventar variante não usada:

```ts
interface CardHeaderProps {
  title: React.ReactNode;       // string na maioria dos casos; ReactNode permite compor (ex.: label + Tooltip)
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;     // botão, link ou chip de ação
  divider?: boolean;            // default false — só SectionCard/DiagnosisCard-like usam
}
```

- `title: React.ReactNode`, não `string` — `KPICard.tsx:81-103` envolve o label num `Tooltip` quando a
  prop `tooltip` é passada; um `title: string` estrito forçaria reconstruir esse comportamento fora do
  `CardHeader`. Aceitar `ReactNode` resolve sem duplicar a lógica de tooltip dentro de `CardHeader`.
- Não cobre o padrão "overline + chip badge" de `TodayHeroCard` (F5) nem os cards "sem header"
  (`AIInsightCard`, `WeeklyReviewCard`, `KudosCard`) — esses continuam compondo o conteúdo deles
  mesmos dentro de `<Card>`, sem `CardHeader`. Forçar todo card a ter `CardHeader` recriaria o
  problema (variante nova por conveniência local).
- Tipografia do título segue o token de fonte ativo (`activeTheme`/tema MUI) — **não** fixa `Syne`
  hardcoded; o conflito de fonte (Inter vs Syne) é explicitamente fora de escopo (ver proposal).
- **`KPICard` fica fora do `CardHeader` na migração-prova** (revisão da task 5.1, ver proposal): o
  "header" de `KPICard` é um label uppercase + tooltip opcional + sparkline na mesma linha — mais
  próximo de um layout de métrica que de um cabeçalho título/ícone/ação. Migra só o wrapper para
  `<Card variant="flat">`, mantendo seu label row atual como `children`. Isso reduz o risco da
  migração-prova (CA7) e ainda exercita `CardHeader` via `WorkoutAnalysisCard` (ícone+h6, o caso mais
  representativo dos 5 formatos encontrados na auditoria).

## D5. Onde vivem os componentes

`src/shared/components/Card.tsx` e `src/shared/components/CardHeader.tsx` — ao lado de `KPICard.tsx`
existente, que é um dos 3 consumidores da migração-prova (CA7). Não entram em `theme/` (são
componentes React, não tokens) nem em `features/*` (são compartilhados entre coach e athlete).

## Riscos e mitigações (inclui pré-mortem via `/codex:adversarial-review`)

Revisão adversarial rodada em 29/09 sobre a primeira versão deste design.md (antes das revisões
acima). Veredito original: `needs-attention`. Os 4 achados foram verificados contra o código real e
já foram incorporados em D1/D2/D4:

| # | Achado do pré-mortem | Onde foi corrigido |
|---|---|---|
| PM1 | `theme.premium.ts:278` exporta um terceiro `radius` (`sharp/inner/outer/pill`), consumido por 4 arquivos de `src/landing/` — CA1 original ("uma única definição em `src/`") ficaria falso | D1 revisado: escopo explícito é o radius dos cards do app; landing fica de fora, documentado como sistema de design separado |
| PM2 | `TreinoCard.tsx:119-125` muda borda e fundo conforme status (REALIZADO/PERDIDO) — `variant="glass"` puro sem overrides não cobre esse consumidor real | D2 ganhou a prop `stateColor`, suportando o caso sem violar "sem `sx` solto" |
| PM3 | `DiagnosisCard.tsx:22-24` usa `component="section" aria-label={title}` (landmark de acessibilidade testado); `Card` como `Box` fixo perderia essa semântica na migração | D2 ganhou `component`/`aria-label` polimórficos |
| PM4 | `KPICard.tsx:81-103` envolve o label num `Tooltip` condicional — `CardHeader.title: string` não comporta isso; a task 5.1 original forçaria reconstruir o comportamento | D4: `title` vira `React.ReactNode`; `KPICard` sai do escopo de `CardHeader` na migração-prova, migra só o wrapper |

**Rodada 2 — pré-mortem no `init` (DoR check, 29/09), sobre design+tasks já revisados pela rodada 1:**

| # | Achado do pré-mortem | Onde foi corrigido |
|---|---|---|
| PM5 | `KPICard`/`StatCard` não têm teste hoje (`find` confirma) — as tasks 5.1/5.2 diziam "testes existentes continuam verdes", uma verificação vazia; CA7 não tinha proteção real para Tooltip/clique | `tasks.md` 5.1/5.2 passam a exigir teste de caracterização **antes** da migração (Tooltip com hover, clique executando `onClick` uma vez) |
| PM6 | `glassSxHover` redefine `background`/`border` incondicionalmente — combinado com `stateColor` num card `glass` + `interactive`, apagaria a indicação semântica no hover; design não definia precedência | D2 ganhou a regra de precedência: `stateColor` sempre vence hover para `background`/`border`; hover aplica só `cursor: pointer` quando os dois coexistem |
| PM7 | Padding "consistente" não tinha contrato — `KPICard` tem uma variante `isHero` (`p: 3`) não capturada na auditoria original; uma implementação sem padding ou com valor errado passaria despercebida | D2 ganhou a prop `padding` (`2 \| 2.5 \| 3`, default `2`); `KPICard` usa `padding={isHero ? 3 : 2}` explicitamente |

**Risco residual aceito:** a revisão do Codex não executou os testes/build desta change (nenhum
código foi escrito ainda) — os achados são sobre o **design**, não uma verificação de implementação.
A task de validação de cada bloco (`npm run lint && npm run build && npm run test:run`) é quem
confirma que a implementação de fato preserva `stateColor`, o landmark de `DiagnosisCard`-like e o
tooltip de `KPICard` quando esses componentes migrarem (foundation ou change seguinte).

**Rollback:** change puramente aditiva do lado dos componentes novos (`Card.tsx`, `CardHeader.tsx`
não existem hoje) e sem migração de dados. Reverter o PR restaura os dois exports de `radius` e os 3
componentes da migração-prova (`KPICard`, `StatCard`, `WorkoutAnalysisCard`) voltam ao wrapper manual
anterior — seguro em qualquer ponto da implementação, inclusive parcial (tasks 1-4 sem a 5, ou vice-versa
não se aplica porque a 5 depende das 1-3).
