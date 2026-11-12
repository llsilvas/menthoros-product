## Context

O backend tem hoje duas camadas relevantes e desconectadas no horizonte longo:

- **`PlanoTreino`** (`tb_plano_treino`): entidade de plano de longo prazo com `atleta`, `prova` (`@OneToOne`, obrigatória), `provaAlvo` (opcional), `nome`, `descricao`, `dataInicio`, `objetivo` (os quatro NOT NULL desde a V1), `status` (`PlanoStatus`, default `'ATIVO'`) e a lista de `PlanoSemanal` (`cascade = ALL`, `orphanRemoval = true`). É referenciada como opcional em `PlanoSemanal` e não carrega fases nem alvos por semana. Lacunas que o macro precisa resolver: não há `PlanoTreinoRepository`; `tenant_id` é NOT NULL na tabela (V45) mas não está mapeado na entidade; e as FKs `prova_id` (V1:115) e `tb_plano_semanal.plano_treino_id` (V1:142) são `ON DELETE CASCADE`, com hard delete de prova em `ProvaServiceImpl` (:267).
- **`PlannerEngine`** (`domain/planner/`): motor determinístico já maduro — `PeriodizationPlanner` (fase), `LoadTargetResolver` (alvo semanal), `TaperStrategy` (curva de redução por distância), `SessionCompositionResolver`, `SessionDayAllocator`, `InjuryPolicyResolver`, `InjuryRiskEvaluator`, `ConstraintValidator`. Roda com `planner-engine.shadow` e, no enforcement, com `planner-engine.enabled` (default `false`) e `fail-open=true`.

Peças que já resolvem parte do macro e devem ser reusadas:

- `RacePreparationRule`: semanas mínimas por distância (5K→8, 10K→10, 21K→12, 42K→16), faixa para distância customizada, `inicioPreparacao`, `preparacaoCurta`. O javadoc já declara "reutilizável pelo macrociclo".
- `TaperStrategy`: janela de taper por distância (≤10,5 km → 7 dias; ≤21,5 → 14; acima → 21) e curva exponencial contínua com teto de 65%. Hoje é aplicada pelo `PlannerEngine` (`aplicarTaperSeAplicavel`) depois do `LoadTargetResolver`. A change ativa `add-taper-guidance` propõe uma terceira fonte de taper (`TaperService`, 60/75/90%); ver proposal D2.
- `TrainingPhase` (`domain/planner/`): BASE, BUILD, CALIBRATION, PEAK, TAPER, RACE_WEEK, RECOVERY, RETURN_TO_TRAINING, POST_RACE. É o vocabulário que o skeleton, o `LoadTargetResolver` e o `SkeletonComplianceChecker` ramificam.
- `SkeletonComplianceChecker`: já tem `TSS_FORA_DA_FAIXA` (soft, revisão) e `LONGO_ACIMA_TETO` (longão acima de 40% do TSS). `GeneratedSessionSnapshot` carrega `data`, `tipoTreino`, `tssPlanejado` e `intensidadeZona` — sem distância.
- `PeriodizacaoPromptFormatter` (`services/prompt/`): já existe e emite a fase por semanas faltando e o "TSS Alvo Semanal" (`ctlAlvo * 7`, :298) que o `PlanoTreinoPromptBuilder` imprime (:397). A change ativa `migrate-plan-prompt-to-skills` planeja aposentá-lo numa skill (tasks 5.1 e 5.3).
- `Prova`: `semanasPreparacao`, `inicioPreparacao`, `tempoObjetivo`, `paceObjetivo`, `tsbIdealProva`, `revisadaPeloCoach`, `motivoRevisao`.
- `RaceProjectionSkill`: `CTLForecast`, `LoadProjection`, `PeriodizationAdjuster`, `RiegelCalculator`.
- `openspec/changes/add-macrociclo-structure/`: change anterior da mesma capability, em backlog frio desde 2026-07-24 (0% das tarefas, sem commit desde 2026-09-02). Modela `Macrociclo` + `Mesociclo` com proporções fixas por fase e para na herança de fase pelo plano semanal — sem alvo por semana, sem template por assessoria, sem edição, versionamento, telas ou replanejamento. O `proposal.md` desta change propõe supersedê-la; a decisão é do founder.
- `docs/arquitetura/roadmap-features-produto.md` §Feature 6 (repo backend): desenho anterior do macrociclo, com entidade `Macrociclo` nova e geração automática — esta change diverge dele em dois pontos (Decisões 1 e 3).

