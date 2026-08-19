# Design — refactor-workout-profile-chart

> A spec de componente (`artifacts/design-system/workout-profile-spec.md`) já é o documento de
> design do *desenho*: contrato de dados (§2), tokens (§3), regras de renderização (§4), variantes
> (§5), estados (§6), interação e a11y (§7), API (§8). **Não repito nada disso aqui.**
>
> Este design.md cobre o que a spec não podia cobrir porque não olhou o repositório: como o módulo
> se encaixa no código que existe hoje, o que a spec assume e não é verdade, e como a mudança é
> sequenciada sem quebrar o que está em voo.

## 1. Estado real do código (verificado em `origin/develop`, 2026-08-18)

| Fato | Onde | Consequência |
|---|---|---|
| `WorkoutTimelineChart/` = 4 arquivos (`WorkoutTimelineChart.tsx` 13,1K, `toWorkoutBlocks.ts` 4,4K, `types.ts`, `index.ts`) | `src/components/features/planos/WorkoutTimelineChart/` | Superfície de remoção pequena e fechada. |
| **Três** formas de etapa alimentam o gráfico | `EtapaTreino` (`src/types/TreinoPlanejado.ts`), `EtapaTreinoDto` (`src/types/PlanoReview.ts`) e **`EtapaItem`** (`src/features/coach/components/etapas/etapaItem.ts`, desde `bdba29b`) | A assinatura do seletor na spec (§2.4) serve só uma. Ver §2. |
| `blocoId`/`blocoRepeticoes` existem **só** em `EtapaTreinoDto` (PlanoReview) | `PlanoReview.ts:39-40` | Bracket de repetição (§4.5) é implementável na revisão; no detalhe do treino, não. |
| `DetalheTreinoDialog` usa `toWorkoutBlocks(etapasOrdenadas)` | `DetalheTreinoDialog.tsx:213` | Um ponto de troca. |
| `TreinoEditDialog` **não** usa `toWorkoutBlocks` — monta `WorkoutBlock[]` à mão a partir de `EtapaItem[]` | `TreinoEditDialog.tsx:380-442` (`liveBlocks`), chart em `:719` | Segunda derivação independente de zona (`zoneFromString`, `blockTypeDe`). É o D6 com outro nome, e some junto. Referências atualizadas após o merge do PR #79 — `blocoFromEtapa` **não existe mais**. |
| Refs de linha da spec conferem exatamente | `:520` eyebrow, `:524` chart, `:549` "Leitura rápida", `:576` "Resumo estrutural" | A spec foi escrita contra este código. |
| `zone` = `Z1 #C8CDD4 · Z2 #34D399 · Z3 #3B82F6 · Z4 #F59E0B · Z5 #EF4444` | `theme.premium.ts:116` | Confirma o D9: azul no meio, cinza na base. Rampa nova é grupo separado. |
| `activeTheme` já monta `zones` com shape `{color, fill, border, label}` e `ZONE_LABELS` idênticos a `workoutZoneLabel` | `activeTheme.ts` | `workoutZoneLabel` da spec **duplica** `ZONE_LABELS`. Reusar, não recriar. |

## 2. Decisão — entrada do seletor (resolve A1)

A §2.4 da spec assinava `selectWorkoutProfile(etapas: EtapaTreinoDto[], context)`. Com dois tipos de
etapa em uso, três caminhos foram considerados — e a conclusão foi **emendada de volta na spec**
(§2.4, "Emenda 2026-08-18"), para que não exista um contrato canônico contradizendo a change:

