# Tasks — refactor-workout-profile-chart

Repo: `apps/menthoros-front`. Gate de stack em todo bloco: `npm run lint && npm run build && npm run test:run`.
Referências `§` são da spec (`artifacts/design-system/workout-profile-spec.md`); `AC-n` são os
critérios de aceite da §9.

> **Meio de verificação (§9.0 da spec).** Vitest roda em jsdom com `css: false`
> (`vite.config.ts:46-52`) — sem engine de layout. **AC-2, AC-3, AC-5, AC-7 e AC-8 não são
> verificáveis em Vitest**: `getBoundingClientRect`, `scrollHeight` e medição de texto retornam
> zero, e a asserção passa tanto na versão correta quanto na quebrada. Esses cinco vão para o
> **Playwright** (task 3.4), com o complemento estrutural em Vitest onde existir. **Vitest prova
> a regra, Playwright prova a geometria.**

**Ordem obrigatória:** Fase 1 verde antes de qualquer componente (§10). A Fase 3 **não está mais
bloqueada** — `preservar-serie-estruturada-na-edicao` foi mergeada em `develop` pelo PR #79
(`bdba29b`), e as tasks abaixo já estão escritas contra o código pós-merge (design §4).

---

## Fase 0 — Tokens (nenhuma mudança visual)

- [x] **0.1** Adicionar `workoutZone` e `workoutZoneLabel` em `src/theme/theme.premium.ts` (§3.1).
      `workoutZoneLabel` deve **reusar** os rótulos já existentes em `activeTheme.ts` (`ZONE_LABELS`),
      não duplicá-los. `zone` fica intocado.
      `verify:` `npm run test:run -- theme.premium` verde; `grep -n "export const zone" theme.premium.ts` inalterado.
- [x] **0.2** Adicionar `font` (`display`/`text`/`mono`) e os quatro grupos do componente —
      `workoutProfileFill`, `workoutProfileChrome`, `workoutProfileType`, `workoutProfileSpace` (§3.2–3.5).
      `verify:` `npm run build` — tipos `as const` compilam sem `any`.
- [x] **0.3** Rotear os grupos novos por `src/theme/activeTheme.ts`. Nenhum componente consome ainda.
      `verify:` `npm run lint && npm run build`; `git diff --stat` toca só `theme/`.
- [x] **0.4** Teste de token **AC-9**: monotonia de matiz Z1→Z5 no arco ciano→vermelho (≈199→160→51→25→0)
      e contraste ≥ 3:1 de cada hex contra `elevation.panel` `#0E1B30`. Estender
      `src/theme/theme.premium.test.ts`, que já tem precedente de asserção de contraste.
      `verify:` `npm run test:run -- theme.premium` — AC-9 verde.

---

## Fase 1 — Seletor puro (sem UI) — **gate**

- [ ] **1.1** Criar `src/features/workout/profile/types.ts` com o contrato da §2.2 literal
      (`Sport`, `BlockKind`, `ZoneKey`, `BlockTarget`, `IntensityConfidence`, `RampSpec`, `RepeatSpec`,
      `ProfileBlock`, `ZoneShare`, `ProfileMetrics`, `IntensityScale`, `WorkoutProfile`).
      `verify:` `npm run build`.
- [ ] **1.2** Criar `input.ts` com `ProfileEtapaInput` e os **três** adaptadores (design §2 e §2.1):
      `fromEtapaTreino` (`src/types/TreinoPlanejado.ts` — `tipoEtapa` pode ser objeto, **sem** `blocoId`),
      `fromEtapaTreinoDto` (`src/types/PlanoReview.ts` — string, **com** `blocoId`/`blocoRepeticoes`)
      e `fromEtapaItens(itens: EtapaItem[])` (`src/features/coach/components/etapas/etapaItem.ts` —
      recebe a **lista**, porque a expansão de `BlocoRow` em `reps × steps` só existe nesse nível).
      Sem `blocoId`, o resultado não tem `repeat` — nunca inferir grupo por igualdade de rótulo.
      `verify:` `input.test.ts` cobre as três formas, a ausência de `repeat` no caminho sem `blocoId`,
      e — para `fromEtapaItens` — um `BlocoRow` de 5×2 produzindo 10 entradas com `repeat.index` de
      1 a 5 e ids estáveis entre duas chamadas com o mesmo estado.