Restrição de arquitetura que governa tudo abaixo: a periodização, o cálculo de carga e os gates de segurança não vivem no prompt (camada determinística primeiro, LLM depois).

## Goals / Non-Goals

**Goals:**

- Dar ao `PlanoTreino` fases e alvos por semana, versionados e aprovados pelo coach
- Gerar a proposta de macro de forma determinística e reprodutível, a partir de template de metodologia
- Tornar o macro insumo e restrição branda da geração semanal, sem tocar nas invariantes de segurança
- Capturar o delta entre a proposta do motor e o macro aprovado, como segundo nível do moat
- Manter o caminho atual intacto para atleta sem macro ativo

**Non-Goals:**

- Edição do macro por linguagem natural (`@Tool`) — change posterior
- Calibração automática do template a partir do delta acumulado — o dado é capturado aqui, o aprendizado não
- Geração do macro por LLM — o motor calcula; o LLM só redige narrativa e justificativa
- Multiesporte
- Mudar o gate de revisão do plano semanal, a `RevisaoSemanal` congelada ou o ledger

## Decisions

### 1. Evoluir `PlanoTreino` em vez de criar `tb_macrociclo`

**Decisão:** o macro é o `PlanoTreino` com campos novos, mais a tabela filha `tb_semana_planejada`. A entidade `Macrociclo` da Feature 6 não é criada.

**Rationale:** criar `Macrociclo` deixaria dois conceitos de plano de longo prazo no mesmo domínio, sendo que `PlanoSemanal` já aponta para `PlanoTreino` e o `CONTEXT.md` já alerta sobre a ambiguidade entre "Plano Semanal" e "Plano de Treino". Reaproveitar a raiz existente mantém um conceito só e aproveita o vínculo já presente.

**O que "estender" exige — a entidade não comporta o macro como está:**

- `prova` passa de `@OneToOne` a `@ManyToOne`: uma prova-alvo tem várias versões (uma `ATIVO`, as demais `ARQUIVADO`) e pode ter propostas paralelas.
- `tenant_id` passa a ser mapeado; todas as consultas do macro filtram por ele.
- `nome`, `descricao` e `objetivo` são preenchidos na geração a partir da prova (nome e distância, meta), sem afrouxar o NOT NULL.
- `status` (`PlanoStatus`) e `macrocicloStatus` convivem: `macrocicloStatus` é o estado do macro (PROPOSTA, ATIVO, ARQUIVADO, CONCLUIDO) e é nulo em `PlanoTreino` legado sem semanas; `status` fica como está para o legado e não é lido pelo código do macro. Unificar os dois é refatoração posterior.
- Cria `PlanoTreinoRepository`.
- Unicidade de `ATIVO` por atleta garantida no banco por índice único parcial (`WHERE macrociclo_status = 'ATIVO'`), não só no serviço.

**Proteção contra perda de dados.** Com as FKs atuais, excluir uma prova-alvo apaga em cascata o macro, as semanas planejadas e todos os planos semanais já aprovados — o histórico que a feature existe para preservar. A migration troca `tb_plano_treino.prova_id` para `ON DELETE RESTRICT` e `tb_plano_semanal.plano_treino_id` para `ON DELETE SET NULL`; `tb_semana_planejada.plano_treino_id` nasce com `CASCADE` (a semana não existe sem o macro, e o macro deixa de ser apagado por cascata). Na aplicação:

