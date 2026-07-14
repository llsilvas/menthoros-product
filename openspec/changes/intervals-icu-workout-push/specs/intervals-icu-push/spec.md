# Spec delta: intervals-icu-push

> Capability nova: entrega automática de treinos planejados aprovados no dispositivo do atleta
> via intervals.icu. Cobre o contrato de conexão (credencial por atleta), o push na aprovação e
> as garantias de segurança/idempotência. Formato: requirements com cenários BDD verificáveis.

## Requirement: Conexão da conta intervals.icu pelo atleta

O atleta DEVE poder conectar, consultar e desconectar sua conta intervals.icu usando uma API key
pessoal, pelos endpoints `/me` (sem resource-id na URL), e a credencial NUNCA deve ser exposta
após o cadastro.

#### Scenario: Conectar com API key válida
- **Given** um atleta autenticado sem conexão intervals.icu ativa
- **When** ele envia `POST /api/v1/integracoes/me/intervals-icu` com uma API key válida
- **Then** o backend valida a key contra `GET /api/v1/athlete/0` do intervals.icu
- **And** persiste `IntegracaoExterna(plataforma=INTERVALS_ICU)` com `externalAthleteId` retornado
- **And** responde 201 com o status da conexão **sem a API key** (nem mascarada)

#### Scenario: API key inválida é recusada sem persistir
- **Given** um atleta autenticado
- **When** ele envia uma API key que o intervals.icu rejeita (401/403)
- **Then** o backend responde 422 com mensagem curada acionável
- **And** nenhum registro é criado ou alterado

#### Scenario: Status nunca expõe a credencial
- **Given** um atleta com conexão ativa
- **When** ele consulta `GET /api/v1/integracoes/me/intervals-icu`
- **Then** a resposta contém estado, data de conexão, último push e último erro
- **And** não contém a API key em nenhum campo

#### Scenario: Isolamento de autorização
- **Given** dois atletas A e B (mesmo tenant) e um tenant externo T2
- **When** A consulta ou altera a conexão
- **Then** somente a conexão do próprio A (resolvida pelo token) é afetada
- **And** não existe rota que aceite atletaId de terceiro para credencial
- **And** recursos de T2 são invisíveis (404)

## Requirement: Push automático na aprovação do plano

Quando o coach aprova um plano semanal, o sistema DEVE enviar cada treino exportável ao
calendário do intervals.icu do atleta conectado, de forma assíncrona (pós-commit), estruturada
(`workout_doc`) e idempotente (`external_id` determinístico), sem jamais bloquear ou falhar a
aprovação por causa do push.

#### Scenario: Aprovação dispara push estruturado
- **Given** um atleta conectado ao intervals.icu com plano `AGUARDANDO_REVISAO` contendo 3
  treinos com etapas e 1 descanso
- **When** o coach aprova o plano
- **Then** a aprovação responde sucesso imediatamente (push é AFTER_COMMIT + async)
- **And** 3 eventos `category=WORKOUT` são criados no intervals.icu com `workout_doc` estruturado
  e `external_id` = `menthoros-<treinoId>`
- **And** o descanso não gera evento
- **And** cada treino enviado fica `SINCRONIZADO` com `exportadoPara` contendo `INTERVALS_ICU`

#### Scenario: Re-aprovação atualiza sem duplicar
- **Given** um plano já aprovado e enviado, editado pelo coach e re-aprovado
- **When** o push processa os treinos
- **Then** eventos existentes são atualizados via PUT pelo id armazenado em
  `TreinoPlanejado.externalId` (a API do intervals.icu NÃO deduplica por `external_id` —
  comprovado empiricamente)
- **And** nenhum evento duplicado é criado no calendário do atleta

#### Scenario: Reconciliação de órfãos na re-aprovação
- **Given** um plano enviado cujo treino foi removido (ou recriado com novo id) antes da
  re-aprovação
- **When** o push processa a re-aprovação
- **Then** eventos `menthoros-*` da semana do plano sem treino correspondente são deletados do
  intervals.icu
- **And** eventos criados pelo próprio atleta (sem prefixo `menthoros-`) nunca são tocados

#### Scenario: Re-aprovações concorrentes não duplicam processamento
- **Given** duas aprovações/re-aprovações processando o mesmo treino em paralelo
- **When** ambos os workers tentam a transição para `SINCRONIZANDO`
- **Then** apenas um vence o claim atômico (optimistic locking via `@Version`)
- **And** o perdedor desiste silenciosamente, sem erro e sem chamada externa

#### Scenario: Atleta não conectado não gera erro
- **Given** um atleta SEM conexão intervals.icu ativa
- **When** o coach aprova o plano
- **Then** nenhuma chamada externa é feita
- **And** os treinos permanecem `NAO_SINCRONIZADO` (estado informativo, não erro)

#### Scenario: Blocos repetidos chegam N×, nunca N²
- **Given** um treino com bloco de `blocoRepeticoes=4` persistido expandido (8 etapas físicas de
  um ciclo de 2)
- **When** o conversor monta o `workout_doc`
- **Then** o payload contém um bloco `reps: 4` com UMA iteração de 2 steps
- **And** um bloco cujas janelas expandidas não são idênticas é emitido como steps individuais
  sem `reps` (fallback, nunca inferência)

#### Scenario: Alvos convertidos best-effort
- **Given** etapas com `ritmoAlvo="5:30-5:45/km"`, `fcAlvoEtapa="140-150 bpm"` e um alvo
  não parseável
- **When** o conversor monta os steps
- **Then** o ritmo vira `pace {units: secs/km, start: 330, end: 345}`
- **And** a FC vira `hr {units: bpm, start: 140, end: 150}` (sem offset)
- **And** o alvo não parseável produz step sem alvo, sem exceção e sem log de erro

## Requirement: Estados de sincronização e recuperação

Falhas de push DEVEM ser classificadas nos estados existentes de `StatusSincronizacao`, visíveis
ao coach e ao atleta, com retry automático apenas para erros transitórios e limite de tentativas.

#### Scenario: Erro de autenticação interrompe e informa
- **Given** um atleta cuja API key foi revogada no intervals.icu
- **When** o push executa
- **Then** o treino fica `ERRO_AUTENTICACAO` e a conexão registra `lastSyncError`
- **And** não há retry automático
- **And** o atleta vê o erro com ação sugerida na tela de conexão

#### Scenario: Erro transitório entra em retry limitado
- **Given** um push que recebe 429 ou 5xx/timeout
- **When** o scheduler de retry executa
- **Then** o treino é reprocessado respeitando a janela mínima entre tentativas
- **And** o scheduler nunca reprocessa treino em `SINCRONIZANDO` (em voo)
- **And** após o limite de tentativas o estado final é `ERRO_PERMANENTE`, visível ao coach, sem
  loop infinito

#### Scenario: Credencial nunca aparece em log
- **Given** qualquer fluxo desta capability (conexão, push, retry) com logging ativo
- **When** os logs são inspecionados em teste
- **Then** a API key não aparece em nenhuma mensagem, header logado ou stacktrace

## Requirement: Visibilidade do push para o coach

O coach DEVE ver, por treino do plano aprovado, se a prescrição chegou ao dispositivo do atleta,
sem sair da tela de plano.

#### Scenario: Chip de status por treino
- **Given** um plano aprovado exibido no perfil do atleta (visão coach)
- **When** os treinos são renderizados
- **Then** cada treino mostra Enviado ao relógio / Envio pendente / Erro no envio (com a
  mensagem) / Atleta não conectado
- **And** o chip não aparece em plano ainda não aprovado
