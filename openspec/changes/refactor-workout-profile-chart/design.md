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
| **Dois** tipos de etapa alimentam o gráfico | `src/types/TreinoPlanejado.ts` (`EtapaTreino`) e `src/types/PlanoReview.ts` (`EtapaTreinoDto`) | A assinatura do seletor na spec (§2.4) serve só um. Ver §2. |
| `blocoId`/`blocoRepeticoes` existem **só** em `EtapaTreinoDto` (PlanoReview) | `PlanoReview.ts:39-40` | Bracket de repetição (§4.5) é implementável na revisão; no detalhe do treino, não. |
| `DetalheTreinoDialog` usa `toWorkoutBlocks(etapasOrdenadas)` | `DetalheTreinoDialog.tsx:213` | Um ponto de troca. |
| `TreinoEditDialog` **não** usa `toWorkoutBlocks` — monta `WorkoutBlock[]` à mão | `TreinoEditDialog.tsx:102` (`blocoFromEtapa`), `:611` | Segunda derivação independente de zona. É o D6 com outro nome, e some junto. |
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

## 3. Layout do módulo

```
src/features/workout/profile/
  types.ts                    ← §2.2 da spec, literal
  input.ts                    ← ProfileEtapaInput + adaptadores dos dois consumidores
  selectWorkoutProfile.ts     ← seletor puro, sem React
  selectWorkoutProfile.test.ts
  scale.ts                    ← mapa esporte→escala, zoneBreaks, normalização (§2.3, §4.2)
  format.ts                   ← formatação de BlockTarget, duração, razão trabalho:recuperação
  WorkoutProfile.tsx          ← componente, §8
  WorkoutProfile.test.tsx     ← AC-1..AC-13
  parts/                      ← Header, Plot, Block, Ramp, Bracket, Axes, Tooltip, Distribution, HiddenTable
  index.ts
```

Fica em `src/features/workout/` — **não** em `features/coach/`: os dois consumidores são do shell do
coach hoje, mas o perfil é de domínio de treino e o atleta é o próximo consumidor natural. Atenção à
armadilha documentada no `CLAUDE.md` do front: `@/features/*` resolve para `src/components/features/*`,
não para `src/features/*`. Importar por caminho relativo explícito.

## 4. Sequência e o conflito com `preservar-serie-estruturada-na-edicao` (A2)

Aquela change reescreve `TreinoEditDialog.tsx` inteiro (modelo `EtapaItem`, novo
`components/etapas/etapaItem.ts`) e está **não mergeada**. As fases 0–2 desta change não tocam
nenhum arquivo dela; a Fase 3 toca o mesmo arquivo, linha a linha.

**Sequência:** Fases 0–2 podem começar já. A Fase 3 **só começa depois** do merge de
`preservar-serie-estruturada-na-edicao` em `develop` — e a branch desta change rebaseia antes.
Resolver isso como conflito de merge seria escolher entre duas reescritas do mesmo arquivo sem
entender nenhuma das duas, que é exatamente o que o `CLAUDE.md` proíbe.

Ganho colateral: com o modelo `EtapaItem` já mergeado, o `activeBlockId` sincronizado com a etapa em
edição (Fase 3, item 9 da spec) fica trivial — a lista de itens já é o eixo do diálogo.

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
