# Capability — prova-no-plano-semanal

## Purpose

Garante que toda prova do atleta apareça no plano da semana como o treino do dia, que o plano já
aprovado seja reaberto para o treinador quando a prova entra nele, e que a execução do treino de
prova feche o resultado da prova.

## ADDED Requirements

### Requirement: Prova vira o treino do dia no plano gerado

Ao persistir um plano semanal gerado, para cada prova não cancelada do atleta cuja data cai na
semana do plano, o sistema SHALL garantir exatamente um treino planejado do tipo `PROVA` naquele
dia, vinculado à prova, com o nome da prova, a distância da prova e o ritmo objetivo derivado do
tempo objetivo quando existir. Qualquer outro treino que a geração tenha colocado no mesmo dia
MUST ser descartado. O volume planejado da semana SHALL incluir a distância da prova. A garantia
MUST NOT depender do conteúdo devolvido pela geração.

#### Scenario: Geração sem prova no dia
- **WHEN** a geração devolve um treino longo no domingo e o atleta tem uma meia maratona nesse domingo
- **THEN** o plano persistido tem um treino `PROVA` no domingo com o nome e a distância da prova, e não tem o longo

#### Scenario: Geração já com prova no dia
- **WHEN** a geração devolve um treino do tipo `PROVA` no dia correto
- **THEN** o plano persistido tem um único treino `PROVA` nesse dia, vinculado à prova, com os dados da prova

#### Scenario: Duas provas na semana
- **WHEN** o atleta tem duas provas não canceladas em dias diferentes da semana
- **THEN** cada dia tem seu treino `PROVA` vinculado à respectiva prova

#### Scenario: Prova cancelada
- **WHEN** a única prova da semana está cancelada
- **THEN** nenhum treino `PROVA` é criado

#### Scenario: Prova com tempo objetivo
- **WHEN** a prova tem tempo objetivo
- **THEN** o treino `PROVA` tem ritmo alvo igual ao tempo objetivo dividido pela distância e duração planejada igual ao tempo objetivo

### Requirement: Instrução explícita à geração

O contexto enviado à geração de uma semana com prova SHALL informar o dia da semana e o nome de
cada prova e instruir que nenhum outro treino seja prescrito nesses dias.

#### Scenario: Semana com prova no domingo
- **WHEN** o contexto da geração é montado para uma semana com prova no domingo
- **THEN** o contexto contém o dia da semana, o nome da prova e a instrução de não prescrever outro treino nesse dia

### Requirement: Prova inserida em semana já gerada reabre a revisão

Quando uma prova não cancelada passa a cair em uma semana que já tem plano gerado e ainda não
encerrada, o sistema SHALL inserir o treino `PROVA` no dia, descartando o treino planejado
pendente que estava lá, recalcular o volume planejado e, se o plano estava aprovado, colocá-lo de
volta em aguardando revisão com o motivo `PROVA_INSERIDA`. Quando a prova é cancelada ou movida
para fora da semana, o treino `PROVA` pendente SHALL ser removido e o plano aprovado SHALL voltar
para revisão com o motivo `PROVA_REMOVIDA`. Treino `PROVA` já realizado MUST NOT ser removido.

#### Scenario: Prova cadastrada em semana aprovada
- **WHEN** o atleta cadastra uma prova para o sábado da semana corrente, cujo plano está aprovado
- **THEN** o treino do sábado é substituído por `PROVA`, o volume é recalculado e o plano fica aguardando revisão com motivo `PROVA_INSERIDA`

#### Scenario: Prova cadastrada em semana ainda não aprovada
- **WHEN** o plano da semana está aguardando revisão e nunca foi aprovado
- **THEN** o treino `PROVA` é inserido e o status do plano não muda

