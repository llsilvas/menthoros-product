# Shared Design System — Spec Delta

## ADDED Requirements

### Requirement: Semantic Color Palette

O sistema SHALL prover paleta semântica com escalas 50-900 para cinco
intenções: `primary`, `danger`, `warning`, `success`, `info`.

#### Scenario: Cores semânticas exclusivas por intenção

- **WHEN** um componente comunica ação principal (CTA, item ativo)
- **THEN** usa tokens da escala `primary` (laranja Menthoros)

- **WHEN** um componente comunica risco crítico (overtraining, rejeição)
- **THEN** usa tokens da escala `danger` (vermelho)
- **AND** `danger-500` é visualmente distinto de `primary-500` (matiz diferente, não apenas saturação)

- **WHEN** um componente comunica atenção (ajustes pendentes, sinais leves)
- **THEN** usa tokens da escala `warning` (amarelo/âmbar)

- **WHEN** um componente comunica sucesso (aprovação, treino completo)
- **THEN** usa tokens da escala `success` (verde)

- **WHEN** um componente comunica informação neutra
- **THEN** usa tokens da escala `info` (azul)

#### Scenario: Contraste validado

- **WHEN** o pipeline de CI valida acessibilidade
- **THEN** todas as combinações documentadas em `tokens.md` produzem contraste ≥ 4.5:1 (WCAG AA texto pequeno)
- **AND** texto sobre `primary-500` usa `white` (contraste validado)
- **AND** texto sobre `warning-100` usa `warning-900` (contraste validado)

#### Scenario: Token shape

```typescript
export const colors = {
  primary:  { 50: '#FFF4ED', 100: '#FFE6D5', /* ... */ 500: '#FF6B35', /* ... */ 900: '#7C2D12' },
  danger:   { 50: '#FEF2F2', 100: '#FEE2E2', /* ... */ 500: '#DC2626', /* ... */ 900: '#7F1D1D' },
  warning:  { 50: '#FFFBEB', /* ... */ 500: '#F59E0B', /* ... */ 900: '#78350F' },
  success:  { 50: '#F0FDF4', /* ... */ 500: '#10B981', /* ... */ 900: '#064E3B' },
  info:     { 50: '#EFF6FF', /* ... */ 500: '#3B82F6', /* ... */ 900: '#1E3A8A' },
  surface:  { 0: '#FFFFFF', 50: '#F8FAFC', 100: '#F1F5F9', /* ... */ 900: '#0F172A' },
} as const;
```

---

### Requirement: AI Suggestion Type Taxonomy

O sistema SHALL prover taxonomia formal de tipos de sugestão da IA, com cor
e label associados a cada tipo.

#### Scenario: Tipos de sugestão definidos

- **WHEN** a IA gera uma sugestão
- **THEN** essa sugestão pertence a exatamente um dos tipos:

| Type | Label PT-BR | Color Token | Semântica |
|------|-------------|-------------|-----------|
| `new_plan` | Novo plano | `info-500` | Criação de plano completo |
| `plan_adjust` | Ajuste de plano | `warning-500` | Modificação de plano existente |
| `recovery` | Recuperação | `info-300` (lavanda) | Sinal de cuidado/redução |
| `race_simulation` | Simulação de prova | `success-500` | Preparação específica |
| `deload` | Descarga | `surface-500` (cinza) | Semana de descarga |
| `injury_response` | Resposta a lesão | `danger-300` | Reação a sinal de lesão |

#### Scenario: Renderização consistente

- **WHEN** qualquer componente exibe um tipo de sugestão
- **THEN** usa `SuggestionTypeBadge` com a prop `type` correspondente
- **AND** o badge usa o color token da taxonomia

---

### Requirement: Elevation Tokens

O sistema SHALL prover 5 níveis de elevação (shadow tokens) para hierarquia
visual consistente.

#### Scenario: Níveis definidos

```typescript
export const elevation = {
  1: '0 1px 2px rgba(0, 0, 0, 0.05)',          // cards inline
  2: '0 2px 4px rgba(0, 0, 0, 0.06)',          // cards selecionados
  3: '0 4px 8px rgba(0, 0, 0, 0.08)',          // dropdowns
  4: '0 8px 16px rgba(0, 0, 0, 0.10)',         // modals, drawers
  5: '0 16px 32px rgba(0, 0, 0, 0.12)',        // command palette
} as const;
```

---

### Requirement: Density Tokens

O sistema SHALL prover três níveis de densidade espacial para acomodar
contextos diferentes (tabela densa vs lista focada).

#### Scenario: Densidades definidas

| Token | Row height | Padding | Uso |
|-------|------------|---------|-----|
| `density-compact` | 40px | 8px 12px | Tabelas densas (atletas, calendário) |
| `density-comfortable` | 56px | 12px 16px | Listas focadas (inbox) |
| `density-spacious` | 72px | 16px 24px | Cards principais (KPI hero) |
