# Design Decisions — Coach Shell Standardization

## Context

Os mockups do shell do treinador apresentaram alta maturidade visual, mas
inconsistências de tratamento entre as próprias telas (sidebar com 3
variações, cores semânticas colidindo, componentes não formalizados).
Esta padronização precede o piloto para evitar refactor pós-lançamento
com treinadores reais usando.

## Decisões

### Decision 1: Sidebar híbrida (fill suave + borda esquerda)

**What**: Item ativo da `CoachSidebar` usa background `primary-50` (fill
suave) + borda esquerda 3px `primary-500`.

**Why**:
- O treinador alterna entre dois modos: trabalho profundo na inbox (modo
  Linear/Notion, navegação infrequente) E troca rápida entre atletas/calendário
  durante validação (modo Pipedrive/Asana, navegação frequente)
- **Só borda** (Linear): bom para modo profundo, mas sinalização muito sutil
  durante troca rápida
- **Só fill** (Asana): bom para troca rápida, mas visualmente "pesado" e
  competitivo com conteúdo em sessões longas
- **Híbrido**: borda é âncora forte mesmo em scan periférico; fill suave
  reforça sem dominar

**Alternatives considered**: Linear puro (rejeitado por baixa sinalização);
Asana puro (rejeitado por peso visual); Material Design (rail) — rejeitado
por estética datada.

### Decision 2: Separar `primary` de `danger` em matizes diferentes

**What**: `primary-500` (#FF6B35, laranja vibrante) e `danger-500` (#DC2626,
vermelho puro) usam matizes claramente distintas, não apenas saturações.

**Why**:
- No mockup atual, "Risco de overtraining" (laranja-coral) e botão "Aprovar"
  (laranja) são quase a mesma cor
- Em contextos de validação clínica de treino, **confusão entre ação e
  alerta é inaceitável** — treinador poderia "aprovar" pensando estar
  reconhecendo um alerta
- Separação de matiz garante distinção até para usuários com daltonismo
  (validar com simulador Sim Daltonism)

### Decision 3: Taxonomia formal de tipos de sugestão da IA

**What**: 6 tipos com cores fixas: `new_plan`, `plan_adjust`, `recovery`,
`race_simulation`, `deload`, `injury_response`.

**Why**:
- Cores ad-hoc no mockup atual criam ambiguidade (atleta vê roxo, treinador
  vê azul, todos perguntam "o que essa cor significa?")
- Taxonomia formal vira **vocabulário compartilhado** entre IA, backend, UI
  e usuário
- Conecta diretamente com o ML que aprende padrões: cada tipo pode ter
  threshold de aceitação diferente

### Decision 4: AthleteRow com 3 variants em vez de 3 componentes

**What**: Um componente `AthleteRow` com prop `variant: 'table' | 'list' |
'calendar'` em vez de `AthleteTableRow`, `AthleteListCard`, `AthleteCalendarRow`.

**Why**:
- Mesma entidade (atleta) com mesma fonte de dados — duplicar quebraria
  consistência ao adicionar campos
- Permite refactor cirúrgico: adicionar nova métrica = atualizar um arquivo
- Trade-off: componente cresce em complexidade interna, mas API pública
  fica simples

**Alternatives considered**: Compound component pattern
(`<AthleteRow><AthleteRow.Avatar />...`) — rejeitado por complexidade
desnecessária para o número de variants.

### Decision 5: Calendar com filtro inteligente default

**What**: `/coach/calendar` filtra por default "Atletas em foco esta semana"
(top 10), não todos os atletas.

**Why**:
- 24 atletas já apertam visualmente; 100+ tornam a view inútil
- Treinador raramente precisa ver TODOS simultaneamente — precisa focar
  em quem está em fase crítica
- "Em foco" usa heurística clara: tem treino-chave OU sinal de alerta OU
  sugestão pendente
- Toggle "Ver todos" continua disponível com virtualização

**Alternatives considered**:
- Agrupamento por grupo de treino: rejeitado porque assumiria que treinador
  organiza por grupo formal (muitos não organizam)
- Scroll horizontal/vertical: rejeitado porque scroll bidimensional em
  calendário é ergonomicamente ruim

### Decision 6: Drag-to-reschedule vira sugestão na inbox

**What**: Ao arrastar um treino no calendário para outro dia, o ajuste
**não é aplicado diretamente** — entra na fila de validação como qualquer
sugestão da IA.

**Why**:
- Mantém **audit trail completo**: todo ajuste tem origem, raciocínio,
  timestamp e revisão
- O ML que aprende padrões precisa de dados estruturados sobre **toda**
  modificação de plano, não só as da IA
- Padroniza o workflow: tudo passa pela inbox, treinador desenvolve um
  único hábito mental
- Trade-off: 1 clique extra para ajustes manuais simples — mitigado por
  "approve-on-create" toggle para ajustes do próprio treinador (opt-in)

### Decision 7: KPICard com sparkline opcional

**What**: `KPICard` aceita sparkline como prop opcional em vez de variant
separado `KPICardWithSparkline`.

**Why**:
- Reduz superfície de API
- Sparkline é **enriquecimento progressivo**: nem todo KPI tem série
  temporal disponível
- Permite A/B testing fácil ("com sparkline aumenta engajamento?")

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Refactor grande pode atrasar piloto | Implementação incremental: tokens + componentes base primeiro (1 sprint), refactor de telas tela-a-tela (1 sprint cada) |
| Treinador-piloto pode preferir o design antigo de algum elemento | Manter mockups antigos como referência; capturar feedback estruturado nas 2 primeiras semanas |
| Performance da tabela com 500+ atletas | Virtualização obrigatória desde MVP; benchmark de 60fps como gate de release |
| Daltonismo / acessibilidade | Auditoria axe-core no CI; teste manual com Sim Daltonism em todos os componentes |
| Drag-to-reschedule criando ruído na inbox | Opt-in "approve-on-create" para ajustes manuais do próprio treinador |
