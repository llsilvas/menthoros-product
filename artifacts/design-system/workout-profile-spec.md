# WorkoutProfile — Especificação de componente

**Status:** spec aprovada para virar change OpenSpec
**Substitui:** `src/components/features/planos/WorkoutTimelineChart/` (chart + `toWorkoutBlocks`)
**Consumidores atuais:** `DetalheTreinoDialog.tsx`, `TreinoEditDialog.tsx`
**Stack:** React 19 + TypeScript + MUI (Vite) — `apps/menthoros-front`
**Leitor-alvo:** o treinador, decidindo se aprova, ajusta ou reprova o treino proposto.

---

## 1. Contexto e problema

O `WorkoutTimelineChart` desenha "Timeline do treino" em dois pontos do fluxo do coach: a
revisão do plano (`TreinoEditDialog`) e o detalhe do treino (`DetalheTreinoDialog`). Nos dois
casos a pergunta do treinador é a mesma e é uma pergunta de **forma**: *este treino tem o
formato que eu esperava?* Um progressivo, um intervalado 5×3', um longo plano — a resposta
deveria ser instantânea e visual.

O componente atual não responde. Ele codifica duração na largura e joga **toda** a informação
de intensidade em uma borda esquerda de 3px, enquanto o preenchimento — o maior canal visual
disponível — carrega uma cor de *etapa estrutural* (`trainingStage`), não de *zona*. O
resultado é uma fileira de retângulos cinza-azulados de altura quase igual: o treinador precisa
ler texto para saber o que está olhando, e ler texto derrota o propósito de existir um gráfico.

O `WorkoutProfile` reconstrói o componente sobre o encoding canônico de perfil de treino
(largura = tempo, altura = intensidade, cor = zona), o mesmo que TrainingPeaks, Zwift e
intervals.icu usam — não por convenção estética, mas porque é o único que deixa a forma do
treino legível sem leitura.

### Rastreamento dos defeitos

| # | Defeito | Onde está hoje | Como a spec resolve | Seção |
|---|---------|----------------|---------------------|-------|
| **D1** | Zona só na borda esquerda de 3px; fill é `trainingStage` para todos | `WorkoutTimelineChart.tsx` — `borderLeft: 3px solid ${zone.border}` + `bgcolor: ${zone.border}14`, com `zone` vindo de `blockTypeColors[block.blockType]` | Fill = gradiente da cor de zona; `trainingStage` deixa de pintar o bloco | §3.1, §4.3 |
| **D2** | Altura quase constante | `zoneHeight = { Z1: 65, Z2: 68, Z3: 85, Z4: 120, Z5: 128 }` px fixos, faixa útil de 65→128 | Altura = intensidade normalizada contínua sobre teto fixo | §4.2 |
| **D3** | Overflow vertical na variante grande | Container `height: 70`, barras até `128px` + `scaleY(1.04)` no hover | Altura do plot é a única fonte de verdade; hover não escala geometria | §4.2, §7.2 |
| **D4** | Eixo X só com extremos | Um `Box` com `0` e `formatDuration(total)` | Ticks derivados de um passo "bonito" | §4.6 |
| **D5** | Blocos curtos colapsam; repetições soltas | `widthPct` puro, sem piso; `blocoId`/`blocoRepeticoes` ignorados | Piso de 3px + bracket de repetição | §4.4, §4.5 |
| **D6** | Badge e legenda divergem | `dominantZone` (reduce sobre `b.zone`) vs `presentZones` (Set sobre `b.zoneKey`) vs fill (`blockTypeColors`) — três fontes | Seletor puro único; badge e distribuição são campos do mesmo retorno | §2.4 |
| **D7** | Label truncado sem regra | `textOverflow: 'ellipsis'` + `showLabel = widthPct > 5` | Cadeia de fallback declarada; reticências proibidas | §4.7 |
| **D8** | Quatro eyebrows caixa-alta e três cards aninhados | `DetalheTreinoDialog.tsx:520` "Timeline do treino" + prop `title` "Etapas por duração e zona" + "Leitura rápida" + "Resumo estrutural" | Uma superfície de card, um header, métricas viram chips | §4.8 |
| **D9** | Paleta não-monotônica | `theme.premium.ts` → `zone` = cinza, verde, **azul**, âmbar, vermelho | Rampa nova `workoutZone`, fria→quente | §3.1 |
| **D10** | Texto genérico "Leitura rápida" | `DetalheTreinoDialog.tsx:549` | Removido; espaço vai para métricas do header | §4.8 |

### Divergências entre o briefing e o código, e como as resolvo

1. **A rampa pedida não existe no repo.** O token `zone` do design system é
   `Z1 #C8CDD4 · Z2 #34D399 · Z3 #3B82F6 · Z4 #F59E0B · Z5 #EF4444` — azul no meio, cinza na
   base. É literalmente o D9. Introduzo um grupo novo `workoutZone` em vez de mutar `zone`,
   porque `zone` é consumido fora deste componente e uma troca silenciosa quebraria a leitura
   de outros gráficos sem aviso. A migração de `zone` → `workoutZone` fica fora de escopo (§11).
2. **Não existe `%FTP` nem potência no contrato.** `EtapaTreinoDto` expõe `fcAlvoEtapa` e
   `ritmoAlvo` como **texto livre** ("70-80% FCmáx", "5:00-5:30/km") e nada mais. O
   `toWorkoutBlocks` atual infere zona com `includes('limiar')`, `includes('vo2')` etc. — string
   matching sobre prosa gerada por LLM. Isso é a origem do D6 e não tem conserto no front.
   Marco como **DEP-1** (§2.5) e especifico o comportamento degradado até ela chegar.
3. **Tipografia.** `Space Grotesk` e `JetBrains Mono` estão carregadas no `index.html`, mas o
   tema MUI declara `"Syne", "Inter"` e os componentes escrevem `fontFamily: 'monospace'` cru —
   o que renderiza a mono do sistema, não JetBrains. Tokenizo em `§3.4`.

---

## 2. Contrato de dados

### 2.1 Princípio

O componente **não recebe `EtapaTreino[]`**. Recebe um `WorkoutProfile` já resolvido — um
objeto onde toda ambiguidade (zona, intensidade normalizada, agrupamento, distribuição) já foi
decidida por um seletor puro. O componente vira uma função de renderização sem regra de negócio.

Motivo: enquanto o cálculo mora dentro do componente, cada superfície que desenha o treino
recalcula à sua maneira — que é exatamente como badge e legenda divergiram (D6).

### 2.2 Tipos de entrada

