# refactor-workout-profile-chart — o perfil do treino passa a ser legível sem leitura

**Tamanho:** L · **Trilha:** Full
**Status:** criada 2026-08-18 — aguardando DoR
**Repos afetados:** `apps/menthoros-front` (somente)

> **Fonte canônica de design:** `menthoros-product/artifacts/design-system/workout-profile-spec.md`
> (spec de componente aprovada). Este proposal não duplica a spec — ele a converte em escopo,
> critérios de aceite e riscos. Onde houver divergência, a spec manda no *como*; este documento
> manda no *quanto* (escopo da change).

## Why

O treinador abre a revisão do plano ou o detalhe de um treino e faz sempre a mesma pergunta, que é
uma pergunta de **forma**: *este treino tem o formato que eu esperava?* Um progressivo, um 5×3' no
limiar, um longo plano — a resposta deveria ser instantânea.

O `WorkoutTimelineChart` não responde. Ele joga toda a informação de intensidade numa borda
esquerda de 3px e usa o preenchimento — o maior canal visual disponível — para a *etapa estrutural*
(`trainingStage`), não para a *zona*. As alturas variam de 65px a 128px num container de 70px:
quase constantes e, na variante grande, transbordando. O resultado é uma fileira de retângulos
cinza-azulados que obriga o treinador a **ler texto** para saber o que está olhando — e ler texto
derrota o propósito de existir um gráfico.

Pior que feio: **mente**. Badge de zona-alvo, legenda de zonas presentes e cor de preenchimento saem
hoje de três fontes independentes (`dominantZone` sobre `b.zone`, `presentZones` sobre `b.zoneKey`,
fill sobre `blockTypeColors`), e nada as obriga a concordar. A regressão reportada — badge "Z1 100%"
sobre blocos laranja — é a consequência esperada desse desenho, não um azar.

O custo é de decisão: o treinador aprova, ajusta ou reprova o treino olhando esse gráfico. Um perfil
que parece preciso e não é leva a aprovar um treino que não foi lido.

## What Changes

Reconstrução do componente sobre o encoding canônico de perfil de treino — **largura = tempo,
altura = intensidade, cor = zona** — o mesmo de TrainingPeaks, Zwift e intervals.icu.

1. **Tokens novos** em `theme.premium.ts`, roteados por `activeTheme`: `workoutZone` (rampa fria→quente
   monotônica), `workoutZoneLabel`, `font` (tokeniza Space Grotesk / JetBrains Mono, hoje carregadas
   no `index.html` mas escritas como `fontFamily: 'monospace'` cru), `workoutProfileFill`,
   `workoutProfileChrome`, `workoutProfileType`, `workoutProfileSpace`. O grupo `zone` existente
   **não é tocado** — é consumido por outros gráficos, e trocá-lo em silêncio quebraria a leitura
   deles sem aviso.
2. **Seletor puro único** `selectWorkoutProfile()` em `src/features/workout/profile/`, que resolve
   zona, intensidade normalizada, agrupamento de repetições e distribuição **uma vez**, e do qual
   badge, altura, cor e legenda saem todos no mesmo retorno. É a correção estrutural do D6.
3. **Componente `WorkoutProfile`** — três variantes (`full` / `compact` / `sparkline`) escolhidas por
   largura do *container* (`ResizeObserver`), não por viewport; rampas como trapézio; bracket `n×`
   para séries repetidas; eixo X com ticks intermediários; eixo Y rotulado Z1–Z5; tooltip com
   colisão; roving focus por teclado; equivalente textual em tabela oculta.
4. **Modo degradado explícito.** Enquanto o backend não expuser intensidade estruturada (DEP-1) e
   limiares do atleta (DEP-2), a altura codifica `kind` em três níveis declarados, a badge some e o
   header mostra `⚠ intensidade estimada`. A estimativa passa a ser **declarada** em vez de
   apresentada como fato.
