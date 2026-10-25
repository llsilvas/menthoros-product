# Spec Delta — garmin-connection

## Purpose
Conexão do atleta ao Garmin Connect: autorização na conta Garmin do próprio atleta, identidade
estável (`userId`), permissões concedidas, renovação de credencial, revogação pelo app ou pelo
Garmin, e a regra de um canal por atleta.

## ADDED Requirements

### Requirement: Autorização na conta Garmin do atleta
O sistema SHALL iniciar a conexão com uma URL de autorização do Garmin que carrega um desafio PKCE
(S256) e um `state` assinado vinculado ao atleta autenticado. A troca do código por credencial
SHALL acontecer somente no servidor, com o segredo do aplicativo, nunca no navegador. O verificador
PKCE SHALL ser descartado após 10 minutos ou após o primeiro uso.

#### Scenario: Atleta pede para conectar
- **WHEN** um atleta autenticado solicita a conexão Garmin
- **THEN** recebe uma URL de autorização do Garmin com desafio S256 e `state` assinado, e nada é
  gravado ainda como conexão

#### Scenario: Retorno válido do Garmin
- **WHEN** o Garmin redireciona com código e um `state` válido dentro de 10 minutos
- **THEN** o sistema troca o código no servidor, obtém o `userId` e as permissões do atleta no
  Garmin, grava a conexão ativa e devolve o atleta ao perfil com resultado de sucesso

#### Scenario: Retorno adulterado ou tardio
- **WHEN** o `state` é inválido, expirado, já usado, emitido para outro provedor (intervals.icu),
  ou o verificador não existe mais
- **THEN** nenhuma conexão é gravada, o atleta volta ao perfil com erro, e o segredo do aplicativo
  não aparece em log nem em resposta

#### Scenario: Canal desligado por configuração
- **WHEN** o canal Garmin está desabilitado ou sem credenciais configuradas e um atleta pede a URL
  ou o Garmin chama o callback
- **THEN** a resposta é "canal não configurado" (503) e nada é gravado

#### Scenario: Atleta recusa no Garmin
- **WHEN** o Garmin redireciona sem código (consentimento negado)
- **THEN** nenhuma conexão é gravada e o atleta volta ao perfil com a informação de que recusou

### Requirement: Identidade e permissões do atleta no Garmin
A conexão SHALL guardar o `userId` do Garmin como identificador externo do atleta (estável mesmo
após reconexão) e a lista de permissões concedidas. O estado da conexão exposto ao atleta e ao
treinador SHALL indicar se as permissões de importar treino (`WORKOUT_IMPORT`) e exportar
atividade (`ACTIVITY_EXPORT`) estão concedidas.

#### Scenario: Consentimento parcial
- **WHEN** o atleta concede só `ACTIVITY_EXPORT` no Garmin
- **THEN** a conexão é gravada como ativa e o estado mostra que o envio de treino ao relógio não
  está autorizado

#### Scenario: Mudança de permissão notificada pelo Garmin
- **WHEN** o Garmin notifica mudança de permissões para um `userId` conectado
- **THEN** a lista de permissões da conexão é substituída pela nova e o estado reflete a mudança

#### Scenario: Mesmo atleta reconecta
- **WHEN** um atleta desconecta e conecta de novo a mesma conta Garmin
- **THEN** a conexão anterior é reativada com o mesmo `userId`, sem criar uma segunda

#### Scenario: Conta Garmin já usada por outro atleta
- **WHEN** o `userId` devolvido pelo Garmin já pertence a uma conexão ativa de outro atleta
- **THEN** nenhuma conexão é gravada e o atleta volta ao perfil com erro

### Requirement: Renovação de credencial sem intervenção
O sistema SHALL guardar a expiração real da credencial de acesso e da credencial de renovação
informadas pelo Garmin. SHALL renovar a credencial de acesso antes de expirar (margem de 600
segundos) sempre que for usá-la, e SHALL renovar periodicamente a credencial de renovação que
expira em menos de 30 dias, de modo que uma conexão nunca expire por inatividade. A credencial de
renovação nova SHALL substituir a anterior de forma atômica, e só a renovação SHALL alterar a
expiração da credencial de renovação.

#### Scenario: Uso com credencial prestes a expirar
- **WHEN** uma operação precisa da credencial e ela expira em menos de 600 segundos
- **THEN** o sistema renova antes da operação e grava a credencial de renovação nova junto