```ts
// src/features/workout/profile/types.ts

/** Esporte determina o denominador de intensidade e o vocabulário de alvo. */
export type Sport = 'run' | 'bike' | 'swim';

/** Papel estrutural do bloco. Ortogonal à zona: um aquecimento pode terminar em Z3. */
export type BlockKind =
  | 'warmup'
  | 'work'
  | 'recovery'   // recuperação ativa DENTRO de uma série
  | 'rest'       // pausa entre séries / parado
  | 'steady'     // bloco contínuo do corpo principal
  | 'cooldown';

export type ZoneKey = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

/**
 * Alvo prescrito. União discriminada — cada esporte prescreve na sua moeda, e o
 * componente nunca precisa adivinhar qual é qual a partir de string.
 */
export type BlockTarget =
  | { kind: 'ftpPct';  from: number; to?: number }            // % do FTP (bike)
  | { kind: 'powerW';  from: number; to?: number }            // watts absolutos (bike)
  | { kind: 'hrPct';   from: number; to?: number; basis: 'max' | 'reserve' | 'threshold' }
  | { kind: 'pace';    fromSecPerKm: number; toSecPerKm?: number }   // corrida
  | { kind: 'pace100'; fromSecPer100m: number; toSecPer100m?: number } // natação
  | { kind: 'rpe';     value: number }                        // 1–10
  | { kind: 'none' };                                         // sem prescrição

/** Confiança na zona. Governa se o bloco pode ser desenhado com altura real. */
export type IntensityConfidence =
  | 'prescribed'  // veio de alvo numérico + limiar do atleta
  | 'derived'     // inferido de tipoEtapa/texto — heurística
  | 'unknown';    // sem base; renderiza em altura neutra e hachurada

export interface RampSpec {
  /** Intensidade normalizada no início e no fim do bloco (0..1). */
  fromNormalized: number;
  toNormalized: number;
}

export interface RepeatSpec {
  /** Identificador do grupo (mapeia `blocoId` do backend). */
  groupId: string;
  /** 1-based: esta é a repetição `index` de `total`. */
  index: number;
  total: number;
}

export interface ProfileBlock {
  id: string;
  /** Posição no eixo X, 0-based, densa e sem buracos. */
  order: number;
  kind: BlockKind;

  /** Segundos, não minutos — blocos de 30s são de primeira classe (D5). */
  durationSec: number;

  /** Nome completo, como o treinador escreveria. Ex.: "Aquecimento progressivo". */
  label: string;
  /** Abreviação de EXATAMENTE ≤5 caracteres, declarada, nunca derivada por corte (D7). */
  shortLabel?: string;

  target: BlockTarget;

  /** Altura. 0..1 relativo ao teto da escala (§4.2). */
  intensityNormalized: number;
  zone: ZoneKey;
  confidence: IntensityConfidence;

  /** Presente só em aquecimento/desaquecimento e rampas explícitas. */
  ramp?: RampSpec;
  /** Presente quando o bloco pertence a uma série repetida. */
  repeat?: RepeatSpec;

  /** Texto auxiliar do tooltip. Nunca renderizado dentro do bloco. */
  note?: string;
}

export interface ZoneShare {
  zone: ZoneKey;
  seconds: number;
  /** 0..1. A soma de `share` sobre todas as zonas é 1 ± 0.005. */
  share: number;
}

export interface ProfileMetrics {
  totalDurationSec: number;
  blockCount: number;
  /** Zona-alvo: maior zona com ≥15% do tempo total (§2.4). */
  targetZone: ZoneKey | null;
  targetZoneSeconds: number;
  /** Distribuição completa, inclui aquecimento e desaquecimento. Soma 100%. */
  distribution: ZoneShare[];
  /** Maior bloco contínuo em Z3+ — proxy de "quanto de trabalho real tem aqui". */
  longestWorkBlockSec: number;
  /**
   * Razão trabalho:recuperação. Calculada DENTRO das séries (`repeat`) quando
   * existe pelo menos uma; caso contrário, global (Z3+ : Z1–Z2). `null` sem recuperação.
   * Dentro da série é como o treinador enuncia o treino — "3 por 2" —, e é a leitura
   * que muda a decisão; a razão global de um longo com sprint final não diz nada.
   */
  workToRecoveryRatio: number | null;
  /**
   * Vêm do backend, não são derivados. `null` quando ausentes — e `intensityFactor` É `null`
   * na tela de revisão hoje: `TreinoPlanejadoDto` (`src/types/PlanoReview.ts`) tem
   * `tssPlanejado` e **não** tem `intensidadePlanejada`. Só o detalhe do treino
   * (`src/types/TreinoPlanejado.ts`) expõe o campo. Ver DEP-5 (§2.5).
   */
  intensityFactor: number | null;   // detalhe: TreinoPlanejado.intensidadePlanejada · revisão: sempre null (DEP-5)
  tss: number | null;               // tssPlanejado — presente nos dois
}

export interface IntensityScale {
  /** Métrica do eixo Y. */
  metric: 'ftpPct' | 'hrPct' | 'pacePct' | 'rpe';
  /**
   * Teto da escala, na unidade da métrica. Fixo por métrica (§4.2) — é o que
   * torna dois treinos diferentes comparáveis lado a lado.
   */
  ceiling: number;
  /** Limiares normalizados (0..1) que separam Z1|Z2, Z2|Z3, Z3|Z4, Z4|Z5. */
  zoneBreaks: [number, number, number, number];
}

export interface WorkoutProfile {
  sport: Sport;
  scale: IntensityScale;
  blocks: ProfileBlock[];
  metrics: ProfileMetrics;
  /** Sinaliza que a spec foi montada sem prescrição confiável (§6.4). */
  degraded: boolean;
}
```

### 2.3 Como cada dimensão do briefing é representada

| Dimensão | Representação | Por quê |
|---|---|---|
| **Rampa** | `ramp?: RampSpec` com dois valores normalizados | Rampa é geometria, não um `kind` novo: um aquecimento pode ser rampa ou patamar, e um bloco `work` progressivo também é rampa. Separar impede um enum combinatório. |
| **Repetição** | `repeat?: RepeatSpec` em **cada** bloco da série | Preserva o eixo X linear (decisão 2). Colapsar N repetições em um retângulo mentiria sobre o tempo — e o tempo é o que o treinador está lendo. O bracket agrupa visualmente sem comprimir o eixo. |
| **Alvo** | União discriminada `BlockTarget` | O tooltip precisa formatar "88–94% FTP", "4:35/km" e "RPE 7" de formas diferentes; um `string` obrigaria o componente a fazer parsing — o mesmo erro do `toWorkoutBlocks` atual. |
| **Esporte** | `sport` no topo + `scale.metric` | O esporte não muda o desenho, muda o **denominador** do eixo Y e o vocabulário do tooltip. Um só componente, uma escala parametrizada. |

Mapa esporte → escala:

| Esporte | `metric` | `ceiling` | Denominador |
|---|---|---|---|
| `bike` | `ftpPct` | `150` | FTP do atleta |
| `run` | `pacePct` | `150` | velocidade no limiar (vLT) — pace convertido para velocidade antes de normalizar, senão a escala inverte |
| `swim` | `pacePct` | `150` | CSS (critical swim speed) |
| qualquer, sem limiar | `hrPct` | `110` | FCmáx |
| último recurso | `rpe` | `10` | percepção |

### 2.4 Onde vive o cálculo — decisão

**Seletor puro no frontend**, em `src/features/workout/profile/selectWorkoutProfile.ts`:

```ts
export function selectWorkoutProfile(
  etapas: ProfileEtapaInput[],
  context: { sport: Sport; thresholds?: AthleteThresholds; tss?: number | null; if?: number | null },
): WorkoutProfile;
```

**Emenda 2026-08-18 — a entrada é normalizada, não `EtapaTreinoDto`.** A versão original desta
assinatura recebia `EtapaTreinoDto[]`, e isso era um erro de fato: **duas** formas de etapa
alimentam o gráfico no código real, e `EtapaTreinoDto` é só uma delas.

| Consumidor | Tipo | `tipoEtapa` | `blocoId`/`blocoRepeticoes` |
|---|---|---|---|
| `DetalheTreinoDialog` | `EtapaTreino` (`src/types/TreinoPlanejado.ts:38-49`) | `string` **ou objeto** | **ausentes** |
| `TreinoEditDialog` | `EtapaTreinoDto` (`src/types/PlanoReview.ts:31-40`) | `string` | presentes |

Aceitar as duas dentro do seletor empurraria o `typeof tipoEtapa === 'object'` para dentro dele —
exatamente o parsing defensivo do `toWorkoutBlocks` que esta spec existe para eliminar. Então o
seletor tem **uma** entrada, e a divergência entre as fontes fica visível na borda:

```ts
// src/features/workout/profile/input.ts
export interface ProfileEtapaInput {
  id?: string;
  ordem?: number;
  tipo: string;              // já resolvido para string pelo adaptador
  descricao?: string;
  duracaoMin?: number;
  fcAlvo?: string;
  ritmoAlvo?: string;
  intensidade?: string;
  repeticoes?: number;
  blocoId?: string;          // ausente no detalhe do treino — ausente, nunca inventado
  blocoRepeticoes?: number;
  observacao?: string;
}

export function fromEtapaTreino(e: EtapaTreino): ProfileEtapaInput;       // detalhe do treino
export function fromEtapaTreinoDto(e: EtapaTreinoDto): ProfileEtapaInput;  // treino salvo na revisão
export function fromEtapaItens(itens: EtapaItem[]): ProfileEtapaInput[];   // editor ao vivo
```

**Terceiro adaptador, acrescentado 2026-08-18.** Desde `bdba29b` o gráfico do editor deriva do
estado ao vivo `itens: EtapaItem[]` (`TreinoEditDialog.tsx:380-442`), não de `EtapaTreinoDto[]` —
para atualizar a cada tecla. Adaptar do DTO ali desenharia o treino **salvo**, não o que o treinador
está montando. `fromEtapaItens` recebe a **lista** porque a expansão de um bloco em `reps × steps`
só existe nesse nível; o índice do bloco vira `repeat.groupId`, o `r` do laço vira `repeat.index` e
`item.repeticoes` vira `repeat.total`.

**Regra:** sem `blocoId`, o perfil não tem `repeat` — e portanto não tem bracket (§4.5). Não
inferir grupo por igualdade de rótulo: seria adivinhação apresentada como estrutura, que é a
classe de bug que esta spec existe para matar.

Unificar `EtapaTreino` e `EtapaTreinoDto` num tipo só é o conserto de raiz, e é refactor de
domínio com alcance muito maior que o gráfico — change própria (§11).

Três alternativas foram consideradas:

| Opção | Veredito |
|---|---|
| Backend calcula e envia `WorkoutProfile` pronto | **Rejeitada por ora.** O backend hoje tem um campo `zonaAlvo` (String) em `TreinoPlanejadoOutputDto` preenchido pela IA junto com o texto do treino — **não derivado das etapas**. Adotá-lo como fonte da badge é criar a segunda fonte de verdade, que é o D6 com outro rótulo. |
| Cálculo dentro do componente | **Rejeitada.** É o desenho atual. Duas superfícies renderizam o mesmo treino e nada garante que cheguem ao mesmo número. |
| **Seletor puro, único, exportado do módulo** | **Escolhida.** Badge, distribuição, altura e cor saem todos de um único `WorkoutProfile`, no mesmo retorno da mesma chamada — não há como divergirem sem que um teste unitário do seletor quebre. |

Regras do seletor:

