# ADR 0013 - Garmin Connect direto como canal dos atletas Garmin, intervals.icu para os demais

## Status
Aceito

## Data
2026-10-23

## Decisores
Founder (Leandro), via grilling (grill-with-docs) sobre os documentos do Garmin Connect Developer
Program v2.0 (15/10/2026) e o levantamento do código do canal intervals.icu

## Contexto

Hoje o intervals.icu é o único canal (ver `CONTEXT.md`: Canal, Conexão, Sincronização) que leva o
treino planejado ao relógio e traz o realizado de volta, para qualquer marca. Para o atleta Garmin
isso exige uma conta extra no intervals.icu e introduz um intermediário com limitações próprias:
o alvo de FC só existe como `%lthr` (em 2026-10-01, 107 bpm chegou ao relógio como 197 bpm), o
uploader tem debounce que precisa de "nudge" (`WorkoutChannel.tocarEvento`), e o realizado chega
já reinterpretado pela plataforma, não como o FIT original.

O Garmin Connect Developer Program (Starter Access: até 1.000 usuários, push-only, sem histórico,
1 client ID) oferece Training API V2 (workout + schedule) e Activity API (push de `activityFiles`
com FIT). O backend já tem o pipeline FIT (`FitParseServiceImpl` → `FitTreinoPersister`) e o seam
`WorkoutChannel`/`StructuredWorkout` desenhado para mais de um adapter.

Restrições contratuais relevantes (License Agreement Rev H): cláusula 15.11 proíbe usar dado
Garmin para treinar/avaliar modelos de IA e reter dado de forma que permita isso; 15.10 exige
declaração de transparência de IA na política de privacidade; 6.4 exige atribuição "Garmin
[modelo]" em toda exibição e export; 4.5 exige consentimento expresso para enviar dado ao Garmin.
O founder informou o uso de IA no cadastro do app no Garmin e considera 15.11 tratado; o texto
enviado deve ser guardado como evidência.

## Opções consideradas

1. Manter o intervals.icu como canal único para todas as marcas (status quo).
2. Garmin direto para todos e descontinuar o intervals.icu (não cobre COROS, Suunto, Polar).
3. Dois canais permanentes: Garmin direto para atleta Garmin, intervals.icu para as demais
   marcas; um canal por atleta, escolhido pela marca do relógio.

## Decisão

Opção 3. Garmin direto (Starter Access) vira o canal obrigatório do atleta Garmin; o intervals.icu
permanece como canal dos demais relógios e não é removido. Um atleta tem um canal só: conectar um
desativa a conexão do outro (mesma mecânica do `autoSyncPausado` do Strava, nunca revertida
automaticamente). Atletas Garmin hoje no intervals.icu migram obrigatoriamente, com aviso no app e
prazo de 30 dias; após o prazo o push do plano para, o realizado continua entrando até migrarem.

Decisões derivadas, fixadas aqui para não serem reabertas:

- **Escopo inicial:** Training API + Activity API. Health API e Courses API ficam para changes
  próprias, com consentimento específico.
- **Alvo no relógio:** FC em bpm absoluto (`HEART_RATE` com `targetValueLow/High`) e pace como
  faixa em m/s. Nunca zona (depende de configuração do atleta no Garmin Connect que o Menthoros
  não vê). Elimina a leitura de LTHR do provedor.
- **Ingestão:** só `activityFiles` (FIT) + `deregistrations` + `userPermissionsChange`. Resumos
  (`activities`, `activityDetails`, `moveIQ`) não são assinados. Atividade manual no Garmin
  (`manual: true`) é ignorada. Só modalidades de corrida, filtradas pelo `activityType` do ping
  antes do download. O ping é persistido e respondido com 200 antes de qualquer processamento;
  download e parse são assíncronos; o binário FIT é apagado após o parse (15.11(e)).
- **Idempotência do push:** `workoutId` e `scheduleId` serializados no `externalId` existente do
  treino planejado (`garmin:<workoutId>:<scheduleId>`); re-aprovação faz `PUT`, exclusão de plano
  faz `DELETE` de schedule e workout — mesmos eventos de domínio de hoje.
