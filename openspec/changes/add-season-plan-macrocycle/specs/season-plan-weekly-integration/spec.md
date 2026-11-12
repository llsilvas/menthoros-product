## ADDED Requirements

### Requirement: Semana do macrociclo como insumo do contexto de geração

O `PlanGenerationContextLoader` SHALL carregar a `SemanaPlanejada` do macro `ATIVO` correspondente à data de referência da geração e expor um `SemanaPlanejadaSnapshot` no `PlanGenerationContext` e no `PlannerInputSnapshot` (montado em `PlannerShadowService.mapToSnapshot`).

Sem macro `ATIVO`, ou sem semana correspondente à data de referência, o snapshot SHALL ser `Optional.empty()` e o comportamento SHALL ser o atual.

#### Scenario: Atleta com macro ativo
- **WHEN** a geração roda para um atleta cuja semana de referência corresponde à semana 9 do macro ativo
- **THEN** o contexto carrega fase, `volumeAlvoKm`, `tssAlvo`, `longaoKm`, sessões-chave e marco daquela semana

#### Scenario: Atleta sem macro
- **WHEN** a geração roda para um atleta sem macro ativo
- **THEN** o snapshot é vazio e a geração segue o caminho atual sem alteração

#### Scenario: Data fora da janela do macro
- **WHEN** a data de referência é posterior à data da prova do macro ativo
- **THEN** o snapshot é vazio e a geração segue o caminho atual

---

### Requirement: Fase da semana derivada do macrociclo

A fase da semana SHALL seguir a precedência: política de lesão > pós-prova (POST_RACE após prova preparatória) > fase da semana planejada > derivação atual por dias até a prova.

`SemanaPlanejada.fase` SHALL ser um `TrainingPhase` entre BASE, BUILD, PEAK, TAPER e RACE_WEEK.

Sem o snapshot, o planner SHALL manter a derivação atual por dias até a prova.

O sistema SHALL registrar em métrica a divergência entre a fase do macro e a fase que a regra atual produziria, sem corrigir nenhuma das duas.

#### Scenario: Fase do macro diverge da heurística
- **WHEN** a semana planejada está em `PEAK` e a regra por dias até a prova resultaria em `BUILD`
- **THEN** o skeleton usa `PEAK` e a métrica de divergência é incrementada

#### Scenario: Lesão sobrepõe o macro
- **WHEN** a semana planejada está em `PEAK` e a política de lesão impõe `RETURN_TO_TRAINING`
- **THEN** o skeleton usa `RETURN_TO_TRAINING` e o alvo segue a regra de lesão sobre o baseline do macro

#### Scenario: Pós-prova sobrepõe o macro
- **WHEN** o atleta correu uma prova preparatória na semana anterior e a semana planejada está em `BUILD`
- **THEN** o skeleton usa `POST_RACE` com a redução atual sobre o baseline do macro

#### Scenario: Prova preparatória na semana
- **WHEN** há prova preparatória dentro da semana de referência e o macro define a fase
- **THEN** a fase vem do macro e a prova continua ancorada como evento fixo da semana

---

### Requirement: Alvo de carga a partir do macrociclo, sob as proteções existentes

Com `SemanaPlanejadaSnapshot` presente, o `LoadTargetResolver` SHALL usar o `tssAlvo` da semana planejada como baseline do alvo semanal, em lugar de `ctlAtual * 7`.

O `tssAlvo` da semana planejada SHALL ser tratado como alvo final, com descarga e taper já embutidos. Quando a fase vem do macro, o resolver SHALL NOT aplicar o step-back por progressão contínua e o `PlannerEngine` SHALL NOT aplicar a `TaperStrategy` sobre o alvo.

O resolver SHALL continuar aplicando, sobre esse baseline, o teto de rampa de CTL e o regime de cold-start quando houver `CalibrationStage`. Quando a fase vem de lesão ou pós-prova, os fatores das fases de redução SHALL ser aplicados como hoje, sobre o baseline do macro.

Quando uma proteção reduz o alvo abaixo do valor do macro, o `WeekPlanSkeleton` SHALL registrar o desvio e o motivo, e o macro SHALL NOT ser alterado.

O alvo resolvido SHALL NOT exceder o `tssAlvo` do macro, ainda que a progressão reativa indique aumento.

#### Scenario: Alvo do macro dentro dos tetos
- **WHEN** a semana planejada pede 620 TSS e os tetos de rampa permitem até 680
- **THEN** o alvo resolvido é 620

