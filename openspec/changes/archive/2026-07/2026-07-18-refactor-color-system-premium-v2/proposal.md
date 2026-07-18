**Tamanho:** L · **Trilha:** Full

```yaml
id: refactor-color-system-premium-v2
motivation: >
  O sistema de cores atual do menthoros-front acumulou dois débitos que comprometem
  a leitura do produto. (1) Colisão semântica: tipos de treino e bandas de prontidão
  reutilizam diretamente os tokens semânticos (ex.: TEMPO = warning[500], INTERVALADO
  = danger[500], REGENERATIVO = success[500], readiness.high = lime, stage.principal =
  lime). Resultado: um treino de TEMPO fica visualmente idêntico a um alerta de aviso,
  e o treinador não distingue "categoria" de "estado". (2) Lime sem disciplina: o lime
  de marca (#D4FF3A) vaza para categorias e estados (etapa principal, banda de prontidão
  alta), diluindo o sinal de marca/ação. A paleta Premium v2.0 (theme.premium.ts) resolve
  ambos: dá hues categóricos dedicados (slate/teal/cyan/violet/magenta/coral/gold/sage),
  ancora estados nos tokens semânticos sem sobreposição, e restringe o lime a marca e
  ação primária. A v2.0 também suaviza o lime (#D4FF3A → #BDDE5A) para reduzir vibração
  sobre o canvas navy e melhorar contraste de texto sobre superfícies lime.
scope:
  repos: [menthoros-front]
  inclui:
    - Reescrita das primitivas de cor para os tokens canônicos da v2.0 (theme.premium.ts como single source of truth)
    - Remapeamento de readiness, trainingType, trainingStage, zonas, trainingStatus, sidebar e glass
    - Guard-rails de CI: regra ESLint que falha em hex literal dentro de componentes + inventário grep
    - Auditoria de Lime Discipline (lime só em brand / primary-action)
  exclui:
    - Backend (thresholds de TSB→Form e bandas de readiness continuam donos no backend; UI só renderiza valor resolvido)
    - Qualquer migração para Tailwind ou CSS color variables (permanece tokens TS + MUI dark)
    - Mudança de layout/tipografia além do necessário para o polish de densidade da Phase 3
    - Re-tematização do heat ramp das zonas Z1–Z5 (só Z2 muda: lime → green)
phases:
  - phase: 1
    nome: Mecânica
    descricao: Swap da escala primary, lime de sidebar/glass, status → tokens semânticos. Sem mudança de mapeamento de categoria.
  - phase: 2
    nome: Collision fixes
    descricao: trainingType, trainingStage, banda de readiness e Z2 migram para hues dedicados; nenhuma categoria compartilha hex com token semântico.
  - phase: 3
    nome: Premium polish
    descricao: glass → material/hairline, densidade e negative space conforme v2.0.
acceptance_criteria:
  - 0 literais de cor (hex/rgb/rgba/hsl) em arquivos de componente — lint passa em CI
  - Lime aparece somente em tokens de brand / primary-action (auditoria Lime Discipline passa)
  - Nenhuma categoria (trainingType, trainingStage, readiness, zone) compartilha hex com um token semântico — verificado por unit test
  - Visual diff revisado e aprovado em três telas: cockpit dashboard, athlete plan view, workout detail
risks:
  - id: acessibilidade
    descricao: novos hues categóricos podem não atingir contraste mínimo. WCAG AA (>=4.5:1) para texto; >=3:1 para componentes de UI / bordas.
    mitigacao: matriz de contraste por token contra os fundos de elevação (surface.900, panel, card, raised) antes do merge da Phase 2.
  - id: rollback
    descricao: regressão visual após swap das primitivas.
    mitigacao: revert single-value (cada role é um token isolado) + feature-flag de tema (premium-v2 on/off) para rollback instantâneo sem redeploy de componentes.
```

## Why

A geração de plano é a tela onde o treinador toma decisão — e hoje a cor atrapalha em vez de ajudar. Dois problemas estruturais:

1. **Colisão semântica.** As taxonomias de domínio reaproveitam tokens semânticos diretamente em `src/shared/theme/workoutColors.ts` e `src/shared/design-tokens/colors.ts`:
   - `WORKOUT_TYPE_COLORS.TEMPO = semantic.warning[500]` — um treino de TEMPO é renderizado com a mesma cor de um aviso.
   - `WORKOUT_TYPE_COLORS.INTERVALADO = semantic.danger[500]` — colide com erro/perigo.
   - `WORKOUT_TYPE_COLORS.REGENERATIVO = semantic.success[500]` — colide com sucesso.
   - `WORKOUT_STAGE_COLORS.principal = primary[500]` (lime) e `readiness.high = primary[500]` (lime).
   O treinador não consegue separar "que tipo de treino é" de "qual o estado dele" porque os dois falam a mesma língua de cor.

2. **Lime sem disciplina.** O lime de marca (`#D4FF3A`) vaza para categoria (etapa principal) e estado (prontidão alta). Quando tudo pode ser lime, o lime deixa de significar "marca / ação".

