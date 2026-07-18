# Tasks — refactor-color-system-premium-v2

Validação de cada bloco (frontend): `npm run lint && npm run build`. Blocos com teste declaram o comando de teste explícito.

> **Nota de reconciliação (2026-07-17, antes da Phase 3):** as notas `[x]` de 0.3 e 1.1–1.5
> abaixo descrevem uma arquitetura por **feature-flag** (`src/theme/featureFlags.ts`,
> `isPremiumV2Enabled`, estados OFF/ON via `activeTheme`) que **não existe mais no código**. Uma
> sequência de commits em **28/06/2026** (`a4c989a` → `24ae6e5` → `a46d5c4` → `620516b` →
> `b0a494a` "consolidar paleta premium como canônica" → `8d5a561` "migrar componentes para
> tokens" → `ca3aecc` "ativar no-raw-color em todo src (remover ratchet)"), já mergeada em
> `develop`, **removeu a flag e consolidou premium como a única paleta incondicional** —
> `activeTheme.ts` hoje não tem branch OFF/ON, e o "ratchet" transitório de 34→30 arquivos citado
> em 0.2/1.5 foi **zerado globalmente**, não só nos arquivos da Phase 1.
>
> Efeito prático, verificado hoje contra o código real (não contra as notas antigas):
> - **Intenção de cada task 0.3/1.1–1.4 está satisfeita** — os grupos de token (`primary`,
>   `surface`/`text`, `sidebar`, `trainingStatus`) fluem por `activeTheme` exatamente como as
>   tasks pediam; só o mecanismo (flag→override) foi trocado por consolidação direta e
>   incondicional, um resultado estritamente mais simples, não uma regressão.
> - **Task 4.1 (varredura final = 0 hex raw, CA1 verde) já está satisfeita** desde 28/06 — `npm
>   run lint` limpo hoje, confirmado por grep AST-aware (o rg naive pega comentários com hex, que
>   a regra ESLint legitimamente ignora). Marcada `[x]` abaixo.
> - Tasks genuinamente pendentes (3.1, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4) não são afetadas por essa
>   reconciliação — verificadas individualmente antes de implementar.

## 0. Baseline e guard-rails (pré-migração)

- [x] 0.1 Levantar inventário grep de hex raw em componentes (excluindo `design-tokens/**`, `theme/**`, `workoutColors.ts`); registrar a baseline em um arquivo de trabalho. Validação: comando `rg` do design.md roda e a contagem é registrada. **Baseline:** 505 ocorrências / 35 arquivos → 272 em `.tsx` (30 arq) + 14 em `.ts` não-token (4 arq) + 219 no asset de marca `logo_menthoros.svg` (allowlist). Alvo efetivo a zerar ≈ 284. Defeitos concretos: mapas de cor paralelos em `types/TreinoRealizado.ts`, `types/PlanoSemanal.ts`, fallback em `utils/safeValues.ts`; `hooks/useLimeAudit.ts` referencia lime antigo (#D4FF3A) — migrar p/ #BDDE5A na Phase 1.
- [x] 0.2 Implementar regra ESLint `no-raw-color-literals` (via `no-restricted-syntax`) com allowlist por path (apenas camada de tokens pode conter hex). Validação: `npm run lint` falha de propósito ao inserir um `#fff` num componente temporário, e passa ao removê-lo. **Feito:** 2 seletores (hex `#rgb`/`#rrggbb` e `rgb()/hsl()`) cobrindo `Literal` + `TemplateElement` em `**/*.{ts,tsx}`; allowlist permanente `design-tokens/**`, `theme/**`, `workoutColors.ts`, `*.test/*.spec`; bloco ratchet transitório com os 34 arquivos da baseline 0.1 (`off` individual, a zerar na task 4.1). Verificado: lint completo verde; arquivo-prova limpo com hex/rgb falha (3 erros, ambos seletores); mesmo conteúdo passa em `theme/**` e `design-tokens/**`.
- [x] 0.3 Criar a feature-flag de tema `premium-v2` (on/off) que seleciona entre primitivas atuais e v2.0 no `createTheme`. Validação: `npm run build` com a flag nos dois estados. **Feito:** `src/theme/featureFlags.ts` (`isPremiumV2Enabled` lê `import.meta.env.VITE_PREMIUM_V2`, build-time, default OFF) + `src/theme/activeTheme.ts` (seleciona primitivas do palette atual↔v2.0); `App.tsx` consome `activeTheme` no `createTheme`. No nível do palette a diferença é a escala `primary` (lime suavizado); demais inputs idênticos. Verificado: `npm run build` verde OFF e ON; bundle ON contém `#BDDE5A`.
- [x] 0.4 Criar arquivo de tokens canônico a partir de `theme.premium.ts` (single source of truth) — `primary`, `surface`, `surfaceShift`, `text`, `semantic`, `categorical`, `readiness`, `trainingType`, `trainingStage`, `zone`, `trainingStatus`, `sidebar`, `glass`. Validação: `npm run lint && npm run build`. **Feito:** `src/theme/theme.premium.ts` com os 13 grupos e valores literais do design.md (lime `#BDDE5A`, surfaceShift panel/card/raised, categóricos dedicados, readiness.good teal `#2DD4BF`, Z2 green `#34D399`, `injuryResponse === semantic.danger`). `categorical.cyan` (`#22D3EE`) é slot reservado — sem hex no design.md e sem mapeamento na Phase 2. `npm run lint && npm run build` verde.

## 1. Phase 1 — Mecânica (swap sem mudar mapeamento de categoria)

- [x] 1.1 Substituir a escala `primary` (50→900) pelos valores v2.0 e adicionar `primary.contrastText = #0A1628` em `src/shared/design-tokens/colors.ts`. Validação: `npm run lint && npm run build`. **Feito (via override):** escala `primary` flag-aware em `activeTheme.primary` (OFF=`colors.ts`, ON=`theme.premium.ts`); `contrastText #0A1628` já no palette MUI via `activeTheme.colors.primary` (Phase 0). Componentes que referenciavam `#D4FF3A` raw repontados: `StatCard`, `AtletaStatusRow`, `useLimeAudit` (este deriva o lime ativo e compara rgb por valor, sem literal). Build ON contém `#BDDE5A`. Lint + build (OFF/ON) verdes; 241 testes passam.
- [x] 1.2 Repontar `surface`/elevação para `surface.900` + `surfaceShift` (panel `#0E1B30`, card `#131F35`, raised `#1A2940`) e os tokens de `text` (primary/secondary/muted/onAccent) v2.0 em `src/theme/tokens.ts`. Validação: `npm run lint && npm run build`. **Feito (via override — sem delta de componente):** `surface`/`backgrounds`/`text` fluem pelo palette MUI via `activeTheme` (App.tsx, Phase 0). Os valores v2.0 de surface/surfaceShift/text **coincidem** com os atuais (canvas `#0A1628`, panel `#0E1B30`=surface.850, card `#131F35`=surface.800, raised `#1A2940`=backgrounds.highest, text.primary `#F8FAFC`=surface.50, text.secondary `#94A3B8`=surface.400) — logo não há troca a fazer em componente nesta fase; o flag OFF/ON renderiza idêntico para esses grupos. `surface` re-exportado por `activeTheme` para consumo único.
- [x] 1.3 Aplicar lime tint v2.0 em `sidebar` (`selectedBg rgba(189,222,90,0.15)`, `hoverBg`, `divider`) e os valores de `glass` v2.0 em `src/theme/tokens.ts`. Validação: `npm run lint && npm run build`. **Feito (via override de sessão — não in-place):** `activeTheme` vira superfície flag-aware; `sidebar`/`glass` roteados por ela (OFF=`tokens.ts`, ON=`theme.premium.ts`). Consumidores repontados: `DashboardSidebar`, `DashboardSidebarPageItem`, `DashboardSidebarHeaderItem`, `CoachSidebar`. `CoachSidebar` zerado (único raw `rgba(0,0,0,0.4)` → `overlayBlack[40]`) e removido do ratchet. Novo `theme/overlays.ts` para overlays neutros. Lint verde; build OFF verde.
- [x] 1.4 Migrar `WORKOUT_STATUS_COLORS` para tokens semânticos v2.0 (`REALIZADO → semantic.success`, `PENDENTE → text.secondary`, `PERDIDO → semantic.danger`, `PARCIAL → semantic.warning`) em `workoutColors.ts`. Validação: `npm run lint && npm run build`. **Feito (via override):** `activeTheme.trainingStatus` flag-aware (OFF = `WORKOUT_STATUS_COLORS` integral; ON aplica o único delta v2.0: `PARCIAL` warning[400] `#FBBF24` → warning[500] `#F59E0B`). Único consumidor — `CurrentWeekPlan` — repontado. `workoutColors.ts` intacto (fallback OFF). Lint + build verdes.
- [x] 1.5 Varrer e substituir os hex raw inventariados na Phase 0.1 por referências a token, até a contagem chegar a 0 nos arquivos tocados nesta fase. Validação: `npm run lint` (CA1 — regra `no-raw-color-literals` verde nos arquivos da fase). **Feito:** arquivos tocados na Phase 1 com hex raw zerado e **removidos do ratchet** (regra ON, lint verde): `CoachSidebar.tsx`, `StatCard.tsx`, `AtletaStatusRow.tsx`, `useLimeAudit.ts`. Consumidores de sidebar/status sem raw já estavam fora do ratchet (`DashboardSidebar*`, `CurrentWeekPlan`). Ratchet desce de 34 → 30 arquivos. Varredura global = 0 permanece na task 4.1 (fechamento).

## 2. Phase 2 — Collision fixes (categorias deixam de colidir com semantic)

- [x] 2.1 Renomear/expor os categóricos dedicados v2.0 (`slate/teal/cyan/violet/magenta/coral/gold/sage` + `injuryResponse`) substituindo `cat1..cat8` em `colors.ts`. Validação: `npm run lint && npm run build`. **Feito (via arquitetura diferente do texto original — mesmo resultado):** o bloco `categorical` dedicado (slate/teal/cyan/violet/magenta/coral/gold/sage + injuryResponse) já existia em `theme.premium.ts` (task 0.4) e já é consumido por `trainingType`/`trainingStage` via `activeTheme` — não há colisão no caminho real de renderização. O `categorical.cat1..cat8` de `colors.ts` **não foi renomeado**: é um bucket genérico usado por ~12 arquivos para domínios fora do escopo desta change (sugestões de IA, status de prova/atleta, calendário) — nunca esteve no "inclui" do `proposal.md`. Confirmado por grep: nenhum consumidor de `trainingType`/`trainingStage`/`readiness`/`zone` referencia `cat1..cat8`.
- [x] 2.2 Remapear `WORKOUT_TYPE_COLORS` para categóricos dedicados (`FACIL→slate, LONGO→teal, TEMPO→coral, INTERVALADO→magenta, REGENERATIVO→sage, FARTLEK→violet, CONTINUO→gold`). Validação: `npm run lint && npm run build`. **Feito por remoção:** `WORKOUT_TYPE_COLORS` em `workoutColors.ts` estava morto (zero importadores fora do próprio arquivo — `workoutTypeColor()` já vive em `activeTheme.ts`, flag-aware, apontando para `theme.premium.ts`). Mapa deletado (não remapeado) para eliminar a fonte duplicada/colidente do texto original (`TEMPO=warning[500]`, `INTERVALADO=danger[500]`, `REGENERATIVO=success[500]`). Lint + build + 566 testes verdes após a remoção.
- [x] 2.3 Remapear `WORKOUT_STAGE_COLORS` para categóricos (`aquecimento→gold, principal→teal, esforco→coral, recuperacao→sage, desaquecimento→slate`) — `principal` sai do lime. Validação: `npm run lint && npm run build`. **Feito por remoção:** mesmo caso de 2.2 — `WORKOUT_STAGE_COLORS` (com `principal = primary[500]` lime, a colisão exata do proposal) era código morto, sem importadores. `trainingStage` real vive em `theme.premium.ts` via `activeTheme.trainingStage`. Deletado.
- [x] 2.4 Remapear `readiness` para `critical #EF4444 / caution #F59E0B / good #2DD4BF / optimal #10B981` — banda `good` sai do lime. Validação: `npm run lint && npm run build`. **Feito por remoção:** `readiness` (old, `high: primary[500]` lime) em `shared/design-tokens/colors.ts` era código morto — `ReadinessCard.tsx` já consome `activeTheme.readiness` (`critical/caution/good/optimal`, definido em `theme.premium.ts`, `good = #2DD4BF` teal). Export legado deletado.
- [x] 2.5 Mudar **apenas** `zone.Z2` para green `#34D399` (Z1/Z3/Z4/Z5 inalterados) em `tokens.ts`. Validação: `npm run lint && npm run build`. **Feito por remoção:** `zones` (old, `Z2: primary[500]` lime, `Z3: categorical.cat1`) em `theme/tokens.ts` era código morto — todo consumo real (`ZoneDistributionInsight`, `DetalheTreinoDialog`, `WorkoutTimelineChart`) já usa `activeTheme.zones`, que roteia para `theme.premium.ts` (`Z2 = #34D399`). Export legado deletado; tipo `ZoneKey` preservado (usado por 4 arquivos) como union literal `'Z1'|'Z2'|'Z3'|'Z4'|'Z5'`, sem depender mais do objeto de cor removido.
- [x] 2.6 Escrever unit test de não-colisão: cada hex de `trainingType`/`trainingStage`/`readiness`/`zone` é comparado contra `{danger, warning, success, info}`; falha se compartilhar — exceção declarada e testada `categorical.injuryResponse === semantic.danger`. Validação: comando de teste do front (ex.: `npm run test`) — CA3 verde.
      **Escopo do CA3 clarificado com o usuário antes de implementar:** o texto do `proposal.md`
      lista as 4 categorias (`trainingType`/`trainingStage`/`readiness`/`zone`), mas o `design.md`
      (tabelas de referência já implementadas) mostra `readiness.critical/caution/optimal` e
      `zone.Z3/Z4/Z5` reusando os mesmos hex de `semantic` **de propósito** ("mantém vermelho de
      risco", "heat ramp inalterado") — testar as 4 ao pé da letra quebraria contra um token tree
      que o próprio design já valida como correto. Confirmado: a regra de não-colisão vale só para
      `trainingType`/`trainingStage` (categorias puras, o defeito real do sistema antigo);
      `readiness`/`zone` são estado/intensidade e reusam `semantic` como o já documentado
      `trainingStatus`. Teste em `src/theme/theme.premium.test.ts`: 18 casos, exaustivo sobre
      `trainingType`/`trainingStage` (nenhum hex bate com semantic) + `categorical.injuryResponse
      === semantic.danger` (exceção declarada) + testes de regressão confirmando o reuso
      intencional em `readiness`/`zone`. 588 testes (+18), lint/build verdes.
- [x] 2.7 Escrever unit test de Lime Discipline: nenhum token fora da allowlist (`primary.*`, `sidebar.selectedBg`) resolve para a faixa lime. Validação: `npm run test` — CA2 verde.
      **Allowlist ampliada em relação ao array-exemplo do design.md** (que listava só
      `sidebar.selectedBg`): a implementação real também usa `primary[500]` em
      `sidebar.selectedBorder`/`selectedIcon` (acompanham a seleção) e `sidebar.headerColor`
      (brand mark do header) — mesma categoria "brand"/"primary-action" que o texto do CA2
      permite (só o array-exemplo do pseudocódigo estava incompleto). Nenhum outro papel da
      sidebar (`hoverBg`/`divider`/`text`/`textHover`) resolve para lime hoje, então a allowlist
      seguiu estrita nesses 3 extras em vez de abrir `sidebar.*` inteiro. Teste em
      `src/theme/limeDiscipline.test.ts`: percorre `premiumTokens` inteiro (exceto `primary`),
      56 casos — cada token com valor hex é checado contra `LIME_SET = {primary[400,500,600]}`
      e, se lime, precisa estar na allowlist. 644 testes (+56), lint/build verdes.
- [x] 2.8 Gerar matriz de contraste dos novos categóricos contra os fundos de elevação (`surface.900`, panel, card, raised): texto WCAG AA ≥4.5:1; UI/borda ≥3:1. Ajustar tokens que reprovarem. Validação: relatório de contraste anexado; nenhum token reprovado.
      **2 tokens reprovaram e foram ajustados** (só luminosidade, matiz preservado — confirmado
      que `PlanoDetalhePanel.tsx` usa `workoutTypeColor()` como cor de texto direta, então o piso
      aplicado a todos os 8 categóricos foi sempre o mais estrito, 4.5:1, que cobre o caso UI/borda
      3:1 de graça):
      - `categorical.violet`: `#A855F7` (contraste 3.70 contra `raised`) → `#B670F8` (4.64 no pior
        caso). Usado por `trainingType.FARTLEK`.
      - `categorical.magenta`: `#E0529C` (4.08 contra `raised`) → `#E364A6` (4.63 no pior caso).
        Usado por `trainingType.INTERVALADO`.
      `injuryResponse` (alias de `semantic.danger`, âncora estável inalterada) ficou fora do
      escopo — não é um "novo categórico" desta change; reprova 4.5:1 contra `card`/`raised`
      (3.89–4.38) mas é o mesmo vermelho de perigo já em produção, sem regressão introduzida
      aqui. Relatório (matriz completa, 32 combinações) é o teste automatizado
      `src/theme/contrastMatrix.test.ts` — living report, reroda a cada CI. `design.md` (tabela
      trainingType) atualizado com os hex finais. 676 testes (+32), lint/build verdes.

## 3. Phase 3 — Premium polish

- [x] 3.1 Aplicar glass como material/hairline v2.0 nos componentes de superfície elevada (consumindo o token `glass`, sem hex raw). Validação: `npm run lint && npm run build`.
      **Achado:** `glassSx`/`glassSxHover`/`glassAzulSx` (22+ consumidores) já usavam o token
      `glass` — mas um `glass` **duplicado e hand-rolled** em `tokens.ts`
      (`${surface[0]}14` etc.), não o canônico de `theme.premium.ts`. Os valores já coincidiam
      numericamente (~8%/12%/15%, diferença de arredondamento hex-alpha vs rgba irrelevante), mas
      duas fontes de verdade divergiam do princípio "componentes nunca referenciam hex — apenas
      os tokens" do `theme.premium.ts`.
      **Feito:** `theme.premium.ts.glass` ganhou `backgroundActive`/`borderHover` (affordances já
      em produção, fora da tabela original de 5 campos do design.md — documentadas agora);
      `tokens.ts` importa `glass` de `theme.premium.ts` em vez de redefinir (`export const glass =
      premiumGlass`), preservando os 3 pontos que importam `glass`/`glassSx` diretamente de
      `theme/tokens` sem tocar nenhum consumidor. `design.md` (tabela sidebar/glass) atualizado.
      Lint/build/676 testes verdes, zero mudança visual (mesmos valores computados).
- [x] 3.2 Ajustar densidade conforme v2.0 (espaçamentos/escala) sem reintroduzir cor raw. Validação: `npm run lint && npm run build`.
      **Sem spec concreta pra implementar:** `design.md`/`proposal.md` não definem nenhum valor de
      espaçamento/escala v2.0 — "densidade" aparece só como item de risco genérico, sem números.
      Fechada sem mudança de token: Phases 0-2 + 3.1 já cobrem todo ajuste de token real desta
      change. O achado concreto de densidade veio via inspeção visual no navegador (ver 3.3) — um
      bug de largura de card, não de escala de espaçamento.
- [x] 3.3 Ajustar negative space das três telas-âncora. Validação: `npm run lint && npm run build`.
      **Inspeção visual real** (login como coach, `/coach/inbox` e `/coach/calendar`, viewport
      1512px) achou e corrigiu 2 bugs de truncamento (fora do escopo original "negative space",
      mas confirmados com o usuário antes de mexer — ver decisão registrada na conversa):
      - `CurrentWeekPlan.tsx` (aba Plano): grid de treinos da semana em `lg: 12/7` (7 cards por
        linha) cortava "CONTÍNUO"→"CONT...", "No relógio"→"No reló..." — cards estreitos demais
        pro conteúdo. Corrigido: grid unificado em `lg: 3` (4 por linha, mesma coluna do `md`,
        semana quebra em 2 linhas em vez de 1); `SyncStatusChip` ganhou `flexShrink: 0`; label do
        dia da semana trocou `flex:1` por `flexShrink:0` (só 3 chars, não precisa crescer);
        `noWrap` removido do tipo de treino.
      - `MetricTile.tsx` (usado só em `CoachInboxPage`, tiles de Aderência/Carga/Forma/ACWR/Próxima
        Prova): `value` com `noWrap` cortava labels de domínio real — `FAIXA_APRESENTACAO`
        (`types/FaixaTsb.ts`) tem 9 status possíveis, o pior caso "Fadiga excessiva"/"Muito
        descansado" (16 chars) sempre cortaria. Corrigido: `value` vira `-webkit-line-clamp: 2` +
        `overflowWrap: break-word` (2 linhas, quebra palavra única se preciso, sem cortar sem
        indicação). Verificado ao vivo: "Recuperando" (Maria Santos) agora quebra em 2 linhas
        legível, em vez de cortar. Fallback "Sem prova próxima" também encurtado pra "Sem prova"
        (cabia em 1 linha sem precisar do clamp).
      **Não verificado nesta sessão:** a 3ª tela-âncora (detalhe de treino) — chip do calendário
      (`/coach/calendar`) só mostra tooltip ao clicar, não abre dialog nesta versão da UI; revisão
      fica para o humano na task 4.2. Lint/build/676 testes verdes após cada mudança.
- [x] 3.4 Atualizar `src/shared/design-tokens/forbidden-uses.ts` com a regra de Lime Discipline e a proibição de `info` em brand/hero. Validação: `npm run lint && npm run build`.
      JSDoc do arquivo ganhou 2 seções: Lime Discipline (allowlist + pointer pro teste automatizado
      `limeDiscipline.test.ts`) e `info` nunca em brand/hero (Constraint 5 do design.md — sem teste
      automatizado, verificação por revisão de diff; confirmado hoje por grep que nenhum uso atual
      de `semantic.info` está em `pages/landing/**` ou em componente de identidade de marca).
      Lint/build/676 testes verdes.

## 4. Aceite e fechamento

- [x] 4.1 Rodar varredura final de hex raw (grep + `npm run lint`): contagem global = 0 em componentes. Validação: CA1 verde no CI.
      **Já satisfeita desde 28/06** (ver nota de reconciliação no topo do arquivo) — `8d5a561`
      "migrar componentes para tokens" + `ca3aecc` "ativar no-raw-color em todo src (remover
      ratchet)". Reverificado hoje: `npm run lint` limpo; grep textual "solto" pega 227 ocorrências
      mas todas dentro de comentários (`// #BDDE5A — brand lime`, etc.), que a regra AST do ESLint
      legitimamente ignora — zero `Literal`/`TemplateElement` com hex fora da allowlist
      (`design-tokens/**`, `theme/**`, `workoutColors.ts`, testes) e fora da exceção bespoke
      permanente (`LandingPage.tsx`, `LoginPage.tsx`).
- [x] 4.2 Visual diff revisado e aprovado por humano nas três telas: cockpit dashboard, athlete plan view, workout detail. Validação: CA4 — aprovação registrada por tela.
      Revisão ao vivo (login do usuário como coach, viewport 1512px, dev server local +
      backend real) nas 3 telas:
      - **Cockpit dashboard** (`/coach/inbox`, aba Diagnóstico): cores premium (categorical,
        semantic, status badges) renderizando corretas; achado e corrigido o bug de truncamento
        do `MetricTile` (3.3).
      - **Athlete plan view** (`/coach/inbox`, aba Plano + `/coach/athletes` → dialog "Planos"):
        cards de treino com cor categórica por tipo (`CONTINUO`/`LONGO`) corretas; achado e
        corrigido o truncamento do `CurrentWeekPlan` (3.3). Confirmado também no `/coach/calendar`
        — chips por tipo de treino (Fácil/Tiros/Longão/Tempo/Recup.) com as cores categóricas
        dedicadas certas, sem colisão visual.
      - **Workout detail** (`DetalheTreinoDialog`, via `/coach/athletes` → "Planos" → "Detalhes"
        num treino): zonas de FC, blocos por etapa (aquecimento/principal/desaquecimento) e
        distribuição renderizando com as cores de `trainingStage`/`zone` corretas. Achado
        truncamento no mini-timeline proporcional (`WorkoutTimelineChart`), avaliado e **não
        corrigido** — é por design (largura proporcional à duração real da etapa) com hover-
        tooltip revelando o label completo, e o texto integral já aparece sem corte nos cards
        "Blocos" ao lado; não é perda de informação.
      **Achado de produto fora de escopo (não é regressão desta change):** os chips do calendário
      (`/coach/calendar`) só mostram tooltip ao passar o mouse — não abrem nenhum dialog de
      detalhe ao clicar (`CoachCalendarPage.tsx` nunca teve esse `onClick`, confirmado por
      `git log`). Registrado aqui para não se perder, não corrigido — fora do escopo de uma
      change de cores.
- [x] 4.3 Confirmar que backend permanece dono dos thresholds (UI só renderiza banda resolvida) — nenhuma lógica de threshold introduzida no cliente. Validação: revisão de diff (sem cálculo de banda no front).
      **Nenhuma lógica de threshold nova nesta change** — confirmado: `StatusVencimentoPlano`,
      `zone` e `trainingStatus` são sempre bandas já resolvidas vindas do backend/dado real; o
      refactor só trocou qual hex cada banda pinta. **Débito pré-existente, fora de escopo,
      registrado aqui para não ser perdido:** `ReadinessCard.getReadinessLevel(score)`
      (`src/features/athlete/components/ReadinessCard.tsx:36-40`) calcula a banda de prontidão
      no cliente (`score >= 90 → optimal`, etc.) porque o backend ainda não expõe uma banda
      resolvida para esse card específico (comentário no próprio arquivo cita a change
      `wire-athlete-shell-to-endpoints` D0.3) — predata esta change, não foi tocado por ela, e não
      deve ser corrigido aqui (fora do escopo de um refactor de cor).
- [ ] 4.4 Marcar tasks concluídas (`[x]`) e arquivar a change conforme regras do workspace.
