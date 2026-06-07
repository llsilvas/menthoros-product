# Canonical Tokens — Reference Sheet

Referência visual rápida dos tokens finais. Use este documento ao codar
componentes ou validar PRs.

## Color Tokens

### Primary (brand lime do logo)

| Token | Hex | Uso |
|-------|-----|-----|
| `primary-50`  | `#F7FFE0` | hover suave de items lime |
| `primary-100` | `#EEFFCC` | backgrounds muito sutis |
| `primary-200` | `#E1FF9E` | reservado |
| `primary-300` | `#D4FF6B` | lime claro (estados secundários) |
| `primary-400` | `#CFFF4D` | hover de buttons primários |
| **`primary-500`** | **`#D4FF3A`** | **canonical brand lime — CTAs, items ativos, deltas positivos** |
| `primary-600` | `#A8CC2E` | active state de buttons |
| `primary-700` | `#7C9923` | borders escuros |
| `primary-800` | `#506617` | reservado |
| `primary-900` | `#2A3D0A` | reservado |

### Surface (navy do logo + escala dark)

| Token | Hex | Uso |
|-------|-----|-----|
| `surface-0`   | `#FFFFFF` | texto branco sobre dark |
| `surface-50`  | `#F8FAFC` | text-primary (off-white) |
| `surface-100` | `#F1F5F9` | text-primary alternativo |
| `surface-200` | `#E2E8F0` | reservado |
| `surface-300` | `#CBD5E1` | reservado |
| `surface-400` | `#94A3B8` | text-tertiary (muted) |
| `surface-500` | `#64748B` | text-secondary muted |
| `surface-600` | `#475569` | reservado |
| `surface-700` | `#1E293B` | borders padrão |
| `surface-800` | `#131F35` | cards, table rows hover |
| `surface-850` | `#0E1B30` | panels, mid-elevation |
| **`surface-900`** | **`#0A1628`** | **navy canonical — canvas base, sidebar** |

### Semantic Colors

| Token | Hex | Uso EXCLUSIVO |
|-------|-----|---------------|
| `danger-500`  | `#EF4444` | alerta, risco, erro, rejeição |
| `warning-500` | `#F59E0B` | atenção, status pendente, sinal moderado |
| `success-500` | `#10B981` | estado saudável, completado, prontidão alta |
| `info-500`    | `#3B82F6` | informação neutra, charts |

### Categorical Colors (não-semânticas)

Use para categorizar tipos sem implicar valor/risco.

| Token | Hex | Sugestão de uso |
|-------|-----|-----------------|
| `cat1` | `#3B82F6` | new_plan (azul) |
| `cat2` | `#10B981` | reservado (cuidado — emerald, evitar confusão com success) |
| `cat3` | `#F59E0B` | tempo runs, plan_adjust (amber) |
| `cat4` | `#A855F7` | reservado (purple) |
| `cat5` | `#EC4899` | reservado (pink) |
| `cat6` | `#14B8A6` | race_simulation (teal) |
| `cat7` | `#8B5CF6` | long_run, recovery suggestion (violet) |
| `cat8` | `#6B7280` | combined_session, deload, strength (gray neutral) |

## Typography Tokens

| Token | Size | Line Height | Weight | Uso |
|-------|------|-------------|--------|-----|
| `text-xs`      | 11px | 14px | 400 | badges, micro labels, timestamps |
| `text-sm`      | 13px | 18px | 400 | table cells, secondary text |
| `text-base`    | 14px | 20px | 400 | body, primary labels |
| `text-lg`      | 16px | 22px | 500 | card titles, emphasis |
| `text-xl`      | 18px | 24px | 600 | section headers |
| `text-2xl`     | 24px | 32px | 600 | page titles |
| `text-display` | 32px | 36px | 600 | KPI hero numbers (tabular) |

**Sempre use** `font-feature-settings: "tnum"` em valores numéricos
(TSS, CTL, %, durações).

## Elevation Tokens (dark mode — usa bg-shift, não shadow)

| Nível | Background | Uso |
|-------|------------|-----|
| 1 (base) | `surface-900` | canvas, sidebar |
| 2 (panel) | `surface-850` | colunas, painéis centrais |
| 3 (card) | `surface-800` | cards, table rows hover |
| 4 (highest) | `#1A2940` | selected, modais, dropdowns, command palette |

Sombras suaves opcionais (apenas em modais sobre overlay):

| Token | Value |
|-------|-------|
| `shadow-modal` | `0 16px 32px rgba(0, 0, 0, 0.4)` |
| `shadow-dropdown` | `0 4px 12px rgba(0, 0, 0, 0.3)` |

## Density Tokens

| Token | Row height | Padding | Uso |
|-------|-----------|---------|-----|
| `density-compact`     | 40-48px | 8px 12px | tabelas densas (Athletes) |
| `density-comfortable` | 56px | 12px 16px | listas focadas (Inbox) |
| `density-spacious`    | 72px | 16px 24px | cards hero, KPIs |

## Border Radius

| Token | Value | Uso |
|-------|-------|-----|
| `radius-xs` | 4px | badges, pills, chips |
| `radius-sm` | 6px | buttons, inputs |
| `radius-md` | 8px | cards padrão, workout blocks |
| `radius-lg` | 12px | KPI cards, modais |
| `radius-xl` | 16px | hero cards, overlays grandes |
| `radius-full` | 9999px | avatars, dots |

## Spacing Scale

Use múltiplos de 4 (sistema base-4):

```
4px  · 8px  · 12px · 16px · 20px · 24px · 32px · 40px · 48px · 64px
```

## Quick Reference — Combinações Validadas

| Texto | Background | Contraste | Uso |
|-------|-----------|-----------|-----|
| `surface-0` (white) | `surface-900` | 16:1 ✓ AAA | texto primário padrão |
| `surface-400` | `surface-900` | 5.1:1 ✓ AA | texto muted/secondary |
| `primary-500` (lime) | `surface-900` | 14:1 ✓ AAA | brand text, deltas |
| `surface-900` (navy) | `primary-500` (lime) | 14:1 ✓ AAA | texto em buttons primários |
| `danger-500` | `surface-900` | 5.6:1 ✓ AA | alerts |
| `success-500` | `surface-900` | 6.2:1 ✓ AA | status saudável |
| `warning-500` | `surface-900` | 8.1:1 ✓ AAA | warnings |

**Nunca usar** texto colorido com contraste < 4.5:1.
