# Shared Design System — Spec Delta (Refinement)

## ADDED Requirements

### Requirement: Dark-First como padrão único do MVP

O sistema SHALL adotar tema escuro como padrão único durante o MVP. Tema
claro não é implementado.

#### Scenario: Carregamento inicial sempre em dark

- **WHEN** qualquer usuário (treinador ou atleta) carrega a aplicação
- **THEN** a interface renderiza em tema escuro
- **AND** não existe toggle de tema visível na UI durante o MVP

#### Scenario: Comunicação ao usuário

- **WHEN** o usuário acessa a tela de Configurações
- **THEN** vê uma seção "Aparência" com nota: "Tema claro chegará em breve"
- **AND** isso comunica expectativa sem prometer prazo

#### Scenario: Componentes sem variant `light`

- **WHEN** um componente é criado durante o MVP
- **THEN** não possui prop `theme` nem variants `light/dark`
- **AND** referencia tokens semânticos diretamente, sem condicional de tema

---

### Requirement: Paleta canônica derivada do logo Menthoros

O sistema SHALL usar `lime-green` e `navy` como cores institucionais,
derivadas diretamente do logo do rinoceronte.

#### Scenario: Primary derivado do lime do logo

- **WHEN** desenvolvedor importa `primary` de design-tokens
- **THEN** recebe escala 50-900 derivada de `#D4FF3A`:

```typescript
export const colors = {
  primary: {
    50:  '#F7FFE0',
    100: '#EEFFCC',
    200: '#E1FF9E',
    300: '#D4FF6B',
    400: '#CFFF4D',
    500: '#D4FF3A',  // canonical brand lime
    600: '#A8CC2E',
    700: '#7C9923',
    800: '#506617',
    900: '#2A3D0A',
  },
} as const;
```

#### Scenario: Surface derivado do navy do logo

- **WHEN** desenvolvedor referencia surfaces
- **THEN** recebe escala 0-900 derivada de `#0A1628`:

```typescript
export const colors = {
  surface: {
    0:   '#FFFFFF',   // reservado para texto/borders sobre dark
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',   // text-tertiary
    500: '#64748B',   // text-secondary muted
    600: '#475569',
    700: '#1E293B',   // borders dark
    800: '#131F35',   // surface elevated (cards)
    850: '#0E1B30',   // surface mid (panels)
    900: '#0A1628',   // surface base (canvas, sidebar) — NAVY DO LOGO
  },
} as const;
```

#### Scenario: Hierarquia de 4 níveis de elevação por bg-shift

- **WHEN** dark mode precisa comunicar hierarquia
- **THEN** usa 4 níveis de surface (não shadows):
  - Nível 1 (base): `surface-900` — canvas
  - Nível 2 (panel): `surface-850` — colunas, painéis
  - Nível 3 (card): `surface-800` — cards, table rows hover
  - Nível 4 (highest): `#1A2940` — selected, modais, command palette

#### Scenario: Contraste validado

- **WHEN** pipeline de CI roda validação
- **THEN** todas as combinações documentadas passam WCAG AA (≥4.5:1):
  - `primary-500` sobre `surface-900`: ≥ 12:1 ✓ AAA
  - `surface-0` (white) sobre `surface-900`: ≥ 16:1 ✓ AAA
  - `surface-400` sobre `surface-900`: ≥ 5:1 ✓ AA
  - Texto em `primary-500` button: usa `surface-900` (preto-navy), não white

#### Scenario: Distinção primary vs success

- **WHEN** validação com simulador de daltonismo (Sim Daltonism, Protanopia)
- **THEN** `primary-500` (lime brand) é visualmente distinguível de
  `success-500` (`#10B981` emerald)
- **AND** lime tem hue ~70° (yellow-green), emerald tem hue ~160°
  (green-cyan) — distância suficiente para todos os tipos de daltonismo
  exceto monocromacia total

---

### Requirement: Disciplina do Lime

O sistema SHALL limitar uso do brand lime para evitar saturação visual.

#### Scenario: Limite por viewport

- **WHEN** uma tela é renderizada no viewport 1440×900
- **THEN** o número de elementos visíveis usando `primary-500` (lime
  saturado) é ≤ 8
- **AND** em dev mode, hook `useLimeAudit()` emite warning se ultrapassar

#### Scenario: Casos legítimos de uso de lime

- **WHEN** lime é usado, deve ser em uma destas categorias:
  - Ação primária (CTA principal, botão "Aprovar")
  - Item ativo de navegação (sidebar, tabs, filter chips)
  - Delta positivo de KPI (`+12%`, `+5 min`)
  - Sparkline em tendência positiva
  - Indicador de progresso/confiança alta (>75%)
  - Métrica-chave hero em card de destaque
- **AND** não é usado para: status dot, categorização de tipo, decoração,
  texto longo

#### Scenario: Lime de alta densidade usa opacidade reduzida

- **WHEN** lime aparece em tabela densa (muitas linhas)
- **THEN** deltas de coluna usam lime com opacidade 70% (`primary-500/70`)
- **AND** apenas elementos acionáveis usam lime 100%

---

### Requirement: Escala tipográfica canônica fechada

O sistema SHALL definir 7 níveis de tipografia. Componentes não usam
valores arbitrários.

