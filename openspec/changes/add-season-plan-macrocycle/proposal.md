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

## Fatiamento em changes filhas

Esta change vira o **épico**: guarda proposal, design e as decisões. Cada fatia abaixo é uma change
própria (`add-season-plan-*`), com um `proposal.md` curto que aponta para cá, e é entregável e
revertível sozinha. As tasks das seções 1 a 10 do `tasks.md` são distribuídas conforme a coluna
"Tasks". Cada fatia só fecha quando seus cenários passam como teste.

| Fatia | Change | Repo · Tam. · Trilha | Tasks | Cenários que fecham (testes) | Depende de | Flag |
|---|---|---|---|---|---|---|
| S1 | `add-season-plan-model-integrity` | backend · M · Full | 1.1–1.3a, 1.3c, 1.4, 1.6 (repo de semana), 1.7, 1.8, 1.11, 1.11a, 1.11b, 1.12 | Excluir prova com macro e planos semanais aprovados não apaga nenhuma linha. Segundo macro `ATIVO` do mesmo atleta é recusado pelo banco. Migrations aplicam em banco limpo e em banco com dados. Cancelar a prova-alvo arquiva o macro e preserva semanas | D1 (nota de supersessão) | nenhuma: a troca das FKs é correção de integridade |
| S2 | `add-season-plan-generator` | backend · M · Full | 1.3b, 1.5, 1.6 (repo de template), 1.9, 2.1–2.12 | Mesma entrada produz as mesmas semanas, sempre. 20 semanas de prova geram 20 semanas com fase, `volumeAlvoKm`, `tssAlvo`, `longaoKm` e `descarga`. Janela menor que o mínimo comprime as fases e marca `preparacaoCurta`. Taper aplicado uma vez só. Atleta em calibração é recusado com motivo. Cada regra do `MacrocicloValidator` tem um caso que dispara e um que não | S1 · `TaperStrategy` · `RacePreparationRule` | nenhuma (domínio puro, sem endpoint) |
| S3 | `add-season-plan-api-read-generate` | backend · S · Full | 4.1–4.3, 4.11, 4.12, 4.12a, 4.12b, 4.13, 4.14 | Treinador gera a proposta da prova-alvo e ela nasce `PROPOSTA`. Atleta com macro só em `PROPOSTA` recebe "sem plano". `ATLETA` recebe 403 nos endpoints do treinador. Tenant A não lê macro do tenant B. Calibração responde 422 com o motivo | S2 | `macrociclo.enabled=false` |
| S4 | `add-season-plan-versioning-approval` | backend · M · Full | 3.1–3.10, 4.4–4.10, 4.14 | Aprovar a v2 sem motivo responde 422 e não cria versão. Na v2 aprovada na semana 7 de 18, as semanas 1 a 6 ficam idênticas. Soma de fases diferente do total responde 422. Semana concluída, em andamento e a da prova são somente leitura. Diff mostra campo e origem. Conflito de versão é tratado | S3 | `macrociclo.enabled` |
| S5 | `add-season-plan-coach-view` | front · M · Full | 7.1–7.5, 7.7, 7.12, 7.13, 7.15, parte de 9 | Estados da aba: sem prova-alvo, prova sem macro, proposta, calibração (ação desabilitada com o motivo), carregando e erro. Mapa de fases, KPIs, tabela de semanas e marcos renderizam do endpoint | S3 · `redesign-coach-athlete-profile` em `develop` | `macrociclo.enabled` |
| S6 | `add-season-plan-coach-adjust` | front · M · Full | 7.8–7.11, 7.14, 7.15, parte de 9 | Gerar, ajustar, aprovar e ver na aba Temporada (e2e). Campo alterado mostra o valor anterior. Aprovação bloqueada por soma de fases. Conflito de versão tratado. Travas de semana | S4 · S5 | `macrociclo.enabled` |
| S7 | `add-season-plan-athlete-view` | front · S · Fast | 8.1–8.4, 8.7, parte de 9 | Bloco "Minha temporada" some sem macro `ATIVO`. Mostra prova-alvo, dias, fase e próximos marcos, com a nota de previsão. Sem estado de calibração: sem macro, não há bloco | S3 | `macrociclo.enabled` |
| S8 | `add-season-plan-weekly-context` | backend · M · Full | 1.10, 5.1–5.5, 5.10, 5.10a, 5.12, 5.16, 5.17 | Com macro, o prompt tem o bloco de posição no ciclo e não tem o "TSS Alvo Semanal" nem a fase legados. Sem macro, o prompt é idêntico ao atual (regressão). `PlanoSemanal` guarda `semanaPlanejadaId` e `desvioAlvoPercentual`. Métrica de divergência de fase só conta com `planner-engine.shadow=true` | S4 (0.3 resolvida: bloco no `PeriodizacaoPromptFormatter`) | `macrociclo.enabled`; ligar o shadow no tenant do piloto |
| S9 | `add-season-plan-load-enforcement` | backend · M · Full | 5.6–5.9, 5.11, 5.11a, 5.11b, 5.13–5.15, 10.4 | Semana pede 620 TSS e o teto é 540: resolve 540, o skeleton registra o motivo e a semana da temporada não muda. Taper com macro resolve o `tssAlvo`, sem segunda redução. Progressão reativa não passa do alvo. Semana perdida não é compensada. Lesão e pós-prova vencem o macro. Longão divergente marca revisão; volume fora da banda nasce com revisão obrigatória, sem 422. Enforcement desligado não muda nada | S8 · `planner-engine.enabled` | `macrociclo.enforcement.enabled` |
| S10 | `add-season-plan-replanning` | backend + front · M · Full | 6.0–6.9, 7.6 | Três semanas abaixo do alvo, acumulando desvio acima do limite, geram a proposta e preservam o passado. Uma semana isolada dentro do limite não gera nada. Mudança de data da prova gera a proposta. Rejeição é registrada. **O limite e a medida do desvio (volume ou aderência) são decididos no grilling dessa change** | S9 rodando um ciclo no piloto | `macrociclo.replanejamento.enabled` |

Fechamento transversal (seção 10), distribuído: 10.1 e 10.2 em cada fatia; 10.3 e 10.5 na última fatia
entregue; 10.4 (ADR "macro como teto, não piso" e precedência segurança > macro > progressão) na S9; 10.6
(rollout por tenant) ao ligar a S8 no piloto.

**Caminho crítico:** S1 → S2 → S3 → S4 → S8 → S9. Em paralelo, depois da S3: S5 (assim que o redesenho do
perfil estiver em `develop`) e S7. S6 depois de S4 e S5. S10 só depois de a S9 rodar um ciclo.

**Valor por fatia:** o treinador só vê algo a partir da S5, mas as fatias 1 a 4 já deixam o modelo, o
gerador e a aprovação testados por API. As fatias 1 a 7 entregam valor com o enforcement do `PlannerEngine`
desligado; as fatias 8 e 9 é que fazem a temporada guiar a geração semanal.

**Risco do fatiamento:** a S5 depende de uma change (`redesign-coach-athlete-profile`) que está em 0/49 com
3 decisões abertas. Se ela atrasar, a S5 entra no layout de seções que existe hoje (task 7.1 já prevê isso),
e a reorganização em abas fica por conta do redesenho.

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
