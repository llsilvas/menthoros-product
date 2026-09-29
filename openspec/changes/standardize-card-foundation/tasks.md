# Tasks — standardize-card-foundation

Branch `feature/standardize-card-foundation` (front).

**Ordem:** 1 → 2 → 3 → 4 → 5. O bloco 1 remove a ambiguidade de `radius` que os blocos 2 e 3 consomem;
o bloco 4 (fix isolado) pode rodar em paralelo a 1-3 se preferir, mas entra antes do 5 porque
`AssessmentInfoCard` é um dos candidatos de migração-prova caso `WorkoutAnalysisCard` mude de escopo.
Um commit por bloco.

## 1. Resolver colisão de `radius` (D1)
- [x] 1.1 Levantar todos os consumidores de `radius` de `theme/tokens.ts` (`grep -rn "radius" src --include="*.tsx" --include="*.ts"`) e confirmar se algum depende do formato `number` em vez de string px. Confirmar também que os consumidores de `radius` de `theme/theme.premium.ts` (`sharp/inner/outer/pill`) estão todos em `src/landing/` — se algum viver fora dali, ele entra no escopo desta change (D1)
  - verify: **zero consumidores** de `radius` em `theme/tokens.ts` (código morto duplicado) — todos os 16 componentes que usam `radius` já importam de `shared/design-tokens/density.ts` diretamente. Os únicos 4 consumidores de `radius` de `theme.premium.ts` são `src/landing/{ProductUI,AccessForm,primitives,sections}.tsx` — confirmado landing-only
- [x] 1.2 Remover o export `radius` de `theme/tokens.ts`; atualizar os poucos consumidores identificados em 1.1 para importar de `shared/design-tokens/density.ts`
  - verify: nenhum consumidor a atualizar (1.1 confirmou zero); `npm run build` sem erro de tipo/import
- [x] 1.3 Validação: `npm run lint && npm run build && npm run test:run`
  - resultado: lint sem issues; build ok; 211 arquivos / 1714 testes verdes (worktree a partir de `origin/develop`)

## 2. Componente `Card` (D2, D3)
- [x] 2.1 Teste primeiro: `shared/components/Card.test.tsx` — variante `flat` (bgcolor `elevation.card`, borda `content.cardBorder`, `radius.lg`, sem boxShadow), variante `glass` (spread de `glassSx`), `interactive`/`onClick` liga hover e cursor, ausência de `interactive` não gera `:hover`, `stateColor` aplica borda 2px + fundo tingido via `alpha()` (caso `success`/`danger`, espelhando `TreinoCard`), `component="section"` + `aria-label` produz `getByRole('region', { name })`, `padding` default `2` e aceita `3`, **`stateColor` + `interactive` juntos: hover não altera `background`/`border` (só `cursor`)** — PM6
  - verify: vermelho confirmado (`Failed to resolve import "./Card"`) antes da implementação
- [x] 2.2 Implementar `shared/components/Card.tsx` conforme D2/D3 — props `variant`, `interactive`, `onClick`, `stateColor`, `component`, `aria-label`, `padding`, `sx`; hover nunca sobrescreve `background`/`border` quando `stateColor` está presente. Lógica pura extraída para `cardStyles.ts` (regra `react-refresh/only-export-components` do lint não permite função não-componente exportada do mesmo arquivo de um componente)
  - verify: `Card.test.tsx` 11/11 verde
- [x] 2.3 Validação: `npm run lint && npm run build && npm run test:run`
  - resultado: lint sem issues; build ok; 212 arquivos / 1725 testes verdes

## 3. Componente `CardHeader` (D4)
- [x] 3.1 Teste primeiro: `shared/components/CardHeader.test.tsx` — título sempre presente (string e `ReactNode`, ex.: label envolto em `Tooltip`), `icon`/`subtitle`/`action` opcionais renderizam quando passados e somem quando omitidos, `divider` alterna a borda inferior
  - verify: vermelho confirmado (`Failed to resolve import "./CardHeader"`) antes da implementação
- [x] 3.2 Implementar `shared/components/CardHeader.tsx` conforme D4 (`title: React.ReactNode`). `divider` testado via `data-divider` no header (marcador semântico) em vez de valor de CSS computado, mais robusto que depender da resolução de stylesheet do jsdom
  - verify: `CardHeader.test.tsx` 7/7 verde
- [x] 3.3 Validação: `npm run lint && npm run build && npm run test:run`
  - resultado: lint sem issues; build ok; 213 arquivos / 1732 testes verdes

