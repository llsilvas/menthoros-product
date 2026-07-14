# Proposal: intervals-icu-workout-push

**Tamanho:** M · **Trilha:** Full (toca dois repos, novo contrato de integração externa, credencial
de terceiro por atleta — risco de segurança/multi-tenancy)

## Status

Proposed (2026-07-14). Sucede a change arquivada `export-planned-workout-fit` (encerrada no gate
0.1 em 2026-07-14 — todos os canais de entrega de `.fit` sem cabo reprovaram: web 406, app roteia
para percurso, USB não montou no macOS). Herda o domínio já especificado lá: des-expansão de
blocos N× (nunca N²), conversão best-effort de alvos, autorização padrão `/me`, export apenas de
plano com review aprovado.

**Canal validado em gate manual (2026-07-14), antes desta proposta:**
`POST /api/v1/athlete/{id}/events` no intervals.icu criou treino estruturado que foi **enviado
automaticamente ao Garmin Connect no mesmo segundo** (`icu_garmin_last_upload` = timestamp da
criação) e apareceu estruturado no relógio do founder ("funcionou no relógio perfeitamente").
Sondagens adicionais na API confirmaram que o campo `workout_doc` estruturado é aceito
diretamente no POST — incluindo alvos de pace em `secs/km` (faixa e valor único), **FC absoluta
em `bpm`** (que a sintaxe de texto NÃO suporta), `%hr`, zonas (`hr_zone`) e blocos aninhados com
`reps` — eliminando a dependência do parser de texto do intervals.icu.

**Product review (2026-07-14): REFINE → condições incorporadas.** Coach-in-the-loop e valor
para o coach aprovados sem ressalva. Dois bloqueantes atendidos nesta revisão do proposal:
(1) gate CA0 formalizado como pré-requisito absoluto dos blocos de implementação, com dono da
decisão de fallback (founder); (2) métrica de sucesso revisada — impacto no coach como métrica
primária e árvore de decisão explícita no critério de revisão. Sugestões incorporadas: OAuth
registrado como follow-up P1 condicionado à adoção (ver Métrica de sucesso).

**Pre-mortem cross-model (Codex, 2026-07-14) — achados incorporados:** premissas de API
comprovadas por sondagem real ANTES da implementação (a API **não deduplica** por
`external_id` — idempotência é client-side; `PUT /events/{id}` validado; `GET /athlete/0`
validado com key real e inválida); contradição fallback-texto × doc-only resolvida (fallback é
decisão de gate que reescreve o design, nunca caminho duplo em runtime); concorrência
especificada (claim atômico via `@Version`, precedência listener × scheduler,
`ERRO_PERMANENTE` como estado final); **reconciliação de eventos órfãos na re-aprovação
incluída no escopo** (treino removido/recriado não deixa prescrição fantasma no relógio);
fixtures de WireMock devem nascer dos transcripts reais capturados no gate 0.

## Why

O atleta continua transcrevendo o plano da semana manualmente para o relógio (ou correndo sem
alvos no pulso), exatamente o problema que `export-planned-workout-fit` atacava — mas agora com
um canal de entrega **comprovado e sem fricção**: o intervals.icu faz a ponte com o Garmin
Connect que a Garmin não abre sem parceria (Training API).

Valor para o coach (persona primária):

- **Elimina a transcrição sem nenhuma ação do atleta por treino:** ao aprovar o plano, os treinos
  estruturados aparecem no calendário do Garmin do atleta automaticamente. Melhor que o download
  `.fit` da change anterior: zero cliques do atleta por treino (era 1 download + 1 import por
  treino, canal que nem existia).
- **Execução mais fiel = análise melhor:** treino no relógio guia o atleta em tempo real; execução
  aderente melhora o dado realizado que o coach analisa (aderência, TSB, decoupling) — fecha o
  ciclo prescreve → executa → analisa.
