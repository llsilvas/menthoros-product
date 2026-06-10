# Tasks: add-athlete-coach-messaging

## 1. Modelo & Migrações

- [ ] 1.1 Migration `tb_conversa` (PK uuid, `tenant_id`, FK `atleta_id` CASCADE,
  `uk_conversa_atleta UNIQUE (tenant_id, atleta_id)`, `created_at`).
- [ ] 1.2 Migration `tb_mensagem` (PK uuid, `tenant_id`, FK `conversa_id` CASCADE, `autor`, `tipo`,
  `conteudo`, `audio_ref`, `transcricao`, `payload` JSONB, `status`, `created_at`; índices
  `idx_mensagem_conversa` + `(tenant_id, conversa_id)`).
- [ ] 1.3 `entity/Conversa.java`, `entity/Mensagem.java` + enums (`AutorMensagem`, `TipoMensagem`,
  `StatusMensagem`).
- [ ] 1.4 Repositórios com queries tenant-aware.

## 2. Infra externa

- [ ] 2.1 Integração de object storage (bucket por `tenant_id`, URLs assinadas) p/ áudio.
- [ ] 2.2 Interface `SpeechToTextService` + implementação do provider escolhido; transcrição
  assíncrona (evento após commit).

## 3. Service

- [ ] 3.1 `getOrCreateConversa(atletaId)` (idempotente; respeita `uk_conversa_atleta`).
- [ ] 3.2 `listarMensagens(atletaId, page)` (read-only, tenant-aware + checagem de papel).
- [ ] 3.3 `enviarTexto(atletaId, input)` persiste mensagem `text`.
- [ ] 3.4 `enviarAudio(atletaId, file)` faz upload, persiste `audio` com `transcricao=null`, dispara
  STT assíncrono. JavaDoc `Idempotent: NO`, `Side Effects: storage + DB + async STT`,
  `Tenant-aware: YES`.
- [ ] 3.5 Ações de `plan_adjustment` (`aceitar`/`recusar`, idempotentes; aceitar pode acionar ajuste
  de plano).

## 4. Controller

- [ ] 4.1 `ConversaController` `@RequestMapping("/api/v1/conversas")` `@RequireTenant` `@Tag`.
- [ ] 4.2 `GET /{atletaId}/mensagens` → `ResponseEntity<Page<MensagemOutputDto>>`.
- [ ] 4.3 `POST /{atletaId}/mensagens/texto` → `ResponseEntity<MensagemOutputDto>` (201).
- [ ] 4.4 `POST /{atletaId}/mensagens/audio` → `ResponseEntity<MensagemOutputDto>` (201).
- [ ] 4.5 `POST /{atletaId}/mensagens/{id}/plan-adjustment/aceitar|recusar`.
- [ ] 4.6 Autorização: `ATLETA` só a própria conversa; `TECNICO`/`ADMIN` atletas do tenant;
  `@Operation`/`@ApiResponses` (200/201/400/403/404).

## 5. Testes

- [ ] 5.1 Atleta acessa só a própria conversa (`{atletaId}` diferente → 403/404).
- [ ] 5.2 Coach acessa atletas do tenant; atleta de outro tenant → 404.
- [ ] 5.3 Texto persistido; áudio persiste com `transcricao=null` e dispara STT (verify async);
  falha de STT não reverte a mensagem.
- [ ] 5.4 `plan_adjustment` aceitar/recusar idempotente; aceitar aciona ajuste (verify).
- [ ] 5.5 `getOrCreateConversa` idempotente (não viola `uk_conversa_atleta`).
- [ ] 5.6 `./mvnw clean test` — verde.
