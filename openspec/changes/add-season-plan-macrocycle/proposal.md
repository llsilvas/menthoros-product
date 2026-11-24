**Tamanho:** L · **Trilha:** Full

> **Resolvido em 2026-11-15:** supersedida e arquivada sem implementação em
> `archive/2026-11/2026-11-15-add-macrociclo-structure/` (D1). O texto abaixo fica como histórico.
>
> **Relação com `add-macrociclo-structure` (backlog frio desde 2026-07-24).** Esta change cobre a
> mesma capability e **propõe supersedê-la** — decisão do founder (Gate 3, ver "Decisões
> pendentes" D1). A change anterior modela `Macrociclo` + `Mesociclo` com proporções fixas (BASE
> 40%, ESPECIFICO 30%, PICO 15%, TAPER 10%, TRANSICAO 5%) e para na herança de fase pelo plano
> semanal. Esta modela alvo **por semana** sobre o `PlanoTreino` existente, e acrescenta o que falta
> para a feature ser utilizável: template por assessoria, edição e versionamento pelo coach,
> validações, telas e replanejamento. O que preservo dela: a ancoragem temporal no prompt e o
> consumo de `RacePreparationRule`. **Enquanto as duas estiverem ativas, coexistem dois modelos de
> dados (`tb_macrociclo`/`Mesociclo` contra `PlanoTreino` + `SemanaPlanejada`) e três vocabulários
> de fase (`FaseMesociclo`, `TrainingPhase` e o desta change).** A decisão precisa sair antes do
> `/implement init`; se for supersedir, `add-macrociclo-structure` recebe nota de supersessão e é
> arquivada sem implementação. Se o founder preferir mantê-la, esta vira um complemento e o modelo
> de dados precisa ser reconciliado antes de qualquer implementação.
>
> **Relação com `add-taper-guidance` (0/29).** Aquela change prevê `TaperService`, `tb_periodo_taper`
> e redução fixa 60/75/90% — uma terceira fonte de taper, ao lado da `TaperStrategy` existente
> (curva exponencial, teto de 65%), que é a que esta change consome. As duas não podem ser
> implementadas como estão; ver D2.

## Why

Assessorias vendem "o planejamento até a prova", mas o Menthoros gera planos semanais isolados: `PlanoTreino` existe como entidade de longo prazo e está praticamente sem uso (nenhuma fase, nenhum alvo por semana, sem repositório próprio), e o `PeriodizationPlanner` deriva a fase apenas da contagem de dias até a prova, com cortes fixos. Sem o mapa macro, a geração semanal é reativa ao passado recente, o coach não tem onde ver planejado contra executado no horizonte da prova, e o delta de decisão do coach só é capturado no nível da semana.

Esta change introduz o plano de temporada (macrociclo) como camada determinística: o coach aprova fases, alvo de volume, longão e marcos até a prova, e esse mapa passa a ser insumo e restrição da geração semanal. PRD: `menthoros-product/prd/prd-plano-temporada.md`.

## What Changes

- Evolui `PlanoTreino` como raiz do macro: `totalSemanas`, `versao`, `macrocicloStatus`, `motivoVersao`, `ctlInicial`, `volumePicoKm`, `longaoMaximoKm`, `preparacaoCurta`, `aprovadoPor`, `aprovadoEm`
- **Remapeia `PlanoTreino` para comportar o macro** — hoje ele não comporta:
  - `@OneToOne prova` vira `@ManyToOne` (várias versões e propostas por prova);
  - `tenant_id` (NOT NULL desde a V45) passa a ser mapeado na entidade;
  - `nome`, `descricao` e `objetivo` (NOT NULL na V1) recebem valor derivado da prova na geração;
  - o `status` existente (`PlanoStatus`, default `'ATIVO'`) convive com `macrocicloStatus` com regra explícita (ver design D1);
  - cria `PlanoTreinoRepository`, que não existe.