- **Coach-in-the-loop preservado e reforçado:** o push só acontece na **aprovação** do plano pelo
  coach (`reviewStatus` → APROVADO). Nada gerado por IA chega ao relógio sem o aval explícito do
  coach — o gatilho do push É o ato de aprovação.

Fundação técnica já existente: entidade `IntegracaoExterna` com unique `(atleta_id, plataforma)`
pronta para uma credencial por atleta; campos completos de sincronização em `TreinoPlanejado`
(`statusSincronizacao`, `exportadoPara`, `externalId`, tentativas, helpers de retry) marcados
"PARA FUTURO" desde a criação; padrão de evento `@TransactionalEventListener(AFTER_COMMIT)` +
`@Async` já estabelecido (`SemanaEncerradaEvent`/`WorkoutAnalysisListener`).

## What Changes

### Backend (`apps/menthoros-backend`)

- **Conexão intervals.icu por atleta (novo):** `FonteDados.INTERVALS_ICU` + reuso de
  `IntegracaoExterna` (API key em `accessToken`, id externo `i…` em `externalAthleteId`).
  Endpoints padrão `/me` (atleta gerencia a própria conexão):
  - `POST /api/v1/integracoes/me/intervals-icu` — recebe a API key, **valida contra a API real**
    (`GET /api/v1/athlete/0` autentica e devolve o id externo) antes de persistir;
  - `GET /api/v1/integracoes/me/intervals-icu` — status da conexão (conectado, desde quando,
    último push, último erro) — **nunca retorna a key**;
  - `DELETE /api/v1/integracoes/me/intervals-icu` — desconecta (soft, padrão Strava).
- **`IntervalsIcuWorkoutConverter` (novo, classe pura):** converte `TreinoPlanejado` +
  `EtapaTreino` em `workout_doc` JSON estruturado. Reagrupa etapas persistidas expandidas por
  `blocoId` com verificação de janelas idênticas → bloco `reps` (N×, nunca N²; fallback expandido
  sem reps quando inconsistente). Alvos best-effort a partir dos formatos canônicos do planner:
  `"5:30-5:45/km"` → `pace secs/km`, `"140-150 bpm"` → `hr bpm` (absoluto, sem offset),
  `zonaAlvo` `"Z2"` → `hr_zone`. Alvo não parseável → step sem alvo (o treino ainda vai).
- **`IntervalsIcuPushService` (novo) + `PlanoAprovadoEvent` (novo):** `aprovarPlano` publica o
  evento; listener `AFTER_COMMIT` + `@Async` empurra cada treino exportável do plano como evento
  de calendário no intervals.icu (`external_id` = id do treino para idempotência; re-push
  atualiza em vez de duplicar). Estados via `StatusSincronizacao` existente + helpers de retry
  do `TreinoPlanejado`; retry de erros temporários por scheduler (padrão
  `DailyActivitySyncScheduler`).
- **`IntervalsIcuWebClientConfig` (novo):** WebClient dedicado com `responseTimeout` obrigatório
  (aprendizado registrado no CLAUDE.md; o client Strava não tem). Tratamento de erro mapeado
  para `StatusSincronizacao`: 401/403 → `ERRO_AUTENTICACAO` (marca conexão com erro), 422 →
  `ERRO_VALIDACAO`, 429 → `ERRO_LIMITE_RATE` (retry), 5xx/timeout → `ERRO_TEMPORARIO` (retry).
- **Migration Flyway:** nenhuma coluna nova — só o valor novo do enum `FonteDados` (coluna é
  STRING). Zero mudança de schema.

### Frontend (`apps/menthoros-front`)

- **Atleta — conexão intervals.icu:** primeira seção real da `AthleteProfilePage` (hoje
  placeholder): card "Conexões" com input de API key (com link "onde encontro?"), estado
  conectado/desconectado, último push e erro legível. Sem OAuth redirect — form simples.
