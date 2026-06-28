## ADDED Requirements

### Requirement: Tokens de cor canônicos Premium v2.0
O sistema de design SHALL derivar toda cor de componentes a partir de tokens TypeScript canônicos definidos pela paleta Premium v2.0 (`theme.premium.ts`), consumidos via MUI dark mode, sem Tailwind e sem CSS color variables.

#### Scenario: Componente referencia token, não hex
- **WHEN** um arquivo de componente (`*.tsx`) precisa de uma cor
- **THEN** ele SHALL referenciar um token de `src/shared/design-tokens` e NÃO SHALL conter literal de cor (`#rrggbb`, `rgb()`, `rgba()`, `hsl()`)

#### Scenario: Lint falha em cor raw
- **WHEN** um literal de cor é introduzido em um arquivo de componente
- **THEN** a regra ESLint `no-raw-color-literals` SHALL falhar o CI

#### Scenario: Hex legítimo só na camada de tokens
- **WHEN** um hex aparece em `src/shared/design-tokens/**`, `src/theme/**` ou `workoutColors.ts`
- **THEN** a regra `no-raw-color-literals` SHALL permiti-lo (allowlist por path)

### Requirement: Lime restrito a marca e ação primária
O sistema de design SHALL restringir o uso do lime de marca (escala `primary.*`) a tokens de brand e de primary-action.

#### Scenario: Lime fora da allowlist é defeito
- **WHEN** um token fora de `primary.*` ou `sidebar.selectedBg` resolve para um hex na faixa lime
- **THEN** o teste de Lime Discipline SHALL falhar

#### Scenario: Categorias e estados não usam lime
- **WHEN** os tokens de `readiness`, `trainingType`, `trainingStage`, `zone` ou `trainingStatus` são resolvidos
- **THEN** nenhum deles SHALL resolver para a faixa lime

### Requirement: Categorias não colidem com tokens semânticos
O sistema de design SHALL garantir que nenhuma cor de categoria compartilhe hex com um token semântico.

#### Scenario: Sem colisão categoria × semântico
- **WHEN** cada hex de `trainingType`, `trainingStage`, `readiness` e `zone` é comparado contra `{danger, warning, success, info}`
- **THEN** nenhuma categoria SHALL compartilhar hex com um token semântico

#### Scenario: Exceção declarada de injuryResponse
- **WHEN** `categorical.injuryResponse` é avaliado
- **THEN** ele SHALL ser igual a `semantic.danger` (`#EF4444`) — exceção intencional e testada (lesão é alerta, não categoria neutra)

#### Scenario: Estado de execução ancora em semantic
- **WHEN** os tokens de `trainingStatus` são resolvidos
- **THEN** eles SHALL referenciar tokens semânticos (REALIZADO→success, PERDIDO→danger, PARCIAL→warning, PENDENTE→text.secondary), pois status é estado e não categoria

### Requirement: Heat ramp de zonas preservado exceto Z2
O sistema de design SHALL preservar o heat ramp fisiológico das zonas Z1–Z5, alterando apenas Z2.

#### Scenario: Z2 muda de lime para green
- **WHEN** o token `zone.Z2` é resolvido
- **THEN** ele SHALL ser green `#34D399` (mudança intencional, tirando lime das zonas)

#### Scenario: Demais zonas inalteradas
- **WHEN** os tokens `zone.Z1`, `zone.Z3`, `zone.Z4`, `zone.Z5` são resolvidos
- **THEN** eles SHALL manter o heat ramp convencional (cinza → azul → âmbar → vermelho)

### Requirement: Backend é dono dos thresholds de banda
O sistema de design SHALL renderizar apenas o valor de banda já resolvido pelo backend, sem recalcular thresholds no cliente.

#### Scenario: UI não calcula banda
- **WHEN** uma banda de readiness ou form (TSB) é exibida
- **THEN** a UI SHALL pintar a banda já resolvida pelo backend e NÃO SHALL conter lógica de fronteira de threshold

### Requirement: info blue jamais em brand surfaces
O sistema de design SHALL usar `info` (`#3B82F6`) exclusivamente como token semântico informativo.

#### Scenario: info fora de brand/hero
- **WHEN** `semantic.info` é aplicado
- **THEN** ele SHALL aparecer apenas em contexto informativo e NUNCA em brand surfaces, hero ou call-to-action

### Requirement: Contraste acessível dos categóricos
O sistema de design SHALL garantir contraste acessível dos novos tokens categóricos contra os fundos de elevação.

#### Scenario: Contraste WCAG dos categóricos
- **WHEN** um token categórico é avaliado contra `surface.900`, `surfaceShift.panel`, `surfaceShift.card` e `surfaceShift.raised`
- **THEN** o contraste SHALL atingir WCAG AA (≥4.5:1) para texto e ≥3:1 para componentes de UI / bordas
