# Athlete UI — Spec Delta (Alignment)

## MODIFIED Requirements

### Requirement: Athlete Shell usa paleta canônica unificada

**Mudança vs versão anterior**: o shell do atleta passa a usar exatamente
os mesmos tokens do coach shell, eliminando paleta paralela.

#### Scenario: Tokens compartilhados

- **WHEN** o shell do atleta renderiza qualquer componente
- **THEN** importa tokens de `@/shared/design-tokens` (mesmo namespace
  que o coach shell)
- **AND** não possui sua próprio paleta de cores

#### Scenario: Brand lime presente também no atleta

- **WHEN** o atleta vê CTAs primários ("Iniciar treino", "Marcar como
  concluído")
- **THEN** usam `primary-500` (lime do logo)
- **AND** isso reforça identidade unificada do produto

#### Scenario: Surfaces idênticas

- **WHEN** atleta e treinador comparam telas lado a lado
- **THEN** o navy `surface-900` é idêntico
- **AND** elevações usam mesma escala
- **AND** texto usa mesma hierarquia (`surface-0`, `surface-400`, etc.)

---

### Requirement: TodayHeroCard — Gradientes harmonizam com navy base

**Mudança vs versão anterior**: gradientes contextuais ajustados para
sair do navy base, não do branco/preto neutro.

#### Scenario: Gradientes derivam do navy

- **WHEN** `workoutType` é `easy_run` e `timeOfDay` é `morning`
- **THEN** gradiente vai de `surface-900` (navy) → `info-700` (azul
  profundo) → `success-700` (verde profundo)
- **AND** mantém legibilidade do texto branco sobre o gradiente
- **AND** sente-se como "extensão do tema escuro", não bloco descolado

#### Scenario: Mapping atualizado

| workoutType | Gradient (do navy para...) |
|-------------|---------------------------|
| `easy_run` / `recovery` | `info-700` → `success-700` |
| `tempo` | `cat3-700` (amber profundo) |
| `intervals` | `danger-700` (vermelho profundo) |
| `long_run` | `cat7-700` (violet profundo) |
| `strength` | `cat8-700` (gray profundo) |
| `rest` | `surface-850` (sutil shift do base) |

#### Scenario: Lime aparece apenas em destaque

- **WHEN** o hero card renderiza
- **THEN** lime aparece **apenas** no CTA inferior, não no fundo
- **AND** isso preserva a regra de disciplina do lime

---

### Requirement: AthleteBottomNav usa paleta canônica

**Mudança vs versão anterior**: item ativo da bottom nav segue mesmo
padrão híbrido do coach shell (fill suave + indicador).

#### Scenario: Item ativo da bottom nav

- **WHEN** o atleta está em `/athlete/today`
- **THEN** o item "Hoje" tem:
  - Ícone em `primary-500` (lime)
  - Label em `primary-500` (lime)
  - Indicador superior 2px em `primary-500` (substitui borda esquerda
    da sidebar do treinador — adaptação mobile)
- **AND** outros items em `surface-400` (muted)

---

### Requirement: Componentes do athlete shell respeitam disciplina do lime

#### Scenario: Lime no athlete shell

- **WHEN** uma tela do atleta renderiza
- **THEN** o número de elementos lime visíveis é ≤ 6 (limite mais
  restrito que o coach por densidade menor)
- **AND** usos legítimos:
  - CTA principal do home
  - Item ativo da bottom nav
  - Delta positivo de progresso ("+5 km vs semana passada")
  - Sparkline de tendência positiva
  - Carga semanal próxima da meta (progress bar)
  - Conquista nova / badge desbloqueado

#### Scenario: ReadinessCard sem lime

- **WHEN** prontidão é "Alta" ou "Ótima"
- **THEN** usa `success-500` (emerald), não `primary-500` (lime)
- **AND** isso evita confusão com "ação primária"