5. **Troca dos dois consumidores** (`DetalheTreinoDialog`, `TreinoEditDialog`) no mesmo PR, e
   remoção do `WorkoutTimelineChart/` inteiro. Sem feature flag: manter os dois em paralelo recria
   exatamente a divergência entre telas que motivou a spec.
6. **Limpeza de hierarquia** no `DetalheTreinoDialog`: caem o eyebrow "Timeline do treino" (`:520`),
   a prop `title="Etapas por duração e zona"` e os cards "Leitura rápida" (`:549`) e "Resumo
   estrutural" (`:576`), substituídos por um header único com chips de métrica.

### Não faz parte desta change

Migrar `zone` → `workoutZone` nos demais gráficos; sobrepor o realizado ao planejado; comparativo
com a última execução (DEP-4, sem fonte); edição direta no gráfico; zoom/brush/scroll horizontal;
séries aninhadas; export como imagem; escala Y em watts absolutos. **DEP-1 e DEP-2 são changes de
backend** e devem ser abertas separadamente — esta change entrega o modo degradado, não a
dependência.

## Critérios de aceite

Os treze critérios verificáveis vivem na **§9 da spec** (`AC-1` … `AC-13`), um por defeito
rastreado (D1–D10 + três de acessibilidade/degradado). Cada `tasks.md` referencia o AC que fecha.

**Meio de verificação (§9.0 da spec).** AC-2, AC-3, AC-5, AC-7 e AC-8 dependem de layout real e
**não são verificáveis em Vitest** — o repo roda jsdom com `css: false`, onde toda medida é zero e
a asserção passa nas duas versões. Esses cinco vão para Playwright (task 3.4), com a parte
estrutural em Vitest onde existir. Resumo dos que governam o gate de entrega:

- **AC-1** — o `background` computado de cada bloco contém `workoutZone[zone]` do próprio bloco, e
  nenhum valor de `trainingStage` aparece em propriedade de cor de bloco.
- **AC-2** — num plot `full` de 176px, blocos com `intensityNormalized` 0.26 e 0.78 medem 46px e
  137px (±1px), com a razão a menos de 2% de 0.78/0.26.
- **AC-3** — durante e depois do hover, `plot.scrollHeight === plot.clientHeight` e o
  `getBoundingClientRect().height` do bloco é idêntico ao de antes.
- **AC-6** — a zona da badge é sempre `metrics.targetZone`, a distribuição soma 100% (±0,5pp) e a
  zona da badge tem share ≥ 15%. Verificado também por teste property-based sobre ≥200 perfis
  gerados: **nunca** existe perfil em que a badge mostre zona ausente da distribuição.
- **AC-7** — nenhum nó de texto dentro de um bloco contém `…`/`...`, e nenhum bloco tem
  `text-overflow: ellipsis`.
- **AC-9** — `workoutZone` é monotônica em matiz no arco ciano→vermelho, e cada hex tem contraste
  ≥ 3:1 contra `elevation.panel` (`#0E1B30`).
- **AC-12** — existe uma `<table>` oculta com exatamente `profile.blocks.length` linhas.
- **AC-13** — com `degraded: true`, a badge não é renderizada, o chip `intensidade estimada` está
  presente e a distribuição é rotulada por `kind`.

## Métrica de sucesso

**Tempo de decisão do treinador na fila de revisão** — mediana de segundos entre abrir um treino e
aprovar/editar/reprovar. **A instrumentação NÃO existe** (verificado 2026-08-18: não há canal de
analytics no front; `CoachPlanReviewPage`/`useCoachPlanReview` só chamam a API e emitem toast, e
`CoachAssessoriaSettingsPage` registra em comentário "sem canal de analytics no front ainda").
Enquanto não houver, esta métrica é **inviável** — ver gap C2 no DoR.

Contra-métrica (não pode piorar): **taxa de edição após aprovação** — se o perfil ficar rápido de
ler mas errado, o treinador aprova e volta atrás. Se subir, a leitura ficou mais rápida e menos
correta, que é o pior resultado possível.

## Open Questions & Assumptions