#### Scenario: Proteção corta o alvo do macro
- **WHEN** a semana planejada pede 620 TSS e o teto de rampa de CTL permite 540
- **THEN** o alvo resolvido é 540 e o skeleton registra o desvio com o motivo do corte
- **THEN** as semanas do macro permanecem inalteradas

#### Scenario: Progressão reativa acima do macro
- **WHEN** a decisão de progressão indicaria aumento de 10% sobre um alvo que já é o do macro
- **THEN** o alvo resolvido permanece no valor do macro

#### Scenario: Semana de taper sem dupla redução
- **WHEN** a semana planejada está em `TAPER` com `tssAlvo` de 380, já reduzido pelo motor do macro
- **THEN** o alvo resolvido é 380, sem nova redução da `TaperStrategy`

#### Scenario: Semana de descarga sem step-back adicional
- **WHEN** a semana planejada tem `descarga = true` após três semanas de progressão contínua
- **THEN** o alvo resolvido é o `tssAlvo` da semana, sem o fator de step-back

#### Scenario: Atleta em calibração com macro ativo
- **WHEN** o atleta está em `CALIBRATION` e existe semana planejada
- **THEN** o alvo segue o regime de cold-start e a fase e as sessões-chave vêm do macro

#### Scenario: Semana perdida não é compensada
- **WHEN** o atleta realizou 40% do volume da semana anterior
- **THEN** o alvo da semana seguinte continua sendo o do macro, sem acréscimo compensatório

---

### Requirement: Posição no ciclo no prompt de geração

O `PeriodizacaoPromptFormatter` existente SHALL incluir, quando houver semana planejada, um bloco com a posição no ciclo: número da semana, total de semanas, fase, alvo de volume, alvo de TSS, longão previsto, sessões-chave e próximo marco com a data.

Com semana planejada, o bloco SHALL substituir a fase derivada por semanas faltando e o "TSS Alvo Semanal" calculado como `ctlAlvo * 7`; o prompt SHALL NOT conter os dois alvos.

Sem semana planejada, o prompt SHALL permanecer como hoje.

#### Scenario: Prompt com macro ativo
- **WHEN** a geração roda na semana 9 de 18, em `BUILD`, com prova-teste de 10 km no fim da semana
- **THEN** o prompt declara a posição no ciclo, o alvo da semana e o marco da semana
- **THEN** o prompt não contém o "TSS Alvo Semanal" legado nem a fase por semanas faltando

#### Scenario: Prompt sem macro
- **WHEN** a geração roda para atleta sem macro ativo
- **THEN** o prompt não contém o bloco de posição no ciclo

---

### Requirement: Compliance do plano semanal contra o alvo do macrociclo

Com `planner-engine.enabled = true`, `macrociclo.enforcement.enabled = true` e semana planejada presente, o compliance do skeleton SHALL verificar:

- volume: pela violação existente `TSS_FORA_DA_FAIXA`, com a faixa centrada no `tssAlvo` da semana planejada;
- longão: pela violação nova `LONGAO_DIVERGENTE_DO_MACRO`, comparando em km o longão gerado com o `longaoKm` previsto, dentro de tolerância configurável. O `GeneratedSessionSnapshot` SHALL carregar a distância da sessão.

Quando o longão gerado está dentro da tolerância do previsto, `LONGO_ACIMA_TETO` SHALL NOT ser registrado para aquela sessão. Sem macro, `LONGO_ACIMA_TETO` segue como hoje.

Uma violação dessas checagens SHALL marcar o plano com revisão obrigatória do coach e registrar a violação, sem bloquear a persistência.

As invariantes de segurança existentes SHALL continuar falhando fechado com 422, acima do `fail-open`.

#### Scenario: Volume fora da banda
- **WHEN** o alvo da semana é 620 TSS com banda de 10% e o plano gerado soma 520 TSS
- **THEN** o plano é persistido com revisão obrigatória e a violação `TSS_FORA_DA_FAIXA` registrada

#### Scenario: Longão divergente
- **WHEN** a semana planejada prevê longão de 30 km e o plano gerado traz 20 km
- **THEN** o plano é persistido com revisão obrigatória e a violação `LONGAO_DIVERGENTE_DO_MACRO` registrada