- **Troca as FKs em cascata que apagariam o macro.** Hoje `tb_plano_treino.prova_id` e `tb_plano_semanal.plano_treino_id` são `ON DELETE CASCADE` (V1) e `ProvaServiceImpl` faz hard delete da prova: apagar uma prova-alvo apagaria o macro e todos os planos semanais aprovados. As FKs passam a `RESTRICT`/`SET NULL` e a exclusão ou o cancelamento de prova com macro ganha regra própria.
- Adiciona entidade `SemanaPlanejada` (`tb_semana_planejada`): uma linha por semana do ciclo com `ordem`, `semanaInicio`, `fase` (`TrainingPhase`), `volumeAlvoKm`, `longaoKm`, `tssAlvo`, `descarga`, `sessoesChave`, `origemValor` (MOTOR | COACH | IA_ACEITA)
- Adiciona entidade `TemplateMetodologia` (`tb_template_metodologia`): template por assessoria com distribuição de fases, curva de volume, frequência de descarga e long run máximo; um default global
- Adiciona `MacrocicloPlannerService` (determinístico) que gera a proposta a partir de prova-alvo + template + baseline do atleta, reusando `RacePreparationRule` e `TaperStrategy`
- Adiciona `MacrocicloValidator` com validações brandas (rampa semanal, longão como fração do volume, cadência de descarga, janela de taper)
- Adiciona `MacrocicloVersionService`: rascunho, diff, aprovação versionada e arquivamento da versão anterior
- Estende `PlanGenerationContext` e o `PlannerInputSnapshot` (montado em `PlannerShadowService.mapToSnapshot`) com `SemanaPlanejadaSnapshot`; `PeriodizationPlanner` passa a ler a fase do macro, abaixo de lesão e pós-prova (fallback: regra atual); `LoadTargetResolver` passa a receber o alvo planejado, e o `PlannerEngine` não reaplica taper nem step-back sobre ele
- Estende o `SkeletonComplianceChecker`: o volume reaproveita `TSS_FORA_DA_FAIXA` com a faixa centrada no alvo do macro; o longão ganha checagem em km, o que exige distância no `GeneratedSessionSnapshot`; `LONGO_ACIMA_TETO` é suspenso quando o longão segue o previsto pelo macro
- **Estende** o `PeriodizacaoPromptFormatter` existente: com macro ativo, o bloco de posição no ciclo ("semana N de M, fase, alvo, próximo marco") **substitui** a fase legada e o "TSS Alvo Semanal" calculado como `ctlAlvo * 7` — não é acrescentado ao lado deles
- Vincula `PlanoSemanal` à semana do macro (`semana_planejada_id`, `desvio_alvo_percentual`)
- Adiciona `ReplanejamentoTriggerService`: gatilhos por desvio acumulado, lesão e mudança de prova, produzindo `SugestaoCoach` de macro com um valor novo em `TipoSugestao`; o gatilho por prova-teste depende de `add-running-field-tests`
- Adiciona endpoints de leitura, rascunho, validação e aprovação do macro, restritos a `TECNICO`/`ADMIN`, e um endpoint do atleta que só enxerga macro `ATIVO`
- Frontend: seção Temporada no perfil do atleta, tela de ajuste e bloco "Minha temporada" no app do atleta

## Capabilities

### New Capabilities

- `season-plan-macrocycle`: Modelo, geração determinística, validações, versionamento e aprovação do plano de temporada; API de leitura e edição
- `season-plan-weekly-integration`: Consumo do macro na geração do plano semanal (contexto, skeleton, prompt, compliance, alvo de carga) e gatilhos de replanejamento
- `season-plan-ui`: Telas de temporada do coach, ajuste do plano e visão do atleta

### Modified Capabilities

Cada uma tem delta em `specs/<capability>/spec.md` desta change, para o arquivamento atualizar a canônica:

- `plan-progression`: o alvo semanal passa a partir do macro quando há macro ativo; a progressão reativa continua como entrada, não como fonte do alvo
- `prova-preparacao-minima`: a tabela de semanas mínimas passa a ser consumida também pelo gerador do macro (decisão de Gate 3 sobre 8/10/12/16 vs 8/10/14/18)
- `coach-suggestion-decision-audit`: ganha o tipo de sugestão de macro, com o delta no nível da temporada

## Impact

