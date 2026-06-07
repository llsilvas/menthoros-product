# Visual QA Checklist — Coach & Athlete Shell

Use este checklist em cada PR que adicione/modifique UI no shell do
treinador ou do atleta. Marca obrigatória antes de merge.

## Pre-merge: 5 minutos de auditoria

### 1. Disciplina do lime

- [ ] Contei mentalmente os elementos lime (`primary-500`) visíveis na
      tela em viewport 1440×900?
- [ ] Total ≤ 8 elementos?
- [ ] Cada lime usado se enquadra em uma das categorias permitidas?
  - [ ] Ação primária (CTA)
  - [ ] Item ativo de navegação
  - [ ] Delta positivo de KPI
  - [ ] Sparkline tendência positiva
  - [ ] Indicador de confiança alta
  - [ ] Métrica-chave hero
- [ ] Nenhum lime usado para: status dot, decoração, categoria, texto longo?

### 2. Distinção semântica

- [ ] Brand `primary-500` (lime) e `success-500` (emerald) lado a lado
      são claramente diferentes hues?
- [ ] Nenhum `danger-500` (red) é usado para categorizar (workout type,
      sport, etc.)?
- [ ] Todos os usos de red são genuinamente: alerta, risco, erro, rejeição?

### 3. Hierarquia de elevação

- [ ] Consigo distinguir os 4 níveis de surface sem esforço?
  - [ ] `surface-900` (canvas) vs `surface-850` (panel)?
  - [ ] `surface-850` (panel) vs `surface-800` (card)?
  - [ ] `surface-800` (card) vs `#1A2940` (highest)?
- [ ] Cards selecionados/hover têm elevação visual perceptível?

### 4. Tipografia

- [ ] Todos os tamanhos usam tokens da escala (xs/sm/base/lg/xl/2xl/display)?
- [ ] Métricas numéricas usam tabular-nums (`font-variant-numeric`)?
- [ ] Hierarquia visual clara: títulos > body > muted?

### 5. Status dots

- [ ] Nenhum status dot usa lime?
- [ ] Cores semânticas corretas: laranja (pending), red (alert_high),
      amber (alert_medium), emerald (synced), gray (no_sync)?
- [ ] O mesmo atleta em telas diferentes tem o mesmo status dot?

### 6. Acessibilidade

- [ ] Contraste de texto sobre background passa WCAG AA?
- [ ] Texto muted ainda atinge 4.5:1?
- [ ] Validei com simulador de daltonismo (Sim Daltonism / browser DevTools)?
- [ ] Nenhum elemento depende **apenas** de cor para comunicar (sempre
      ícone, label ou padrão acompanha)?

### 7. Densidade

- [ ] Densidade adequada ao contexto:
  - Tabela (Athletes): compact 40-48px
  - Lista focada (Inbox): comfortable 56px
  - Cards hero (KPI): spacious 72px

### 8. Edge cases visualizados

Se for tabela/lista de atletas:
- [ ] Testei com nome longo (40+ chars)?
- [ ] Testei com atleta sem foto (initials fallback)?
- [ ] Testei com `last_activity = null`?
- [ ] Testei com TSS = 0 (exibe "—", não "0")?
- [ ] Testei com TSB extremo (+30, -80)?

Se for tela com KPI:
- [ ] Testei com 0 atletas?
- [ ] Testei com dados < 14 dias (placeholder, não números enganosos)?
- [ ] Testei comparativo desabilitado quando sem histórico?

### 9. Padrões transversais

- [ ] Sidebar do treinador idêntica entre as 4 telas?
- [ ] Bottom nav do atleta idêntica entre as telas?
- [ ] Avatars do mesmo atleta consistentes em todos os contextos?
- [ ] Phase pills (BASE/BUILD/...) com cores e ícones idênticos em
      qualquer lugar?

### 10. Single source of truth temporal

- [ ] Apenas um date range/filter por tela?
- [ ] Componentes filhos herdam do filtro global?
- [ ] Se há janela fixa (ex: CTL 42d), aparece como label informativo
      sem controle interativo?

---

## Validação visual com usuário real (sprint review)

Antes de cada release que afete UI, agendar 15min com Carlos Mendes
(treinador-piloto):

- [ ] Mostro 4 telas do coach shell em sequência
- [ ] Cronometrar: ele identifica os atletas em risco em <5s?
- [ ] Cronometrar: ele encontra a inbox de validações sem dica?
- [ ] Perguntar: "qual cor mais te chama atenção?" (esperado: lime nos CTAs)
- [ ] Perguntar: "consegue ler com conforto por 30min?" (dark fadiga)
- [ ] Coletar feedback estruturado, não livre ("o que está faltando?
      o que está sobrando? o que confunde?")

---

## Visual Regression (automatizado)

Configurar no CI:

- [ ] Chromatic ou Percy capturando snapshots de cada Storybook story
- [ ] Falha de CI bloqueia merge se diff visual > 0.1% sem aprovação
- [ ] Cobertura mínima: todos os componentes canônicos + todas as 4 telas
      do coach + 3 telas do atleta

---

## Anti-padrões a procurar (red flags em review)

- ⛔ Cor hardcoded (`#XXXXXX` em vez de token semântico)
- ⛔ Mais de 8 elementos lime na tela
- ⛔ Lime usado em status dot ou decoração
- ⛔ Vermelho usado para categorizar tipo
- ⛔ Dois date pickers/filtros temporais na mesma tela
- ⛔ Mistura de tamanhos de fonte fora da escala canônica
- ⛔ Avatar do mesmo atleta com tratamento diferente entre telas
- ⛔ "Forma" com cor ad-hoc (sem usar enum fechado)
- ⛔ Texto colorido sem fallback de ícone/peso (acessibilidade)
- ⛔ Status sem documentação na enum canônica