- excluir prova com macro em qualquer status é recusado com 422, com mensagem orientando a cancelar;
- cancelar ou trocar a prova-alvo arquiva o macro `ATIVO` (`ARQUIVADO`, `motivoVersao` = "prova cancelada"), descarta propostas e preserva semanas e planos semanais;
- o `orphanRemoval` de `planoSemanalList` sai, porque remover o vínculo não pode apagar plano semanal aprovado.

**Alternativa rejeitada:** entidade nova com `PlanoTreino` em descontinuação — custo de migração e de linguagem sem ganho, dado que `PlanoTreino` está pouco usado e pode ser estendido.

---

### 2. `SemanaPlanejada` como tabela filha, não cálculo em tempo de leitura

**Decisão:** uma linha por semana do ciclo, materializada na geração.

**Rationale:** o coach edita semana a semana, e cada valor precisa guardar sua origem (`MOTOR`, `COACH`, `IA_ACEITA`) para o diff entre versões e para o aprendizado. Um cálculo em tempo de leitura perderia a edição manual e o diff. Também permite ao `PlanoSemanal` apontar para a semana exata que consumiu.

**Alternativa rejeitada:** guardar só os parâmetros e recalcular — impossível preservar edição pontual.

---

### 3. O macro nasce como proposta, não como ativo

**Decisão:** o coach aciona a geração (`POST .../macrociclo`) para uma prova-alvo, e o macro nasce em `PROPOSTA`. Ele vira `ATIVO` apenas por ação explícita do coach, e só então fica visível ao atleta. Não há geração automática no cadastro da prova no MVP (proposal D3): o atleta também cadastra prova, e um hook no `ProvaService` geraria propostas a partir de dado que nenhum coach revisou.

A invisibilidade ao atleta é garantida por papel, não só por filtro de status: os endpoints do macro ficam sob `hasAnyRole('TECNICO', 'ADMIN')` (padrão do `CoachSugestaoController`), e o único endpoint do atleta (`/atletas/me/temporada`) consulta só `macrocicloStatus = ATIVO` do próprio atleta.

**Rationale:** o princípio do produto é que a IA propõe e o coach decide; a Feature 6 previa geração automática com "alerta ao atleta", o que publica ao atleta um plano que nenhum coach revisou. Esta é a mesma política do `PlanoSemanal`, que nunca nasce aprovado.

**Alternativa rejeitada:** gerar ativo e permitir edição depois — inverte o gate e cria expectativa no atleta antes da revisão.

---

### 3b. Fase da semana usa `TrainingPhase`

**Decisão:** `SemanaPlanejada.fase` é um `TrainingPhase`, restrito a BASE, BUILD, PEAK, TAPER e RACE_WEEK. Descarga é a flag `descarga`, não uma fase. CALIBRATION, RECOVERY, RETURN_TO_TRAINING e POST_RACE continuam sendo fases que só o motor semanal produz (calibração, lesão, pós-prova). A UI traduz: Base, Construção (BUILD), Pico (PEAK), Polimento (TAPER), Semana da prova (RACE_WEEK).

**Rationale:** o skeleton, o `LoadTargetResolver` e o compliance já ramificam por `TrainingPhase`; um enum novo (ou o `FaseMesociclo` de `add-macrociclo-structure`, com ESPECIFICO e TRANSICAO) exigiria mapeamento em todos esses pontos e um terceiro vocabulário. O template de metodologia distribui semanas entre essas cinco fases.

---

### 4. Versionamento com semanas executadas imutáveis

**Decisão:** aprovar um rascunho cria uma versão nova (`versao` incrementado, `motivoVersao` obrigatório quando há versão anterior) e arquiva a anterior. Semanas com `ordem` anterior à semana corrente são copiadas sem alteração.

**Rationale:** o histórico é o que permite responder "o que mudou e por quê" e é a matéria-prima do delta de temporada. Reescrever o passado destruiria a comparação planejado contra executado.

