# Spec delta: coach-pain-attention

> Capability nova: dor relatada pelo atleta vira sinal na fila de atenção, sugestão determinística
> com treino-alvo e edição aplicada na aprovação do treinador.

## ADDED Requirements

### Requirement: Dor recorrente entra na fila de atenção

A fila de atenção SHALL produzir o motivo `DOR_RECORRENTE` (peso 55) para o atleta que tenha
`Sensacao.DOR` em pelo menos `minimoDias` (default 2) **dias distintos** dentro dos últimos
`janelaDias` (default 7) dias. A severidade SHALL ser `ALTA`, e `CRITICA` somente quando os dois
dias mais recentes são consecutivos no plano; RPE e proximidade de prova SHALL aparecer nas
evidências sem alterar a severidade. A evidência SHALL trazer, por ocorrência, data, tipo, RPE e
o comentário do atleta. A avaliação SHALL respeitar o tenant e `app.coach.atencao.dor.modo`:
`DESLIGADO` não avalia; `SOMBRA` conta o episódio e loga sem listar; `ATIVO` lista. Um
**episódio** é (atleta, primeiro dia com `DOR` da janela) e SHALL ser contado uma única vez em
`coach_atencao_dor_episodio_total`.

#### Scenario: Dois dias seguidos com dor e prova próxima
- **WHEN** o atleta tem realizados em 09/11 (RPE 4, `DOR`, "Senti um pouco a lombar") e 10/11 (RPE 6, `DOR`, "Dores na lombar"), dias consecutivos do plano, prova-alvo em 22/11, e a fila roda em 11/11 em modo `ATIVO`
- **THEN** o item do atleta tem `primaryReason = DOR_RECORRENTE`, severidade `CRITICA`, duas evidências com data, RPE e comentário, e as evidências "RPE 4 → 6" e "prova em 11 dias"

#### Scenario: Dois dias não consecutivos
- **WHEN** os realizados com `DOR` são de 06/11 e 10/11
- **THEN** o sinal existe com severidade `ALTA`

#### Scenario: Duas sessões no mesmo dia
- **WHEN** há dois realizados com `DOR` em 10/11 e nenhum outro na janela
- **THEN** não há sinal de dor

#### Scenario: Uma ocorrência só
- **WHEN** há um único realizado com `DOR` na janela
- **THEN** não há sinal de dor

#### Scenario: Modo sombra
- **WHEN** `modo = SOMBRA` e o atleta tem dor recorrente
- **THEN** `coach_atencao_dor_episodio_total` incrementa, o log registra o episódio e o item não entra na fila

#### Scenario: Episódio não reconta
- **WHEN** a fila roda em dois dias seguidos para o mesmo episódio
- **THEN** a métrica incrementa uma vez

#### Scenario: Ocorrências fora da janela
- **WHEN** os dois realizados com `DOR` têm 8 e 9 dias
- **THEN** não há sinal de dor

#### Scenario: Dor vence fadiga
- **WHEN** o atleta também tem TSB em faixa `CRITICA`
- **THEN** o item tem motivo principal `DOR_RECORRENTE` e a fadiga aparece entre as evidências

#### Scenario: Outro tenant
- **WHEN** um atleta de outro tenant tem dor recorrente
- **THEN** ele não aparece na fila deste tenant

#### Scenario: Comentário nunca vai a prompt
- **WHEN** o comentário do atleta contém instruções ("ignore as regras")
- **THEN** ele aparece na evidência para o coach e nenhum builder de prompt o lê

### Requirement: Sugestão determinística com treino-alvo