- **Zona-alvo:** entre as zonas com `share ≥ 0.15`, a de maior índice. Se nenhuma atinge 15%,
  `targetZone = null` e o header mostra "sem alvo dominante" em vez de inventar uma.
  O corte de 15% descarta o pico incidental (um sprint de 30s num longo de 2h não faz o treino
  ser Z5) sem exigir maioria — um 6×3' Z4 dentro de 60min dá 30% e é, corretamente, o alvo.
- **Distribuição:** `seconds` por zona sobre **todos** os blocos, aquecimento e desaquecimento
  inclusos. Blocos com rampa contribuem para a zona em que ficam a maior parte do tempo (o
  ponto médio da rampa) — não subdivididos, porque a granularidade do dado de origem é o bloco.
- **Invariante testável:** `Σ distribution[].share === 1 ± 0.005` e
  `targetZone === null || distribution.find(d => d.zone === targetZone).share >= 0.15`.

`selectWorkoutProfile` é puro, sem React, e memoizado no consumidor via `useMemo` sobre a
referência de `etapas`.

### 2.5 Dependências de backend

| ID | Campo necessário | Onde | Impacto se ausente |
|---|---|---|---|
| **DEP-1** | `intensidadeAlvo` estruturado em `EtapaTreinoDto` — `{ tipo: FTP_PCT \| HR_PCT \| PACE \| POWER_W \| RPE, min, max }` | `EtapaTreinoDto`, entidade `EtapaTreino`, migration | **Alto.** Sem ele a zona é inferida por `includes()` sobre texto de LLM. Todo bloco cai em `confidence: 'derived'` e o modo degradado (§6.4) fica sendo o caminho normal, não a exceção. |
| **DEP-2** | Limiares do atleta — `ftpWatts`, `paceLimiarSecPerKm`, `cssSecPer100m`, `fcMax` | Perfil do atleta | **Alto.** Sem limiar não há como converter alvo absoluto (watts, pace) em % — a altura vira `confidence: 'unknown'`. |
| **DEP-3** | `esporte` por treino | `TreinoPlanejadoOutputDto` (hoje não existe; há `tipoTreino` no tipo do front, ausente no DTO de saída) | **Médio.** Sem ele, `sport` é passado pelo consumidor como prop; a spec assume `'run'` como default do produto. |
| **DEP-4** | Comparativo com a última execução — duração e IF realizados do mesmo treino/tipo | `TreinoRealizadoOutputDto` + endpoint de comparação | **Baixo.** Métrica de header **cortada do escopo v1** por não ter fonte. Ver §11. |
| **DEP-5** | `intensidadePlanejada` no DTO da **revisão** | `TreinoPlanejadoDto` do painel de revisão (`src/types/PlanoReview.ts:44-59`) e o DTO de saída correspondente no backend | **Médio.** O campo existe em `src/types/TreinoPlanejado.ts` (detalhe do treino) e **não** existe na revisão. Sem ele, o chip **IF do header nunca renderiza na tela de revisão** — que é a tela onde o treinador decide. Comportamento até lá: §4.8, chip omitido. |

`blocoId` e `blocoRepeticoes` **já existem** em `EtapaTreinoDto` — o agrupamento de repetições
(D5, decisão 7) é implementável hoje, sem dependência. Cuidado com o nome: são os do
`EtapaTreinoDto` de `src/types/PlanoReview.ts` (revisão). O `EtapaTreino` de
`src/types/TreinoPlanejado.ts` (detalhe do treino) **não os tem** — ali não há bracket de
repetição, e a ausência é declarada, não contornada por inferência.

### 2.6 Exemplo — 40min, 12 blocos (corrida, 5×3' no limiar)

> **Este exemplo é o caminho feliz, e o caminho feliz não é o de hoje.** Ele mostra
> `degraded: false`, `confidence: 'prescribed'` em todo bloco e `intensityFactor: 0.88` — os três
> dependem de DEP-1, DEP-2 e DEP-5 (§2.5), e **nenhum dos três existe**. Na tela de revisão atual o
> perfil sai com `degraded: true`, blocos em `'derived'`/`'unknown'` e `intensityFactor: null`.
> O exemplo está aqui como alvo do contrato, não como retrato da v1 — ver §6.4 para o que renderiza
> de fato.

```json
{
  "sport": "run",
  "degraded": false,
  "scale": {
    "metric": "pacePct",
    "ceiling": 150,
    "zoneBreaks": [0.40, 0.55, 0.65, 0.73]
  },
  "metrics": {
    "totalDurationSec": 2400,
    "blockCount": 12,
    "targetZone": "Z4",
    "targetZoneSeconds": 900,
    "distribution": [
      { "zone": "Z1", "seconds": 600,  "share": 0.250 },
      { "zone": "Z2", "seconds": 900,  "share": 0.375 },
      { "zone": "Z4", "seconds": 900,  "share": 0.375 }
    ],
    "longestWorkBlockSec": 180,
    "workToRecoveryRatio": 1.5,
    "intensityFactor": 0.88,
    "tss": 62
  },
  "blocks": [
    { "id": "b0",  "order": 0,  "kind": "warmup",   "durationSec": 600, "label": "Aquecimento progressivo", "shortLabel": "AQUEC",
      "target": { "kind": "pace", "fromSecPerKm": 390, "toSecPerKm": 320 },
      "intensityNormalized": 0.42, "zone": "Z2", "confidence": "prescribed",
      "ramp": { "fromNormalized": 0.28, "toNormalized": 0.56 } },

    { "id": "b1",  "order": 1,  "kind": "work",     "durationSec": 180, "label": "Limiar", "shortLabel": "LIM",
      "target": { "kind": "pace", "fromSecPerKm": 258, "toSecPerKm": 264 },
      "intensityNormalized": 0.78, "zone": "Z4", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 1, "total": 5 } },
    { "id": "b2",  "order": 2,  "kind": "recovery", "durationSec": 120, "label": "Trote de recuperação", "shortLabel": "REC",
      "target": { "kind": "pace", "fromSecPerKm": 400 },
      "intensityNormalized": 0.26, "zone": "Z1", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 1, "total": 5 } },

    { "id": "b3",  "order": 3,  "kind": "work",     "durationSec": 180, "label": "Limiar", "shortLabel": "LIM",
      "target": { "kind": "pace", "fromSecPerKm": 258, "toSecPerKm": 264 },
      "intensityNormalized": 0.78, "zone": "Z4", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 2, "total": 5 } },
    { "id": "b4",  "order": 4,  "kind": "recovery", "durationSec": 120, "label": "Trote de recuperação", "shortLabel": "REC",
      "target": { "kind": "pace", "fromSecPerKm": 400 },
      "intensityNormalized": 0.26, "zone": "Z1", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 2, "total": 5 } },

    { "id": "b5",  "order": 5,  "kind": "work",     "durationSec": 180, "label": "Limiar", "shortLabel": "LIM",
      "target": { "kind": "pace", "fromSecPerKm": 258, "toSecPerKm": 264 },
      "intensityNormalized": 0.78, "zone": "Z4", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 3, "total": 5 } },
    { "id": "b6",  "order": 6,  "kind": "recovery", "durationSec": 120, "label": "Trote de recuperação", "shortLabel": "REC",
      "target": { "kind": "pace", "fromSecPerKm": 400 },
      "intensityNormalized": 0.26, "zone": "Z1", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 3, "total": 5 } },

    { "id": "b7",  "order": 7,  "kind": "work",     "durationSec": 180, "label": "Limiar", "shortLabel": "LIM",
      "target": { "kind": "pace", "fromSecPerKm": 258, "toSecPerKm": 264 },
      "intensityNormalized": 0.78, "zone": "Z4", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 4, "total": 5 } },
    { "id": "b8",  "order": 8,  "kind": "recovery", "durationSec": 120, "label": "Trote de recuperação", "shortLabel": "REC",
      "target": { "kind": "pace", "fromSecPerKm": 400 },
      "intensityNormalized": 0.26, "zone": "Z1", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 4, "total": 5 } },

    { "id": "b9",  "order": 9,  "kind": "work",     "durationSec": 180, "label": "Limiar", "shortLabel": "LIM",
      "target": { "kind": "pace", "fromSecPerKm": 258, "toSecPerKm": 264 },
      "intensityNormalized": 0.78, "zone": "Z4", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 5, "total": 5 } },
    { "id": "b10", "order": 10, "kind": "recovery", "durationSec": 120, "label": "Trote de recuperação", "shortLabel": "REC",
      "target": { "kind": "pace", "fromSecPerKm": 400 },
      "intensityNormalized": 0.26, "zone": "Z1", "confidence": "prescribed",
      "repeat": { "groupId": "g1", "index": 5, "total": 5 } },

    { "id": "b11", "order": 11, "kind": "cooldown", "durationSec": 300, "label": "Desaquecimento", "shortLabel": "DESAQ",
      "target": { "kind": "pace", "fromSecPerKm": 400, "toSecPerKm": 450 },
      "intensityNormalized": 0.30, "zone": "Z2", "confidence": "prescribed",
      "ramp": { "fromNormalized": 0.40, "toNormalized": 0.20 } }
  ]
}
```