#### Scenario: Prova movida para outra semana gerada
- **WHEN** o atleta muda a data da prova de uma semana gerada para outra semana gerada
- **THEN** o `PROVA` da semana antiga é removido e ela volta para revisão com `PROVA_REMOVIDA`; a semana nova recebe o `PROVA` e volta para revisão com `PROVA_INSERIDA`

#### Scenario: Prova cancelada com treino já realizado
- **WHEN** o atleta cancela uma prova cujo treino `PROVA` já tem execução registrada
- **THEN** o treino é mantido e o plano não muda

#### Scenario: Semana sem plano gerado
- **WHEN** a prova cai em semana que ainda não tem plano
- **THEN** nada acontece agora; a prova entra quando a semana for gerada

### Requirement: Plano reaberto continua visível ao atleta

Um plano que voltou a aguardar revisão por reabertura SHALL continuar sendo o plano devolvido ao
atleta para aquela semana, com os treinos atualizados. O motivo da reabertura SHALL ser exposto ao
treinador na revisão e limpo quando o plano for aprovado ou rejeitado.

#### Scenario: Atleta consulta o plano reaberto
- **WHEN** o atleta consulta o plano da semana corrente após a reabertura
- **THEN** recebe o plano reaberto com o treino `PROVA`, não o plano da semana anterior

#### Scenario: Coach vê o motivo
- **WHEN** o treinador abre a revisão de um plano reaberto
- **THEN** o plano exibe o motivo `PROVA_INSERIDA` ou `PROVA_REMOVIDA`

#### Scenario: Aprovação limpa o motivo
- **WHEN** o treinador aprova o plano reaberto
- **THEN** o plano fica aprovado, sem motivo de reabertura, e o evento de aprovação é publicado como em qualquer aprovação

### Requirement: Execução do treino de prova fecha o resultado da prova

Sempre que um treino realizado é vinculado a um treino planejado do tipo `PROVA`, por qualquer
caminho (registro manual do atleta, lançamento pelo treinador, reconciliação de arquivo FIT ou de
atividade Strava), o sistema SHALL marcar a prova vinculada como realizada e registrar como tempo
realizado a duração do treino realizado. Se o vínculo for refeito para outro realizado, o tempo
SHALL seguir o novo vínculo. O sistema MUST NOT desmarcar a prova como realizada automaticamente.

#### Scenario: Registro manual no dia da prova
- **WHEN** o atleta registra um treino manual do tipo `PROVA` na data da prova
- **THEN** o realizado vincula ao treino `PROVA`, o treino fica realizado e a prova fica realizada com o tempo do treino

#### Scenario: Reconciliação de atividade importada
- **WHEN** uma atividade FIT ou Strava é reconciliada ao treino `PROVA`
- **THEN** a prova fica realizada com o tempo da atividade

#### Scenario: Vínculo refeito
- **WHEN** o vínculo do treino `PROVA` é trocado para outro realizado com duração diferente
- **THEN** o tempo realizado da prova passa a ser o do novo realizado

#### Scenario: Vínculo desfeito
- **WHEN** o vínculo é desfeito e nenhum realizado fica ligado ao treino `PROVA`
- **THEN** a prova permanece marcada como realizada com o último tempo registrado

### Requirement: Agenda do atleta destaca o dia da prova

A agenda semanal do atleta SHALL apresentar o treino `PROVA` com tratamento visual próprio
(indicador de prova em vez do marcador de tipo, nome da prova como título, distância, o rótulo
"Prova" e a meta quando houver) e SHALL exibir, no topo do plano, a indicação de que há prova na
semana com o dia e os dias faltando.

#### Scenario: Dia da prova na agenda
- **WHEN** a semana tem um treino `PROVA` no domingo
- **THEN** a linha do domingo mostra o indicador de prova, o nome da prova e "21 km · Prova · meta 1:45:00"

#### Scenario: Faixa da semana de prova
- **WHEN** o atleta abre o plano de uma semana com prova
- **THEN** o topo mostra "Prova nesta semana", o nome, o dia e os dias faltando
