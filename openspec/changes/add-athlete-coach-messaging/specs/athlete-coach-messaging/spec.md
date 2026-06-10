## ADDED Requirements

### Requirement: Conversa e histórico de mensagens

O sistema SHALL manter uma `Conversa` 1:1 entre `Atleta` e a assessoria por tenant
(`UNIQUE (tenant_id, atleta_id)`) e SHALL expor `GET /api/v1/conversas/{atletaId}/mensagens`
(tenant-aware, paginado) com o histórico ordenado por `createdAt`. A resposta SHALL ser
`ResponseEntity<Page<MensagemOutputDto>>`.

#### Scenario: Histórico paginado
- **WHEN** existe conversa com mensagens para o `atletaId`
- **THEN** o sistema retorna a página de `MensagemOutputDto` ordenada por `createdAt`

#### Scenario: Conversa criada sob demanda
- **WHEN** ainda não existe `Conversa` para o `atletaId` e uma mensagem é enviada
- **THEN** o sistema cria a `Conversa` de forma idempotente (respeitando `UNIQUE (tenant_id, atleta_id)`)

---

### Requirement: Envio de mensagem de texto

O sistema SHALL expor `POST /api/v1/conversas/{atletaId}/mensagens/texto` (tenant-aware) que persiste
uma mensagem `text` com o `autor` resolvido do papel do usuário autenticado.

#### Scenario: Texto enviado
- **WHEN** um usuário autorizado envia um corpo válido
- **THEN** o sistema persiste a mensagem `text` e retorna `201 Created` com `MensagemOutputDto`

#### Scenario: Corpo inválido
- **WHEN** o conteúdo é nulo/vazio
- **THEN** o sistema retorna `400 Bad Request`

---

### Requirement: Envio de áudio com transcrição assíncrona

O sistema SHALL expor `POST /api/v1/conversas/{atletaId}/mensagens/audio` (tenant-aware) que armazena
o áudio em object storage (referência em `audioRef`), persiste a mensagem `audio` com `transcricao`
nula e dispara a transcrição de forma assíncrona. A falha de transcrição NÃO SHALL reverter a
mensagem.

#### Scenario: Áudio enviado e transcrição disparada
- **WHEN** um usuário autorizado envia um arquivo de áudio
- **THEN** o sistema persiste a mensagem com `audioRef` e `transcricao=null` e inicia a transcrição
  assíncrona; o HTTP response retorna antes de a transcrição concluir

#### Scenario: Falha de transcrição não reverte a mensagem
- **WHEN** a transcrição falha
- **THEN** a mensagem permanece persistida com `transcricao=null` e o erro é logado

---

### Requirement: Autorização por papel na mensageria

O sistema SHALL restringir o acesso às conversas: um `ATLETA` acessa somente a conversa cujo
`atletaId` resolve do próprio token; `TECNICO`/`ADMIN` acessam conversas de atletas do próprio tenant;
atletas de outro tenant SHALL resultar em `404 Not Found`.

#### Scenario: Atleta acessa apenas a própria conversa
- **WHEN** um `ATLETA` chama os endpoints com um `{atletaId}` diferente do seu
- **THEN** o sistema nega o acesso (`403`/`404`) e não retorna mensagens

#### Scenario: Coach acessa atletas do seu tenant
- **WHEN** um `TECNICO` acessa a conversa de um atleta do seu tenant
- **THEN** o sistema retorna a conversa

#### Scenario: Coach e atleta de outro tenant
- **WHEN** o `{atletaId}` pertence a outro tenant
- **THEN** o sistema retorna `404 Not Found`

---

### Requirement: Cartões de ajuste de plano (plan_adjustment)

O sistema SHALL suportar mensagens `plan_adjustment` com `payload` e `status`
(`pending`/`accepted`/`declined`) e SHALL expor ações de aceitar/recusar, idempotentes no
estado-alvo. Aceitar PODE acionar o ajuste de plano do atleta.

#### Scenario: Aceitar cartão de ajuste
- **WHEN** o usuário aceita um cartão `plan_adjustment` `pending`
- **THEN** o status vira `accepted` e o ajuste de plano é acionado

#### Scenario: Ação idempotente
- **WHEN** o usuário aceita um cartão já `accepted`
- **THEN** o sistema responde sem erro e não aciona o ajuste novamente