- **Novas tabelas:** `tb_semana_planejada`, `tb_template_metodologia`; colunas novas em `tb_plano_treino` e `tb_plano_semanal`; troca de FKs em `tb_plano_treino` e `tb_plano_semanal`; índice único parcial de macro `ATIVO` por atleta. Migrations a partir de V116 (develop termina em V115 em 2026-11-12; revalidar a numeração no PR — `add-pain-attention-signal` também vai criar migration)
- **Risco de perda de dados:** sem a troca das FKs, apagar uma prova-alvo apaga em cascata o macro e os planos semanais aprovados. A troca é pré-requisito da fatia 1, não melhoria posterior
- **Pacotes afetados:** `domain/planner/`, `domain/compliance/`, `domain/macrociclo/` (novo), `entity/`, `repository/`, `services/`, `services/helper/`, `services/prompt/`, `controller/`, `dto/`, `enums/`
- **Sem breaking change:** atleta sem macro ativo segue o caminho atual em todos os pontos de integração
- **Dependência de rollout:** as fatias 4 e 5 só têm efeito vinculante com `planner-engine.enabled=true`; hoje o default é `false`. A métrica de divergência de fase da fatia 4 depende de `planner-engine.shadow`, que também tem default `false` — sem ligá-lo no tenant do Design Partner, a fatia 4 não produz dado
- **Dependências entre changes:**
  - `migrate-plan-prompt-to-skills` (tasks 5.1 e 5.3) planeja aposentar o `PeriodizacaoPromptFormatter` numa skill. Se ela entrar antes, o bloco de posição no ciclo é implementado na skill; se entrar depois, ela herda o bloco. A ordem precisa ser combinada antes da fatia 4
  - `add-running-field-tests`: fonte do resultado de prova-teste; sem ela, o gatilho por prova-teste fica fora da fatia 6
  - `redesign-coach-athlete-profile`: redesenha o perfil do atleta (header, abas Visão geral · Financeiro · Histórico). A entrada "Temporada" precisa ser encaixada no layout que estiver em `develop` quando a fatia 2 começar
  - `add-taper-guidance` e `add-macrociclo-structure`: ver notas no topo
- **Impacto em testes:** novos testes de `MacrocicloPlannerService`, `MacrocicloValidator` e compliance; os testes de `PlannerEngine` e `LoadTargetResolver` ganham casos com e sem macro
- **Sem mudança** no gate de aprovação do plano semanal, na `RevisaoSemanal` congelada (ADR-0006 do backend, `apps/menthoros-backend/docs/adr/0006-revisao-semanal-persistida-congelada-fidelidade-ao-moat.md` — não confundir com a ADR-0006 do produto, que trata de prompts) e nas invariantes de segurança

## Critérios de aceite

- **Dado** um atleta sem macro e uma prova-alvo cadastrada a 20 semanas, **quando** o coach gera a
  proposta, **então** o sistema cria um `PlanoTreino` em `PROPOSTA` com 20 `SemanaPlanejada`, cada
  uma com fase, `volumeAlvoKm`, `tssAlvo`, `longaoKm` e `descarga`, e `origemValor = MOTOR`.
- **Dado** o mesmo atleta, template e baseline, **quando** a geração roda duas vezes, **então** as
  duas execuções produzem valores idênticos em todas as semanas.
- **Dado** um macro em `PROPOSTA`, **quando** o atleta consulta a própria temporada, **então** a
  resposta indica que não há plano disponível.
- **Dado** um rascunho de versão 2, **quando** o coach aprova sem informar motivo, **então** a
  resposta é 422 e nenhuma versão é criada.
- **Dado** um macro aprovado na semana 7 de 18, **quando** uma nova versão é aprovada, **então** as
  semanas 1 a 6 ficam idênticas às da versão anterior.
- **Dado** uma prova-alvo com macro e planos semanais vinculados, **quando** alguém tenta excluí-la,
  **então** nenhum `PlanoTreino`, `SemanaPlanejada` ou `PlanoSemanal` é apagado.
- **Dado** um atleta com macro ativo cuja semana planejada pede 620 TSS e teto de rampa de 540,
  **quando** o plano semanal é gerado, **então** o alvo resolvido é 540, o skeleton registra o
  desvio com o motivo, e nenhuma `SemanaPlanejada` é alterada.
