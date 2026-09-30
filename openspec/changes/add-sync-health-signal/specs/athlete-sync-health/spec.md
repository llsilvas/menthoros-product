# athlete-sync-health

## ADDED Requirements

### Requirement: Último pull de atividades com sucesso
O sistema SHALL registrar, por conexão intervals.icu e Strava, o instante do último pull de atividades
concluído sem erro, separado do push de treino planejado.

#### Scenario: Push não conta como pull
- **WHEN** um treino planejado é enviado ao intervals.icu
- **THEN** o instante do último pull com sucesso não muda

#### Scenario: Pull com token revogado
- **WHEN** o pull recebe 401
- **THEN** o instante do último pull com sucesso não muda e o erro é registrado

### Requirement: Saúde da sincronização por atleta
O sistema SHALL classificar a sincronização do atleta em `OK`, `COM_ERRO` ou `SEM_INTEGRACAO`, considerando
as conexões intervals.icu e Strava do tenant do atleta, e expô-la no perfil do coach com o último pull com
sucesso e uma categoria de erro — nunca a mensagem crua da API externa.

#### Scenario: Uma integração falha, a outra funciona
- **WHEN** o intervals.icu tem erro e o Strava teve pull com sucesso há 2 dias
- **THEN** o status é `OK`

#### Scenario: Sem integração
- **WHEN** o atleta não tem conexão
- **THEN** o status é `SEM_INTEGRACAO`

### Requirement: Lacuna explicada pela sincronização
Na aba Diagnóstico, uma lacuna aberta de atleta com status `COM_ERRO` SHALL ser rotulada "Sem sincronização
com o <plataforma> desde dd/MM"; com `OK` ou `SEM_INTEGRACAO`, "Sem treinos registrados".

#### Scenario: Token revogado
- **WHEN** a lacuna está aberta desde 16/09 e o intervals.icu está com erro, com último pull ok em 15/09
- **THEN** a legenda diz "Sem sincronização com o intervals.icu desde 15/09"