#### Scenario: Atleta parado
- **WHEN** o job diário encontra uma conexão cuja credencial de renovação expira em menos de 30 dias
- **THEN** renova a credencial sem depender de uso

#### Scenario: Outras gravações não adiam a renovação
- **WHEN** a conexão recebe uma mudança de permissões ou um erro de sincronização
- **THEN** a expiração da credencial de renovação não muda e o job continua a renovar no prazo

#### Scenario: Garmin rejeita a renovação
- **WHEN** o Garmin responde que a credencial de renovação é inválida
- **THEN** a conexão é marcada como revogada com motivo visível ao atleta e ao treinador, e nenhum
  token é mantido

### Requirement: Revogação pelo app
O atleta SHALL poder desconectar o Garmin no próprio perfil. A desconexão SHALL avisar o Garmin
(remoção do registro do usuário) em melhor esforço e SHALL sempre concluir localmente, apagando as
credenciais e marcando a conexão como revogada. Treinos realizados já ingeridos SHALL permanecer.

#### Scenario: Desconexão com Garmin disponível
- **WHEN** o atleta desconecta
- **THEN** o registro é removido no Garmin, a conexão fica revogada, as credenciais são apagadas e
  os treinos realizados continuam visíveis

#### Scenario: Desconexão com Garmin fora do ar
- **WHEN** o atleta desconecta e o Garmin não responde
- **THEN** a conexão fica revogada localmente mesmo assim, e a falha é registrada sem o token

### Requirement: Revogação pelo Garmin
O sistema SHALL receber notificações de desregistro do Garmin num endpoint sem autenticação de
usuário, protegido por um segredo no caminho da URL, respondendo em menos de 30 segundos. O segredo
SHALL NOT aparecer em log nem em contexto de observabilidade. Uma notificação para `userId`
conectado SHALL marcar a conexão como revogada; para `userId` desconhecido SHALL ser ignorada com
200. Segredo incorreto ou não configurado SHALL responder 404.

#### Scenario: Atleta remove o app no Garmin Connect
- **WHEN** chega uma notificação de desregistro com o `userId` de um atleta conectado
- **THEN** a resposta é 200 e a conexão fica revogada

#### Scenario: Segredo errado
- **WHEN** o endpoint é chamado com segmento secreto incorreto
- **THEN** a resposta é 404 e o corpo não é registrado

#### Scenario: Segredo nunca em log
- **WHEN** qualquer chamada chega ao endpoint
- **THEN** a URI registrada em log e no contexto da requisição traz o segmento secreto mascarado

#### Scenario: userId desconhecido
- **WHEN** chega uma notificação para um `userId` sem conexão
- **THEN** a resposta é 200 e nada muda

### Requirement: Um canal por atleta
Um atleta SHALL ter no máximo um canal ativo (Garmin ou intervals.icu). Conectar um canal SHALL
desativar a conexão do outro e SHALL pausar a sincronização automática do Strava do atleta; Strava
conectado depois de um canal ativo SHALL nascer pausado; a pausa SHALL NOT ser revertida
automaticamente ao desconectar.

#### Scenario: Conecta Garmin com intervals.icu ativo
- **WHEN** um atleta com conexão intervals.icu ativa conclui a conexão Garmin
- **THEN** a conexão intervals.icu fica inativa, o Strava fica pausado e o estado mostra só o Garmin
  como canal

#### Scenario: Conecta intervals.icu com Garmin ativo
- **WHEN** um atleta com conexão Garmin ativa conclui a conexão intervals.icu
- **THEN** a conexão Garmin fica revogada (com aviso ao Garmin em melhor esforço) e o intervals.icu
  vira o canal

#### Scenario: Desconecta tudo
- **WHEN** o atleta desconecta o Garmin e não tem outro canal
- **THEN** o Strava permanece pausado

#### Scenario: Strava depois do Garmin
- **WHEN** um atleta com conexão Garmin ativa conecta o Strava
- **THEN** a conexão Strava nasce com a sincronização automática pausada

### Requirement: Consentimento e transparência
Antes de concluir a conexão, o atleta SHALL ver que seus treinos planejados serão enviados ao Garmin
e que dados do Garmin serão processados por sistemas de IA do Menthoros, com link para o aviso de
privacidade do Garmin Connect e para a política de privacidade do Menthoros, que SHALL conter a
declaração de transparência de IA.

#### Scenario: Tela de conexão
- **WHEN** o atleta abre o card de conexão Garmin
- **THEN** vê o aviso de transferência e de processamento por IA com os dois links antes do botão
  "Conectar"