- **Dado** um atleta com macro ativo numa semana de taper, **quando** o plano semanal é gerado,
  **então** o alvo resolvido é o `tssAlvo` da semana, sem segunda redução da `TaperStrategy`.
- **Dado** um atleta com macro ativo, **quando** a progressão reativa indicaria aumento sobre o alvo
  do macro, **então** o alvo resolvido permanece no valor do macro.
- **Dado** um atleta que realizou 40% do volume da semana anterior, **quando** a semana seguinte é
  gerada, **então** o alvo continua sendo o do macro, sem acréscimo compensatório.
- **Dado** `planner-engine.enabled = true` e volume gerado fora da banda do alvo, **quando** o plano
  é persistido, **então** ele nasce com revisão obrigatória e a violação registrada, sem 422.
- **Dado** um atleta **sem** macro ativo, **quando** o plano semanal é gerado, **então** o resultado
  é idêntico ao comportamento atual (teste de regressão).
- **Dado** três semanas consecutivas abaixo do alvo acumulando desvio acima do limite, **quando** a
  semana é encerrada, **então** uma proposta de replanejamento é criada com as semanas futuras
  recalculadas e as passadas preservadas.
- **Dado** uma única semana abaixo do alvo dentro do limite, **quando** a semana é encerrada,
  **então** nenhuma proposta é criada.

## Métrica de sucesso

**Primária:** queda relativa de **≥ 20%** na taxa de `consumedReviewOutcome = ADJUSTED` dos planos
semanais de atletas com macro ativo, comparada à dos mesmos coaches antes do macro — o coach edita
menos porque o alvo da semana já reflete a intenção que ele aprovou uma vez por ciclo.

**Secundárias:**

- Adoção: ≥ 70% dos atletas com prova-alvo com macro aprovado no Design Partner.
- Taxa de aceite das propostas de replanejamento ≥ 50% (abaixo disso, o gatilho está ruidoso).
- % de macros aprovados com ao menos uma edição do coach — acompanhamento, não alvo: edição alta
  indica template ruim, edição zero indica que o coach não está revisando.

## Decisões resolvidas (grilling de 2026-11-15)

Todas seguem a recomendação registrada. Onde o texto acima ainda descreve a alternativa, vale esta seção.

| # | Decisão | Resultado |
|---|---|---|
| D1 | `add-macrociclo-structure` | **Supersedida.** Recebe nota de supersessão e é arquivada sem implementação (task 0.2) |
| D2 | `add-taper-guidance` | **Obsoleta.** O taper vive nas semanas da temporada, via `TaperStrategy`; a orientação ao atleta vira change pequena depois |
| D3 | Quem gera | **Manual**, pelo treinador. Sem hook no `ProvaService` |
| D4 | Fatia 6 (replanejamento) | **Sai desta change** e vira a change própria S10. O limite de desvio do gatilho é decidido lá |
| Q4 | Semanas mínimas | **8/10/12/16** (`RacePreparationRule`). Fonte única para prova e temporada |
| Q6 | Vocabulário | "Plano de temporada" e "Semana da temporada" no produto e na UI (já no `CONTEXT.md`). `PlanoTreino` e `SemanaPlanejada` ficam só no código |
| Q7 | Template editável | **Só o default global** na primeira entrega. `tb_template_metodologia` nasce com `assessoria_id` nulo para o default; edição pela assessoria é change posterior |
| Q8 | Modo planilha completa | **Fora do MVP.** Entra se a demanda aparecer no piloto |
| Q9 | Atleta em calibração | **Espera a graduação.** A ação "Gerar temporada" fica desabilitada com o motivo visível; a proposta nasce quando o atleta gradua. Substitui "marcar como estimado em calibração" (task 2.6) e os estados de calibração do atleta (8.5, 8.6) |
| Q10 | Ordem | **Backend primeiro**; a aba no perfil espera `redesign-coach-athlete-profile` chegar em `develop`. A change é quebrada em changes filhas (abaixo), cada uma fechando cenários testáveis |

Premissa 0.4: `tb_plano_treino` tem 0 linhas e `tb_plano_semanal.plano_treino_id` 0 vínculos no banco do
homelab (dev/testes, conferido em 2026-11-15). **Produção (Railway, `main`) não foi conferida** — rodar a
mesma contagem antes de aplicar a V116 em `main`.