**Alternativa rejeitada:** editar o macro no lugar, sem versão — perde o sinal e torna a aderência acumulada não auditável.

---

### 5. Precedência explícita: segurança > macro > progressão reativa

**Decisão — fase:** a fase da semana segue a ordem **lesão > pós-prova > macro > heurística**. Hoje a lesão já tem precedência (`PlannerEngine`: `injuryPolicy.phaseOverride().orElse(periodizacao.phase())`) e uma prova preparatória gera POST_RACE com redução `FATOR_REDUCAO` no `PeriodizationPlanner`. O macro entra abaixo dessas duas e acima da derivação por dias até a prova.

**Decisão — carga:** `SemanaPlanejada.tssAlvo` é o alvo **final** da semana, com descarga e taper já embutidos pelo `MacrocicloPlannerService` (task 2.5). Por isso, quando a fase vem do macro:

- `LoadTargetResolver` usa `tssAlvo` como baseline em lugar de `ctlAtual * 7` e **não** aplica o step-back ×0,8 (as descargas já estão no macro);
- `PlannerEngine` **não** chama `aplicarTaperSeAplicavel` (a curva já está no macro);
- a contenção `min(target, baseline)` de TAPER/RACE_WEEK fica neutra, porque baseline e alvo são o mesmo valor;
- o teto de rampa de CTL e o regime de cold-start continuam valendo por cima.

Quando a fase vem de lesão ou pós-prova, o resolver se comporta como hoje sobre o baseline do macro (redução de verdade, ADR-0012 do produto). Quando uma proteção corta o alvo, o `WeekPlanSkeleton` registra o desvio e o motivo; o macro não é reescrito.

Teste obrigatório: semana de taper com macro ativo resolve para o `tssAlvo` da semana, sem segunda redução.

**Rationale:** o macro é intenção do coach, não garantia fisiológica. Se o macro pudesse elevar carga acima dos tetos, a feature viraria um bypass das proteções que hoje falham fechado.

**Alternativa rejeitada:** macro como valor final — removeria o efeito das proteções nas semanas de pico, exatamente onde elas importam.

---

### 6. O macro é teto, nunca piso; semana perdida não é compensada

**Decisão:** nenhuma regra eleva a carga para "recuperar" volume perdido, e o alvo da semana seguinte continua sendo o do macro.

**Rationale:** compensação automática é o caminho clássico para lesão por pico de carga, e o ACWR já existe no sistema justamente para evitá-lo. Desvio relevante vira proposta de replanejamento, decisão do coach.

---

### 7. Validações do macro são brandas, com banda de tolerância

**Decisão:** `MacrocicloValidator` produz alertas (rampa, longão como fração do volume, cadência de descarga, janela de taper) que não bloqueiam a aprovação. "Distribuição de intensidade da fase" sai do MVP: `SemanaPlanejada` não tem campo de intensidade e `sessoesChave` não é estruturado o bastante para medi-la.

No compliance semanal, com macro ativo:

- **Volume:** reaproveita `TSS_FORA_DA_FAIXA`, que já é soft e já marca revisão; a diferença é que a faixa passa a ser centrada no `tssAlvo` do macro (o `WeeklyLoadTarget` já vem dele). Não nasce chave nova.
- **Longão:** checagem nova em km (`LONGAO_DIVERGENTE_DO_MACRO`), com tolerância configurável. Exige `distanciaKm` no `GeneratedSessionSnapshot` (hoje sem distância; o `TreinoPlanejadoLlmDto` já traz `distanciaKm`) e no mapper que o monta.
- **`LONGO_ACIMA_TETO`** (longão acima de 40% do TSS) é suspenso quando o longão gerado está dentro da tolerância do previsto pelo macro: o coach aprovou aquele longão, e a checagem antiga dispararia em toda semana de longão concentrado. Sem macro, continua igual.