- [ ] **1.3** Criar `scale.ts`: mapa esporte→métrica/teto (§2.3), `zoneBreaks` de 5 zonas Coggan
      normalizados sobre teto 150 (§4.2), e `normalize()` com `clamp`.
      `verify:` `scale.test.ts` — os quatro breaks batem com a tabela da §4.2.
- [ ] **1.4** Criar `selectWorkoutProfile.ts`. Portar a heurística de `toWorkoutBlocks.ts` para dentro
      dele, marcando todo resultado inferido como `confidence: 'derived'` (§10, item 4). Trocar o
      `return 1` (default Z1) por `confidence: 'unknown'` — o default silencioso é uma afirmação falsa (§6.3).
      Blocos com `duracaoMin` ausente ou `≤ 0` são descartados do eixo e contados em `droppedBlocks`.
      `verify:` `npm run test:run -- selectWorkoutProfile`.
- [ ] **1.5** Métricas: `targetZone` (maior zona com share ≥ 0,15, senão `null`), `distribution` sobre
      **todos** os blocos, `longestWorkBlockSec`, `workToRecoveryRatio` (dentro das séries quando há
      `repeat`; global caso contrário; `null` sem recuperação), `intensityFactor`/`tss` vindos do
      consumidor sem derivação.
      `verify:` teste com o exemplo da §2.6 (40min, 12 blocos) reproduzindo o JSON esperado campo a campo.
- [ ] **1.6** Modo degradado (§6.4): sem intensidade estruturada ou sem limiar, `degraded: true`,
      altura por `kind` em três níveis (`rest/recovery 0.25` · `warmup/cooldown/steady 0.50` · `work 0.85`),
      `targetZone: null`, distribuição por `kind`.
      `verify:` teste dedicado — hoje este é o **caminho normal** (proposal A5), não a exceção.
- [ ] **1.7** Invariantes de **AC-6** como teste: `Σ share === 1 ± 0.005` e
      `targetZone === null || distribution.find(d => d.zone === targetZone).share >= 0.15`.
      `verify:` `npm run test:run -- selectWorkoutProfile` verde.
- [ ] **1.8** **[decisão]** Teste property-based do AC-6 (≥200 perfis gerados). Escolher entre
      adicionar `fast-check` (dependência de dev — exige aprovação explícita, CLAUDE.md) e um gerador
      determinístico com seed fixa. **Pausar e perguntar** antes de instalar qualquer coisa.
      `verify:` 200 perfis gerados, zero em que a badge mostre zona ausente da distribuição.

> **GATE:** a Fase 2 não começa com qualquer teste da Fase 1 vermelho.

---

## Fase 2 — Componente (ao lado do antigo, sem tocar em consumidor)

- [ ] **2.1** Esqueleto de `WorkoutProfile.tsx` com a API da §8 e a resolução de variante por
      `ResizeObserver` sobre a largura do **container** (≥560 `full`, 280–559 `compact`, <280
      `sparkline`), com histerese de 24px (§5.1).
      `verify:` teste de variante com `ResizeObserver` mockado nos três limiares + histerese.
- [ ] **2.2** Plot e blocos: escala X linear com piso de 3px e redistribuição proporcional; separador
      de 1px desenhado **sobre** a borda (sem gap); escala Y por teto fixo com piso de 12%; baseline reta;
      `borderRadius: 2px 2px 0 0` (§4.1, §4.2).
      `verify:` Vitest sobre a **fórmula** — a altura calculada e a redistribuição de piso são funções
      puras extraídas para `geometry.ts` e testadas sem DOM (`Σw === plotWidth`, piso respeitado,
      flag `overflowCompressed` acima de 8%). **AC-2 e AC-5 (medição em px) ficam para a task 3.4.**