Aberto por causa de Q9: o critério de "graduação" da calibração precisa ser lido do código (de onde o
backend tira o estado de calibração do atleta) antes da S2; a mensagem da ação desabilitada depende dele.

## Tickets (changes filhas)

Esta change é o **épico**: guarda proposal, design e decisões. O trabalho é feito por 10 changes filhas
`add-season-plan-*`, cada uma um **ticket vertical** (banco, motor, API, UI e testes no mesmo PR),
verificável sozinho, com `proposal.md` e `tasks.md` próprios. As tasks das seções 1 a 10 deste
`tasks.md` estão distribuídas nos `tasks.md` das filhas, com a referência "(épico N.M)".

Substitui o primeiro fatiamento S1–S10 (horizontal, por camada), refeito pelo `/to-tickets` em
2026-11-15. **Divergência registrada:** `docs/agents/issue-tracker.md` manda os tickets do `to-tickets`
virarem blocos no `tasks.md` da mesma change; aqui cada ticket é uma change própria, a pedido do founder
(changes menores, um PR revisável por ticket).

| # | Change | Bloqueado por | Entrega | Status |
|---|---|---|---|---|
| 1 | `add-season-plan-model-integrity` | — | Prefactor: excluir a prova-alvo responde 422 e não apaga temporada nem planos; cancelar arquiva; um `ATIVO` por atleta | ready-for-agent |
| 2 | `add-season-plan-generate-tracer` | 1 | **Tracer:** treinador gera a temporada (motor mínimo) e a vê na aba; 403, isolamento, flag | ready-for-agent |
| 3 | `add-season-plan-complete-proposal` | 2 | Taper, longão, descargas, marcos, preparação curta e validações na aba | ready-for-agent |
| 4 | `add-season-plan-calibration-gate` | 2 | Atleta em calibração: 422 e ação desabilitada com o motivo | ready-for-agent |
| 5 | `add-season-plan-approve-athlete-view` | 2 | Treinador aprova; atleta vê "Minha temporada"; proposta invisível ao atleta | ready-for-agent |
| 6 | `add-season-plan-adjust-v2` | 5 | Ajuste com travas, motivo obrigatório, passado imutável; tela e e2e | ready-for-agent |
| 7 | `add-season-plan-version-diff` | 6 | Diff com origem, recálculo que preserva edições, conflito de versão | ready-for-agent |
| 8 | `add-season-plan-weekly-context` | 5 | Temporada no prompt do plano semanal; regressão sem temporada; shadow | ready-for-agent |
| 9 | `add-season-plan-load-enforcement` | 8 | Temporada como teto da carga; compliance; ADR | ready-for-agent |
| 10 | `add-season-plan-replanning` | 9 + 1 ciclo no piloto | Proposta de replanejamento | ready-for-human (limite de desvio em aberto) |

**Fronteira hoje:** ticket 1. Depois do 2, os tickets 3, 4 e 5 andam em paralelo; depois do 5, o 6 e o 8
andam em paralelo.

Fechamento transversal (seção 10): 10.1 e 10.2 em cada ticket; 10.3 e 10.5 no último entregue; 10.4 no
ticket 9; 10.6 ao ligar o ticket 8 no piloto.

**Risco:** o ticket 2 põe a aba no perfil do atleta, e `redesign-coach-athlete-profile` está em 0/49 com 3
decisões abertas. Se o redesenho não estiver em `develop`, a aba entra como seção no layout atual.

## Decisões pendentes — resolvidas (histórico, antes do `/implement init`)

**D1. Supersedir `add-macrociclo-structure`?**
- (a) Supersedir: esta change segue; a anterior recebe nota e é arquivada sem implementação.
- (b) Reconciliar: manter `Macrociclo`/`Mesociclo` e encaixar `SemanaPlanejada` embaixo.
- **Recomendação: (a).** A anterior está em 0/36 tasks e não tem alvo por semana, edição nem telas;
  reconciliar custa um segundo modelo de plano de longo prazo sem ganho de produto.

