# Design Decisions — Athlete Shell Refinement

## Context

O mockup inicial do shell do atleta apresentava elementos visuais fortes mas
desalinhados com três princípios estratégicos do Menthoros:

1. **Coach-in-the-loop deve ser visível**: o atleta precisa perceber que há
   um treinador humano supervisionando a IA. Se a interface não materializa
   essa presença, o diferencial competitivo evapora.
2. **Linguagem do atleta, não do cientista esportivo**: TSS, CTL, ATL são
   termos para o motor de IA e o treinador, não para o usuário final.
3. **Insights > dados crus**: a vantagem do Menthoros vs Strava/Garmin é
   interpretar dados, não apenas exibi-los.

## Decisões

### Decision 1: Substituir foto fixa do hero por gradiente dinâmico

**What**: O hero do `/athlete/home` deixa de usar fotografia de atleta e passa
a usar gradiente algorítmico baseado em `workoutType` e `timeOfDay`.

**Why**:
- Foto cria identidade que pode excluir atletas que não se veem representados
  (gênero, idade, biotipo)
- Brasil tem diversidade muito maior que o atleta-modelo padrão de stock photos
- Gradientes contextuais comunicam o tipo do treino visualmente antes mesmo
  do texto ser lido (Z2 longo = warm orange, recovery = cool blue/teal)

**Alternatives considered**:
- Manter foto + permitir upload customizado: rejeitado por exigir feature de
  upload + moderação + storage no MVP
- Ilustração vetorial: rejeitado por exigir investimento alto em ilustrador
  e gerar inconsistência se feito por IA

### Decision 2: Renomear "Preparação" para "Prontidão"

**What**: A métrica "Preparação 92% Alta" passa a ser "Prontidão" com escala
qualitativa clara (Baixa / Moderada / Alta / Ótima).

**Why**: "Preparação Alta" é semanticamente ambíguo — pode ser interpretado
como "estou bem preparado" (positivo) ou "preciso de muita preparação"
(negativo). "Prontidão" é inequivocamente positivo quanto maior.

### Decision 3: Renomear abas de Progresso

**What**: `Resumo / Condicionamento / Performance / Saúde` →
`Visão Geral / Forma / Volume / Provas`

**Why**:
- "Condicionamento" e "Performance" têm sobreposição conceitual no vernáculo
  do atleta amador (ambos significam "estou bem treinado")
- "Saúde" sem dados de HRV/sono integrados fica vazio — adiar até integração
  Garmin completa
- "Forma" mapeia diretamente para o conceito TSB já familiar a corredores
  intermediários, e é tradução natural de "form" da literatura
- "Provas" cria espaço dedicado para o que motiva o atleta: PRs e competições

### Decision 4: PMC Chart com modo dual

**What**: O gráfico de carga oferece toggle "Simples / Avançado":
- Simples: TSS diário (gráfico atual)
- Avançado: três linhas CTL/ATL/TSB com labels traduzidos

**Why**: Atender iniciante (que se confunde com 3 linhas) e avançado (que quer
o PMC clássico) sem forçar decisão excludente no design.

### Decision 5: Tela /athlete/coach como first-class citizen

**What**: Quinto item da bottom nav, dedicado à comunicação com treinador.

**Why**:
- Tornar o coach-in-the-loop tangível
- Capturar feedback estruturado (RPE, sensações) que alimenta o ML de
  aprendizado de padrões do coach
- Integração natural com Whisper API (áudio é input preferido em mobile)

### Decision 6: Componente ZoneDistributionInsight

**What**: Donut de distribuição de zonas acompanhado de interpretação textual
gerada via análise SQL estruturada do histórico do atleta.

**Why**: Conecta com o princípio "SQL estruturado > RAG para training
decisions" (~90-95% accuracy). É exemplo concreto de como dados estruturados
viram insight de produto visível ao usuário.

**Example output**:
- Fase BASE: "80% em Z1-Z2 — distribuição polarizada saudável ✓"
- Fase BUILD: "Excesso de Z4 detectado — risco de overreaching ⚠️"

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Atletas avançados sentirem falta de TSS/CTL puros | Tooltip "Saiba mais" expande termos técnicos; modo avançado no PMC |
| Chat com coach sobrecarregar treinador | Templates de respostas + IA sugere drafts para o coach revisar |
| Gradientes dinâmicos parecerem genéricos | Investir 1 sprint em paleta de gradientes refinada com designer; A/B test contra foto no piloto |
| Acessibilidade comprometida em dark mode | Auditoria axe-core obrigatória + revisão manual em WCAG AA |
