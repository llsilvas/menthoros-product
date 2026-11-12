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
`DESLIGADO` não avalia; `SOMBRA` loga sem listar; `ATIVO` lista. O motivo principal do item
SHALL seguir a regra atual da fila (severidade antes do peso): `DOR_RECORRENTE` vence outro motivo
de mesma severidade e, com severidade menor, aparece como evidência. A avaliação da fila SHALL
continuar sem escrita (leitura pura). Um **episódio** é (atleta, primeiro dia com `DOR` da janela)
e SHALL ser contável uma única vez a partir dos dados persistidos (forma definida na Decisão
pendente P2 do `proposal.md`).

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
- **THEN** o log registra o episódio e o sinal não entra na fila nem como evidência

#### Scenario: Episódio não reconta
- **WHEN** a fila roda em dois dias seguidos (e a cada abertura do dashboard) para o mesmo episódio
- **THEN** a contagem de episódios registra um só

#### Scenario: Ocorrências fora da janela
- **WHEN** os dois realizados com `DOR` têm 8 e 9 dias
- **THEN** não há sinal de dor

#### Scenario: Dor vence fadiga na mesma severidade
- **WHEN** o atleta tem dor `CRITICA` (dias consecutivos) e TSB em faixa `CRITICA`
- **THEN** o item tem motivo principal `DOR_RECORRENTE` e a fadiga aparece entre as evidências

#### Scenario: Fadiga crítica vence dor alta
- **WHEN** o atleta tem dor `ALTA` (dias não consecutivos) e TSB em faixa `CRITICA`
- **THEN** o item tem motivo principal `FADIGA` e a dor aparece entre as evidências

#### Scenario: Outro tenant
- **WHEN** um atleta de outro tenant tem dor recorrente
- **THEN** ele não aparece na fila deste tenant

#### Scenario: Comentário nunca vai a prompt
- **WHEN** o comentário do atleta contém instruções ("ignore as regras")
- **THEN** ele aparece na evidência para o coach e o teste ArchUnit garante que nenhum builder de prompt acessa `TreinoRealizado#getFeedbackAtleta` nem as evidências da fila

### Requirement: Sugestão determinística com treino-alvo

A rotina de sugestões SHALL, em `modo = ATIVO`, rodar **por atleta** (cron diário sobre os atletas
com `DOR` na janela, sem o corte de 20 itens da fila, e, de forma idempotente, o evento de feedback
com `DOR` registrado pelo atleta), avaliar a dor diretamente — **sem depender** de
`DOR_RECORRENTE` ser o motivo principal da fila — e convertê-la em `SugestaoCoach` de tipo
`PAIN_ADJUST`, com `summary` derivado da prescrição, `confidence` `HIGH` para `CRITICA` e `MEDIUM`
para `ALTA`. O `reasoningJson` SHALL manter `rationale`, `sourceRules` e `confidence` na raiz
(formato `RecommendationExplanation` atual) e acrescentar `proposedAction` apontando para o
próximo treino pendente de intensidade (`INTERVALADO`, `TIRO`, `FARTLEK`, `TEMPO_RUN`, `SUBIDA`,
`LONGO`) de um plano **aprovado**, com `targetSnapshot` (versão do treino), uma **prescrição
completa** (`REGENERATIVO`, 30 min, uma etapa contínua Z1, `zonaAlvo` Z1, percepção de esforço
leve, distância limpa, descrição neutra) e `reason = PAIN_INJURY`. Sem candidato, com o próximo
intensivo já bloqueado para edição, ou com o plano ainda em revisão, a sugestão SHALL nascer sem
`proposedAction` e com `summary` de ajuste manual. Nenhum texto gerado SHALL citar região do corpo, exercício corretivo
ou condição clínica. A sugestão SHALL coexistir com uma `RECOVERY` pendente do mesmo atleta.
Antes de gerar, a rotina SHALL encerrar `PAIN_ADJUST` pendentes obsoletas (`EXPIRED` por
`expiresAt`; `SUPERSEDED` por alvo realizado, removido ou alterado) para que a substituta possa
existir.

#### Scenario: Intervalado na quinta
- **WHEN** o item é `DOR_RECORRENTE` e há `INTERVALADO` 60 min pendente em Qui 12/11 e `LONGO` em Sáb 14/11
- **THEN** a sugestão é `PAIN_ADJUST` `PENDING`, `proposedAction.treinoPlanejadoId` é o de Qui, `targetSnapshot.versao` é a versão atual do treino, `prescription.etapas` tem uma única etapa Z1 de 30 min, o `reasoningJson` ainda desserializa como `RecommendationExplanation`, e o `summary` é "Atleta relatou dor em 2 treinos. Sugestão: trocar Qui 12/11 (Intervalado 60 min) por treino leve de 30 min. Confirmar com o atleta antes de manter Sáb 14/11."

#### Scenario: Sem intensivo pendente
- **WHEN** a semana só tem treinos leves ou já realizados
- **THEN** a sugestão nasce sem `proposedAction` e o `summary` diz "Nenhum treino intensivo pendente; manter plano e confirmar com o atleta no próximo check-in."

#### Scenario: Intensivo já no relógio
- **WHEN** a dor é registrada às 20h e o próximo intensivo é na manhã seguinte, já `TODAY_ON_WATCH` quando a rotina roda
- **THEN** a sugestão nasce sem `proposedAction` e o `summary` diz que o próximo intensivo já está no relógio e pede ajuste manual