## 4. Corrigir bug de cor (F4)
- [x] 4.1 `pages/home/components/AssessmentInfoCard.tsx:125` — trocar `bgcolor: '33'` pelo token real (confirmar contra o design original se era `${primary[500]}33` ou outro papel de cor; usar `alpha()` do MUI em vez de concatenação de string, alinhado com F7)
  - resultado: `bgcolor: alpha(primary[500], 0.2)` — coerente com `color: primary[500]` no mesmo Chip (papel/role em lime translúcido). Componente não tinha teste; criado `AssessmentInfoCard.test.tsx` com asserção exata contra `alpha(primary[500], 0.2)` (não apenas "é rgba", que passaria mesmo com o bug)
  - verify: `AssessmentInfoCard.test.tsx` 2/2 verde
- [x] 4.2 Validação: `npm run lint && npm run build && npm run test:run`
  - resultado: lint sem issues; build ok; 214 arquivos / 1734 testes verdes

## 5. Migração-prova (CA7)

`KPICard` e `StatCard` não têm teste hoje (confirmado por `find` durante o DoR check) — "testes
existentes continuam verdes" seria uma verificação vazia (PM5). Cada um ganha um teste de
caracterização **antes** da migração, no comportamento atual, para servir de rede de segurança real.

- [x] 5.1a Teste de caracterização `shared/components/KPICard.test.tsx` (não existe hoje) sobre o
  comportamento **atual**: `Tooltip` aparece no hover do label quando `tooltip` é passado e não
  aparece quando ausente; padding `isHero` (`p: 3`) vs. normal (`p: 2`)
  - verify: 6/6 verde contra a implementação atual, antes de qualquer migração
- [x] 5.1b Migrar `shared/components/KPICard.tsx` para `<Card variant="flat" padding={isHero ? 3 : 2}>` como wrapper — manter o label row (com `Tooltip` condicional) e o sparkline como `children`, sem `CardHeader` (ver `design.md` D4)
  - verify: 6/6 de 5.1a continua verde; `padding` tipado `2 | 3` na própria variável (sem cast) já que agora alimenta a prop tipada de `Card`
- [x] 5.2a Teste de caracterização `pages/home/components/StatCard.test.tsx` (não existe hoje): `onClick` dispara exatamente uma vez ao clicar quando presente; cursor pointer só quando `onClick` está presente
  - verify: 4/4 verde contra a implementação atual. Assertar `cursor: 'default'` explícito sem `onClick` quebrou pós-migração (Card não seta cursor quando não-interativo, computed fica `''`, não `'default'` — visualmente idêntico); ajustado para `not.toBe('pointer')`, que é o comportamento que de fato importa
- [x] 5.2b Migrar `pages/home/components/StatCard.tsx` para `<Card variant="glass" interactive={!!onClick} onClick={onClick}>`
  - verify: 4/4 de 5.2a continua verde (após o ajuste de asserção acima)
- [x] 5.3 Migrar `features/athlete/components/WorkoutAnalysisCard.tsx` para `<Card variant="flat">` + `<CardHeader icon={...} title={...}>`
  - verify: 3/3 testes existentes de `WorkoutAnalysisCard.test.tsx` continuam verdes. `Card` ganhou a prop `data-testid` (repassada ao elemento raiz) para preservar `getByTestId('workout-analysis-card')` — adicionado teste próprio em `Card.test.tsx`. Border muda de `surface[700]` para `content.cardBorder` (default da variante `flat`, D3) — mudança visual intencional, sem asserção de cor no teste existente
- [x] 5.4 Validação final: `npm run lint && npm run build && npm run test:run`
  - resultado: lint sem issues; build ok; 216 arquivos / 1745 testes verdes
  - **Navegação manual adiada**: as 3 telas (`KPICard` no Inbox do coach, `StatCard`/`AssessmentInfoCard` na Home, `WorkoutAnalysisCard` no fluxo pós-treino do atleta) ficam atrás de login Keycloak. Backend local respondeu (`:8099/actuator/health` 200), mas Keycloak não está rodando neste ambiente (`:8180`/`:8080`/`:8081`/`:8543` todos inacessíveis, nenhum processo `keycloak`) — sem ele não há como autenticar. Confiança fica nos 14 testes de componente dos 3 cards migrados (estrutura, ordem de texto, Tooltip, padding, clique, cursor). Follow-up: revisar visualmente com Keycloak local rodando antes do PR, ou durante o `/qa`