Notas de leitura do exemplo: `b0` é rampa 0.28→0.56 mas `zone: "Z2"` e
`intensityNormalized: 0.42` — a zona e a altura nominal vêm do **ponto médio** da rampa, e o
`ramp` só governa a geometria. A distribuição fecha: Z1 = 5×120 = 600s (25%);
Z2 = 600s do aquecimento + 300s do desaquecimento = 900s (37,5%); Z4 = 5×180 = 900s (37,5%).
Z4 é a maior zona acima de 15% → `targetZone: "Z4"`, e `workToRecoveryRatio` = 180/120 = 1.5,
exibida como `trabalho 3:2`.

---

## 3. Tokens de design

Padrão do repo: grupos `as const` em `src/theme/theme.premium.ts`, consumidos **exclusivamente**
via `activeTheme` (nunca hex cru no componente, nunca import direto do grupo). Sigo isso.

### 3.1 Rampa de zonas — `workoutZone`

Grupo **novo**. Não muta `zone`, que é consumido por outros gráficos (§1, divergência 1).

```ts
// theme.premium.ts
export const workoutZone = {
  Z1: '#38BDF8', // sky   — frio, base aeróbica / recuperação
  Z2: '#34D399', // green — mantém o hex já usado em `zone.Z2`
  Z3: '#FACC15', // yellow
  Z4: '#F97316', // orange
  Z5: '#EF4444', // red   — mantém o hex já usado em `zone.Z5`
} as const;

export const workoutZoneLabel = {
  Z1: 'Recuperação', Z2: 'Base', Z3: 'Tempo', Z4: 'Limiar', Z5: 'VO₂ Máx',
} as const;
```

Monotônica em temperatura de cor e em luminância percebida decrescente a partir de Z3 — a
leitura "mais alto e mais quente = mais forte" fica redundante com a altura, que é o que
garante o D9 e o requisito de "cor nunca como único canal" (§7.3).

Contraste do hex sólido contra o fundo do plot (`elevation.panel` `#0E1B30`):
Z1 8.2:1 · Z2 9.0:1 · Z3 10.1:1 · Z4 6.0:1 · Z5 4.5:1 — todos ≥ 3:1. ✔

### 3.2 Gradiente e geometria de bloco

```ts
export const workoutProfileFill = {
  /** Gradiente vertical do topo (100%) à base (55%) — decisão 5. */
  gradientTopAlpha:    1.00,
  gradientBottomAlpha: 0.55,
  /** Banda sólida no topo — é ELA que carrega o contraste de 3:1 (§7.3). */
  capHeightPx:  2,
  capAlpha:     1.00,
  /** Contorno de 1px a 100% — segundo portador de contraste. */
  outlineAlpha: 1.00,
  outlineWidthPx: 1,
  /** Rampas (aquecimento/desaquecimento) — mesma cor da zona, 70% de opacidade. */
  rampAlpha: 0.70,
  /** Bloco não-focado quando há um bloco ativo. */
  inactiveAlpha: 0.55,
  /** Sem prescrição confiável — hachura diagonal sobre neutro. */
  unknownFill: 'surface.600',
  unknownHatch: 'repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,.10) 3px 6px)',
  radiusTopPx: 2,
  radiusBottomPx: 0,
  separatorWidthPx: 1,
  separatorColor: 'elevation.panel', // separador é o próprio fundo — não é um gap
} as const;
```

### 3.3 Grade, eixos e plot

```ts
export const workoutProfileChrome = {
  plotBg:            'elevation.panel',   // #0E1B30
  gridlineColor:     'overlayWhite.8',    // 8% — decisão 6
  gridlineWidthPx:   1,
  baselineColor:     'overlayWhite.15',
  baselineWidthPx:   1,
  axisTickColor:     'overlayWhite.12',
  axisLabelColor:    'surface.500',
  zoneLabelColor:    'surface.500',
  bracketColor:      'overlayWhite.25',
  bracketWidthPx:    1,
  bracketTickPx:     4,                   // "pernas" verticais do bracket
  tooltipBg:         'elevation.highest', // #1A2940
  tooltipBorder:     'overlayWhite.15',
  focusRingColor:    'primary.500',       // #BDDE5A
  focusRingWidthPx:  2,
  focusRingOffsetPx: 2,
} as const;
```

### 3.4 Tipografia

`Space Grotesk` e `JetBrains Mono` já estão carregadas no `index.html` mas não são tokens — os
componentes escrevem `fontFamily: 'monospace'`, que resolve para a mono do sistema. Tokenizo:

```ts
export const font = {
  display: '"Space Grotesk", "Syne", "Inter", sans-serif',
  text:    '"Inter", system-ui, sans-serif',
  mono:    '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
} as const;

export const workoutProfileType = {
  headerTitle:  { family: 'display', size: '0.875rem', weight: 600, tracking: '0',        transform: 'none' },
  headerChip:   { family: 'mono',    size: '0.6875rem', weight: 500, tracking: '0.02em',  transform: 'none' },
  badge:        { family: 'mono',    size: '0.6875rem', weight: 700, tracking: '0.06em',  transform: 'uppercase' },
  blockLabel:   { family: 'text',    size: '0.625rem',  weight: 600, tracking: '0.01em',  transform: 'none' },
  axisTick:     { family: 'mono',    size: '0.625rem',  weight: 400, tracking: '0.02em',  transform: 'none' },
  zoneAxis:     { family: 'mono',    size: '0.5625rem', weight: 500, tracking: '0.04em',  transform: 'none' },
  bracketLabel: { family: 'mono',    size: '0.625rem',  weight: 700, tracking: '0.02em',  transform: 'none' },
  tooltipTitle: { family: 'text',    size: '0.8125rem', weight: 600, tracking: '0',       transform: 'none' },
  tooltipBody:  { family: 'text',    size: '0.75rem',   weight: 400, tracking: '0',       transform: 'none' },
  tooltipData:  { family: 'mono',    size: '0.75rem',   weight: 500, tracking: '0',       transform: 'none' },
} as const;
```

Regra: **todo número é mono, todo rótulo é texto.** Números em mono alinham verticalmente entre
blocos e entre chips, o que deixa o treinador comparar durações sem reler — é a razão funcional,
não a estética.

Só **um** elemento caixa-alta na superfície inteira: a badge de zona-alvo (D8).

### 3.5 Espaçamento e raio

```ts
export const workoutProfileSpace = {
  cardPadding:      { full: 16, compact: 12, sparkline: 0 },
  headerGap:        12,
  chipGap:          8,
  plotToXAxis:      6,
  yAxisWidth:       { full: 22, compact: 0, sparkline: 0 },
  bracketToPlot:    6,
  bracketLane:      { full: 16, compact: 12, sparkline: 0 },
  plotHeight:       { full: 176, compact: 92, sparkline: 36 },  // dentro das faixas da decisão 9
  cardRadius:       8,   // = radius.md do repo
} as const;
```

---

## 4. Regras de renderização

### 4.1 Escala X

- Escala **linear única** sobre `Σ durationSec`. Sem quebras, sem escala por bloco.
- `xOf(t) = (t / totalDurationSec) * plotWidth`.
- Blocos são contíguos: `x_{i+1} = x_i + w_i`. **Não existe gap.** A separação visual é um
  traço de 1px em `elevation.panel` desenhado **sobre** a borda direita do bloco, ou seja,
  come 1px do bloco em vez de deslocar o próximo (decisão 2).
- **Piso de largura:** `w_i = max(3px, xOf(dur_i))`. O excedente introduzido pelos pisos é
  descontado proporcionalmente dos blocos que estão acima do piso, preservando `Σw = plotWidth`.
  Isso distorce o eixo — assumido e limitado: se o total de correção exceder **8%** da largura,
  o componente entra em `overflowCompressed` e o eixo X ganha o marcador `≈` junto ao último
  tick, sinalizando que a escala não é exata ali (§6.6). Silenciar a distorção seria pior que
  mostrá-la.

### 4.2 Escala Y

- Normalizada por **teto fixo por métrica** (`scale.ceiling`), não pelo pico do treino
  — é o que permite pôr dois treinos lado a lado e ler a diferença (decisão 3).
  Para `ftpPct` e `pacePct` o teto é **150%**; acima disso a barra satura no topo e ganha um
  chanfro de 3px no canto superior, indicando corte.
- `h_i = plotHeight * clamp(intensityNormalized, 0.12, 1.0)`.
  O piso de 12% garante que um bloco Z1 continue sendo um bloco e não uma linha.
- **Baseline reta** em `y = plotHeight`. Todos os blocos partem dela. `borderRadius: 2px 2px 0 0`
  (decisão 3) — o raio só nos cantos superiores mantém a base contínua, que é o que faz o perfil
  ler como um único traçado em vez de N pastilhas.
- **O hover não altera geometria** (corrige o D3): sem `scaleY`, sem `transform`. O plot tem
  `overflow: hidden` e a altura máxima de bloco é, por construção, `plotHeight`.

Limiares de zona (padrão Coggan de 5 zonas, normalizados sobre teto 150):