**D2. O que fazer com `add-taper-guidance`?**
- (a) Esta change a torna obsoleta: o taper passa a viver nas semanas do macro (via `TaperStrategy`)
  e o que ela tem de útil (orientação ao atleta) vira change pequena depois.
- (b) Implementá-la antes, e esta change consome o `TaperService` em vez da `TaperStrategy`.
- **Recomendação: (a).** Três fontes de taper é o problema; a `TaperStrategy` já está em produção no
  `PlannerEngine` e é a que o macro reusa.

**D3. Geração automática no cadastro da prova-alvo, ou manual pelo coach?**
- O PRD (:209) e a versão anterior desta spec diziam "ao cadastrar prova-alvo gera"; a API (task 4.1)
  e a UI ("ação de gerar plano") já eram manuais, e não havia task de hook no `ProvaService`.
- O atleta também cadastra prova (`atleta-cadastra-prova`): geração automática criaria proposta a
  partir de dado não revisado pelo coach.
- (a) Manual: o coach aciona a geração; a aba mostra a ação quando há prova-alvo sem macro.
- (b) Automática quando o **coach** marca a prova como alvo; nunca a partir de prova do atleta.
- **Recomendação: (a)** no MVP. É o que a API e a UI já descrevem, não exige hook no `ProvaService`
  e não gera propostas órfãs. As specs abaixo estão escritas assim; (b) entra depois se a adoção
  pedir.

**D4. Fatia 6 no MVP?** O PRD (:253) põe a fatia 6 (replanejamento) em "experimentar depois", com
50% de confiança. Esta change a mantém, atrás de `macrociclo.replanejamento.enabled=false`.
**Recomendação:** manter as tasks, mas a fatia 6 só entra no Design Partner depois de a fatia 5
rodar um ciclo; se o founder seguir o PRD, a seção 6 de `tasks.md` sai para uma change própria.

**D5. Temporada sem prova-alvo? (2026-11-22)**
- No épico, toda temporada é ancorada em uma prova: `PlanoTreino.prova` é obrigatória e a duração vem da
  data da prova. Atleta sem prova fica com o plano semanal atual e vê o estado vazio na aba.
- (a) Fora do MVP: o épico segue só com temporada de prova; o ciclo sem prova vira change posterior.
- (b) Dentro do épico: `prova` opcional e template por objetivo já nos tickets 1 a 3.
- **Decisão do founder: (a).** O atleta pode ter temporada sem prova, como ciclo de desenvolvimento
  (objetivo, duração curta, fases BASE e BUILD, teste opcional no fim), mas em
  `add-season-plan-development-cycle`, depois dos tickets 2, 3 e 5. (b) reabriria o modelo e a migration
  do ticket 1 sem evidência de adoção.

## Open Questions & Assumptions

**Premissas assumidas:**

- O coach aceita aprovar a estrutura uma vez por ciclo em vez de redecidir volume e longão toda
  semana. **Hipótese**, não validada — é o que o Design Partner testa.
- A objeção comercial contra a planilha é real e recorrente; base: comparação com Ion Periodization
  e Runy (`knowledge/marketing/runy-concorrente.md`).
- `RacePreparationRule` é a fonte vigente de semanas mínimas, e não a tabela do roadmap do backend.
- As fatias 1 a 3 entregam valor com o enforcement do `PlannerEngine` desligado.
- Não há linhas relevantes em `tb_plano_treino` em produção (entidade pouco usada). **Conferir antes
  da migration de FKs**; se houver, a migration precisa preservá-las.

**Em aberto (Gate 3), além de D1–D4:**

1. Evoluir `PlanoTreino` com `tb_semana_planejada`, ou criar entidade nova como previa a Feature 6
   do roadmap do backend?
2. Semanas mínimas: 8/10/12/16 (`RacePreparationRule`) ou 8/10/14/18 (roadmap)?
3. Modo planilha completa (todas as sessões como rascunho) entra no MVP?
4. Atleta em calibração: gerar macro com volume relativo, ou esperar a graduação?
5. Template de metodologia editável pela assessoria na fatia 1, ou só o default global?
6. Limite de desvio acumulado que inicia o gatilho de replanejamento: quanto, e medido por volume
   ou por aderência?