Ambas marcam o plano para revisão obrigatória, sem bloquear a persistência; as invariantes de segurança seguem falhando fechado com 422.

**Rationale:** um guardrail que muda a cada violação não protege nada, e o macro precisa poder divergir da realidade — é o que gera a proposta de replanejamento. Misturar as duas camadas faria o macro ficar rígido demais (o coach desliga) ou a segurança herdar a flexibilidade do macro.

---

### 8. O macro guarda km e TSS

**Decisão:** `volumeAlvoKm` e `tssAlvo` na mesma linha. A UI mostra km; o motor consome TSS.

**Rationale:** o `PlanoSemanal` já tem `volumeAlvoKm` e o coach raciocina em km e longão, enquanto `LoadTargetResolver` e o PMC raciocinam em TSS. Converter em tempo de leitura exigiria assumir um pace e introduziria erro silencioso.

---

### 9. Template de metodologia como dado, não como prompt

**Decisão:** `TemplateMetodologia` versionado no banco, por assessoria, com um default global. O fragmento de texto associado serve apenas ao tom da narrativa gerada por LLM.

**Rationale:** a distribuição de fases e a curva de volume são parâmetros de cálculo; mantê-los como dado deixa a geração reprodutível e permite calibrar o template a partir do delta depois, sem reescrever prompt.

---

### 10. Fase do macro com o `PeriodizationPlanner` atual como fallback, e divergência instrumentada

**Decisão:** com macro ativo, a fase da semana vem da `SemanaPlanejada` (respeitada a precedência de lesão e pós-prova, Decisão 5); sem macro, vale a regra atual. A divergência entre as duas é contada em métrica, no mesmo espírito do `planner.phase.divergence.count` já existente.

**Dependência:** a métrica só é produzida com `planner-engine.shadow=true`, que hoje tem default `false` (`application.yml`). A fatia 4 precisa ligar o shadow no tenant do Design Partner, senão não gera dado.

**Rationale:** o padrão já adotado no projeto para trocar lógica de fase sem regressão silenciosa. A métrica também mede se o template está coerente com a heurística antiga antes de desligá-la.

---

### 10b. Com macro, o prompt substitui a fase e o alvo legados

**Decisão:** com semana planejada presente, o `PeriodizacaoPromptFormatter` (existente, estendido) emite o bloco de posição no ciclo **no lugar** da fase derivada por semanas faltando e do "TSS Alvo Semanal" calculado como `ctlAlvo * 7`. Sem macro, o prompt fica byte a byte igual.

**Rationale:** com `planner-engine.enabled=false` o prompt é o único caminho até o LLM. Acrescentar o bloco ao lado dos valores legados entrega ao modelo dois alvos e duas fases contraditórios.

**Dependência:** `migrate-plan-prompt-to-skills` quer aposentar esse formatter. Se ela entrar antes, o bloco é implementado na skill; a ordem é combinada antes da fatia 4.

---

### 10c. `desvio_alvo_percentual`

**Decisão:** `desvio_alvo_percentual = (tss_planejado_do_plano − tss_alvo_da_semana) / tss_alvo_da_semana × 100`, em TSS, calculado na persistência. A base é TSS, não km: `PlanoSemanal.volumeAlvoKm` é o volume que o LLM gerou (`PlanGenerationPersister`), não um alvo, e o motor raciocina em TSS (Decisão 8). Um segundo valor, contra o aprovado pelo coach, é o delta da task 5.13.

---

### 11. Gatilho de replanejamento por desvio acumulado, não por semana isolada

**Decisão:** `ReplanejamentoTriggerService` dispara por desvio acumulado numa janela (default 3 semanas) acima de um limite configurável, por lesão registrada e por mudança de data ou meta da prova. A proposta entra como `SugestaoCoach` com um valor novo em `TipoSugestao` (hoje só PLAN_ADJUST, RECOVERY e NEW_PLAN). O gatilho por resultado de prova-teste depende de `add-running-field-tests`, que cria a fonte desse resultado; até ela entrar, esse gatilho fica fora.