- **Coach — visibilidade do push (superfície mínima de review):** chip de status por treino no
  `TreinoCard` (`CurrentWeekPlan`) — Enviado ao relógio / Pendente / Erro / Atleta não conectado
  — exigindo expor `statusSincronizacao` no DTO de resumo do plano. O coach precisa saber se a
  prescrição chegou ao pulso sem perguntar ao atleta.

### Fora de escopo

- **OAuth multiusuário do intervals.icu** (registro da aplicação com o mantenedor) — evolução
  natural quando houver volume; o MVP usa API key por atleta, que o próprio atleta cola.
- **Garmin Training API** (parceria direta) — segue no roadmap como canal nativo de longo prazo;
  os campos `exportadoPara`/`metadadosSincronizacao` acomodam múltiplas plataformas.
- Sincronização contínua fora do ciclo de aprovação: a reconciliação (push + deleção de
  órfãos) acontece **somente** no ato de aprovação/re-aprovação — edições sem re-aprovar não
  propagam (coerente com coach-in-the-loop: o que vai ao relógio é o que foi aprovado).
- Download `.fit` manual (a change anterior morreu com o canal; não ressuscitar).
- Criptografia at-rest de credenciais — os tokens Strava já são TEXT puro; padronizar
  criptografia é débito transversal registrado, não escopo desta change.
- Wellness/atividades do intervals.icu (só push de treino planejado, direção única).

## Critérios de aceite

- **CA0 — Gate residual de canal:** um push real usando `workout_doc` estruturado **sem
  `description`** (incluindo alvo de FC absoluta em bpm e bloco `reps`) chega ao relógio com os
  steps e alvos corretos, validado com a conta do founder e registrado no `tasks.md` antes dos
  blocos de implementação. (O canal texto→Garmin já foi validado em 2026-07-14; falta confirmar
  o doc-only de ponta a ponta.)
- **CA1 — Conexão:** API key inválida é recusada no POST com mensagem curada (nenhum registro
  persistido); key válida persiste `IntegracaoExterna` com `externalAthleteId` preenchido; o GET
  de status nunca expõe a key (nem mascarada); DELETE desconecta e pushes seguintes marcam
  `ERRO_AUTENTICACAO`/atleta não conectado sem chamar a API.
- **CA2 — Push na aprovação:** aprovar um plano com atleta conectado cria no intervals.icu um
  evento por treino exportável (descanso/sem conteúdo ficam de fora), com `external_id`
  determinístico; aprovar de novo (re-aprovação após edição) **atualiza** os eventos em vez de
  duplicar; a resposta do endpoint de aprovação não espera o push (assíncrono pós-commit).
- **CA3 — Estrutura fiel:** blocos persistidos expandidos com `blocoRepeticoes` N viram bloco
  `reps: N` com UMA iteração (N×, nunca N²; verificação de janelas idênticas com fallback
  expandido); etapas em ordem; duração usa distância quando presente, senão tempo, senão step
  aberto; nome/descrição do treino e das etapas legíveis no evento.
- **CA4 — Alvos best-effort:** `"5:30-5:45/km"` → pace 330-345 secs/km (teste unitário por
  formato); `"140-150 bpm"` → hr bpm 140-150; `zonaAlvo` → `hr_zone`; ritmo vence FC quando
  ambos presentes; string fora dos padrões → step sem alvo, sem falha, sem log de erro.
- **CA5 — Estados e retry:** 401 marca `ERRO_AUTENTICACAO` e a conexão exibe o erro ao atleta;
  429/5xx/timeout marcam retry e o scheduler reprocessa até o limite de tentativas existente;
  atleta sem conexão não gera chamada nem erro — status informativo. A API key nunca aparece em
  log (verificado por teste que inspeciona o log capturado).
- **CA6 — Autorização:** endpoints `/me` resolvem o atleta pelo token (`resolverAtletaIdAtual`);
  ATLETA não lê/escreve conexão de outro atleta; cross-tenant não existe (404); push respeita
  tenant guard nas queries (padrão scheduler Strava).
