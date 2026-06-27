**Tamanho:** L · **Trilha:** Full

> Change de **frontend** (`apps/menthoros-front`). Não toca backend, schema, nem contratos de API.
> Lógica de domínio (limiares de readiness, TSB→Forma, regras de zona) permanece **propriedade do backend** — a UI só renderiza o valor resolvido. Esta change é puramente **token de cor + consumo de token**.

## 1. Summary + Goals / Non-Goals

### Why (o problema, em nossas palavras)

O sistema de cor atual do frontend acumulou três dívidas que comprometem legibilidade, confiabilidade visual e a leitura "premium / instrument-grade" do produto:

1. **Sobrecarga do lime (`#D4FF3A`).** Hoje o lime significa, ao mesmo tempo: marca, ação primária, banda de readiness 70–89 (`readiness.high`), zona fisiológica Z2 e a etapa `principal` de um treino. Quando uma cor significa quatro coisas, ela não significa nenhuma — o olho não consegue inferir intenção. Na v2.0 o lime é **retunado para `#BDDE5A` (tamed)** e restrito a **marca + ação** apenas.
2. **Colisão semântica × categórica.** Tipos de treino e etapas reaproveitam `danger`/`warning`/`success`/`info` (ver `src/shared/theme/workoutColors.ts`). Um chip vermelho é ambíguo: é "erro" ou é `INTERVALADO`? A v2.0 move tipos/etapas para uma paleta **`categorical` dedicada**; o vermelho puro fica reservado a **lesão** (`injuryResponse`).
3. **Premium drift.** Lime neon + glass pesado (`blur(10px)` + white-alpha empilhado) leem como energy-drink, não como instrumento. A direção é **restraint, hairlines, material sobre glow**.

### Goals

- Adotar `theme.premium.ts` (v2.0) como **única fonte de verdade** de tokens de cor — sem inventar cores novas.
- Garantir que **todo componente referencie token semântico/de papel**, nunca hex cru.
- Resolver a colisão semântico×categórico migrando tipos/etapas para `categorical`.
- Restringir o lime a marca/ação e a **uma métrica-chave por view** (Disciplina do Lime, auditável).
- Trocar o efeito glass por **material + hairline** nas superfícies densas do coach cockpit.

### Non-Goals

- **Não** alterar limiares de readiness, fórmula TSB→Forma, nem regras de zona — isso é do backend/domínio.
- **Não** mudar a rampa de calor convencional das zonas Z1–Z5 (convenção de domínio). **Só Z2 muda** (lime → verde) — intencional, não um esquecimento.
- **Não** introduzir Tailwind nem CSS color vars. Tokens continuam TypeScript + MUI dark.
- **Não** redesenhar layout/IA das telas — esta change é cor + material, não reflow funcional.
- `info` blue (`#3B82F6`) **permanece** como token funcional de UI, mas **nunca** alcança superfícies de marca / hero.

## 2. What Changes

- **`src/shared/design-tokens/colors.ts`**: `primary` regenerado, ancorado em `#BDDE5A` (500); `readiness` reescrito como mapa nomeado (`critical`/`caution`/`good`/`optimal`), banda `good` 70–89 = teal `#2DD4BF` (lime removido); `categorical` reescrito de `cat1..cat8` genéricos para paleta nomeada (`slate`/`teal`/`cyan`/`violet`/`magenta`/`coral`/`gold`/`sage`/`injuryResponse`).
- **`src/theme/tokens.ts`**: `zones.Z2.color` lime → `#34D399` (verde); `glass` revisado para material/hairline; `sidebar.selectedBg` recalculado sobre o novo lime; export de `readinessColor(score)` determinístico.
- **`src/shared/theme/workoutColors.ts`** (epicentro da colisão): `WORKOUT_TYPE_COLORS` e `WORKOUT_STAGE_COLORS` remapeados de tokens semânticos para `categorical`; `principal` perde o lime (→ `categorical.teal`).
- **`src/features/athlete/components/ReadinessCard.tsx`**: remover a lógica de banda inline (que usa `primary[500]` para 70–89) e consumir `readinessColor()` do token.
- **Lint**: nova regra `no-raw-color-literals` (ESLint) que falha CI em qualquer hex/rgba em arquivos fora dos arquivos de token.
- **Auditoria**: teste unitário sobre os mapas de token garantindo que nenhuma categoria compartilha hex com token semântico; reforço do `useLimeAudit` existente.

### Capabilities

#### New Capabilities

- `frontend-color-system`: contrato de tokens de cor v2.0 (papéis, regras de consumo, disciplina do lime, gate de lint) e os critérios verificáveis de conformidade.

#### Modified Capabilities

<!-- Nenhuma capability de domínio muda. A renderização de readiness/zone/status passa a consumir tokens v2.0, sem alterar a lógica resolvida pelo backend. -->

## 3. Hardcoded-hex inventory plan

Levantamento atual (medido em `apps/menthoros-front`, excluindo os arquivos de token `src/shared/design-tokens/*` e `src/theme/tokens.ts`):