#### Scenario: Longão concentrado previsto pelo macro
- **WHEN** a semana planejada prevê longão de 32 km e o plano gerado traz 32 km, somando mais de 40% do TSS da semana
- **THEN** nenhuma violação `LONGO_ACIMA_TETO` é registrada para o longão

#### Scenario: Invariante de segurança violada
- **WHEN** o plano gerado viola uma invariante obrigatória de segurança
- **THEN** a resposta é 422 e o plano não é persistido, independente das checagens de macro

#### Scenario: Enforcement desligado
- **WHEN** `planner-engine.enabled = false` ou `macrociclo.enforcement.enabled = false`
- **THEN** as checagens de macro não são aplicadas e o macro chega ao LLM apenas pelo prompt

---

### Requirement: Vínculo do plano semanal à semana do macrociclo

O `PlanoSemanal` SHALL guardar a referência à `SemanaPlanejada` que originou o seu alvo e o desvio percentual entre o TSS planejado do plano e o `tssAlvo` da semana: `(tss planejado − tssAlvo) / tssAlvo × 100`. A base SHALL ser TSS, porque `PlanoSemanal.volumeAlvoKm` é o volume gerado, não um alvo.

A ausência de macro ativo SHALL deixar ambos os campos nulos.

#### Scenario: Plano gerado com macro ativo
- **WHEN** um plano semanal é gerado para a semana 9 do macro
- **THEN** o plano guarda `semanaPlanejadaId` e `desvioAlvoPercentual`

#### Scenario: Plano gerado sem macro
- **WHEN** um plano semanal é gerado para atleta sem macro ativo
- **THEN** `semanaPlanejadaId` e `desvioAlvoPercentual` ficam nulos

---

### Requirement: Edição do plano semanal pelo coach não altera o macrociclo

Editar, adicionar ou remover treinos de um `PlanoSemanal` SHALL NOT alterar nenhuma `SemanaPlanejada`.

O sistema SHALL registrar o delta entre o alvo da semana do macro e o plano aprovado pelo coach.

#### Scenario: Coach reduz o volume da semana aprovada
- **WHEN** o coach remove um treino antes de aprovar o plano da semana 9
- **THEN** a `SemanaPlanejada` 9 permanece inalterada e o delta é registrado

---

### Requirement: Gatilhos de proposta de replanejamento

O `ReplanejamentoTriggerService` SHALL avaliar, no encerramento de cada semana, os gatilhos: desvio acumulado acima do limite configurado dentro de uma janela de semanas; lesão registrada; mudança de data ou de meta da prova-alvo.

O gatilho por resultado de prova-teste SHALL entrar somente depois de `add-running-field-tests`, que cria a fonte desse resultado.

Um gatilho acionado SHALL produzir uma proposta de nova versão do macro como `SugestaoCoach` de um tipo novo em `TipoSugestao`, com a evidência que a originou, as semanas afetadas e os valores propostos calculados pelo motor.

Toda a avaliação SHALL ficar atrás de `macrociclo.replanejamento.enabled` (default `false`).

A proposta SHALL alterar apenas semanas futuras e SHALL NOT ser aplicada sem decisão do coach.

O desfecho da proposta (aceita, editada, rejeitada) SHALL ser registrado.

#### Scenario: Desvio acumulado
- **WHEN** o atleta fica abaixo do alvo por três semanas consecutivas, acumulando desvio acima do limite
- **THEN** uma proposta de replanejamento é criada com as semanas futuras recalculadas

#### Scenario: Desvio em semana isolada
- **WHEN** o atleta fica abaixo do alvo em uma única semana, dentro do limite acumulado
- **THEN** nenhuma proposta é criada

#### Scenario: Prova-teste realizada (depende de `add-running-field-tests`)
- **WHEN** o resultado de uma prova-teste é registrado
- **THEN** uma proposta é criada com zonas e alvos recalculados a partir do novo resultado

#### Scenario: Mudança de data da prova
- **WHEN** o coach altera a data da prova-alvo
- **THEN** uma proposta é criada com as fases redistribuídas para a nova janela

#### Scenario: Coach rejeita a proposta
- **WHEN** o coach rejeita a proposta de replanejamento
- **THEN** o macro permanece na versão atual e o desfecho `REJEITADA` é registrado

#### Scenario: Semanas passadas preservadas
- **WHEN** uma proposta de replanejamento é aceita na semana 9 de 18
- **THEN** as semanas 1 a 8 permanecem com os valores da versão anterior