- [ ] **2.3** Preenchimento: gradiente 100%→55% da cor de zona, cap sólido de 2px e contorno de 1px,
      ambos a 100% (§4.3). `trainingStage` deixa de pintar bloco.
      **Mecanismo obrigatório (§4.3.1):** a cor da zona entra como custom property **inline**
      (`style={{ '--zone-color': ... }}`) e o `sx` a consome via `var(--zone-color)`. Sem isso o AC-1
      não é testável — `bgcolor` via `sx` vira classe Emotion e o Vitest roda com `css: false`, então
      a asserção passaria com `trainingStage` ainda pintando o bloco.
      `verify:` **AC-1** — cada bloco declara `--zone-color` inline igual a `workoutZone[zone]`, e
      nenhum valor de `activeTheme.trainingStage` aparece em propriedade de cor (inline ou no `sx`).
      Confirmação do `background` computado vai junto na task 3.4.
- [ ] **2.4** Rampas como trapézio via `polygon()`, cor da zona do ponto médio a 70%, cap acompanhando
      a hipotenusa; descendente espelhada (§4.4).
      `verify:` render de aquecimento e desaquecimento; `clip-path` computado bate com a fórmula.
- [ ] **2.5** Bracket de repetição na `bracketLane`: 1px, pernas de 4px, rótulo `{total}×`; só a
      primeira repetição do grupo recebe rótulo de bloco; grupo < 48px perde as pernas (§4.5).
      **Desambiguação (§4.5):** "apenas a primeira repetição recebe rótulo" = todos os blocos com
      `repeat.index === 1`. Num 5×(3' + 2'), os **dois** blocos da primeira repetição são rotulados
      (`LIM` e `REC`); os oito das repetições 2–5 ficam mudos.
      `verify:` **AC-5, parte estrutural (Vitest)** — existe exatamente um bracket `5×`, e o número de
      blocos rotulados é igual ao número de blocos com `repeat.index === 1`. A extensão em px do
      bracket é da task 3.4.
- [ ] **2.6** Eixo X com passo "bonito" por faixa de duração, tick final sempre igual à duração total,
      supressão do penúltimo em colisão; eixo Y com gridlines nos quatro `zoneBreaks` e rótulos Z1–Z5
      centrados na faixa (§4.6).
      `verify:` **AC-4** — 40min rende `0,5,…,40`; 47min tem `47` como último tick.
- [ ] **2.7** Cadeia de fallback de rótulo **medindo texto** (§4.7): `label` → `shortLabel` (≤5 chars,
      vindo do dado) → ícone do `kind` → nada. Reticências proibidas.
      `verify:` **AC-7, parte de conteúdo (Vitest)** — nenhum `…`/`...` em nó de texto de bloco.
      A ausência de `text-overflow: ellipsis` **não** é verificável aqui se a propriedade vier de
      `sx` (mesma limitação do AC-8) e vai para a task 3.4, junto com a **escolha** do elo da cadeia,
      que depende de medir texto: em jsdom toda medida é zero e o teste passaria com a cadeia invertida.
- [ ] **2.8** Header único (§4.8): título em display, badge `ALVO · Zn`, chips mono na ordem fixa
      (duração, blocos, tempo na zona-alvo, razão trabalho:recuperação como proporção inteira, IF, TSS),
      chip `⚠ n etapas sem duração` quando houver descartes, chip `⚠ intensidade estimada` quando `degraded`.
      Barra de distribuição empilhada de 4px derivada de `metrics.distribution`.
      **IF:** o chip é omitido quando `intensityFactor === null` — o que na tela de revisão é
      **sempre**, porque `TreinoPlanejadoDto` (`src/types/PlanoReview.ts:44-59`) não tem
      `intensidadePlanejada` (DEP-5). Nunca derivar IF da distribuição de zonas.
      `verify:` **AC-6** (badge = `metrics.targetZone`, distribuição soma 100%±0,5pp) e **AC-13**;
      mais um teste explícito de que o header da revisão renderiza TSS e **não** renderiza IF.