**A1 — Duas formas de etapa alimentam o mesmo gráfico. `RESOLVIDA` (spec emendada 2026-08-18).**
`DetalheTreinoDialog` consome `EtapaTreino` (`src/types/TreinoPlanejado.ts:38-49`: `tipoEtapa` pode
ser objeto, **sem** `blocoId`), e `TreinoEditDialog` consome `EtapaTreinoDto`
(`src/types/PlanoReview.ts:31-40`: `tipoEtapa` string, **com** `blocoId`/`blocoRepeticoes`). A §2.4
da spec assinava `selectWorkoutProfile(etapas: EtapaTreinoDto[])`, que serve só um dos dois — a
assinatura foi **corrigida na própria spec** para `ProfileEtapaInput[]` com um adaptador por
consumidor, junto com a regra de que sem `blocoId` não há `repeat` nem bracket. Não é mais desvio
do documento canônico: é o documento canônico.

**A2 — Conflito em voo com `preservar-serie-estruturada-na-edicao`.** Aquela change (branch
`feature/preservar-serie-estruturada-na-edicao`, commit `fde9089`, **não mergeada**) reescreve o
`TreinoEditDialog` inteiro para um modelo de lista `EtapaItem` e cria
`features/coach/components/etapas/etapaItem.ts`. A Fase 3 desta change toca o mesmo arquivo.
**Premissa:** esta change entra **depois** do merge daquela, e a task 4.2 é escrita contra o modelo
`EtapaItem`, não contra os quatro campos fixos. Se a ordem inverter, a Fase 3 precisa ser
replanejada — não resolvida no merge.

**A3 — "Leitura rápida" existe duas vezes no `DetalheTreinoDialog`.** Além do card em `:549`, a
linha `:310` diz "Leitura rápida do contexto, intensidade e duração planejada", fora da região do
perfil. O AC-10 pede que o texto "não exista no documento". **Premissa:** o AC-10 é lido como
restrito à região do perfil; a linha `:310` fica. Marcar no teste com o escopo explícito, para o
critério não passar a virar uma armadilha na próxima edição.

**A4 — `sport` não existe no contrato.** `TreinoPlanejadoDto` não expõe esporte (DEP-3).
**Premissa:** `'run'` como default do produto, passado como prop pelo consumidor. Risco aceito e
declarado: um treino de bike ou natação é pintado com a escala de corrida. `tipoTreino` existe
(`PlanoReview.ts:48`) e pode servir de heurística — decidir na task 2.1 entre heurística declarada
e default cego; nenhum dos dois é dado real.

**A6 — o chip IF nunca renderiza na revisão.** `TreinoPlanejadoDto` (`src/types/PlanoReview.ts:44-59`)
tem `tssPlanejado` e **não** tem `intensidadePlanejada`; só `src/types/TreinoPlanejado.ts` (detalhe
do treino) expõe o campo. **Decisão:** o chip é omitido, nunca derivado da distribuição de zonas —
um IF calculado no front seria lido pelo treinador como vindo do motor de treino. Registrado como
**DEP-5** na §2.5 da spec, change de backend.

**A5 — o modo degradado é o caminho normal, não a exceção.** Sem DEP-1/DEP-2, todo bloco cai em
`confidence: 'derived'` ou `'unknown'`. **Consequência aceita e declarada:** a entrega v1 é
majoritariamente o modo degradado — o ganho imediato é de forma, hierarquia e honestidade sobre a
estimativa, não de precisão de intensidade. Se isso não for aceitável, DEP-1 vira bloqueio e a
change espera.

**Q1 — o teste property-based do AC-6** exige uma lib de geração (`fast-check`) que não está no
projeto. Adicionar dependência de dev precisa de aprovação explícita (CLAUDE.md). Alternativa sem
dependência: gerador determinístico próprio com seed fixa. Decidir na task 3.4.

**Q2 — a métrica de sucesso depende de instrumentação** do tempo de decisão na fila de revisão.
Confirmar que o evento existe antes do merge; se não existir, a métrica vira qualitativa e isso
precisa estar escrito, não presumido.