- **Erros do canal:** 429 entra no retry existente; 412 (permissão `WORKOUT_IMPORT` ausente) é
  erro de autenticação sem retry, resolvido pelo atleta.
- **Token:** refresh sob demanda mais job diário para tokens com mais de 60 dias, para não perder a
  conexão de atleta parado (refresh token expira em 90 dias e rotaciona a cada uso).
- **Desconexão:** o botão do app chama `DELETE /user/registration`; o webhook `deregistrations`
  marca a conexão como revogada. Treinos realizados já ingeridos permanecem.
- **Histórico:** cold start aceito (ADR-0012); upload de FIT opcional sugerido na conexão.
- **Atribuição:** "Garmin [modelo]" (de `deviceName`, ou "Garmin" quando desconhecido) em todo
  lugar que mostra treino realizado Garmin, inclusive exports, desde a primeira entrega.
- **Webhook:** segmento secreto na URL por ambiente; só `userId` conhecido; 200 sempre.
- **Ambientes:** um client ID só; o webhook aponta para o ambiente de testes até o go-live e depois
  para produção (revisão de domínio de 24–48 h); local usa payloads gravados.
- **Melhores esforços** (`pace-curves` do intervals.icu) ficam indisponíveis para atleta Garmin na
  primeira entrega; cálculo a partir do FIT é feature própria.
- **Onboarding:** `CanalIntegracao` ganha `GARMIN`; a conexão continua sendo feita no perfil, como
  hoje.

## Consequências

### Positivas
- Atleta Garmin conecta uma vez, na própria conta, sem plataforma intermediária.
- Prescrição de FC chega ao relógio exatamente em bpm; some a classe de bug do `%lthr`.
- Realizado entra pelo FIT original, pelo pipeline que já existe; running dynamics vêm da fonte.
- O seam `WorkoutChannel` passa a ter dois adapters reais, o que valida o desenho.

### Negativas / Trade-offs
- Dois canais permanentes: `WorkoutChannel` precisa ser resolvido por atleta, e toda feature que
  depende de API exclusiva de um canal (melhores esforços, LTHR) precisa de caminho equivalente ou
  degradação explícita no outro.
- Sem histórico no Starter: atleta novo começa com carga zerada.
- Dependência contratual direta do Garmin: pode cobrar (10.1), encerrar com 30 dias de aviso (9.2),
  exige notificação de incidente em 24 h, 30 dias de aviso prévio para nova UI com dado Garmin
  (6.6) e revisa conformidade de atribuição.
- Um client ID limita a um ambiente recebendo webhooks por vez.
- Migração obrigatória dos atletas Garmin hoje no intervals.icu (quantidade ainda não levantada).

## Plano de revisão

Reavaliar quando: (a) o Garmin responder formalmente sobre a cláusula 15.11 em sentido contrário ao
assumido; (b) o número de usuários conectados se aproximar de 1.000 ou o histórico virar bloqueio
(gatilhos para Enterprise); (c) o Garmin passar a cobrar pelo Starter; (d) surgir demanda real de
Health API.

## Referências
- Garmin Connect Developer Program v2.0 (15/10/2026): Start Guide, OAuth2 PKCE, Training API V2,
  Activity API, License Agreement Rev H, API Brand Guidelines — PDFs na raiz do workspace.
- `CONTEXT.md`: Canal, Conexão, Sincronização, Fonte.
- ADR-0012 (cold start de carga).
- `apps/menthoros-backend`: `services/WorkoutChannel.java`, `services/impl/IntervalsIcuAdapter.java`,
  `services/impl/FitUploadServiceImpl.java`, `entity/TreinoPlanejado.java` (`externalId`).
- Memo CPO `artifacts/decision-memo-add-watch-brand-connection-guide.md` (premissa mantida).
- Supera `artifacts/docs/architecture/INTEGRACAO_GARMIN_STRAVA_CONSOLIDATED.md`.