- **CA7 — Front:** atleta conecta/desconecta e vê status com erro legível; chip de status por
  treino visível para o coach no plano; estados de loading/erro não engolem a mensagem do
  backend.
- **CA8 — Sem regressão:** `./mvnw clean test` e `npm run lint && npm run build` verdes.

## Métrica de sucesso

> Revisada após o product review (2026-07-14): a métrica primária mede o impacto no coach; a
> taxa técnica é suporte, não norte.

- **Primária — impacto no coach:** **zero treinos recriados manualmente no Garmin Connect** para
  atletas conectados, nas primeiras 4 semanas. Verificação com o coach fundador cruzando o dado
  objetivo: nº de treinos `SINCRONIZADO` (campos de sync existentes) vs. relato de transcrição
  manual. Hoje a transcrição custa 5-10 min por treino estruturado; o alvo é esse custo ir a
  zero para a base conectada.
- **Suporte — saúde da entrega:** ≥ 90% dos treinos exportáveis de planos aprovados de atletas
  conectados ficam `SINCRONIZADO` em até 10 minutos da aprovação (query direta nos campos de
  sync, sem tabela nova).
- **Critério de revisão (árvore de decisão explícita):** se < 50% dos atletas ativos conectarem
  o intervals.icu em 4 semanas, decisão do founder entre três caminhos: **(A)** priorizar OAuth
  do intervals.icu (elimina a fricção da key — evolução conhecida, registrar como change P1);
  **(B)** acelerar a application da Garmin Training API (canal nativo, sem conta de terceiro);
  **(C)** onboarding assistido (instruções em vídeo/call nos primeiros atletas) e re-medir por
  mais 4 semanas. Rollback da change só se, além da conexão baixa, o push falhar em manter a
  métrica de suporte para quem conectou.

## Open Questions & Assumptions

- **RESOLVIDO (gate CA0 fechado em 2026-07-14): push `workout_doc`-only chega ao relógio.**
  Evento doc-only com pace, FC bpm absoluta e bloco `reps: 4` verificado no relógio do founder
  no mesmo dia ("apareceu certinho") — task 0.1. O design D2 (doc-only, sem caminho texto) está
  confirmado como vigente; blocos de implementação liberados.
- **Aberto: um step pode carregar pace E FC?** O `workout_doc` parece aceitar ambos; o Garmin
  aceita um alvo primário por step. Premissa herdada: ritmo vence, FC vai na descrição do step.
  Confirmar no gate CA0 e ajustar o conversor se o intervals.icu propagar ambos.
- **Resolvido (pre-mortem): ciclo de vida do evento.** Re-aprovação atualiza pelo id
  armazenado e **reconcilia órfãos** — eventos `menthoros-*` da semana sem treino
  correspondente são deletados (design D3). Eventos do próprio atleta nunca são tocados.
- **Assumido: a API key é do atleta e o atleta a gerencia.** Diferente do Strava (coach conecta
  na tela de atletas), a key do intervals.icu é pessoal — a superfície é do atleta. O coach vê
  o status, não gerencia a credencial.
- **Assumido: zonas do intervals.icu ≈ zonas do atleta.** `hr_zone` é resolvida pelas zonas
  configuradas no intervals.icu do atleta, que podem divergir das do Menthoros (mesma questão da
  change anterior). MVP: zona vai como zona; alvos absolutos (bpm/pace) não têm esse problema e
  são os formatos canônicos do planner.
- **Assumido: rate limit folgado.** 5.000 chamadas/dia por key **do atleta** (não global);
  um plano semanal = ~5-7 POSTs na aprovação. Sem risco realista no MVP; 429 tem retry mesmo
  assim.
- **Assumido: credencial em TEXT puro segue o padrão Strava.** Registrado como débito
  transversal de criptografia at-rest (junto com os tokens OAuth) — não ampliado por esta change
  (a key é revogável pelo atleta no intervals.icu a qualquer momento).