A paleta **Premium v2.0** (`theme.premium.ts`, fonte canônica desta change) corrige os dois: hues categóricos dedicados, estados ancorados em tokens semânticos sem sobreposição, e lime restrito a marca/ação. Suaviza o lime de `#D4FF3A` para `#BDDE5A` (menos vibração sobre o navy, melhor contraste de texto sobre superfícies lime via `contrastText: #0A1628`).

## What Changes

- **Primitivas reescritas para a v2.0** — `primary` (50→900 + `contrastText`), `surface` + `surfaceShift` (panel/card/raised), `text` (primary/secondary/muted/onAccent), `semantic` (âncoras inalteradas).
- **Categóricos renomeados e dedicados** — `cat1..cat8` genéricos → `slate/teal/cyan/violet/magenta/coral/gold/sage` + `injuryResponse`.
- **Remapeamento de domínio sem colisão** — `trainingType`, `trainingStage`, `readiness`, `zone`, `trainingStatus` passam a referenciar tokens v2.0; nenhuma categoria compartilha hex com semântico (exceto `injuryResponse`, que é intencionalmente o vermelho de perigo).
- **`sidebar` e `glass`** alinhados aos tokens v2.0 (lime tint de seleção, hairline borders, material glass).
- **Guard-rails de CI** — regra ESLint que falha o build em hex literal dentro de `*.tsx`/componentes, e inventário grep de hardcoded-hex; auditoria automatizável de Lime Discipline.

## Capabilities

### New Capabilities

- `design-system` (frontend): formaliza, como capability auditável, a camada de tokens de cor sob a paleta Premium v2.0 — single source of truth, não-colisão categoria × semântico, Lime Discipline e contrato "componentes nunca referenciam hex raw" (CI gate).

## Impact

**Frontend (`apps/menthoros-front`):**
- `src/shared/design-tokens/colors.ts` — primitivas reescritas (primary scale, surface/surfaceShift, text, semantic, categorical nomeados).
- `src/theme/tokens.ts` — derivação MUI (palette, zonas, sidebar, glass) repontada para v2.0.
- `src/shared/theme/workoutColors.ts` — `WORKOUT_TYPE_COLORS`, `WORKOUT_STAGE_COLORS`, `WORKOUT_STATUS_COLORS` deixam de apontar para tokens semânticos e passam a apontar para categóricos dedicados.
- `src/shared/design-tokens/forbidden-uses.ts` — estende guard-rails com a regra de Lime Discipline.
- Config ESLint — nova regra `no-raw-color-literals` aplicada a componentes (falha CI).

**Backend:** nenhum. Thresholds (TSB→Form, bandas de readiness) permanecem donos no backend; a UI só renderiza o valor de banda já resolvido.

**Banco / API:** nenhum.

## Critérios de aceite

- **CA1 — Sem hex raw em componente.** *Given* um arquivo de componente (`*.tsx`), *when* ele contém um literal de cor (`#rrggbb`, `rgb()`, `rgba()`, `hsl()`), *then* o lint falha o CI. Verificável: `npm run lint` retorna erro na regra `no-raw-color-literals`.
- **CA2 — Lime Discipline.** *Given* a árvore de tokens v2.0, *when* o auditor de Lime Discipline roda, *then* nenhum token fora de `primary.*`, `sidebar.selectedBg` (lime tint de ação) referencia lime. Verificável por teste.
- **CA3 — Sem colisão categoria × semântico.** *Given* os mapas `trainingType`, `trainingStage`, `readiness`, `zone`, *when* o unit test compara cada hex de categoria contra `{danger, warning, success, info}`, *then* nenhuma categoria compartilha hex com um token semântico — exceção declarada e testada: `categorical.injuryResponse === semantic.danger` (intencional).
- **CA4 — Visual diff aprovado.** *Given* as três telas-âncora (cockpit dashboard, athlete plan view, workout detail), *when* o visual diff pós-migração é revisado, *then* há aprovação humana registrada por tela.

## Open Questions & Assumptions

- **Assumption:** `theme.premium.ts` (no corpo desta change) é a single source of truth; nenhum hex fora dele é canônico. Onde a v2.0 é omissa (ex.: estados `300/700` de semantic usados hoje em `danger.300`, `warning.400`), assume-se manter as variações atuais derivadas, ancoradas no `500` da v2.0.
- **Assumption:** o heat ramp Z1–Z5 é convenção fisiológica e permanece (cinza → verde → azul → âmbar → vermelho); **apenas Z2 muda** (lime → green `#34D399`) — declarado como intencional no design.
- **Assumption:** `info` blue (`#3B82F6`) jamais é usado em brand surfaces / hero — apenas como token semântico informativo.
- **Open:** a regra ESLint deve permitir hex em arquivos de token (`design-tokens/**`, `theme/**`) e proibir no resto? (premissa atual: sim — allowlist por path.)
- **Open:** a feature-flag de tema é build-time (env) ou runtime (toggle)? Impacta a estratégia de rollback (ver risco).

## Métrica de sucesso

- **Tempo de leitura de plano:** redução do tempo médio que o treinador leva para escanear uma athlete plan view e identificar tipo + estado de cada treino (proxy: teste de usabilidade com 5 treinadores, antes/depois).
- **Defeitos de cor:** **0** literais de cor raw em componentes (medido em CI) e **0** colisões categoria × semântico (medido em unit test) — ambos como gate permanente, não só no merge.
