# Finalize Design System — Dark-First com Tokens do Logo Menthoros

## Why

A validação visual das telas do coach shell trouxe duas evoluções que
invalidam parte da spec anterior (`standardize-coach-shell-ux`):

1. **Adoção do logo Menthoros como fonte de tokens canônicos**: lime-green
   `#D4FF3A` (era `#FF6B35` laranja) como `primary`, navy `#0A1628` como
   `surface-900`. A nova paleta unifica visualmente os shells do treinador
   e do atleta (que já usavam lime + navy), criando coesão de produto.

2. **Adoção formal de dark-first**: o tema escuro deixa de ser uma das
   opções e passa a ser o **padrão único do MVP**. Light mode fica fora
   de escopo até pós-piloto. Isso simplifica decisões de componentes e
   reduz superfície de testes.

Além disso, o review visual identificou **inconsistências nos componentes
existentes que precisam ser corrigidas** antes do piloto:

- `AtletaStatusRow` usa cores cruas hardcoded (`#34c064`, `rgba(231,76,60,...`)
  que não pertencem ao token system — status `EM_DIA` até usa verde não-canônico
- `AtletasList` usa cores de nível experience hardcoded (`#93C5FD`, `#FCD34D`,
  `#6EE7B7`) em vez dos tokens `categorical` e `semantic`
- Escala tipográfica não documentada (11px / 12px / 14px coexistindo)
- Sem regra de enforcement para evitar drift incremental (cores cruas em PRs futuros)

Esta mudança **consolida e finaliza** o design system, corrige as violações
existentes e trava os tokens para que o coach shell seja construído sobre
uma fundação sólida.

## What Changes

### Tokens (BREAKING — substitui paleta anterior)

- **MODIFIED**: `primary-500` muda de `#FF6B35` para `#D4FF3A` (lime do logo)
- **MODIFIED**: `surface-900` formalizado como `#0A1628` (navy do logo)
- **ADDED**: escala completa `primary-50` a `primary-900` derivada do lime ✅
- **ADDED**: escala completa `surface-0` a `surface-900` derivada do navy ✅
- **ADDED**: tokens de tipografia (`text-xs` a `text-display`) ✅
- **ADDED**: tokens de elevação (4 níveis via bg-shift, dark-friendly) ✅
- **ADDED**: tokens de densidade (compact/comfortable/spacious) ✅
- **ADDED**: declaração explícita de dark-first (light fica out-of-scope) ✅

### Convenções formalizadas

- **ADDED**: regra de "disciplina do lime" — máximo 8 elementos lime por tela
- **ADDED**: `AvatarStatus` enum canônico (5 estados, sem lime) ✅
- **ADDED**: `FormVariant` enum fechado (5 níveis + `formFromTSB()`) ✅
- **ADDED**: ESLint rule para bloquear cores cruas em vez de tokens
- **ADDED**: hook `useLimeAudit()` em dev mode
- **ADDED**: regra "vermelho ≠ tipo de treino" — `danger` reservado para risco/erro
- **ADDED**: regra de single source of truth temporal por tela

### Correção de violações existentes

- **FIXED**: `AtletaStatusRow` — substituir todas as cores hardcoded por tokens
  semânticos (`semantic.success`, `semantic.danger`, `categorical.cat1`)
- **FIXED**: `AtletasList` — substituir cores de nível hardcoded por tokens
  (`categorical.cat1`, `semantic.warning`, `semantic.success`)

### Athlete Shell alinhado

- **VERIFIED**: `theme/tokens.ts` já importa de `shared/design-tokens` —
  bridge com MUI está funcional ✅
- **ADDED**: auditoria e fix de quaisquer cores cruas remanescentes nas
  telas do atleta (home, plan, progress)

## Impact

- **Affected specs**: `shared-design-system` (refinamento profundo), `athlete-ui`
- **Affected code**:
  - `src/shared/design-tokens/*` — tokens criados ✅
  - `src/theme/tokens.ts` — bridge MUI alinhada ✅
  - `src/features/coach/types/AvatarStatus.ts` — criado ✅
  - `src/features/coach/types/AthleteForm.ts` — criado ✅
  - `src/pages/home/components/AtletaStatusRow.tsx` — fix de cores cruas
  - `src/pages/atletas/AtletasList.tsx` — fix de cores cruas
- **Migration**: sem breaking change funcional. Mudança é puramente visual
  (tokens → mesmo visual com código correto).
- **Risco**: Baixo. Antes de qualquer merge, validar visualmente com Carlos
  Mendes (treinador-piloto). Se feedback positivo, travar tokens e fazer PR.

## Out of Scope (consciente)

- **Coach shell** (`CoachAthleteAvatar`, `StatusBadge`, `WorkoutBlock`,
  `/coach/athletes`, `/coach/insights`, `/coach/calendar`): responsabilidade
  da change `standardize-coach-shell-ux`, que consumirá os tokens definidos aqui.
- **Storybook** e stories de edge cases: setup tem custo alto e pertence ao
  sprint do coach shell.
- **Light mode**: adiado para pós-piloto.
- **High contrast mode**: adiado, mas dark default já passa WCAG AAA.
- **Theming por tenant** (white-label): tier premium futuro.

## Janela ideal

Completar **antes** de iniciar `standardize-coach-shell-ux`. Os tokens são
o input do primeiro task list do coach shell.
