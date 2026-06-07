# Coach UI — Spec Delta (Refinement)

## MODIFIED Requirements

### Requirement: CoachAthleteAvatar — Status dot sem lime

**Mudança vs versão anterior**: removida opção lime do status dot para
evitar conflito semântico com brand action.

#### Scenario: Paleta canônica de status dot

| Status | Color Token | Significado |
|--------|-------------|-------------|
| `pending_validation` | `warning-500` (amber/orange) | Tem sugestão da IA aguardando validação |
| `alert_high` | `danger-500` (red) | Alerta crítico (overtraining, lesão reportada) |
| `alert_medium` | `warning-400` (amber claro) | Sinal leve (recuperação baixa, sono ruim) |
| `synced_recent` | `success-500` (emerald) | Sincronizado nas últimas 24h |
| `no_sync` | `surface-400` (gray) | Sem sincronia há > 3 dias |
| `none` | — | Sem dot |

#### Scenario: Lime removido do enum

- **WHEN** desenvolvedor tenta usar `status="pending_validation"` esperando
  cor lime
- **THEN** o componente renderiza com `warning-500` (laranja)
- **AND** TypeScript enum não inclui `'lime'` ou variantes baseadas em lime

#### Scenario: Consistência entre telas

- **WHEN** o mesmo atleta aparece em Inbox, Athletes e Calendar
- **THEN** seu status dot tem cor idêntica em todas as telas
- **AND** isso é validado por teste E2E (snapshot do mesmo athlete-id
  em 3 contextos)

#### Scenario: Component props (refinado)

```typescript
interface CoachAthleteAvatarProps {
  athlete: { id: string; name: string; avatarUrl?: string; };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'pending_validation' | 'alert_high' | 'alert_medium' | 'synced_recent' | 'no_sync' | 'none';
  showInitialsFallback?: boolean; // default true
  onClick?: () => void;
}
```

---

### Requirement: StatusBadge — Forma como enum fechado

**Mudança vs versão anterior**: adiciona 5 variants específicos para a
coluna "Forma" da tabela de Athletes, eliminando ambiguidade entre lime
e emerald.

#### Scenario: Variants de Forma definidos

| Variant | Color | Label PT-BR sugerido |
|---------|-------|---------------------|
| `form_excellent` | `primary-500` (lime) | "Excelente" |
| `form_good`      | `success-500` (emerald) | "Boa" |
| `form_stable`    | `info-500` (blue) | "Estável" |
| `form_low`       | `warning-500` (amber) | "Baixa" |
| `form_critical`  | `danger-500` (red) | "Muito baixa" |

#### Scenario: Mapeamento determinístico a partir do TSB

- **WHEN** componente recebe `tsb: number` e deve renderizar Forma
- **THEN** mapeia para variant via função pura:

```typescript
function formFromTSB(tsb: number): FormVariant {
  if (tsb >= 15)  return 'form_excellent';
  if (tsb >= 5)   return 'form_good';
  if (tsb >= -10) return 'form_stable';
  if (tsb >= -25) return 'form_low';
  return 'form_critical';
}
```

#### Scenario: Sem variants ad-hoc

- **WHEN** desenvolvedor precisa exibir "Forma" em qualquer tela
- **THEN** usa `<StatusBadge variant="form_*" />`
- **AND** não cria texto colorido custom ou pill arbitrário

---

### Requirement: WorkoutBlock — Combined session sem vermelho

**Mudança vs versão anterior**: variant `combined_session` recebe tinta
neutra (cat8 gray), corrigindo conflito semântico com cor de alerta.

#### Scenario: Variants de WorkoutBlock

| Variant | Background tint | Border |
|---------|----------------|--------|
| `easy_run` / `recovery` | `info-500` 10% | `info-500` 30% |
| `tempo` / `threshold` | `cat3` (amber) 10% | `cat3` 30% |
| `intervals` / `vo2max` | `danger-500` 10% | `danger-500` 30% |
| `long_run` | `cat7` (violet) 10% | `cat7` 30% |
| `strength` | `cat8` (gray) 10% | `cat8` 30% |
| `combined_session` | `cat8` (gray) 15% | `cat8` 40% |
| `rest` | nenhum | nenhum (texto muted) |

#### Scenario: Princípio reafirmado

- **WHEN** um tipo de treino não tem mapeamento semântico óbvio
- **THEN** **nunca** usa cor `danger`/`warning`/`success`
- **AND** usa paleta categorical (cat1-cat8)
- **AND** treinador entende: "vermelho = intensidade alta porque a Z4/Z5
  é fisiologicamente intensa"; "treino combinado em cinza = neutro,
  é estrutura, não intensidade"

---

## ADDED Requirements

### Requirement: Smart Filter Pagination Clarity