**Rationale:** uma semana ruim é rotina; três seguidas é tendência. Disparar por semana isolada produziria ruído e derrubaria a taxa de aceite, que é a métrica de saúde do gatilho.

---

### 12. Horizonte de detalhe de 1 a 2 semanas, com modo planilha opcional

**Decisão:** a geração de sessões cobre a semana seguinte e, por flag, a subsequente como rascunho. Um modo opcional por assessoria gera todas as semanas como rascunho regenerável, marcadas como previstas.

**Rationale:** a literatura e a aderência real não sustentam prescrever a sessão da semana 14 na semana 1, mas parte dos coaches exige a planilha completa na venda. O modo opcional atende sem tornar o rascunho uma promessa.

## Risks / Trade-offs

- **Perda de dados por cascata:** ver Decisão 1. A troca das FKs entra na primeira migration da fatia 1.
- **Dependência do enforcement:** com `planner-engine.enabled=false`, o macro chega ao LLM apenas como texto e pode ser ignorado. Mitigação: as fatias 1 a 3 entregam valor sem o enforcement; as checagens de compliance entram atrás da mesma flag; o prompt substitui os valores legados (Decisão 10b).
- **Divergência de semanas mínimas:** `RacePreparationRule` usa 8/10/12/16 e o roadmap documenta 8/10/14/18. Precisa de decisão única antes da implementação; a tabela escolhida passa a ser fonte única para prova e macro.
- **Volume de dados:** uma linha por semana por atleta por versão. Com 18 a 24 semanas e poucas versões por ciclo, é desprezível; ainda assim o arquivamento guarda as versões antigas sem índice de leitura quente.
- **Template errado gera proposta ruim:** mitigado pela métrica de edição antes de aprovar — alta edição indica template a corrigir.

## Migration Plan

Seis fatias, cada uma entregável sozinha. A 1 a 3 não alteram nada que roda hoje.

1. Modelo + `MacrocicloPlannerService` + `MacrocicloValidator` + endpoints de leitura
2. Aba Temporada (coach, leitura) e bloco do atleta
3. Rascunho, diff, validação, aprovação e versionamento + tela de ajuste
4. `SemanaPlanejadaSnapshot` no contexto e no skeleton, bloco de posição no prompt, métrica de divergência em shadow
5. `LoadTargetResolver` consumindo o alvo planejado + checagens de compliance (atrás de `planner-engine.enabled`)
6. `ReplanejamentoTriggerService` + proposta de macro na fila do coach

Rollback: cada fatia atrás de flag própria (`macrociclo.enabled` nas fatias 1 a 4, `macrociclo.enforcement.enabled` na fatia 5, `macrociclo.replanejamento.enabled` na fatia 6), todas com default `false`. Desligadas, o caminho atual é restaurado sem deploy. A troca de FKs (fatia 1) não é revertida pela flag — é correção de integridade, e fica mesmo com o macro desligado.

A fatia 6 diverge do PRD, que a põe em "experimentar depois" (proposal D4).

## Open Questions

Decisões de produto pendentes estão no `proposal.md`, seção "Decisões pendentes" (D1 supersessão de `add-macrociclo-structure`, D2 `add-taper-guidance`, D3 geração automática ou manual, D4 fatia 6). Abaixo, as técnicas:

1. Conferir se `tb_plano_treino` tem linhas em produção antes da migration de FKs.
2. Semanas mínimas: 8/10/12/16 (código) ou 8/10/14/18 (roadmap)?
3. O modo planilha completa entra no MVP ou fica para depois da primeira validação com assessoria?
4. Atleta em calibração: gerar macro com volume relativo ou esperar a graduação?
5. O template de metodologia é editável pela assessoria na fase 1, ou só o default global, com edição depois?
6. Limite de desvio acumulado para o gatilho: começar em quanto, e por volume ou por aderência?