## 6. Fechamento
- [x] 6.1 Revisar `specs/design-system/spec.md` (já criado no proposal) contra a implementação final — ajustar cenários se a API de `Card`/`CardHeader` mudou durante o desenvolvimento
  - resultado: spec confere com a implementação final. Único detalhe sem cenário próprio é `data-testid` (prop de teste, não comportamento de usuário) — decisão consciente de não formalizar em BDD
- [x] 6.2 Revisar se `standardize-card-migration` (change seguinte) precisa de ajuste no proposal/design em função de alguma decisão tomada durante a implementação (ex.: mudança na API de `Card`/`CardHeader`)
  - resultado: nenhum ajuste necessário. `TreinoCard` (task 9.1) já usa `stateColor` corretamente; as tasks que preservam `data-testid` existente (ex.: se algum dos 9 cards restantes tiver um) seguem coberto implicitamente por "testes existentes verdes" + o padrão já estabelecido em `WorkoutAnalysisCard` (task 5.3 desta change)

## 7. QA (`/qa`, 29/09)

Rodado em paralelo: `frontend-reviewer` e `clean-code-reviewer` (Claude), `/codex:review` e
`/codex:adversarial-review` (Codex, cross-model). Veredito consolidado: **aprovar** — nenhum achado
Critical nos 4 passes.

**Important corrigidos nesta rodada** (commit próprio):
- `buildCardSx` retornava `Record<string, unknown>`, forçado de volta a `SxProps<Theme>` com `as` no
  consumidor (clean-code-reviewer) — assinatura agora declara `SxProps<Theme>` como retorno; o cast
  interno continua (é o padrão aceito para montar esse tipo incrementalmente), mas o consumidor
  (`Card.tsx`) não precisa mais castear.
- `onClick?: unknown` em `BuildCardSxArgs` acoplava a camada de estilo ao handler de evento
  (clean-code-reviewer) — `cardStyles.ts` agora só recebe `isInteractive: boolean`, já resolvido por
  `Card.tsx`.
- Default de `padding` duplicado em `Card.tsx` e `cardStyles.ts` (clean-code-reviewer) — `padding`
  virou obrigatório em `BuildCardSxArgs`; o único default (`2`) mora em `Card.tsx`.
- Transição de hover que existia em `StatCard`/`AssessmentInfoCard` (`transition:
  transitions.default`) tinha sumido na migração para `Card` (Codex adversarial) — `buildCardSx`
  aplica `transitions.default` sempre, não só nas variantes que já tinham.
- `design.md` D3 ficou com uma descrição desatualizada (dizia que a borda de `WorkoutAnalysisCard`
  só mudaria em `standardize-card-migration`, mas ele migrou nesta change) — corrigido.

**Important registrados como follow-up, não corrigidos aqui** (expandiriam o escopo desta change —
`Card`/`CardHeader` viram a base compartilhada, mas os dois pontos abaixo são capacidades novas, não
consolidação do que já existia):
- **Acessibilidade por teclado em `Card interactive`** (frontend-reviewer): sem `role="button"`,
  `tabIndex` ou `onKeyDown` (Enter/Space). Não é regressão — nenhum card clicável do app tinha isso
  antes (`StatCard` já usava `Paper onClick` sem essas props) — mas agora é a primitiva compartilhada
  que mais cards vão adotar, então o custo de corrigir sobe a cada novo consumidor. Candidato a change
  própria antes que `standardize-card-migration` migre mais cards interativos.
- **`CardHeader` fixa `component="h3"`** (frontend-reviewer): sem prop para ajustar o nível de heading.
  Nenhum consumidor atual precisa disso (só `WorkoutAnalysisCard` usa `CardHeader` por enquanto); YAGNI
  por ora, mas registrar para quando um segundo consumidor aparecer numa página com hierarquia de
  heading mais profunda.
- **Mudança visual de raio do `KPICard`** (clean-code-reviewer + frontend-reviewer, achado convergente):
  `borderRadius: 1` (≈4px) → `radius.lg` (12px) via `Card variant="flat"`. Consistente com D2 (o token
  `density.ts` já comenta "KPI cards, modals" para `lg`) — intencional, não é um bug, mas nenhum teste
  trava o valor antigo vs. novo porque não fazia parte do que a caracterização protegia (comportamento,
  não pixels). Fica registrado aqui para a revisão visual pendente (task 5.4).
