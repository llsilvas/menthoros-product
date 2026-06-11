# Proposal: add-athlete-coach-messaging

## Status

Proposed

## Why

O shell do atleta tem a aba `coach` e o shell do coach abre conversas com cada atleta. Os mocks
preveem mensageria atleta↔coach com mensagens de texto, áudio (com transcrição) e cartões de
`plan_adjustment` acionáveis. Hoje não há nenhuma persistência de conversa/mensagem. Esta change é a
mais independente do conjunto — depende apenas de identidade/autorização (#1).

## What Changes

- Entidades `Conversa` (1:1 atleta↔coach por tenant) e `Mensagem` (`tipo` `text`/`audio`/
  `plan_adjustment`, `autor`, `conteudo`, `audioRef`, `transcricao`, `createdAt`) + migrations.
- Endpoints (`@RequireTenant`):
  - `GET /api/v1/conversas/{atletaId}/mensagens` — histórico paginado.
  - `POST /api/v1/conversas/{atletaId}/mensagens/texto` — envia texto.
  - `POST /api/v1/conversas/{atletaId}/mensagens/audio` — envia áudio (armazenamento + transcrição).
  - Ações sobre mensagens `plan_adjustment` (aceitar/recusar).
- Autorização: o atleta só acessa a **própria** conversa; o coach acessa conversas de atletas do seu
  tenant. DTOs `MensagemOutputDto`/`MensagemInputDto` (records).

## Capabilities

### ADDED Capabilities

- `athlete-coach-messaging`: mensageria atleta↔coach com texto, áudio e cartões de ajuste de plano.

## Impact

- **Depende de (por id):** `add-current-user-endpoint` (#1) — identidade/autorização (resolução do
  atleta do token; checagem de tenant do coach).
- **Decisões de design (em `design.md`):** armazenamento de áudio (object storage vs blob),
  transcrição (provider STT), modelo de autorização por papel.
- **Arquivos de produção (trabalho futuro):** `entity/Conversa.java`, `entity/Mensagem.java`,
  repositórios, `MensagemService`/impl, `ConversaController`, DTOs, mapper (null-check), migrations
  `tb_conversa`/`tb_mensagem`, integração STT (config externa).
- **Migrações Flyway:** `tb_conversa` e `tb_mensagem` (próximas versões livres).