- **111** ocorrências de hex cru em **24** arquivos de componente.
- **189** ocorrências de `rgba(...)` em componentes.
- Maiores ofensores: `WorkoutTimelineChart.tsx` (22), `pages/landing/LandingPage.tsx` (19), `App.tsx` (7), `types/PlanoSemanal.ts` (6), `pages/auth/LoginPage.tsx` (6), `types/TreinoRealizado.ts` (5).

**Como encontrar tudo (já existe base):**

```bash
# hex cru (3/6 dígitos) — exclui arquivos de token
grep -rn --include="*.tsx" --include="*.ts" -E "#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b" src/ \
  | grep -vE "src/shared/design-tokens|src/theme/tokens.ts"
# rgba / rgb cru
grep -rn --include="*.tsx" --include="*.ts" -E "rgba?\(" src/ \
  | grep -vE "src/shared/design-tokens|src/theme/tokens.ts"
```

`src/shared/design-tokens/forbidden-uses.ts` já mapeia hex→token e expõe `auditRawColors()`. Esta change **promove esse mapa a gate de CI** via regra ESLint (ver design.md §Lint Rule), e atualiza o mapa para a v2.0 (`#D4FF3A` → "lime aposentado; use `primary[500]` = `#BDDE5A`").

**Regra de roteamento:** todo literal encontrado é classificado em um de quatro destinos — `primary` (marca/ação), token `semantic` (feedback), token `categorical` (qualitativo), ou token de superfície/`glass`/`text`. Hex sem token correspondente vira defeito que **bloqueia o merge** até ser roteado.

## 4. Lime Discipline check

Regra revisável: **lime aparece apenas como marca/ação + no máximo UMA métrica-chave por view.** Banda de readiness, zona, etapa e tipo **nunca** usam lime.

- **Estático:** `grep` garante 0 ocorrências de lime nos mapas de readiness/zone/stage/type (ver acceptance criteria).
- **Runtime (dev):** `useLimeAudit()` já existe (`src/shared/hooks/useLimeAudit.ts`, limite 8 elementos lime no viewport). Esta change reduz o limite e o reaponta para a regra v2.0.

## 5. Component migration plan (resumo — detalhe em design.md)

- **Fase 1 — mecânica, baixo risco:** trocar o valor do lime (`#D4FF3A`→`#BDDE5A`) na escala `primary`, em `sidebar`/`glass`, e mapear `trainingStatus` → tokens semânticos. **Sem mudança de lógica visual.**
- **Fase 2 — correção de colisão:** tipos de treino, etapas, banda de readiness e Z2 migram para `categorical`/`readiness`/verde. **Muda a cor de chips/labels** (esperado).
- **Fase 3 — premium polish:** glass → material/hairline, densidade e espaço negativo no coach cockpit.

## 6. Acceptance Criteria (binários, testáveis)

Critérios completos em `specs/frontend-color-system/spec.md`. Mínimo:

- **AC-1** — `npm run lint` passa com **0** literais de cor crua em arquivos de componente (regra `no-raw-color-literals` ativa e falhando CI quando violada).
- **AC-2** — `grep` por lime (`#D4FF3A`, `#BDDE5A`, `BDDE5A`, `primary[500]`) **não encontra** ocorrências em `readiness`, `zone` (exceto comentário), `trainingStage` ou `trainingType`.
- **AC-3** — teste unitário sobre os mapas de token assere que **nenhuma** categoria (`trainingType`/`trainingStage`/`categorical`) compartilha hex com um token `semantic` (exceto o reservado `injuryResponse = danger`).
- **AC-4** — visual diff revisado em: **cockpit dashboard**, **athlete plan view**, **workout detail**.
- **AC-5** — `npm run build` e `npm run test:run` passam.

## 7. Métrica de sucesso

- **Confiabilidade visual:** colisões de cor semântico×categórico reduzidas de **N** mapeamentos colidentes (hoje: 6 em `workoutColors.ts` — `TEMPO`, `INTERVALADO`, `REGENERATIVO`, `CONTINUO`, `principal`, `esforco`, `recuperacao`, `desaquecimento` reusando tokens semânticos) para **0**.
- **Dívida de cor crua:** de **111** hex + **189** rgba em componentes para **0** literais fora dos arquivos de token (gate de CI).
- **Rotina do treinador:** menos tempo de hesitação ao ler a fila/plano (um chip vermelho = lesão, nunca tipo de treino) — proxy verificável pela ausência de colisão (AC-3).

## 8. Open Questions & Assumptions

**Assumptions:**
- `theme.premium.ts` é congelado como fonte de verdade; nenhum valor de cor será inventado ou ajustado fora dele.
- Limiares de readiness e regras de zona são resolvidos pelo backend; a UI recebe valor/banda e só mapeia para cor.
- O coach cockpit é a persona primária — a remoção de glass/blur prioriza legibilidade densa.

**Open Questions:**
- O retuning do lime (`#BDDE5A`) sobre `primary.contrastText` (`#0A1628`) atinge WCAG AA para texto? **Verificar contraste antes de Fase 1** (ver Risks).
- A Disciplina do Lime deve ser hard-fail no CI ou warning de dev? Proposta: **warning runtime** (`useLimeAudit`) + **review manual**, não hard-fail (heurística de viewport é não-determinística).
- Feature flag por shell (coach vs athlete) é necessário, ou rollback por reversão de valor único basta? Proposta: **reversão de valor único** (ver Rollback).