A paginação do `/coach/calendar` SHALL ser explícita sobre o conjunto
que está paginando quando smart filter está ativo.

#### Scenario: Smart filter ativo

- **WHEN** o filtro "Atletas em foco" está ativo (mostrando 10 de 24)
- **THEN** a paginação no rodapé exibe:
  - "Mostrando 1-10 de 10 atletas em foco"
  - **NÃO** "1-12 de 24" (que confunde)
- **AND** se houver > 10 atletas em foco, paginação navega entre eles

#### Scenario: Smart filter desativado

- **WHEN** "Ver todos" é ativado
- **THEN** paginação reflete o total real: "Mostrando 1-12 de 24 atletas"

---

### Requirement: Insights — Eliminação de controles temporais duplicados

A tela `/coach/insights` SHALL ter um único date range no header. Cards
herdam esse range.

#### Scenario: Card de análise detalhada

- **WHEN** o card "Análise detalhada" exibe dados temporais
- **THEN** **não** possui dropdown próprio "Últimas 4 semanas"
- **AND** o título do card refletir o range global ("Análise detalhada ·
  13 Abr – 12 Mai")

#### Scenario: Exceção — gráficos com janela fixa

- **WHEN** um KPI precisa de janela fixa (ex: VO₂max sempre últimas 8
  semanas para tendência)
- **THEN** exibe label informativo "Últimas 8 semanas" como texto, sem
  controle interativo

---

### Requirement: Monotonia — Calibração visual baseada em literatura

O gauge de Monotonia SHALL ter transições de cor alinhadas com literatura
de fisiologia do esporte.

#### Scenario: Zonas de cor do gauge

| Valor | Cor de fundo | Interpretação |
|-------|--------------|---------------|
| 0.0 – 1.0 | `info-500` (azul) | Baixa monotonia (treino variado) |
| 1.0 – 1.5 | `success-500` (verde) | Faixa ideal |
| 1.5 – 2.0 | `warning-500` (amber) | Atenção |
| 2.0 – 3.0 | `danger-500` (red) | Risco de overtraining |

#### Scenario: Marcador visual

- **WHEN** valor atual é 1.32
- **THEN** marcador posiciona-se sobre zona verde (success)
- **AND** label abaixo do gauge: "Dentro da faixa ideal" em success
- **AND** range textual: "Ideal: 1.0 – 1.5"

---

### Requirement: Carga Aguda × Crônica — Zona segura calibrada

O gráfico de Carga Aguda × Crônica SHALL usar zona segura visualmente
correspondente à literatura (0.8 – 1.3, não 0.5 – 1.5).

#### Scenario: Zona segura

- **WHEN** o gráfico renderiza
- **THEN** a faixa de background success-tinted cobre apenas y entre
  0.8 e 1.3 no eixo
- **AND** valores fora dessa faixa estão sobre background neutro
- **AND** referências numéricas no eixo y são 0.5, 0.8, 1.0, 1.3, 1.5, 2.0

---

### Requirement: Edge Cases Visuais (suíte mandatória)

Todos os componentes de domínio do coach shell SHALL ter stories de
Storybook cobrindo os edge cases abaixo.

#### Scenario: Edge cases do AthleteRow

- Nome longo: "Maria Eduarda Cristina dos Santos Oliveira" — truncate
  com tooltip
- Sem foto: avatar com initials "ME" sobre `surface-700`
- Sem sincronia: `last_activity = null` → exibe "Sem sincronia há X dias"
  em muted, sparkline vazia (placeholder)
- TSS = 0: célula exibe "—" em muted, não "0"
- TSB extremo positivo (+30): cell coloring lime tint, "Excelente" form
- TSB extremo negativo (-80): cell coloring red tint forte, "Muito baixa"
  form + ícone alerta

#### Scenario: Edge cases do CoachSidebar

- Coach sem foto: initials fallback
- Tenant único: tenant switcher exibe nome sem chevron (não há para onde
  trocar)
- Inbox badge > 99: exibe "99+" em vez de número exato
- Coach com role admin: navegação inclui itens extras (Configurações da
  assessoria)

#### Scenario: Edge cases do Insights

- Assessoria com 0 atletas ativos: exibe empty state com CTA "Convide
  o primeiro atleta"
- Assessoria nova (< 14 dias de dados): KPIs exibem "Coletando dados"
  em vez de números enganosos
- Sem comparativo possível: toggle "Comparar com período anterior" fica
  desabilitado com tooltip

#### Scenario: Edge cases do Calendar

- Atleta sem plano: linha mostra "Sem plano ativo" com CTA "Gerar plano"
- Semana toda como Descanso: linha não some, mantém visualização
- Treino com duração 0 ou TSS null: bloco exibe "—" em vez de 0
