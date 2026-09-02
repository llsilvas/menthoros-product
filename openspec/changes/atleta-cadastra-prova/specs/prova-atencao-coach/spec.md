# Capability — prova-atencao-coach

## Purpose

Garante que o treinador tome ciência de toda prova que o atleta cria, altera ou cancela, pela
fila de atenção que ele já consulta, e registra essa ciência na própria prova.

## ADDED Requirements

### Requirement: Prova alterada pelo atleta fica pendente de ciência do coach

Toda prova SHALL carregar o indicador `revisadaPeloCoach`, o motivo da pendência
(`motivoRevisao`: `NOVA`, `DATA_ALTERADA`, `ALVO_TROCADA`, `CANCELADA`) e, quando o motivo é
`ALVO_TROCADA`, o nome da prova-alvo substituída. Quando um usuário com papel de atleta cria uma
prova, cancela uma prova, ou altera data, distância ou o indicador de prova-alvo, o sistema SHALL
colocar `revisadaPeloCoach = false` e gravar o motivo correspondente. Alteração restrita a nome ou tempo objetivo
MUST NOT alterar o indicador. Gravações feitas por treinador ou administrador MUST NOT alterar o
indicador. Provas existentes antes desta capability SHALL nascer com `revisadaPeloCoach = true`.

#### Scenario: Atleta cria prova
- **WHEN** um atleta cria uma prova
- **THEN** a prova fica com `revisadaPeloCoach = false` e `motivoRevisao = NOVA`

#### Scenario: Atleta troca a prova-alvo
- **WHEN** um atleta marca a prova B como alvo enquanto A era a alvo
- **THEN** B fica com `revisadaPeloCoach = false`, `motivoRevisao = ALVO_TROCADA` e o nome de A registrado como alvo anterior

#### Scenario: Atleta muda a data
- **WHEN** um atleta altera a data de uma prova já vista pelo coach
- **THEN** `revisadaPeloCoach` volta a `false`

#### Scenario: Atleta muda só o nome
- **WHEN** um atleta altera apenas o nome de uma prova já vista pelo coach
- **THEN** `revisadaPeloCoach` permanece `true`

#### Scenario: Coach edita a prova
- **WHEN** um treinador altera a data de uma prova
- **THEN** `revisadaPeloCoach` não muda

#### Scenario: Atleta cancela
- **WHEN** um atleta cancela uma prova
- **THEN** a prova cancelada fica com `revisadaPeloCoach = false`

### Requirement: Coach registra ciência

O sistema SHALL expor `PATCH /api/v1/atletas/{atletaId}/provas/{provaId}/ciente`, restrito aos
papéis de treinador e administrador do tenant da prova, que coloca `revisadaPeloCoach = true`.
Chamar em prova já revisada MUST ser idempotente. O registro de ciência SHALL limpar o motivo e o
nome da alvo anterior.

#### Scenario: Ciência registrada
- **WHEN** um treinador do tenant chama o endpoint em uma prova pendente
- **THEN** responde `200`, a prova fica `revisadaPeloCoach = true`

#### Scenario: Chamada repetida
- **WHEN** o endpoint é chamado em prova já revisada
- **THEN** responde `200` sem alterar nada

#### Scenario: Atleta tenta dar ciência
- **WHEN** um usuário com papel de atleta chama o endpoint
- **THEN** responde `403`

#### Scenario: Prova de outro tenant
- **WHEN** um treinador chama o endpoint com prova de outro tenant
- **THEN** responde `404`

### Requirement: Prova pendente aparece na fila de atenção do coach

A fila de atenção do treinador SHALL produzir um sinal com motivo `PROVA_ATLETA` para todo
atleta do tenant que tenha ao menos uma prova futura ou cancelada com `revisadaPeloCoach = false`,
sujeito ao corte de severidade e ao limite de itens que a fila já aplica. A severidade SHALL ser
`CRITICA` quando a prova pendente tem preparação curta ou `motivoRevisao = ALVO_TROCADA`; `ALTA`
nos demais casos. A evidência do item SHALL trazer nome da prova, data, distância, "N de M
semanas" (semanas faltando e mínimo) e o motivo, incluindo o nome da alvo anterior quando houver.
O sinal SHALL deixar de existir quando não restar prova pendente para o atleta. Como a fila pode
omitir o atleta por limite, o perfil do atleta SHALL listar as provas pendentes de ciência
independentemente da fila.

#### Scenario: Prova nova dentro do prazo
- **WHEN** um atleta cadastra uma prova com preparação suficiente
- **THEN** a fila do coach lista o atleta com motivo `PROVA_ATLETA`, severidade `ALTA` e
  evidência com nome, data e "N de M semanas"

#### Scenario: Prova nova com preparação curta
- **WHEN** um atleta cadastra uma maratona para daqui a 8 semanas
- **THEN** o item tem severidade `CRITICA` e evidência "8 de 16 semanas"

#### Scenario: Troca de prova-alvo
- **WHEN** um atleta marca uma prova como alvo substituindo outra
- **THEN** o item tem severidade `CRITICA` e a evidência traz "alvo trocada: antes <nome da anterior>"

#### Scenario: Atleta fora da fila por limite
- **WHEN** a fila do tenant já tem 20 itens de severidade maior e o atleta com prova pendente fica de fora
- **THEN** o perfil do atleta ainda lista a prova como pendente de ciência, com o botão de ciência

#### Scenario: Ciência resolve o item
- **WHEN** o coach registra ciência da única prova pendente de um atleta sem outros sinais
- **THEN** o atleta deixa de aparecer na fila

#### Scenario: Atleta com outro sinal mais grave
- **WHEN** o atleta também tem sinal de fadiga `CRITICA`
- **THEN** a fila mantém um item por atleta, com o motivo principal pelo peso, e a prova aparece
  entre as evidências

### Requirement: Sinal de prova não gera sugestão automática

O processo que converte itens da fila de atenção em sugestões ao treinador SHALL ignorar o
motivo `PROVA_ATLETA` sem registrar aviso.

#### Scenario: Job diário com item de prova
- **WHEN** o job de sugestões encontra um item cujo motivo principal é `PROVA_ATLETA`
- **THEN** nenhuma sugestão é criada e nenhum aviso é logado