- [ ] **2.9** Estados: skeleton com geometria real e alturas `[0.3,0.7,0.35,0.7,0.35,0.4]` sem layout
      shift (§6.1); vazio com baseline e ação `onAddBlocks` (§6.2); parciais/ inválidos (§6.3).
      `verify:` os três renderizam com a mesma altura da variante final.
- [ ] **2.10** Interação: hover/tap muda **só opacidade** (ativo 100%, demais 55%), zero mudança
      geométrica; tooltip com detecção de colisão e o conteúdo fixo da §7.1; `Esc` fecha.
      `verify:` **AC-3, complemento (Vitest)** — o estilo do bloco não declara `transform`/`scaleY` e
      só a opacidade muda entre estado normal e ativo. Necessário, não suficiente:
      `scrollHeight === clientHeight` durante o hover é da task 3.4.
- [ ] **2.11** Teclado (§7.2): um único tab stop com roving focus; `←/→`, `Home/End`, `↑/↓` para a
      próxima zona diferente; anel de foco por `outline` (não `border`); `aria-live="polite"`.
      `verify:` teste de teclado percorre 12 blocos com um só tab stop.
- [ ] **2.12** Leitor de tela (§7.4): `role="img"` com `aria-label` gerado do mesmo `WorkoutProfile`,
      e `<table>` visualmente oculta com uma linha por bloco.
      `verify:` **AC-12** — a tabela tem exatamente `profile.blocks.length` linhas **e cada linha
      contém ordem, nome, duração, zona e alvo do bloco correspondente**. Contar linhas sozinho passa
      com uma tabela de N linhas vazias.
- [ ] **2.13** `prefers-reduced-motion` (sem pulso, sem transição) e `prefers-contrast: more`
      (contorno 2px, fill sólido) (§7.3).
      `verify:` teste com `matchMedia` mockado nas duas media queries.
- [ ] **2.14** **[opcional — só se sobrar escopo]** Corte de > 200 blocos (§6.5). Design §6 recomenda
      **não** construir o segundo renderizador SVG agregado agora; entregar apenas o aviso.
      `verify:` decidido junto com o revisor; sem tarefa pendente se descartado.

---

## Fase 3 — Troca de consumidores

> Dependência **resolvida**: `preservar-serie-estruturada-na-edicao` está em `develop` desde o
> PR #79 (`bdba29b`). As tasks abaixo estão escritas contra o código pós-merge.
- [ ] **3.1** `DetalheTreinoDialog.tsx`: trocar `toWorkoutBlocks` + `WorkoutTimelineChart` (`:213`, `:524`)
      por `fromEtapaTreino` + `selectWorkoutProfile` + `WorkoutProfile`. **Remover** o eyebrow
      "Timeline do treino" (`:520`), a prop `title` (`:525`) e os cards "Leitura rápida" (`:549`) e
      "Resumo estrutural" (`:576`). A linha `:310` ("Leitura rápida do contexto…") **fica** — está fora
      da região do perfil (proposal A3).
      `verify:` **AC-10** em Vitest (busca por texto, com o escopo do query explícito na região do
      perfil). **AC-8 vai para a task 3.4** — `text-transform` vem de classe Emotion e o Vitest roda
      com `css: false`, então a asserção não enxerga o estilo computado.
