# PRD — Plano de temporada (macrociclo)

Change-id: add-season-plan-macrocycle
Owner: Product / CPO (draft)
Status: Aprovado no Gate 3 (2026-11-15) — em implementação (tickets 1–3 de 10 arquivados)
Tamanho estimado: L
Persona: coach (primário), atleta (secundário)

## 0. Estado real (2026-11-20)

O Gate 3 foi fechado na sessão de 2026-11-15 e o épico `add-season-plan-macrocycle` foi fatiado em
10 tickets verticais (as seis fatias do §5 continuam valendo como desenho; a execução segue os
tickets).

| Ticket | Change | Estado |
|---|---|---|
| 1 | `add-season-plan-model-integrity` | Arquivada 2026-11-16 (backend #239, V116/V117) |
| 2 | `add-season-plan-generate-tracer` | Arquivada 2026-11-18 (backend #245, front #226, V118) |
| 3 | `add-season-plan-complete-proposal` | Arquivada 2026-11-19 (backend #250, front #227) |
| 4 | `add-season-plan-calibration-gate` | A fazer — 0/6 |
| 5 | `add-season-plan-approve-athlete-view` | Em andamento desde 2026-11-20 |
| 6 | `add-season-plan-adjust-v2` | A fazer — 0/14 |
| 7 | `add-season-plan-version-diff` | A fazer — 0/9 |
| 8 | `add-season-plan-weekly-context` | A fazer — 0/10 |
| 9 | `add-season-plan-load-enforcement` | A fazer — 0/12 |
| 10 | `add-season-plan-replanning` | A fazer — 0/9 (limite de desvio aguarda o founder) |

**O coach ainda não vê nada disso em produção:** os tickets 1–3 estão em `develop`, atrás de
`season-plan.enabled` (`SEASON_PLAN_ENABLED`, default `false`). Faltam a promoção a `main` e ligar
a flag.

**Relação com o North Star** (`knowledge/product/north-star.md`, métrica ratificada em
2026-11-20): a hipótese (b) do §3 — queda da taxa de modificação do plano semanal — é a aposta
deste épico nos minutos de revisão por atleta. Ela só começa a ser testada no ticket 8.

**Terminologia:** onde este documento diz "Design Partner Program", leia-se turma fundadora.

## 1. Problema

Assessorias de corrida vendem "o planejamento até a prova": o aluno que vai correr uma
maratona recebe, no primeiro dia, a estrutura das 16 a 24 semanas seguintes. O Menthoros
hoje gera planos semanais isolados, sem estrutura longitudinal — o `PlanoTreino` existe como
entidade mas não carrega fases nem alvos por semana, e o `PeriodizationPlanner` deriva a fase
apenas da contagem de dias até a prova.

Três consequências:

- **Comercial:** na conversa de venda o coach compara o Menthoros com a planilha que já mostra
  tudo até a prova, e o produto parece oferecer menos.
- **Qualidade:** sem saber se está na semana 2 de 20 ou na 18 de 20, a geração semanal é
  reativa ao passado recente e a periodização pode derivar ao longo do ciclo.
- **Decisão:** o coach não tem onde ver planejado contra executado no horizonte da prova, que
  é a pergunta "o atleta está no caminho?".

## 2. Persona

Coach de assessoria de corrida, conforme `knowledge/product/personas.md`. O atleta é
secundário e consome o plano em modo leitura.

Perguntas operacionais atendidas (`knowledge/product/north-star.md`): "o que devo fazer a
seguir?" e "o que deve chegar ao atleta depois que eu aprovar?".

## 3. Hipótese

Se o coach puder aprovar uma estrutura de temporada que passa a restringir a geração semanal,
então (a) a objeção de venda contra a planilha cai, (b) a taxa de modificação do plano semanal
diminui, porque o alvo da semana já reflete a intenção dele, e (c) o delta entre a proposta do
motor e o plano aprovado passa a ser capturado também no nível da temporada, o que alimenta o
moat descrito em `knowledge/product/coach-in-the-loop-principle.md`.

Rótulo: **hipótese** — não há dado de produto ainda; a validação é o Design Partner Program.

## 4. Objetivo de negócio

- Remover a objeção "a planilha mostra o plano inteiro" no funil de aquisição de assessorias.
- Reduzir o tempo do coach por atleta por semana, por aprovar a intenção uma vez por ciclo em
  vez de redecidir volume e longão a cada semana.
- Criar o segundo nível de sinal de aprendizado (temporada, além da semana).

## 5. MVP

Seis fatias, nesta ordem. A fatia 1 não altera nada que roda hoje; o risco começa na 4.

| Fatia | Entrega | Risco |
|---|---|---|
| 1 | Modelo (`PlanoTreino` + semanas-alvo), geração determinística, endpoint de leitura | Nenhum — aditivo |
| 2 | Tela de temporada do coach (leitura) | Nenhum |
| 3 | Tela de ajuste: edição, validações, versionamento e aprovação | Nenhum no fluxo atual |
| 4 | Macro no `PlanningContext`, no skeleton e no prompt, com métrica de divergência | Altera o plano gerado |
| 5 | `LoadTargetResolver` consumindo o alvo planejado | Altera a carga semanal |
| 6 | Gatilhos de replanejamento a partir da `RevisaoSemanal` e de mudanças na prova | Altera a fila do coach |

Tela do atleta entra na fatia 2 como leitura do mapa, sem sessões futuras.

## 6. Fora do escopo

- Triatlo e multiesporte — escopo atual é corrida (`knowledge/company/strategic-constraints.md`).
- Edição do macro por linguagem natural (`@Tool`) — fica para change posterior; ver §15.
- Calibração automática do template da assessoria a partir do delta acumulado — o dado passa a
  ser capturado aqui, mas o aprendizado é outra change.
- Compartilhamento ou exportação do plano de temporada em PDF.
- Mudança no gate de aprovação do plano semanal e na `RevisaoSemanal` congelada (ADR-0006).

## 7. Fluxo principal

**Criação.** O coach cadastra a prova-alvo com data e meta → o motor determinístico gera a
proposta a partir do template de metodologia (fases, alvo semanal, longão, descargas, marcos) →
as validações rodam e os alertas aparecem → o coach ajusta → o coach aprova e o plano fica
ativo → o atleta passa a ver o mapa.

**Semana a semana.** O carregamento do contexto busca a semana do macro → o alvo é reconciliado
com o executado, sob as proteções de segurança → o skeleton restringe fase, volume, longão e
sessões-chave → o LLM compõe as sessões dentro do alvo → o compliance valida → o plano nasce
com o vínculo à semana do macro e o desvio registrado → o coach revisa como hoje.

**Replanejamento.** O fechamento da semana compara executado com o alvo do macro → um gatilho
gera proposta de nova versão → o coach aceita, edita ou rejeita → as semanas futuras são
recalculadas; as passadas não mudam.

## 8. Regras de negócio

1. **Precedência:** segurança (lesão, TSB, rampa de CTL, cold-start) vence o macro; o macro
   vence a progressão reativa. Quando a segurança corta, a semana fica abaixo do alvo e o macro
   não é reescrito automaticamente.
2. **O macro é teto, não piso.** Nenhuma regra força volume para cumprir o plano.
3. **Semana perdida não é compensada.** O volume que faltou não é somado à semana seguinte.
4. **Um macro ativo por atleta.** Criar outro arquiva o anterior.
5. **O macro nasce como proposta.** Fica visível ao atleta só depois da aprovação do coach —
   princípio 3 de `knowledge/product/product-principles.md`.
6. **Horizonte de detalhe:** as sessões são geradas para a semana seguinte, e opcionalmente
   para a subsequente como rascunho. As demais semanas guardam só o alvo.
7. **Edição do coach no plano semanal não altera o macro.** O delta é registrado; uma sequência
   na mesma direção vira sugestão de ajuste do macro.
8. **Atleta em calibração:** o macro fornece fase e sessões-chave, mas o volume segue o regime
   de cold-start até a graduação (ADR-0012 do backend).
9. **Versionamento:** cada aprovação cria uma versão com motivo. As semanas já executadas são
   imutáveis entre versões.
10. **Validações são alertas, não bloqueios** — exceto as invariantes de segurança que já falham
    fechado hoje (422).

## 9. Estados da interface

Mockups navegáveis no canvas de design: `Menthoros — Plano de temporada (maratona)`
(https://claude.ai/artifact/1McoN3RKSesXMvYz7EXfK7). Três artboards: coach (temporada),
coach (ajuste), atleta (mobile). Tokens de `menthoros-front` via design system Menthoros.

### 9.1 Coach — aba Temporada (perfil do atleta)

Entra como quarta aba do perfil do atleta, ao lado de Visão geral, Semana atual e Provas.

**Composição, de cima para baixo:**

| Bloco | Conteúdo | Observação |
|---|---|---|
| Cabeçalho | Prova-alvo, distância, data, meta, chip de status com versão | Ações: Histórico de versões, Ajustar plano |
| Faixa de KPIs | Semana atual de N, dias até a prova, volume de pico, longão máximo, aderência acumulada | `MetricTile` existente; números em JetBrains Mono |
| Mapa da temporada | Faixa de fases sobre N colunas de volume semanal, com marcos, descargas e semana atual | Barra por semana: preenchida = realizado, contorno sólido = planejado, contorno tracejado = previsto |
| Próximas semanas | Tabela das 5 semanas seguintes: semana, fase, volume alvo, longão, sessões-chave, nível de detalhe | Link "Ver as N semanas" |
| Coluna lateral | Proposta de ajuste da IA (quando houver), marcos, validações do plano | Card da IA usa `ai-highlight-bg` + `ai-highlight-border` |

**Estados:**

- **Sem prova-alvo:** o mapa é substituído por estado vazio com CTA "Cadastrar prova-alvo".
- **Prova-alvo sem macro:** estado vazio com CTA "Gerar plano de temporada" e, se a preparação
  for curta, o alerta de `RacePreparationRule.preparacaoCurta`.
- **Macro em proposta (não aprovado):** o mapa aparece com faixa de aviso "Rascunho, não visível
  ao atleta" e as ações Revisar e Aprovar.
- **Atleta em calibração:** as colunas de volume aparecem em faixa, não em valor pontual, com
  nota "volume ainda em calibração".
- **Proposta de replanejamento pendente:** o card da IA aparece no topo da coluna lateral com
  evidência e as ações Aceitar, Editar e Rejeitar.
- **Carregando:** skeleton das barras e das linhas da tabela, sem spinner central.
- **Erro:** o card do mapa mostra a falha e a ação Tentar de novo; os KPIs continuam.

**Cores:** fases usam a paleta categórica (slate, teal, coral, sage) e o lime fica reservado
para prova, semana atual e bloco de IA — a disciplina do lime do design system.

### 9.2 Coach — Ajustar plano de temporada

Tela cheia, acessada pela ação Ajustar plano. Edita um rascunho; a versão ativa continua
valendo até a aprovação.

| Bloco | Conteúdo |
|---|---|
| Cabeçalho | Chip "Rascunho · versão N", contagem de alterações, ações Descartar, Salvar rascunho e Aprovar |
| Parâmetros | Metodologia (template), data da prova, meta, volume de pico, longão máximo, treinos por semana, frequência de descarga, botão Recalcular semanas futuras |
| Fases | Stepper de semanas por fase (mais/menos) e prévia da curva de volume com as semanas alteradas em destaque |
| Semanas | Tabela editável: volume, longão, sessões-chave, descarga, marco. Campo alterado fica marcado e exibe o valor anterior |
| Alterações | Diff da versão anterior para a atual, com a origem de cada mudança (proposta da IA aceita ou edição do coach) e o efeito nos totais |
| Validações | Recalculadas sobre o rascunho a cada edição |
| Motivo | Texto livre que fica no histórico de versões |

**Estados:**

- **Semanas travadas:** concluídas, em andamento e a semana da prova são somente leitura, com
  nota do motivo na célula da semana.
- **Recálculo:** preserva semanas passadas e valores editados à mão; a tela avisa quais linhas
  serão regeneradas antes de confirmar.
- **Edição que viola validação branda:** a linha ganha marcador de atenção e o card de
  validações atualiza; a aprovação segue permitida.
- **Edição que viola invariante de segurança:** o campo é rejeitado em linha, com o limite.
- **Soma de fases diferente do total de semanas:** o cabeçalho do bloco Fases mostra a
  diferença e a aprovação fica bloqueada até zerar.
- **Aprovando:** confirmação que informa quantas semanas já detalhadas serão regeradas.
- **Conflito de versão:** se outra sessão aprovou enquanto o rascunho estava aberto, a tela
  oferece recarregar e reaplicar as alterações.

### 9.3 Atleta — Minha temporada (mobile)

Leitura. Mostra a estrutura, não as sessões futuras.

- Prova-alvo com contagem de dias.
- Fase atual com barra segmentada das fases e "semana N de M".
- Volume por semana: realizado, semana atual em destaque, futuro em cinza.
- Resumo da semana: alvo, feito, longão, e CTA "Ver treinos da semana".
- Próximos marcos com a explicação do efeito (ex.: "seus ritmos são recalculados depois").
- Nota fixa: as semanas futuras são previsão e o treinador ajusta conforme a evolução.

**Estados:** sem macro aprovado, o bloco inteiro não aparece (nem placeholder); durante a
calibração, o volume futuro aparece como faixa.

## 10. Histórias de usuário

1. Como coach, cadastro a prova-alvo e recebo uma proposta de temporada já com fases, volumes e
   longões, para não montar a planilha à mão.
2. Como coach, ajusto a duração das fases e os alvos das semanas antes de aprovar, para o plano
   refletir a minha metodologia.
3. Como coach, vejo planejado contra executado no horizonte da prova, para saber se o atleta
   está no caminho.
4. Como coach, recebo proposta de replanejamento com evidência quando o atleta desvia, para
   decidir em vez de recalcular.
5. Como coach, aprovo a estrutura uma vez e recebo os planos semanais já dentro do alvo, para
   revisar menos.
6. Como atleta, vejo o mapa até a minha prova, para entender onde estou no ciclo.

## 11. Critérios de aceite

- [ ] Cadastrar prova-alvo gera proposta de macro com fases, alvo semanal, longão e descargas.
- [ ] A proposta não é visível ao atleta antes da aprovação do coach.
- [ ] Editar fases e alvos recalcula as validações sem recalcular as semanas passadas.
- [ ] Aprovar cria versão com motivo e arquiva a anterior; semanas executadas não mudam.
- [ ] Plano semanal gerado com macro ativo nasce vinculado à semana do macro e com o desvio
      registrado.
- [ ] Carga semanal acima do alvo do macro só ocorre por replanejamento aprovado.
- [ ] Quando a segurança corta a carga, a semana fica abaixo do alvo e o macro não muda.
- [ ] Semana perdida não é compensada na seguinte.
- [ ] Fechamento de semana com desvio acima do limite gera proposta de replanejamento.
- [ ] As três telas atendem contraste 4.5:1 e alvos de toque de 44px.

## 12. Métricas de sucesso

| Métrica | Como medir | Alvo inicial |
|---|---|---|
| Adoção | % de atletas com prova-alvo que têm macro aprovado | ≥ 70% no Design Partner |
| Edição antes de aprovar | % de macros aprovados com ao menos uma edição do coach | Acompanhar; alta edição indica template ruim |
| Taxa de modificação do plano semanal | `consumedReviewOutcome = ADJUSTED` antes e depois do macro | Queda relativa ≥ 20% |
| Aderência ao alvo | Desvio médio entre volume realizado e alvo do macro | Acompanhar, sem alvo na fase 1 |
| Replanejamento | Propostas aceitas / propostas geradas | ≥ 50%; abaixo disso o gatilho está ruidoso |
| Objeção de venda | Menção à planilha nas conversas de aquisição | Qualitativo, nas calls quinzenais |

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Macro rígido faz o coach desligar a feature | Validações brandas com banda de tolerância; o macro nunca bloqueia a geração |
| Gatilho de replanejamento ruidoso | Limite por desvio acumulado, não por semana isolada; medir taxa de aceite |
| Depende do enforcement do `PlannerEngine`, hoje em shadow | Fatias 1 a 3 entregam valor com o macro apenas informativo |
| Divergência de semanas mínimas entre código (8/10/12/16) e roadmap (8/10/14/18) | Decisão explícita no Gate 3; a tabela escolhida vira fonte única |
| Macro em TSS não comunica ao coach, que lê km | O macro guarda km e TSS; a UI mostra km |
| Expectativa de "planilha completa" não atendida pelo horizonte de detalhe | Modo opcional de gerar todas as sessões como rascunho regenerável |
| Duas entidades de plano longo (`PlanoTreino` e um novo `Macrociclo`) | Evoluir `PlanoTreino`; não criar entidade paralela |
| Sobreposição com `add-macrociclo-structure` | Proposta explícita de supersessão no `proposal.md` da change; decisão no Gate 3 |

## 14. Score de ROI

`ROI = impacto (1–5) × confiança (0–100%) ÷ esforço (1–5)`

| Item | Impacto | Confiança | Esforço | ROI | Bucket |
|---|---|---|---|---|---|
| Fatias 1–3 (modelo, motor, telas) | 5 | 80% | 3 | 1,33 | Fazer agora |
| Fatias 4–5 (macro restringindo a geração) | 4 | 60% | 3 | 0,80 | Fazer em seguida |
| Fatia 6 (replanejamento automático) | 3 | 50% | 3 | 0,50 | Experimentar depois |
| Proposta nova (§14.1) | 4 | 55% | 1 | 2,20 | Fazer agora |

**Evidência por trás da confiança:**

- 80% nas fatias 1–3: a objeção comercial é observada na comparação com Ion Periodization e
  Runy (`knowledge/marketing/runy-concorrente.md`), e a entrega é aditiva, sem risco técnico.
- 60% nas fatias 4–5: depende do rollout do enforcement do `PlannerEngine`, que hoje está
  desligado por padrão; a métrica de divergência em shadow ainda não foi coletada.
- 50% na fatia 6: não há dado sobre quantas propostas o coach aceitaria; o risco é ruído.
- 55% na proposta nova: o mecanismo reusa dado que as fatias 1–3 já produzem, mas o efeito em
  retenção do atleta é hipótese.

### 14.1 Proposta nova — Marco do atleta como evento de engajamento

**O que é.** Os marcos do macro (prova-teste, meia de teste, maratona) já estarão no banco por
causa das fatias 1 a 3. A proposta é transformar cada marco em um evento no app do atleta: aviso
alguns dias antes, e depois do marco um card com o resultado contra a projeção e a frase "seus
ritmos foram atualizados" — com o recálculo de zonas que o backend já faz.

**Por que.** O B2B2C do Menthoros depende de retenção dos dois lados, e hoje o atleta só tem
motivo para abrir o app quando tem treino. Um marco é a única data do ciclo em que o atleta já
está emocionalmente envolvido. O custo é baixo porque o dado, a projeção (`RaceProjectionSkill`)
e o recálculo de zonas já existem.

**Esforço.** 1 (XS): uma notificação agendada e um card na tela do atleta, sobre dado existente.

**Risco.** Marco cancelado ou prova não realizada gera notificação órfã; precisa de gate pelo
status da prova.

**Gate.** Draft. Não entra no roadmap sem decisão do founder.

## 15. Próximos passos

**Gate 3 — decisões que precisam do founder antes da change:**

1. **Supersedir `add-macrociclo-structure`** (backlog frio desde 2026-07-24, 0% das tarefas) ou
   reconciliar os dois modelos. A change anterior usa `Macrociclo` + `Mesociclo` com proporções
   fixas e para na herança de fase; esta usa alvo por semana e cobre edição, versionamento, telas e
   replanejamento.
2. Evoluir `PlanoTreino` em vez de criar `tb_macrociclo` (a Feature 6 do roadmap do backend
   propõe entidade nova).
3. Tabela de semanas mínimas: manter 8/10/12/16 do `RacePreparationRule` ou adotar 8/10/14/18
   do roadmap.
4. O macro nasce como proposta e não como ativo, contra a geração automática descrita na
   Feature 6.
5. Posição no `SPRINTS.md` e relação com o rollout do enforcement do `PlannerEngine`.
6. Aprovar ou arquivar a proposta nova de §14.1.

**Resultado do Gate 3 (2026-11-15):**

| # | Decisão | Resultado |
|---|---|---|
| 1 | Supersedir `add-macrociclo-structure` | **Sim** — arquivada sem implementação em 2026-11-15, junto com `add-taper-guidance` |
| 2 | Evoluir `PlanoTreino` em vez de `tb_macrociclo` | **Sim** — V116 adicionou as colunas de temporada em `tb_plano_treino`; V117 criou `tb_season_week` |
| 3 | Tabela de semanas mínimas | **8/10/12/16** (`RacePreparationRule`) |
| 4 | Macro nasce como proposta | **Sim** — geração manual pelo coach, visível ao atleta só depois da aprovação |
| 5 | Posição no `SPRINTS.md` | **Em aberto** — o épico não tem linha de sprint; replanejamento virou change própria (ticket 10) |
| 6 | Proposta nova de §14.1 (marco como evento de engajamento) | **Em aberto** — sem registro de decisão |

**Depois do gate:** a change já está escrita como rascunho em
`openspec/changes/add-season-plan-macrocycle/` (proposal, design, tasks e três specs). Falta apenas
a decisão de promoção e a posição no `SPRINTS.md`.

---

Last reviewed: 2026-11-20