| Zona | % do denominador | `zoneBreaks` normalizado |
|---|---|---|
| Z1 | ≤ 60% | `< 0.40` |
| Z2 | 61–82% | `0.40 – 0.55` |
| Z3 | 83–97% | `0.55 – 0.65` |
| Z4 | 98–110% | `0.65 – 0.73` |
| Z5 | > 110% | `> 0.73` |

### 4.3 Cor e preenchimento

- `fill = linear-gradient(180deg, workoutZone[zone] 100%, alpha(workoutZone[zone], .55) 100%)`
  — topo saturado, base atenuada, para que a leitura do olho suba com a intensidade.
- **Cap sólido de 2px** no topo, `workoutZone[zone]` a 100% (decisão 5).
- **Contorno de 1px** em `workoutZone[zone]` a 100% em todo o perímetro.
- `trainingStage` **deixa de pintar blocos** (D1). O papel estrutural (`kind`) passa a ser
  comunicado por **forma** — rampa para aquecimento/desaquecimento — e por rótulo, não por cor.
  Motivo: só existe um canal de cor no fill, e ele pertence à zona, que é a informação de decisão.

### 4.3.1 Mecanismo obrigatório — a cor da zona entra por custom property inline

O bloco declara a cor da zona como **CSS custom property inline**, e o `sx` a consome:

```tsx
<Box
  data-zone={block.zone}
  style={{ '--zone-color': activeTheme.workoutZone[block.zone] } as CSSProperties}
  sx={{
    background: 'linear-gradient(180deg, var(--zone-color) 0%, color-mix(in srgb, var(--zone-color) 55%, transparent) 100%)',
    outline: '1px solid var(--zone-color)',
  }}
/>
```

**Isto não é preferência de estilo — é o que torna o AC-1 verificável.** O padrão do repo é pintar
via `sx` (`WorkoutTimelineChart.tsx:161-179` faz `bgcolor: ${zone.border}14`), e `sx` vira classe
Emotion. O Vitest deste projeto roda com `css: false` (§9.0), então `getComputedStyle().background`
devolve vazio: um teste de AC-1 escrito sobre `sx` **passaria com `trainingStage` ainda pintando o
bloco** — exatamente o defeito D1 que o critério deveria pegar.

Com a custom property inline, `element.style.getPropertyValue('--zone-color')` é legível em jsdom
sem layout e sem CSS, e a asserção do AC-1 passa a ter conteúdo. O `sx` continua sendo o mecanismo
de estilo, e o token continua sendo consumido via `activeTheme` — a convenção do repo é preservada.

O mesmo vale para qualquer outro AC que precise afirmar **ausência** de uma propriedade declarada
por `sx` (`text-overflow`, `text-transform`, `transform`): em Vitest a asserção não enxerga o
estilo, e o critério vai para o Playwright (§9.0).

### 4.4 Rampas

- Um bloco com `ramp` renderiza como **trapézio**: `polygon(0 (1-from)h, 100% (1-to)h, 100% h, 0 h)`.
- Cor da zona **em que a rampa ocorre** (a zona do ponto médio), a **70%** de opacidade
  (decisão 4). Sem cor dedicada: o aquecimento não é uma quinta categoria de intensidade, é
  uma trajetória dentro de uma zona.
- O cap de 2px acompanha a hipotenusa (borda superior inclinada, 100% de opacidade).
- Rampa descendente (desaquecimento) usa `from > to` — mesma regra, espelhada.

### 4.5 Agrupamento de repetições

- Blocos com o mesmo `repeat.groupId` formam um **grupo contíguo**. Continuam sendo N
  retângulos no eixo — o tempo não é comprimido.
- Acima do grupo, na `bracketLane`, um bracket de 1px com pernas de 4px nas extremidades e o
  rótulo `{total}×` centralizado, em mono.
- Dentro de um grupo, **apenas a primeira repetição recebe rótulo de bloco**; as demais ficam
  mudas. Repetir "LIM / REC" cinco vezes é ruído, e o bracket já disse que se repete (D5, D8).
  **"Primeira repetição" = todos os blocos com `repeat.index === 1`**, não o primeiro bloco do
  grupo. Num 5×(3' limiar + 2' trote), a primeira repetição são **dois** blocos e os dois recebem
  rótulo — `LIM` e `REC` —, porque o par é a unidade que o treinador lê; os oito blocos das
  repetições 2 a 5 ficam mudos. Rotular só o primeiro bloco esconderia o que é a recuperação.
- Se o grupo tem largura < 48px, o bracket vira só o rótulo `{total}×` sem as pernas.
- Grupos aninhados (bloco dentro de bloco) **não são suportados**: `blocoId` do backend é um
  nível só. Aninhamento vai para §11.

### 4.6 Eixos

**Eixo X.** Ticks em passo "bonito" escolhido para render 4–7 rótulos:

| Duração total | Passo |
|---|---|
| < 20 min | 2 min |
| 20–45 min | 5 min |
| 45–90 min | 10 min |
| 90–180 min | 15 min |
| > 180 min | 30 min |

Rótulo `mm` até 60min, `h:mm` acima. O tick final é sempre a duração total, mesmo fora do
passo — o treinador precisa do total exato, e ele some se ficar só na grade (D4). Se o total
cair a menos de metade do passo do penúltimo tick, o penúltimo é suprimido para não colidir.

**Eixo Y.** Gridlines horizontais nos quatro `zoneBreaks`, `overlayWhite.8` (decisão 6).
Rótulos `Z1`–`Z5` na goteira esquerda de 22px, posicionados no **centro vertical da faixa** da
zona, não sobre a linha — a linha é o limite, o rótulo é a faixa.

### 4.7 Cadeia de fallback de label (D7)

Avaliada por bloco, na ordem, **medindo texto**, não estimando por percentual de largura:

1. `label` completo, se `medida(label) + 12px ≤ larguraDoBloco` **e** `larguraDoBloco ≥ 44px`.
2. `shortLabel` (≤5 caracteres, vindo do dado — **nunca cortado em runtime**), se
   `medida(shortLabel) + 8px ≤ larguraDoBloco`.
3. Ícone do `kind`, se `larguraDoBloco ≥ 18px`.
4. Nada. O tooltip cobre.

**Reticências são proibidas.** Um rótulo cortado ("AQUEC…") custa o mesmo pixel que o ícone e
informa menos — e "AQUEC" sem regra declarada é ambíguo entre aquecimento e desaquecimento,
que é o bug concreto do D7. `shortLabel` sai do seletor a partir de um mapa fixo por `kind`
(`AQUEC`, `DESAQ`, `REC`, `PAUSA`, `LIM`, `TEMPO`, …), não de um `slice(0,5)`.

A duração dentro do bloco só aparece na variante `full` **e** se sobrar altura ≥ 28px depois
do rótulo. Fora disso, duração é tooltip.

### 4.8 Uma superfície, um header (D8, D10)

A composição inteira é **um** card (`elevation.card`, `1px` `content.cardBorder`, raio 8).
Some: o eyebrow externo "Timeline do treino", a prop `title` duplicada, os cards de "Leitura
rápida" e "Resumo estrutural" (`DetalheTreinoDialog.tsx:520–586`).

Header, em uma linha:

```
Perfil do treino                    [ALVO · Z4]
40 min · 12 blocos · 15 min em Z4 · trabalho 3:2 · IF 0.88 · TSS 62
```

- **Título:** um só, em display, caixa normal. Não é eyebrow.
- **Badge:** `ALVO · Z4` — o prefixo explícito (decisão 8) impede que o treinador leia a badge
  como "este treino é todo Z4".
- **Chips:** mono, separados por `·`, sem borda e sem card. Ordem fixa, cada um omitido se
  indisponível:
  1. **Duração total** — a primeira pergunta de qualquer treinador.
  2. **Nº de blocos** — leitura de complexidade.
  3. **Tempo na zona-alvo** — a métrica de "quanto de treino de verdade tem aqui".
  4. **Razão trabalho:recuperação** — define o caráter do intervalado; só em treinos com
     série. Exibida como proporção inteira reduzida (`1.5` → `trabalho 3:2`), que é como o
     treinador enuncia o treino, não como decimal.
  5. **IF** e **TSS** — só quando `intensidadePlanejada`/`tssPlanejado` vierem não-nulos.
     **Na tela de revisão o IF nunca vem** (DEP-5, §2.5): o header ali mostra TSS e omite IF.
     Omitir é a regra correta — inventar um IF a partir da distribuição de zonas seria derivar
     um número que o treinador leria como vindo do motor de treino.

Cortadas do header: **maior bloco contínuo** (redundante com "tempo na zona-alvo" na maior
parte dos casos; fica no `ProfileMetrics` para o tooltip) e **comparativo com a última
execução** (sem fonte — DEP-4).

Legenda de distribuição: barra empilhada de 4px de altura sob o eixo X, com os `share` por
zona e rótulo `Z4 38%` em mono, derivada de `metrics.distribution` — o **mesmo** objeto de onde
sai a badge (D6).

---

## 5. Matriz de variantes × elementos