#### Scenario: Gerada no evento, não só no cron
- **WHEN** o segundo feedback com `DOR` é registrado às 20h
- **THEN** a sugestão existe antes do cron das 06:00, e o cron não cria uma segunda

#### Scenario: Dor não é o motivo principal da fila
- **WHEN** o atleta tem dor `ALTA` e TSB em faixa `CRITICA` (principal da fila = `FADIGA`)
- **THEN** a `PAIN_ADJUST` é criada mesmo assim

#### Scenario: Atleta fora do topo da fila
- **WHEN** o tenant tem mais de 20 itens na fila e o atleta com dor recorrente não está entre eles
- **THEN** o cron cria a `PAIN_ADJUST` para ele

#### Scenario: Plano em revisão
- **WHEN** o próximo intensivo pertence a um plano `AGUARDANDO_REVISAO`
- **THEN** a sugestão nasce sem `proposedAction` e com `summary` pedindo o ajuste na revisão do plano

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

`POST /api/v1/coach/sugestoes/{id}/aprovar` SHALL, quando a sugestão tem `proposedAction` e
`app.coach.sugestao.acao.enabled = true`, substituir a prescrição do treino-alvo (tipo, duração,
etapas, zona, distância limpa, descrição, TSS recalculado) pelo mesmo serviço do `PATCH` manual
de treino (`TreinoPlanejadoServiceImpl.editarTreino`, que passa por `ApprovedWorkoutEditPolicy` e
`PostApprovalEditCoordinator`) com `editReason = PAIN_INJURY`, na mesma transação em que marca
`APPROVED`, registrando no audit o treino, a versão antes/depois e o motivo. Versão do alvo
diferente do `targetSnapshot`, rejeição da policy, treino inexistente, sugestão expirada
(`expiresAt` vencido) ou flag desligada SHALL responder `409` com `code` no corpo, sem alterar a
sugestão nem o treino. `aprovar`/`rejeitar` em `EXPIRED` ou `SUPERSEDED` SHALL responder `422`,
como `REJECTED` hoje. Sem `proposedAction`, o comportamento atual SHALL permanecer.
`PUT /api/v1/coach/sugestoes/{id}` (editar `summary`) SHALL responder `409` quando há
`proposedAction`.

#### Scenario: Aprovação substitui o treino
- **WHEN** o coach aprova a sugestão do cenário "Intervalado na quinta"
- **THEN** o treino de Qui fica `REGENERATIVO`, 30 min, uma única etapa Z1, sem a distância antiga, com `editedAfterApprovalAt` preenchido e a edição registrada em `PlannedWorkoutPostApprovalEdit` com `reason = PAIN_INJURY`; a sugestão fica `APPROVED`; `WorkoutEditedAfterApprovalEvent` é publicado e o reenvio ao relógio sai depois do commit, como no `PATCH` manual; o payload exportado não contém etapa acima de Z2

#### Scenario: Alvo já realizado
- **WHEN** o treino de Qui já tem realizado vinculado no momento da aprovação
- **THEN** a API responde `409 NOT_PENDING`, a sugestão continua `PENDING` (até a rotina encerrá-la) e o treino não muda

#### Scenario: Alvo alterado pelo coach
- **WHEN** o coach editou o treino de Qui para 40 min depois da geração e alguém aprova a sugestão
- **THEN** a API responde `409 ALVO_ALTERADO` e o treino continua com 40 min

#### Scenario: Sugestão expirada
- **WHEN** o coach aprova uma `PAIN_ADJUST` com `expiresAt` no passado que a rotina ainda não encerrou
- **THEN** a API responde `409 SUGESTAO_EXPIRADA` e o treino não muda

#### Scenario: Sugestão já encerrada pela rotina
- **WHEN** o coach aprova ou rejeita uma sugestão `SUPERSEDED`
- **THEN** a API responde `422` e nada muda

#### Scenario: Flag de ação desligada
- **WHEN** `app.coach.sugestao.acao.enabled = false` e o coach aprova uma sugestão com `proposedAction`
- **THEN** a API responde `409 ACAO_DESABILITADA`; a sugestão não vira `APPROVED`

#### Scenario: Editar o texto de uma sugestão com ação
- **WHEN** o coach chama `PUT /api/v1/coach/sugestoes/{id}` numa `PAIN_ADJUST` com `proposedAction`
- **THEN** a API responde `409 SUGESTAO_COM_ACAO_NAO_EDITAVEL`

#### Scenario: Falha ao aplicar
- **WHEN** o `editarTreino` lança exceção
- **THEN** a transação é desfeita e a sugestão continua `PENDING`

#### Scenario: Segunda aprovação
- **WHEN** o coach aprova uma sugestão já `APPROVED`
- **THEN** responde `200` sem reaplicar o patch

#### Scenario: Sugestão antiga
- **WHEN** uma `RECOVERY` sem `proposedAction` é aprovada
- **THEN** só o status muda

### Requirement: O coach vê dor como decisão no perfil

O perfil do atleta SHALL mostrar o motivo `DOR_RECORRENTE` como "Dor recorrente", com chip
"Atenção alta" quando `CRITICA`, as evidências e, havendo sugestão `PAIN_ADJUST` pendente, o
bloco "Sugestão da IA" com o `summary` e as ações Aceitar · Ajustar · Rejeitar. Para isso
`SinalRecenteDto` SHALL trazer `evidence` e `sugestaoId` (hoje ausente e `null`, respectivamente;
Decisão pendente P3). "Aceitar" SHALL
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