#### Scenario: Escala definida

```typescript
export const typography = {
  'xs':      { size: '11px', lineHeight: '14px', weight: 400, tracking: '0.04em' },  // badges, micro labels
  'sm':      { size: '13px', lineHeight: '18px', weight: 400 },                       // table cells, secondary
  'base':    { size: '14px', lineHeight: '20px', weight: 400 },                       // body, primary labels
  'lg':      { size: '16px', lineHeight: '22px', weight: 500 },                       // card titles, emphasized
  'xl':      { size: '18px', lineHeight: '24px', weight: 600 },                       // section headers
  '2xl':     { size: '24px', lineHeight: '32px', weight: 600 },                       // page titles
  'display': { size: '32px', lineHeight: '36px', weight: 600, fontFamily: 'tabular' },// KPI hero numbers
} as const;
```

#### Scenario: Tabular numbers obrigatório para métricas

- **WHEN** um componente renderiza valores numéricos (TSS, CTL, %, minutos)
- **THEN** usa `font-feature-settings: "tnum"` para alinhamento vertical
  consistente
- **AND** evita "saltos" entre linhas em tabelas

---

### Requirement: Princípio "Vermelho ≠ Categoria"

O sistema SHALL reservar a cor `danger` (`#EF4444`) exclusivamente para
alerta, risco ou erro. Nunca para categorizar tipos.

#### Scenario: Categorização usa paleta não-semântica

- **WHEN** workout type, sport, ou outra categoria precisa de cor
- **THEN** usa paleta de **categorical colors** (definida abaixo), nunca
  `danger`/`warning`/`success`

```typescript
export const categoricalColors = {
  // Paleta neutra para categorização (não semântica)
  cat1: '#3B82F6',  // azul
  cat2: '#10B981',  // emerald
  cat3: '#F59E0B',  // amber
  cat4: '#A855F7',  // purple
  cat5: '#EC4899',  // pink
  cat6: '#14B8A6',  // teal
  cat7: '#8B5CF6',  // violet
  cat8: '#6B7280',  // gray neutral (para "combinado", "outros")
};
```

#### Scenario: "Treino combinado" e tipos sem cor natural

- **WHEN** um workout type não tem mapeamento semântico óbvio (ex:
  "Combinado", "Outros", "Custom")
- **THEN** usa `categoricalColors.cat8` (gray neutral)
- **AND** **nunca** usa border vermelha (que indicaria erro/alerta)

---

### Requirement: Single Source of Truth Temporal por Tela

O sistema SHALL evitar controles temporais duplicados na mesma tela.

#### Scenario: Date range global vs local

- **WHEN** uma tela possui date range no header (global)
- **THEN** componentes filhos (gráficos, KPIs) herdam esse range
- **AND** componentes filhos não exibem seu próprio date picker
- **AND** se um gráfico precisa de range diferente, é movido para tela
  dedicada (não convive com global)

#### Scenario: Exceção legítima

- **WHEN** um gráfico tem range derivado (não selecionável)
- **THEN** pode exibir label informativo ("Últimas 4 semanas") mas sem
  controle interativo

---

## MODIFIED Requirements

### Requirement: Semantic Color Palette (refinado)

**Mudança vs versão anterior**: cores semânticas reafirmadas e diferenciadas
explicitamente do brand `primary`.

| Token | Cor | Uso EXCLUSIVO |
|-------|-----|---------------|
| `primary-500` | `#D4FF3A` lime | Brand, ações, deltas positivos |
| `danger-500`  | `#EF4444` red  | Alerta, risco, erro, rejeição |
| `warning-500` | `#F59E0B` amber | Atenção, sinal moderado |
| `success-500` | `#10B981` emerald | Estado saudável, completado |
| `info-500`    | `#3B82F6` blue | Informação neutra, charts |

#### Scenario: Quatro princípios de cor

1. **Primary nunca categoriza** — lime é ação/brand, não tipo
2. **Danger nunca decora** — vermelho só comunica risco
3. **Success ≠ Primary** — emerald é estado, lime é ação
4. **Categorias usam paleta dedicada** — não reutilizar semânticas

---

### Requirement: AI Suggestion Type Taxonomy (refinado)

**Mudança vs versão anterior**: tipos passam a usar paleta categorical, não
semântica.

#### Scenario: Tipos com cores não-semânticas

| Type | Label PT-BR | Color Token | Categórico (não semântico) |
|------|-------------|-------------|----------------------------|
| `new_plan`        | Novo plano        | `cat1` (blue)    | criação |
| `plan_adjust`     | Ajuste de plano   | `cat3` (amber)   | modificação |
| `recovery`        | Recuperação       | `cat7` (violet)  | cuidado/redução |
| `race_simulation` | Simulação de prova| `cat6` (teal)    | preparação |
| `deload`          | Descarga          | `cat8` (gray)    | descarga |
| `injury_response` | Resposta a lesão  | `danger-300`     | **única exceção**: lesão é risco |

#### Scenario: Justificativa da exceção `injury_response`

- **WHEN** o tipo é `injury_response`
- **THEN** usa `danger-300` (variante mais clara) porque lesão **é**
  semanticamente risco
- **AND** isso é a única exceção formalizada à regra "categoria ≠ semântica"