| Elemento | `full` | `compact` | `sparkline` |
|---|:---:|:---:|:---:|
| Altura do plot | 176px | 92px | 36px |
| Card, borda e padding | ✔ | ✔ (12px) | ✘ (sem chrome) |
| Título do header | ✔ | ✘ | ✘ |
| Badge `ALVO · Zn` | ✔ | ✔ | ✘ |
| Chips de métrica | todos | duração + blocos | ✘ |
| Fill com gradiente de zona | ✔ | ✔ | ✔ |
| Cap sólido 2px | ✔ | ✔ | ✔ (1px) |
| Contorno 1px | ✔ | ✔ | ✘ |
| Rampas (trapézio) | ✔ | ✔ | ✔ |
| Gridlines de zona | ✔ | ✔ | ✘ |
| Eixo Y (rótulos Z1–Z5) | ✔ | ✘ | ✘ |
| Eixo X com ticks | ✔ | ✔ (3 ticks: 0, meio, total) | ✘ |
| Baseline | ✔ | ✔ | ✔ |
| Bracket de repetição `n×` | ✔ | ✔ | ✘ |
| Rótulo dentro do bloco | cadeia completa (§4.7) | só ícone ou nada | ✘ |
| Duração dentro do bloco | condicional | ✘ | ✘ |
| Barra de distribuição | ✔ | ✔ | ✘ |
| Tooltip no hover/tap | ✔ | ✔ | ✔ |
| Navegação por teclado | ✔ | ✔ | ✘ (não focável) |
| `aria-label` resumo | ✔ | ✔ | ✔ |
| Tabela oculta para leitor de tela | ✔ | ✔ | ✘ |

### 5.1 Seleção de variante

`variant` é uma prop; `variant="auto"` (default) escolhe por **largura do container**, medida
com `ResizeObserver` — não por viewport. Motivo: o componente vive dentro de diálogos e células
de grid cuja largura não acompanha a do viewport; amarrar ao breakpoint global renderiza
`full` num card de 240px numa tela de 1440px.

| Largura do container | Variante |
|---|---|
| ≥ 560px | `full` |
| 280–559px | `compact` |
| < 280px | `sparkline` |

Breakpoints MUI do repo (`xs 0 · sm 600 · md 900 · lg 1200 · xl 1536`) continuam governando o
**layout ao redor**: em `< sm` o header quebra em duas linhas (título+badge / chips) e os chips
ganham rolagem horizontal em vez de wrap, para não empurrar o plot para baixo da dobra.

Histerese de 24px na troca de variante, para o componente não oscilar durante uma animação de
abertura de diálogo.

---

## 6. Estados e casos de borda

### 6.1 Loading

Skeleton com a **geometria real** do componente: card, header com dois retângulos (título e
badge), plot com 6 barras de alturas fixas `[0.3, 0.7, 0.35, 0.7, 0.35, 0.4]` em
`overlayWhite.8`, pulsando. Alturas variadas e não uniformes porque um skeleton de barras
iguais ensina o olho a esperar um gráfico plano — que é o defeito que estamos corrigindo.
Sem eixos. Altura idêntica à da variante final: zero layout shift.

### 6.2 Vazio (`blocks.length === 0`)

Card com altura do plot preservada, baseline desenhada, e a mensagem
*"Este treino não tem etapas estruturadas."* + ação secundária **"Adicionar etapas"** quando o
consumidor passar `onAddBlocks`. Preservar a altura evita o pulo de layout entre um treino com
e sem etapas na mesma lista.

### 6.3 Dado parcial ou inválido

| Situação | Comportamento |
|---|---|
| `durationSec` ausente ou `≤ 0` em um bloco | O bloco é **descartado** do eixo e contabilizado em `droppedBlocks`. Um chip de aviso `⚠ 2 etapas sem duração` aparece no header. Hoje o código emite `console.warn` e desenha uma barra de largura 0 — invisível e silenciosa. |
| Todos os blocos sem duração | Cai no estado vazio (§6.2) com texto *"Etapas sem duração informada."* |
| `intensityNormalized` fora de `[0,1]` | `clamp`, e satura com chanfro no topo (§4.2). |
| Zona ausente/indeterminada em um bloco | `confidence: 'unknown'` → fill neutro `surface.600` + hachura diagonal, altura fixa em 0.45. A hachura é o sinal de "não sei", distinto de qualquer zona. Nunca escolher Z1 por default — é o que o `toWorkoutBlocks` faz hoje (`return 1`) e é uma afirmação falsa. |

### 6.4 Sem zonas prescritas / alvo em pace sem limiar