- **Risco de dependência aceito pelo founder:** intervals.icu é mantido por uma pessoa (David
  Tinker), gratuito, estável há anos e com API pública documentada. Mitigação estrutural: o
  conversor é isolado; a Garmin Training API substitui o transporte sem tocar o domínio.

## Rollback

Change quase 100% aditiva: sem migration de schema (só valor novo em enum STRING), endpoints e
telas novos, evento de domínio novo. O único ponto tocado em código existente é a publicação do
`PlanoAprovadoEvent` em `aprovarPlano` (1 linha) — reverter o PR desliga tudo. Dados residuais
pós-rollback: registros `INTERVALS_ICU` em `tb_integracao_externa` e campos de sync preenchidos
em `TreinoPlanejado` — inertes sem o código (mesma semântica de "PARA FUTURO" que já têm hoje).
Eventos já criados no calendário do intervals.icu dos atletas permanecem (o atleta pode apagar;
sem dado sensível — é o treino dele).

## Riscos e mitigações

- **Push doc-only não chega estruturado ao relógio** (Alto impacto, Baixa probabilidade — o
  canal texto já provou a ponte e o doc é o formato interno do parse): gate CA0 é a primeira
  task; se falhar, fallback é gerar `description` em sintaxe de texto (validada: pace com
  sufixo `Pace`, `% HR`, zonas — sem bpm absoluto, que degradaria para `%hr` calculado).
- **Sintaxe de texto como fallback perde FC absoluta** (Médio): sondagem mostrou que
  `"145 bpm"` no texto é **absorvido na duração** (falso-positivo perigoso). Por isso o design
  manda `workout_doc` estruturado e proíbe o caminho texto no conversor de produção.
- **API key vaza em log/response** (Alto impacto, Média probabilidade sem guarda): CA1/CA5
  exigem testes de não-exposição (status sem key, log capturado sem key); code review com foco
  nisso; key só trafega no POST de conexão e no header Basic do client.
- **Re-aprovação duplica eventos no calendário** (Médio — **a API comprovadamente NÃO deduplica
  por `external_id`**, sondado em 2026-07-14): idempotência client-side — PUT pelo id do evento
  gravado em `TreinoPlanejado.externalId`; id perdido → listagem por data + match de
  `external_id` antes de POST (design D3); CA2 testa o caminho de re-aprovação explicitamente.
- **N² no relógio via blocos expandidos** (Alto impacto se escapar — herdado): mesma mitigação
  da change anterior, agora no conversor JSON: des-expansão com verificação de janelas
  idênticas, fallback expandido sem `reps`; teste 4×→4× no CI.
- **Listener assíncrono falha em silêncio** (Médio): estados de sync visíveis nas duas
  superfícies (chip do coach, status do atleta); erro persiste em `erroSincronizacao`/
  `lastSyncError`; scheduler de retry com limite de tentativas, estado final `ERRO_PERMANENTE`
  e log estruturado.
- **Re-aprovações concorrentes ou corrida listener × scheduler** (Médio — achado do pre-mortem):
  dois workers processando o mesmo treino duplicariam eventos ou sobrescreveriam estado. Claim
  atômico pela transição condicional a `SINCRONIZANDO` com `@Version` (perdedor desiste
  silencioso) + scheduler restrito aos estados de retry (design D3); cenário BDD específico na
  spec.
- **Fricção da API key mata a adoção** (Médio — atleta precisa criar conta + colar key):
  métrica de conexão com critério de revisão explícito (< 50% em 4 semanas → investigar antes
  de evoluir); instruções passo a passo na tela de conexão; OAuth é a evolução conhecida.
- **intervals.icu muda a API ou sai do ar** (Baixa probabilidade, mantenedor único): client
  isolado atrás de interface; estados de erro já modelados; Garmin Training API é o plano de
  substituição do transporte.