| Opção | Veredito |
|---|---|
| Seletor sobrecarregado, aceita os dois tipos | **Rejeitada.** Empurra o `typeof tipoEtapa === 'object'` para dentro do seletor — o mesmo parsing defensivo que o `toWorkoutBlocks` faz hoje e que a spec quer eliminar. |
| Unificar `EtapaTreino` e `EtapaTreinoDto` primeiro | **Rejeitada nesta change.** É refactor de tipos de domínio com alcance muito maior que o gráfico; vira change própria. |
| **`ProfileEtapaInput` normalizado + um adaptador por consumidor** | **Escolhida.** O seletor tem uma entrada só, pura e testável. Cada consumidor traz seu adaptador fino (`fromEtapaTreino`, `fromEtapaTreinoDto`), que é onde mora — e onde fica visível — o fato de que uma das fontes não tem `blocoId`. |

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
```

**Regra:** sem `blocoId`, o perfil não tem `repeat` — e portanto não tem bracket. Não inferir grupo
por igualdade de rótulo: seria adivinhação apresentada como estrutura, que é a classe de bug que
esta change existe para matar.

### 2.1 O terceiro adaptador — `EtapaItem` (acrescentado após o merge do PR #79)

```ts
export function fromEtapaTreino(e: EtapaTreino): ProfileEtapaInput;       // detalhe do treino
export function fromEtapaTreinoDto(e: EtapaTreinoDto): ProfileEtapaInput;  // treino salvo na revisão
export function fromEtapaItens(itens: EtapaItem[]): ProfileEtapaInput[];   // editor ao vivo
```

O merge de `preservar-serie-estruturada-na-edicao` (`bdba29b`) mudou o consumidor mais importante:
o gráfico do editor **não deriva mais de `EtapaTreinoDto[]`**. Ele deriva do estado ao vivo
`itens: EtapaItem[]` (`TreinoEditDialog.tsx:380-442`, `liveBlocks`), para atualizar a cada tecla — e
é isso que dá ao perfil o valor de feedback imediato durante a edição. Adaptar de `EtapaTreinoDto`
ali desenharia o treino **salvo**, não o que o treinador está montando.

Por isso `fromEtapaItens` recebe a **lista**, não um item: um `BlocoRow` de `reps × steps` vira N
blocos no eixo, e essa expansão só existe no nível da lista. O `liveBlocks` atual já faz exatamente
essa expansão, e os ids que ele gera (`bloco-${idx}-${r}-${si}`) já carregam a estrutura de que o
`RepeatSpec` precisa — o mapeamento é leitura, não invenção:

| `EtapaItem` (editor) | `ProfileEtapaInput` / `RepeatSpec` |
|---|---|
| índice do `BlocoRow` na lista | `repeat.groupId` |
| `r` (1..reps) do laço de expansão | `repeat.index` |
| `item.repeticoes` | `repeat.total` |
| `sub.duracaoMin`, `sub.tipoEtapa`, `sub.fcAlvoEtapa` | `duracaoMin`, `tipo`, `fcAlvo` |
| `StepRow` avulso | sem `repeat` — etapa fora de série |

**Ids estáveis:** `step-${item.id}` para avulsas, `bloco-${groupId}-${r}-${si}` para blocos — o
mesmo esquema que o `liveBlocks` já usa. Estabilidade importa porque `activeBlockId` (§8 da spec)
sincroniza o bloco destacado com a linha em edição: um id que muda a cada tecla faria o destaque
piscar. `item.id` já é estável no modelo `EtapaItem`, e o índice do bloco só muda quando o treinador
reordena — que é quando o destaque **deve** seguir.

Com isso a Fase 3 deixa de exigir decisão de design no meio do código: o caminho
`EtapaItem[] → ProfileEtapaInput[] → selectWorkoutProfile → WorkoutProfile` está fechado aqui.

## 3. Layout do módulo

```
src/features/workout/profile/
  types.ts                    ← §2.2 da spec, literal
  input.ts                    ← ProfileEtapaInput + os TRÊS adaptadores (ver §2)
  selectWorkoutProfile.ts     ← seletor puro, sem React
  selectWorkoutProfile.test.ts
  scale.ts                    ← mapa esporte→escala, zoneBreaks, normalização (§2.3, §4.2)
  format.ts                   ← formatação de BlockTarget, duração, razão trabalho:recuperação
  WorkoutProfile.tsx          ← componente, §8
  WorkoutProfile.test.tsx     ← os ACs de Vitest (§5), NÃO AC-1..AC-13
  parts/                      ← Header, Plot, Block, Ramp, Bracket, Axes, Tooltip, Distribution, HiddenTable
  index.ts