Enquanto **DEP-1**/**DEP-2** não existirem, ou quando o atleta não tiver limiar cadastrado, o
seletor retorna `degraded: true`. Nesse modo:

- Todos os blocos ficam em `confidence: 'derived'` ou `'unknown'`.
- **A altura passa a codificar `kind`**, em três níveis discretos e declarados
  (`rest/recovery 0.25` · `warmup/cooldown/steady 0.50` · `work 0.85`), não uma intensidade
  contínua que não temos.
- A badge some. A distribuição vira **distribuição por `kind`**, não por zona, e é rotulada
  como tal.
- O header ganha o chip `⚠ intensidade estimada`, com tooltip explicando a origem.

Declarar a estimativa é obrigatório: um perfil que parece preciso e não é leva o treinador a
aprovar um treino que não leu — que é um custo maior do que o gráfico ser feio.

Alvo em **pace sem limiar**: a conversão pace→%vLT é impossível sem `paceLimiarSecPerKm`
(DEP-2). O pace continua sendo mostrado literalmente no tooltip; só a **altura** degrada.

### 6.5 Treino longo (> 3h)

- Passo do eixo X vai a 30min (§4.6).
- Rótulos internos de bloco desligam abaixo de 44px de largura pela cadeia normal — na prática,
  quase todos somem, e o tooltip assume.
- Sem scroll horizontal e sem zoom: o valor do perfil é a **forma completa em uma tela**.
  Um perfil que exige rolagem deixa de responder "que treino é este?" na primeira olhada.
  Zoom/brush vai para §11.
- Acima de **200 blocos** o componente renderiza um caminho SVG agregado (um `path` por zona
  contígua) em vez de N elementos, mantendo a geometria idêntica. Interação por bloco é
  substituída por interação por segmento agregado.

### 6.6 Treino muito curto (< 15min) e blocos de 30–60s

- Passo do eixo X vai a 2min.
- O piso de 3px por bloco (§4.1) domina: um bloco de 30s num treino de 12min pede 0.7% da
  largura — em um plot de 600px, 4px. Passa raspando, e o piso segura.
- Se a correção acumulada de piso passar de 8% da largura, o marcador `≈` aparece no eixo
  (§4.1). Preferimos declarar a distorção a escondê-la.

---

## 7. Interação e acessibilidade

### 7.1 Hover e tap

- Hover (ponteiro) ou tap (toque) sobre um bloco o torna **ativo**.
- Bloco ativo: opacidade 100%. Todos os demais: 55% (`inactiveAlpha`). **Nenhuma mudança
  geométrica** — a comparação de altura entre blocos precisa continuar válida durante o hover,
  e o `scaleY(1.04)` atual invalida exatamente isso, além de causar o D3.
- Em toque, um segundo tap fora fecha; `Esc` fecha em qualquer entrada.
- Tooltip, conteúdo fixo e nesta ordem:

```
Limiar                        ← label
bloco 5 de 12                 ← posição, sempre
3 min                         ← duração, mono
Z4 · Limiar                   ← zona, com a cor da zona como acento
4:18–4:24 /km                 ← alvo formatado por BlockTarget.kind
repetição 3 de 5              ← só se `repeat`
```

- Posicionamento com colisão: o tooltip se ancora acima do bloco e reflete para dentro do
  container nas bordas. Hoje ele usa `left: 50%; transform: translateX(-50%)` sem colisão, e
  vaza no primeiro e no último bloco.

### 7.2 Teclado

- O plot é **um único tab stop** (`tabIndex={0}`) com **roving focus** interno — 12 tab stops
  num treino de 12 blocos tornaria a navegação da página inutilizável.
- `←`/`→`: bloco anterior/próximo. `Home`/`End`: primeiro/último.
- `↑`/`↓`: pula para o próximo bloco de zona **diferente** — o atalho para "onde começa o
  trabalho?" em um intervalado longo.
- O bloco focado exibe o mesmo tooltip do hover e recebe anel de foco `primary.500` 2px com
  offset 2px, desenhado **por fora** do bloco (`outline`, não `border`), para não alterar a
  geometria.
- `Esc` fecha o tooltip e mantém o foco no plot.

### 7.3 Contraste e canais redundantes

- **Cor nunca é o único canal.** A intensidade é lida por **altura** (canal primário),
  **cor de zona** (redundante) e **rótulo de zona** no eixo Y + no tooltip. O componente
  continua legível em escala de cinza — critério de aceite AC-11.
- **3:1 mínimo** medido no **cap sólido de 2px e no contorno de 1px** (ambos a 100%) contra
  `elevation.panel`. Os cinco hexes passam (§3.1).
  A base do gradiente (55%) fica abaixo de 3:1 na Z5 e é **aceita por exceção declarada**:
  é preenchimento decorativo interno, não o limite que identifica o elemento — que é o papel
  do contorno, conforme WCAG 1.4.11. O piso de 55% garante que a base nunca some contra o fundo.
- `prefers-reduced-motion`: sem pulso no skeleton, sem transição de opacidade no hover.
- `prefers-contrast: more`: contorno vai a 2px e o gradiente vira fill sólido a 100%.

### 7.4 Leitor de tela

- O plot é `role="img"` com `aria-label` gerado do mesmo `WorkoutProfile`:
  > *"Perfil do treino. 40 minutos, 12 blocos. Zona-alvo Z4, limiar, 15 minutos. Distribuição:
  > Z1 25%, Z2 37%, Z4 38%."*
- Abaixo, uma `<table>` visualmente oculta (`.visually-hidden`, não `display:none`) com uma
  linha por bloco: ordem, nome, duração, zona, alvo. É o equivalente textual completo, e é o
  que torna o gráfico auditável.
- Durante a navegação por teclado, uma região `aria-live="polite"` anuncia o bloco focado.
- A variante `sparkline` é `aria-hidden` quando acompanhada de um rótulo textual próprio no
  consumidor; caso contrário mantém o `aria-label` resumido.

---

## 8. API do componente

```ts
// src/features/workout/profile/WorkoutProfile.tsx

export interface WorkoutProfileProps {
  /** Perfil já resolvido. Único caminho de dado — sem fallback interno de cálculo. */
  profile: WorkoutProfile;

  /** Default 'auto' — escolhe por largura do container (§5.1). */
  variant?: 'auto' | 'full' | 'compact' | 'sparkline';

  /** Default 'idle'. 'loading' força o skeleton independentemente de `profile`. */
  state?: 'idle' | 'loading';

  /** Título do header. Default 'Perfil do treino'. Ignorado fora de `full`. */
  title?: string;

  /**
   * Bloco ativo. Se fornecido, o componente é CONTROLADO: hover e teclado
   * apenas emitem `onActiveBlockChange`, sem mudar estado interno.
   */
  activeBlockId?: string | null;
  onActiveBlockChange?: (blockId: string | null) => void;

  /** Emitido em click/Enter sobre um bloco. Sem handler, o bloco não é clicável. */
  onBlockSelect?: (block: ProfileBlock) => void;

  /** Habilita a ação do estado vazio (§6.2). */
  onAddBlocks?: () => void;

  /** Sobrepõe métricas do header. Default: as seis de §4.8, na ordem. */
  headerMetrics?: Array<'duration' | 'blocks' | 'targetZoneTime' | 'workRatio' | 'if' | 'tss'>;

  /** Default true. `false` esconde a barra de distribuição. */
  showDistribution?: boolean;

  /** Override do `aria-label` gerado. Use apenas quando o contexto já o descreve. */
  'aria-label'?: string;

  /** Passado ao root para posicionamento no layout do consumidor. */
  sx?: SxProps<Theme>;
  'data-testid'?: string;
}
```

### 8.1 Controlado vs interno

| Aspecto | Dono | Nota |
|---|---|---|
| Bloco ativo (hover/foco) | **Interno por default; controlado se `activeBlockId !== undefined`** | Controlá-lo é o que permite sincronizar o perfil com uma lista de etapas ao lado, no `TreinoEditDialog`. |
| Variante resolvida | Interno (`ResizeObserver`) | Salvo `variant` explícito. |
| Visibilidade e posição do tooltip | Interno, sempre | Não há caso de uso para o consumidor posicionar tooltip, e expor isso acopla o consumidor à geometria. |
| Índice de foco de teclado | Interno, sempre | Deriva do bloco ativo; expor os dois convida a estados inconsistentes. |
| Cálculo do perfil | **Fora do componente** (`selectWorkoutProfile`) | §2.4. |
| Estado de loading | Consumidor (`state`) | Quem conhece a query conhece o loading. |

Defaults: `variant='auto'`, `state='idle'`, `title='Perfil do treino'`,
`showDistribution=true`, `headerMetrics` = as seis, na ordem de §4.8.

---

## 9. Critérios de aceite

Um por defeito, verificáveis por teste automatizado salvo onde indicado.

### 9.0 Meio de verificação — qual critério roda onde

O Vitest deste repo roda em **jsdom com `css: false`** (`vite.config.ts:46-52`), e o
`src/test/setup.ts` não fornece engine de layout. Consequência que não é negociável: em jsdom,
`getBoundingClientRect()`, `scrollHeight`, `clientHeight` e `offsetWidth` retornam **zero**, e
regra de CSS não é aplicada. Um critério de altura, largura ou overflow escrito em Vitest
**passa igualmente na implementação correta e na quebrada** — que é a definição de teste inútil,
e é o padrão de falha que o `CLAUDE.md` do frontend registra como a razão de E2E ser regra.

Cada AC declara seu meio. **Playwright** significa navegador real, com layout: é lá que pixel,
overflow e medição de texto são verificáveis.

| AC | Meio | Por quê |
|---|---|---|
| AC-1 | Vitest **+ confirmação em Playwright** | Só é testável em Vitest por causa do mecanismo obrigatório da §4.3.1 (custom property inline). Sem ele, `bgcolor` via `sx` vira classe Emotion e `css: false` não enxerga — a asserção passaria com `trainingStage` ainda pintando. |
| **AC-2** | **Playwright** | Altura em px exige layout. |
| **AC-3** | **Playwright** | `scrollHeight`/`clientHeight` e geometria no hover exigem layout. Em Vitest, cobrir só o complemento: ausência de `transform`/`scaleY` no estilo do bloco — necessário, não suficiente. |
| AC-4 | Vitest | Ticks são nós de texto. |
| **AC-5** | **Playwright** | Piso de 3px num plot de 600px é medição. A parte estrutural (existe exatamente um bracket `5×`; só a primeira repetição tem rótulo) fica em Vitest. |
| AC-6 | Vitest | Aritmética pura sobre `metrics`. |
| **AC-7** | **Playwright** | A cadeia de fallback **mede texto** — é o ponto do critério. Em Vitest cobrir só a proibição de **conteúdo**: nenhum `…`/`...` em nó de texto de bloco. A ausência de `text-overflow: ellipsis` **não** é verificável em Vitest quando a propriedade vem de `sx` — mesma limitação do AC-8, e vai para o Playwright junto. |
| **AC-8** | **Playwright** | `text-transform` computado vem de classe Emotion, e Vitest roda com `css: false` — a asserção não enxerga o estilo. |
| AC-9 | Vitest | Aritmética de cor sobre os tokens. |
| AC-10 | Vitest | Busca por texto. |
| AC-11 | Playwright | Já era — snapshot visual com `grayscale(1)`. |
| AC-12 | Vitest | Estrutura de DOM. **A asserção verifica conteúdo por célula**, não só a contagem de linhas: uma tabela com N linhas vazias satisfaz a contagem e falha o propósito. |
| AC-13 | Vitest | Presença/ausência de nós. |

Regra geral: **Vitest prova a regra, Playwright prova a geometria.** Onde um AC tem as duas
naturezas, ele é dividido entre os dois meios — nunca resolvido no mais barato.

**AC-1 (D1) — zona no preenchimento**
*Dado* um perfil com blocos em Z2 e Z4,
*quando* o componente renderiza,
*então* cada bloco declara `--zone-color` inline igual a `workoutZone[zone]` do respectivo bloco
(§4.3.1), e nenhum valor de `activeTheme.trainingStage` aparece em nenhuma propriedade de cor de
bloco — nem inline, nem no objeto `sx`.
Confirmação em Playwright: o `background` **computado** do bloco resolve para a cor da zona.

**AC-2 (D2) — altura codifica intensidade** · *meio: Playwright*
*Dado* dois blocos com `intensityNormalized` 0.26 e 0.78 num plot `full` de 176px,
*quando* renderiza,
*então* as alturas são 46px e 137px (±1px), e a razão entre elas está a menos de 2% de 0.78/0.26.

**AC-3 (D3) — sem overflow** · *meio: Playwright; complemento em Vitest (ausência de `transform`)*
*Dado* um perfil com um bloco em `intensityNormalized: 1.0` na variante `full`,
*quando* o mouse entra e sai desse bloco,
*então* em nenhum instante `plot.scrollHeight > plot.clientHeight`, e o `getBoundingClientRect().height`
do bloco é idêntico antes, durante e depois do hover.

**AC-4 (D4) — ticks intermediários**
*Dado* um treino de 40min,
*quando* renderiza em `full`,
*então* o eixo X exibe os ticks `0, 5, 10, 15, 20, 25, 30, 35, 40` **e** o último tick é
exatamente a duração total; para um treino de 47min, o último tick é `47`.

**AC-5 (D5) — blocos curtos e repetições** · *meio: piso de largura em Playwright; bracket e rótulo em Vitest*
*Dado* um treino de 60min com um bloco de 30s,
*quando* renderiza em um plot de 600px,
*então* a largura do bloco é ≥ 3px;
*e dado* um grupo de 5 blocos com o mesmo `repeat.groupId`,
*então* existe exatamente um bracket com o texto `5×` sobre a extensão do grupo, e apenas a
primeira repetição do grupo tem rótulo de bloco.

**AC-6 (D6) — semântica única**
*Dado* qualquer perfil válido,
*quando* renderiza,
*então* a zona da badge é igual a `profile.metrics.targetZone`;
*e* a soma dos percentuais da barra de distribuição é 100% (±0.5pp);
*e* a zona da badge aparece na distribuição com share ≥ 15%.
Teste adicional (property-based, ≥200 perfis gerados): nunca existe um perfil em que a badge
mostre uma zona ausente da distribuição — a regressão exata reportada no briefing
("Z1 100%" com blocos laranja).

**AC-7 (D7) — cadeia de fallback de label** · *meio: escolha do rótulo em Playwright; proibição de reticências em Vitest*
*Dado* um bloco cujo `label` medido excede a largura disponível,
*quando* renderiza,
*então* o texto exibido é exatamente `shortLabel` (≤5 chars) ou nada;
*e* nenhum nó de texto dentro de qualquer bloco contém `…` ou `...`;
*e* nenhum elemento de bloco tem `text-overflow: ellipsis`.

**AC-8 (D8) — hierarquia** · *meio: Playwright (`css: false` no Vitest não enxerga `text-transform` de classe Emotion)*
*Dado* o `DetalheTreinoDialog` renderizado com etapas,
*quando* inspecionado,
*então* existe exatamente **um** elemento com `text-transform: uppercase` na região do perfil
(a badge), e exatamente **uma** superfície com `border` (o card raiz) — sem cards aninhados.

**AC-9 (D9) — rampa monotônica**
*Dado* os tokens `workoutZone`,
*quando* convertidos para o matiz HSL,
*então* a sequência Z1→Z5 é monotonicamente decrescente em matiz no arco ciano→vermelho
(≈199° → 160° → 51° → 25° → 0°), sem inversão;
*e* cada hex tem contraste ≥ 3:1 contra `elevation.panel` (`#0E1B30`), verificado por teste.