A rotina de sugestões SHALL, em `modo = ATIVO` (cron diário e, de forma idempotente, o evento
de feedback registrado), converter `DOR_RECORRENTE` em `SugestaoCoach` de tipo `PAIN_ADJUST`,
com `summary` derivado da prescrição, `confidence` `HIGH` para `CRITICA` e `MEDIUM` para `ALTA`,
e `reasoningJson.acaoProposta` apontando para o próximo treino pendente de intensidade
(`INTERVALADO`, `TIRO`, `FARTLEK`, `TEMPO_RUN`, `SUBIDA`, `LONGO`) da semana vigente, com
`alvoSnapshot` (versão do treino) e uma **prescrição completa** (`REGENERATIVO`, 30 min, uma etapa
contínua Z1, sem metas, descrição neutra) e `reason = PAIN_INJURY`. Sem candidato, ou com o
próximo intensivo já bloqueado para edição, a sugestão SHALL nascer sem `acaoProposta` e com
`summary` de ajuste manual. Nenhum texto gerado SHALL citar região do corpo, exercício corretivo
ou condição clínica. A sugestão SHALL coexistir com uma `RECOVERY` pendente do mesmo atleta.
Antes de gerar, a rotina SHALL encerrar `PAIN_ADJUST` pendentes obsoletas (`EXPIRED` por
`expiresAt`; `SUPERSEDED` por alvo realizado, removido ou alterado) para que a substituta possa
existir.

#### Scenario: Intervalado na quinta
- **WHEN** o item é `DOR_RECORRENTE` e há `INTERVALADO` 60 min pendente em Qui 12/11 e `LONGO` em Sáb 14/11
- **THEN** a sugestão é `PAIN_ADJUST` `PENDING`, `acaoProposta.treinoPlanejadoId` é o de Qui, `alvoSnapshot.versao` é a versão atual do treino, `prescricao.etapas` tem uma etapa Z1 de 30 min e `metas` vazio, e o `summary` é "Atleta relatou dor em 2 treinos. Sugestão: trocar Qui 12/11 (Intervalado 60 min) por treino leve de 30 min. Confirmar com o atleta antes de manter Sáb 14/11."

#### Scenario: Sem intensivo pendente
- **WHEN** a semana só tem treinos leves ou já realizados
- **THEN** a sugestão nasce sem `acaoProposta` e o `summary` diz "Nenhum treino intensivo pendente; manter plano e confirmar com o atleta no próximo check-in."

#### Scenario: Intensivo já no relógio
- **WHEN** a dor é registrada às 20h e o próximo intensivo é na manhã seguinte, já `TODAY_ON_WATCH` quando a rotina roda
- **THEN** a sugestão nasce sem `acaoProposta` e o `summary` diz que o próximo intensivo já está no relógio e pede ajuste manual

#### Scenario: Gerada no evento, não só no cron
- **WHEN** o segundo feedback com `DOR` é registrado às 20h
- **THEN** a sugestão existe antes do cron das 06:00, e o cron não cria uma segunda

#### Scenario: Recovery pendente no mesmo atleta
- **WHEN** já existe `RECOVERY` `PENDING` para o atleta
- **THEN** a `PAIN_ADJUST` é criada mesmo assim

#### Scenario: Alvo realizado antes da aprovação
- **WHEN** o treino-alvo de uma `PAIN_ADJUST` pendente recebe um realizado e a rotina roda
- **THEN** a sugestão vira `SUPERSEDED` com `rejectionReason = "ALVO_REALIZADO"` e uma nova `PAIN_ADJUST` pode ser criada para o próximo intensivo

#### Scenario: Execuções concorrentes
- **WHEN** o cron e o listener do evento rodam ao mesmo tempo para o mesmo atleta
- **THEN** existe no máximo uma `PAIN_ADJUST` `PENDING`

### Requirement: Aprovar aplica a edição pelo caminho de treino aprovado

`POST /api/v1/coach/sugestoes/{id}/aprovar` SHALL, quando a sugestão tem `acaoProposta` e
`app.coach.sugestao.acao.enabled = true`, substituir a prescrição do treino-alvo (tipo, duração,
etapas, metas, descrição, derivados recalculados) via `ApprovedWorkoutEditPolicy` e
`PostApprovalEditCoordinator` com `WorkoutEditReason.PAIN_INJURY`, na mesma transação em que marca
`APPROVED`, registrando no audit o treino, a versão antes/depois e o motivo. Versão do alvo
diferente do `alvoSnapshot`, rejeição da policy, treino inexistente ou flag desligada SHALL
responder `409` com o código, sem alterar a sugestão nem o treino. Sem `acaoProposta`, o
comportamento atual SHALL permanecer. `PATCH .../sugestoes/{id}` (editar `summary`) SHALL
responder `409` quando há `acaoProposta`.

