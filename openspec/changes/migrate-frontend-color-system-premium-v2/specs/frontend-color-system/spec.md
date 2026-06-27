# Spec delta — frontend-color-system

## ADDED Requirements

### Requirement: Lime restrito a marca e ação
O sistema SHALL usar o lime (`primary[500] = #BDDE5A`) exclusivamente como cor de **marca** e **ação primária**, e SHALL NOT usá-lo em readiness, zonas, etapas ou tipos de treino.

#### Scenario: Lime ausente dos mapas de domínio
- **WHEN** se inspeciona `readiness`, `zone`, `trainingStage` e `trainingType`
- **THEN** nenhum valor SHALL resolver para `#BDDE5A`/`#D4FF3A`/`primary[500]`

#### Scenario: Disciplina do Lime por view
- **WHEN** uma view é renderizada
- **THEN** o lime SHALL aparecer apenas em elementos de marca/ação e em no máximo UMA métrica-chave, e `useLimeAudit()` SHALL emitir warning em dev quando o limite for excedido

### Requirement: Componentes consomem tokens, nunca hex cru
O sistema SHALL referenciar tokens semânticos/de papel em componentes e SHALL falhar o CI quando um literal de cor crua existir fora dos arquivos de token.

#### Scenario: Lint bloqueia hex cru
- **WHEN** um componente em `src/**` (exceto `src/shared/design-tokens/**` e `src/theme/tokens.ts`) contém um hex (`#rgb`/`#rrggbb`) ou `rgb()/rgba()`
- **THEN** `npm run lint` SHALL falhar com a regra `no-raw-color-literals`

#### Scenario: Token files permanecem como fonte de verdade
- **WHEN** o hex aparece em `src/shared/design-tokens/**` ou `src/theme/tokens.ts`
- **THEN** a regra SHALL NOT acusar violação

### Requirement: Separação entre paleta semântica e categórica
O sistema SHALL colorir tipos e etapas de treino pela paleta `categorical` e SHALL reservar o vermelho puro a lesão (`injuryResponse`); nenhuma categoria SHALL compartilhar hex com um token `semantic` (`danger`/`warning`/`success`/`info`), exceto o reservado `injuryResponse`.

#### Scenario: Sem colisão categórico × semântico
- **WHEN** um teste unitário compara os valores de `trainingType`, `trainingStage` e `categorical` contra `semantic`
- **THEN** a interseção de hex SHALL ser vazia, salvo `categorical.injuryResponse === semantic.danger`

#### Scenario: Chip de tipo não é confundível com feedback
- **WHEN** `INTERVALADO` é renderizado
- **THEN** sua cor SHALL ser `categorical.magenta` (não `semantic.danger`), de modo que vermelho nunca signifique simultaneamente "erro" e "INTERVALADO"

### Requirement: Domínio é dono dos limiares; UI só renderiza
O sistema SHALL renderizar readiness, forma (TSB) e zona a partir do valor/banda resolvido pelo backend, e SHALL NOT recalcular limiares no frontend.

#### Scenario: Banda de readiness vem do domínio
- **WHEN** a UI recebe um `readinessScore`
- **THEN** ela SHALL mapear apenas o score→cor via `readinessColor()`, sem alterar os limiares de banda

### Requirement: Rampa de calor das zonas preservada, exceto Z2
O sistema SHALL manter a rampa de calor convencional Z1→Z5 e SHALL alterar apenas Z2 (lime → verde `#34D399`).

#### Scenario: Z1, Z3, Z4, Z5 inalteradas
- **WHEN** se inspeciona `zone`
- **THEN** Z1 (`#C8CDD4`), Z3 (`#3B82F6`), Z4 (`#F59E0B`), Z5 (`#EF4444`) SHALL permanecer; só Z2 SHALL mudar

### Requirement: info blue não alcança superfícies de marca
O sistema SHALL manter `info = #3B82F6` como token funcional de UI e SHALL NOT aplicá-lo a superfícies de marca / hero.

#### Scenario: Hero sem azul de info
- **WHEN** uma superfície de marca/hero é renderizada
- **THEN** ela SHALL NOT usar `semantic.info`