**AC-10 (D10) — sem texto genérico**
*Dado* o `DetalheTreinoDialog` renderizado,
*quando* buscado por texto,
*então* "Leitura rápida" e "Resumo estrutural" não existem no documento;
*e* o header do perfil exibe duração total e número de blocos como chips.

**AC-11 (a11y) — canais redundantes**
*Dado* o componente renderizado com um filtro `grayscale(1)` aplicado,
*quando* comparado por snapshot com a versão colorida,
*então* a ordenação relativa de altura dos blocos é idêntica, e os rótulos `Z1`–`Z5` do eixo Y
permanecem legíveis. (Verificação por teste visual Playwright + assertiva de DOM.)

**AC-12 (a11y) — equivalente textual**
*Dado* qualquer perfil válido,
*quando* consultado por leitor de tela,
*então* existe uma `<table>` oculta com exatamente `profile.blocks.length` linhas, cada uma
contendo ordem, nome, duração, zona e alvo do bloco correspondente.

**AC-13 (degradado)**
*Dado* um perfil com `degraded: true`,
*quando* renderiza,
*então* a badge de zona-alvo não é renderizada, o chip `intensidade estimada` está presente,
e a barra de distribuição é rotulada por `kind`, não por zona.

---

## 10. Plano de migração

### Fase 0 — tokens (sem mudança visual)
1. Adicionar `workoutZone`, `workoutZoneLabel`, `font`, `workoutProfileFill`,
   `workoutProfileChrome`, `workoutProfileType`, `workoutProfileSpace` em `theme.premium.ts`.
2. Rotear por `activeTheme`. Nada consome ainda. `zone` fica intocado.

### Fase 1 — seletor (sem UI)
3. Criar `src/features/workout/profile/` com `types.ts`, **`input.ts`** (o `ProfileEtapaInput` e os
   adaptadores `fromEtapaTreino`/`fromEtapaTreinoDto` da §2.4), **`scale.ts`**, **`geometry.ts`**
   (fórmula de largura/altura, pura e testável sem DOM — §9.0) e `selectWorkoutProfile.ts`.
4. Portar a heurística de `toWorkoutBlocks` para dentro do seletor, marcando o resultado como
   `confidence: 'derived'` — a heurística não some antes de DEP-1, mas passa a ser **declarada**
   como estimativa em vez de apresentada como fato.
5. Testes unitários do seletor, incluindo as invariantes de AC-6. **Gate: o seletor está
   verde antes de qualquer componente existir.**

### Fase 2 — componente
6. `WorkoutProfile.tsx` novo, ao lado do antigo. Sem tocar em consumidor.
7. Testes de render por variante e os ACs **que não dependem de consumidor nem de layout**:
   AC-1, AC-4, AC-6, AC-9, AC-12, AC-13, mais as partes estruturais de AC-3, AC-5 e AC-7 (§9.0).
   **AC-8 e AC-10 não fecham aqui** — são critérios sobre o `DetalheTreinoDialog`, que só existe
   depois da troca de consumidor, e fecham na Fase 3. AC-2, AC-5 (medida), AC-7 (escolha do rótulo),
   AC-8 e AC-11 fecham no Playwright, também na Fase 3. Cobrar "AC-1..AC-13" nesta fase seria um
   gate falso: metade dos critérios não tem como ser exercida ainda.

### Fase 3 — troca de consumidores
8. `DetalheTreinoDialog.tsx`: trocar `WorkoutTimelineChart` por `WorkoutProfile`; **remover** o
   eyebrow externo (`:520`) e os dois cards `Leitura rápida`/`Resumo estrutural` (`:529–586`).
9. `TreinoEditDialog.tsx`: trocar o componente e passar `activeBlockId` sincronizado com a
   etapa em edição — ganho direto: editar uma etapa destaca a barra correspondente.
10. Atualizar os testes dos dois diálogos.

### Fase 4 — remoção
11. Deletar `src/components/features/planos/WorkoutTimelineChart/` inteiro.
12. Remover a entrada em `src/index.md`.

### O que quebra

| Quebra | Impacto | Ação |
|---|---|---|
| `WorkoutBlock` deixa de existir (vira `ProfileBlock`) | `durationMin` → `durationSec`, `blockType` → `kind`, `zoneKey` → `zone`, `zone: 1..5` some | Tipo interno, dois consumidores. Conversão mecânica. |
| `toWorkoutBlocks` some | Chamado nos dois diálogos | Substituído por `selectWorkoutProfile`, assinatura diferente (recebe contexto de esporte/limiares). |
| Prop `title="Etapas por duração e zona"` | Passada em `DetalheTreinoDialog` | Removida — o header do novo componente tem título próprio. |
| Testes que asseram texto de bloco | `TreinoEditDialog.test.tsx` já foi ajustado uma vez para `'Esforço 1/3'` e `'3 min'` | Vão quebrar de novo: a numeração de repetição migra do rótulo do bloco para o bracket (`5×`) e para o tooltip. Reescrever asserções para o bracket. |
| Blocos sem duração deixam de renderizar | Hoje viram barra de largura 0 (invisível) | Passam a ser contados no chip `⚠ n etapas sem duração` — **mudança de comportamento visível**, e intencional. |
| Cores mudam para todos os treinos | `zone` → `workoutZone`; Z1 cinza→azul, Z3 azul→amarelo | Só dentro do perfil. Outros gráficos seguem em `zone` (§11). |

**Sem flag de feature.** O componente antigo e o novo não coexistem em produção: são dois
consumidores, ambos migrados no mesmo PR, e manter os dois em paralelo recria a divergência
entre telas que motivou esta spec.

---

## 11. Fora de escopo

- **Migrar `zone` → `workoutZone` nos demais gráficos.** A rampa nova é melhor em qualquer
  lugar, mas trocar a paleta de gráficos que não estão sendo redesenhados é mudança sem
  verificação. Change própria.
- **Sobreposição do realizado sobre o planejado** (perfil planejado + traçado do executado).
  É o passo natural seguinte e depende de dado de série temporal do `TreinoRealizado`.
- **Comparativo com a última execução** no header — DEP-4, sem fonte hoje.
- **Edição direta no gráfico** (arrastar borda de bloco para mudar duração). O `TreinoEditDialog`
  edita por formulário; o perfil é leitura.
- **Zoom, brush e scroll horizontal** em treinos longos (§6.5).
- **Séries aninhadas** (bloco dentro de bloco) — `blocoId` do backend é de um nível só.
- **Export do perfil como imagem** (PNG para compartilhar com o atleta).
- **Escala Y por potência absoluta** (watts) em vez de %FTP — útil para comparar atletas
  diferentes, inútil para o caso de uso atual (um atleta por vez).
- **DEP-1, DEP-2 e DEP-5 em si.** São changes de backend — DEP-1/DEP-2 são pré-requisito para sair
  do modo degradado, DEP-5 destrava o chip IF na revisão. Devem ser abertas separadamente.
- **Unificar `EtapaTreino` e `EtapaTreinoDto`** num tipo único de domínio. É o conserto de raiz da
  divergência absorvida pelo `ProfileEtapaInput` (§2.4), e tem alcance muito além do gráfico.