#### Scenario: Aprovação substitui o treino
- **WHEN** o coach aprova a sugestão do cenário "Intervalado na quinta"
- **THEN** o treino de Qui fica `REGENERATIVO`, 30 min, uma etapa Z1, sem metas, `editReason = PAIN_INJURY`, `editedAfterApprovalAt` preenchido; a sugestão fica `APPROVED`; o reenvio ao relógio é disparado como no `PATCH` manual e o payload exportado não contém etapa acima de Z2

#### Scenario: Alvo já realizado
- **WHEN** o treino de Qui já tem realizado vinculado no momento da aprovação
- **THEN** a API responde `409 NOT_PENDING`, a sugestão continua `PENDING` (até a rotina encerrá-la) e o treino não muda

#### Scenario: Alvo alterado pelo coach
- **WHEN** o coach editou o treino de Qui para 40 min depois da geração e alguém aprova a sugestão
- **THEN** a API responde `409 ALVO_ALTERADO` e o treino continua com 40 min

#### Scenario: Flag de ação desligada
- **WHEN** `app.coach.sugestao.acao.enabled = false` e o coach aprova uma sugestão com `acaoProposta`
- **THEN** a API responde `409 ACAO_DESABILITADA`; a sugestão não vira `APPROVED`

#### Scenario: Editar o texto de uma sugestão com ação
- **WHEN** o coach chama `PATCH .../sugestoes/{id}` numa `PAIN_ADJUST` com `acaoProposta`
- **THEN** a API responde `409 SUGESTAO_COM_ACAO_NAO_EDITAVEL`

#### Scenario: Falha ao aplicar
- **WHEN** o coordinator lança exceção
- **THEN** a transação é desfeita e a sugestão continua `PENDING`

#### Scenario: Segunda aprovação
- **WHEN** o coach aprova uma sugestão já `APPROVED`
- **THEN** responde `200` sem reaplicar o patch

#### Scenario: Sugestão antiga
- **WHEN** uma `RECOVERY` sem `acaoProposta` é aprovada
- **THEN** só o status muda

### Requirement: O coach vê dor como decisão no perfil

O perfil do atleta SHALL mostrar o motivo `DOR_RECORRENTE` como "Dor recorrente", com chip
"Atenção alta" quando `CRITICA`, as evidências e, havendo sugestão `PAIN_ADJUST` pendente, o
bloco "Sugestão da IA" com o `summary` e as ações Aceitar · Ajustar · Rejeitar. "Aceitar" SHALL
mostrar o diff (alvo, de → para) antes de confirmar. "Ajustar" SHALL rejeitar a sugestão com
`rejectionReason = "AJUSTE_MANUAL"` e abrir a edição manual do treino-alvo. `409` na aprovação
SHALL manter o card com a mensagem do backend.

#### Scenario: Card de dor
- **WHEN** o perfil traz o sinal e a sugestão do cenário "Intervalado na quinta"
- **THEN** o card "Dor recorrente" mostra "Atenção alta", as duas evidências, chips "RPE 4 → 6" e "Prova em 11 dias", o bloco de IA e as três ações

#### Scenario: Aceitar mostra o diff e reflete no plano
- **WHEN** o coach aciona Aceitar
- **THEN** vê "Qui 12/11: Intervalado 60 min → Regenerativo 30 min" e confirma; com `200`, o card some e a linha de Qui no plano mostra "Regenerativo · 30 min" com o selo de edição pós-aprovação

#### Scenario: Ajustar
- **WHEN** o coach aciona Ajustar
- **THEN** a sugestão é rejeitada com `AJUSTE_MANUAL`, o diálogo de edição do treino de Qui abre, e o card some