```

Fica em `src/features/workout/` — **não** em `features/coach/`: os dois consumidores são do shell do
coach hoje, mas o perfil é de domínio de treino e o atleta é o próximo consumidor natural. Atenção à
armadilha documentada no `CLAUDE.md` do front: `@/features/*` resolve para `src/components/features/*`,
não para `src/features/*`. Importar por caminho relativo explícito.

## 4. Sequência — a dependência foi resolvida (A2, fechada em 2026-08-18)

`preservar-serie-estruturada-na-edicao` **foi mergeada** em `develop` pelo PR #79 (`bdba29b`). Ela
reescreveu o `TreinoEditDialog.tsx` para o modelo de lista `EtapaItem` e criou
`components/etapas/etapaItem.ts`. Era o bloqueio de sequenciamento desta change, e não existe mais:
**todas as fases podem correr em sequência normal**, sobre uma branch tirada de `develop` atualizada.

O merge mudou o alvo da Fase 3 e isso é ganho, não retrabalho:

- O `activeBlockId` sincronizado com a etapa em edição (Fase 3, item 9 da spec) fica trivial — a
  lista de itens já é o eixo do diálogo.
- Em compensação, o gráfico passou a derivar de `EtapaItem[]`, o que exige o terceiro adaptador
  (§2.1). Sem ele, a Fase 3 pararia para decidir design no meio da implementação.
- As referências de linha mudaram: `blocoFromEtapa` **não existe mais**, a derivação virou
  `liveBlocks` (`:380-442`) e o chart está em `:719`. A §1 e as tasks 3.0/3.2 já refletem isso.

## 5. Estratégia de teste

| Camada | O que cobre | Onde |
|---|---|---|
| Unitário puro (Vitest) | Seletor: zona, normalização, distribuição, `targetZone`, invariantes de AC-6, agrupamento, blocos descartados | `selectWorkoutProfile.test.ts` — **gate: verde antes de existir componente** |
| Unitário puro | Escala por esporte, `zoneBreaks`, formatação de `BlockTarget` | `scale.test.ts`, `format.test.ts` |
| Property-based | AC-6 sobre ≥200 perfis gerados | Ver Q1 do proposal — decidir entre `fast-check` (dependência nova, precisa de aprovação) e gerador com seed fixa |
| Geometria pura (Vitest) | Fórmula de largura/altura extraída para `geometry.ts`: `Σw === plotWidth`, piso de 3px, `overflowCompressed` acima de 8% | `geometry.test.ts` — sem DOM, e por isso confiável |
| Componente (Testing Library) | AC-1 (via `--zone-color` inline, §4.3.1 da spec), AC-4, AC-6, AC-12, AC-13 + as partes estruturais de AC-3, AC-5 e AC-7 | `WorkoutProfile.test.tsx` |
| Componente, **na Fase 3** | AC-10 — é critério sobre o `DetalheTreinoDialog`, que só existe depois da troca de consumidor | teste do diálogo |
| Token (Vitest) | AC-9 (monotonia de matiz + contraste ≥3:1) | `theme.premium.test.ts` já tem precedente de teste de contraste — estender |
| **Playwright** | **AC-2, AC-3, AC-5, AC-7, AC-8, AC-11** + o fluxo real de revisão | `tests/e2e/coach/` — o `CLAUDE.md` do front torna E2E **obrigatório** aqui: revisão/aprovação de plano é decisão coach-in-the-loop |

**Por que cinco ACs saíram do Vitest** (§9.0 da spec, adicionada 2026-08-18). `vite.config.ts:46-52`
roda `environment: 'jsdom'` com `css: false`, e `src/test/setup.ts` não traz engine de layout. Em
jsdom, `getBoundingClientRect()`, `scrollHeight`, `clientHeight` e `offsetWidth` retornam **zero**, e
regra de CSS não é aplicada. AC-2 (altura em px), AC-3 (overflow no hover), AC-5 (piso de 3px), AC-7
(cadeia que **mede texto**) e AC-8 (`text-transform` computado de classe Emotion) escritos ali
passariam tanto na implementação correta quanto na quebrada.

Onde o AC tem as duas naturezas, ele é **dividido**, não movido inteiro: o Vitest fica com a parte
que não depende de layout (existe um bracket `5×`; o bloco não declara `transform`; não há
reticências em lugar nenhum) e o Playwright com a medida. **Vitest prova a regra, Playwright prova a
geometria** — e nenhum AC é resolvido no meio mais barato só por ser mais barato.

**Corolário que virou requisito de implementação.** A mesma limitação atinge qualquer asserção sobre
propriedade declarada por `sx`: Emotion gera uma classe, e com `css: false` o Vitest não a lê. Por
isso a §4.3.1 da spec **obriga** a cor da zona a entrar por custom property inline
(`--zone-color`), consumida pelo `sx`. É o que dá conteúdo ao AC-1 — sem isso, o teste passaria com
o `trainingStage` ainda pintando o bloco, que é literalmente o defeito D1. Onde não houver mecanismo
equivalente (`text-overflow`, `text-transform`), o critério vai inteiro para o Playwright.

## 6. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **A v1 entrega majoritariamente o modo degradado** (A5) — perfil bonito, intensidade estimada | Alta | Está declarado na UI (`⚠ intensidade estimada`) e no proposal. Se o treinador ler a altura como precisa, o chip falhou — validar em E2E que ele está presente sempre que `degraded`. |
| Reescrita concorrente do `TreinoEditDialog` (A2) | Alta | Fase 3 depende de merge, não de conflito. §4. |
| Sem feature flag, um bug do perfil atinge as duas telas de uma vez | Média | O gate da Fase 1 (seletor verde antes de qualquer UI) e a bateria AC-1..AC-13 são a rede. Rollback = revert do PR único. |
| Cores mudam para todos os treinos (Z1 cinza→azul, Z3 azul→amarelo) sem aviso ao treinador | Média | Restrito ao perfil; outros gráficos seguem em `zone`. Vale uma nota de release — o treinador tem memória visual da paleta. |
| `> 200 blocos` → caminho SVG agregado (§6.5) é um segundo renderizador | Baixa | Nenhum treino real chega perto. **Adiar**: implementar o corte como aviso, não como segundo renderizador; task marcada como opcional. |
| Tokens novos (7 grupos) inflam `theme.premium.ts` | Baixa | Grupos `as const` roteados por `activeTheme`, como o resto do arquivo. Sem mudança de padrão. |