- [ ] **3.2** `TreinoEditDialog.tsx`: trocar o chart (`:719`) e **remover o `useMemo` `liveBlocks`
      inteiro** (`:380-442`) — é a segunda derivação independente de zona (`zoneFromString`,
      `blockTypeDe`), o D6 com outro nome. No lugar: `fromEtapaItens(itens)` → `selectWorkoutProfile`
      → `WorkoutProfile`, mantendo a atualização a cada edição. Passar `activeBlockId` sincronizado
      com a linha em edição (ids estáveis, design §2.1).
      Atenção: `blocoFromEtapa` não existe mais — foi removida no PR #79.
      `verify:` editar uma etapa destaca a barra correspondente, e o gráfico continua atualizando a
      cada tecla (teste de componente); `grep -n "zoneFromString\|blockTypeDe" TreinoEditDialog.tsx`
      retorna vazio.
- [ ] **3.3** Atualizar os testes dos dois diálogos. Espera-se quebra em asserções de rótulo de bloco
      (`'Esforço 1/3'`, `'3 min'`): a numeração de repetição migra para o bracket `5×` e para o tooltip
      (§10, "O que quebra"). Reescrever contra o bracket, não remover a asserção.
      `verify:` `npm run test:run` inteiro verde.
- [ ] **3.4** E2E do fluxo de revisão com o perfil novo (obrigatório pelo `CLAUDE.md` do front — decisão
      coach-in-the-loop): abrir a fila, abrir um treino, conferir badge/chips/bracket, editar e salvar.
      **Este é o único lugar onde os ACs de geometria são verificáveis** (§9.0 da spec) — os cinco
      abaixo são requisito de entrega desta task, não "nice to have":
      - **AC-2** — `intensityNormalized` 0.26 e 0.78 medem 46px e 137px (±1px) num plot `full` de 176px,
        com a razão a menos de 2% de 0.78/0.26.
      - **AC-3** — durante e depois do hover, `plot.scrollHeight === plot.clientHeight` e o
        `boundingBox()` do bloco é idêntico ao de antes.
      - **AC-5** — bloco de 30s num treino de 60min mede ≥ 3px num plot de 600px.
      - **AC-1, confirmação** — o `background` computado do bloco resolve para a cor da zona.
      - **AC-7** — com o `label` maior que a largura disponível, o texto exibido é exatamente
        `shortLabel` ou nada; e nenhum bloco tem `text-overflow: ellipsis` computado.
      - **AC-8** — exatamente um `text-transform: uppercase` computado e uma superfície com `border`
        na região do perfil.
      - **AC-11** — snapshot com `grayscale(1)` mantém a ordenação de altura e os rótulos Z1–Z5.
      `verify:` `npm run test:e2e` verde e o spec visita de fato a região do perfil — uma corrida
      verde que nunca chega ao perfil não é cobertura.

---

## Fase 4 — Remoção

- [ ] **4.1** Deletar `src/components/features/planos/WorkoutTimelineChart/` inteiro (4 arquivos).
      `verify:` `grep -rn "WorkoutTimelineChart\|toWorkoutBlocks" src` retorna vazio.
- [ ] **4.2** Remover a entrada em `src/index.md`.
      `verify:` `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

---

## Fase 5 — Fechamento

- [ ] **5.1** `/qa` — `frontend-reviewer` + `clean-code-reviewer` em paralelo; consolidar e tratar.
- [ ] **5.2** Avaliação qualitativa da v1 (decisão registrada no proposal, seção "Métrica de sucesso"):
      coletar o feedback do treinador após uma semana de uso sobre "dá para dizer que treino é esse
      sem ler texto?", e medir a **taxa de edição após aprovação** (`editadoPeloCoach` sobre treinos
      já aprovados) antes e depois — sai do banco, sem instrumentação nova.
      `verify:` as duas leituras registradas na change antes do arquivamento; a contra-métrica não piorou.
- [ ] **5.3** Registrar como follow-up: **DEP-1** (intensidade estruturada em `EtapaTreinoDto`) e
      **DEP-2** (limiares do atleta) como changes de backend; sem elas o modo degradado permanece o
      caminho normal. Abrir também a change de migração `zone` → `workoutZone` nos demais gráficos (§11).
