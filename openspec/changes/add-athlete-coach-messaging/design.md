# Design: add-athlete-coach-messaging

## Decisão 1 — Armazenamento de áudio

**Escolhido:** object storage (S3-compatível), referenciado por `Mensagem.audioRef` (chave/URL), e
**não** blob no Postgres.

Justificativa: áudios são binários grandes; mantê-los no banco infla o storage transacional, os
backups e a latência. A tabela guarda apenas a referência + metadados (duração, mime, tamanho). O
upload usa o bucket do tenant (prefixo por `tenant_id`) com URLs assinadas para leitura. Se nenhum
object storage estiver disponível no ambiente, o design admite um fallback de blob explicitamente
marcado como provisório — mas o contrato (`audioRef`) não muda.

## Decisão 2 — Transcrição (STT)

**Escolhido:** transcrição assíncrona após o upload, gravada em `Mensagem.transcricao`.

- O `POST .../audio` persiste a mensagem com `transcricao` nula e dispara a transcrição de forma
  assíncrona (evento após commit), sem bloquear o request — mesmo padrão da análise de workout do
  projeto.
- Provider STT configurável (preferência por reuso da stack de IA já presente; caso o provider de
  transcrição seja distinto, isolar atrás de uma interface `SpeechToTextService`).
- Falha de transcrição NÃO reverte a mensagem; fica `transcricao = null` e re-tentável.

## Decisão 3 — Autorização por papel

- Conversa é 1:1 entre um `Atleta` e a assessoria (coaches do tenant), escopada por `tenant_id`.
- `ATLETA`: só acessa a conversa cujo `atletaId` resolve do próprio token (vínculo de #1). Tentar
  acessar `{atletaId}` diferente → `403`/`404`.
- `TECNICO`/`ADMIN`: acessam qualquer conversa de atleta do **seu** tenant; atleta de outro tenant →
  `404`.
- `VISUALIZADOR`: leitura apenas, sem envio.

## Modelo de dados

`tb_conversa`
- `id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL`,
  `atleta_id UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE`,
  `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `CONSTRAINT uk_conversa_atleta UNIQUE (tenant_id, atleta_id)`.

`tb_mensagem`
- `id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID NOT NULL`,
  `conversa_id UUID NOT NULL REFERENCES tb_conversa(id) ON DELETE CASCADE`,
  `autor VARCHAR NOT NULL` (`atleta`/`coach`), `tipo VARCHAR NOT NULL`
  (`text`/`audio`/`plan_adjustment`), `conteudo TEXT`, `audio_ref VARCHAR`, `transcricao TEXT`,
  `payload JSONB` (para `plan_adjustment`), `status VARCHAR`,
  `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- índices: `idx_mensagem_conversa`, composto `(tenant_id, conversa_id)`.

## Cartões plan_adjustment

Mensagens `plan_adjustment` carregam um `payload` (proposta de ajuste) e um `status`
(`pending`/`accepted`/`declined`). Aceitar/recusar é idempotente no estado-alvo; aceitar pode acionar
o ajuste de plano (reuso da infra de plano), análogo ao efeito de `add-coach-suggestion-inbox`.

## Alternativas consideradas

- **Áudio como blob no Postgres:** rejeitado (custo de storage/backup/latência).
- **Transcrição síncrona no upload:** rejeitado — bloqueia o request e acopla ao tempo do STT.
