# Proposal: export-planned-workout-fit

**Tamanho:** M · **Trilha:** Full (toca dois repos, contrato de API novo, incerteza de design no
parse dos alvos textuais)

## Status

**ENCERRADA NO GATE 0.1 (2026-07-14) — adiada em favor da Garmin Training API.** A validação
do canal de entrega (CA0/design D0) reprovou: Garmin Connect web só importa *atividade*
(406 para workout .fit), o app do celular roteia o arquivo para import de *percurso*, e o
único canal existente é USB `GARMIN/NEWFILES` (que ainda exige cliente MTP no macOS) —
inviável para o fluxo do atleta e insuficiente para o ganho do coach. Zero código de produção
escrito. Decisão do founder: iniciar a application da **Garmin Training API** (parceria) e
levar o domínio já especificado (des-expansão N×, parser de alvos, autorização `/me`,
superfície front) para a change futura de push sync. Detalhes registrados na task 0.1.

Proposed (2026-07-14). Decisões de escopo validadas com o founder na criação:
granularidade = **por treino + ZIP da semana**; alvos = **parse best-effort com fallback**;
acesso = **atleta e coach, apenas plano com review aprovado**.

**Product review (2026-07-14): GO com condições** — task 0 como gate obrigatório, métrica de
adoção decisória (< 10% → investigar antes de push automático), timing no roadmap em aberto
(ver Open Questions).

**Pre-mortem adversarial local (2026-07-14, contra o código real) — 3 achados críticos
incorporados ao design:** blocos repetidos são persistidos **expandidos** no banco (aplicar
repeat ×N em cima daria N² no relógio — design D2 des-expande com verificação); o **canal de
import** de workout no Garmin Connect precisa ser validado antes de qualquer encoder (design
D0, gate absoluto); a autorização segue o padrão `/me`, não o `PlanoTreinoController`, que tem
um **IDOR intra-tenant pré-existente** (registrado abaixo como débito independente). Achados
menores também incorporados: unidades dos setters tipados do SDK, CORS não expõe
`Content-Disposition`, semântica de id conflitante na collection `/planos`, colisão de nomes no
ZIP, `product`/`serialNumber≠0` no FileIdMesg.

**Pre-mortem cross-model (Codex, 2026-07-14) — 1 achado nesta change, incorporado:** a change
introduzia endpoints binários sensíveis a autorização sem delta de requisitos OpenSpec
(`specs/`), deixando o contrato da API fora da revisão verificável e sujeito a drift na
implementação (especialmente IDOR intra-tenant do ATLETA e acesso restrito a plano aprovado).
Resolvido: criado `specs/fit-workout-export/spec.md` cobrindo download individual, ZIP semanal,
acesso apenas a plano aprovado, auto-resolução do ATLETA, isolamento de assessoria para
TECNICO/ADMIN, CORS `Content-Disposition`, semana vazia/nomes duplicados e download stateless.

## Why

Hoje o atleta recebe o plano da semana como leitura na tela (`AthletePlanPage`) e precisa
**transcrever manualmente** cada treino estruturado para o relógio (criar o workout no Garmin
Connect passo a passo) — ou, pior, correr "de cabeça" sem os alvos de pace/FC no pulso. Todo o
dado necessário já existe estruturado no Menthoros: `TreinoPlanejado` + `EtapaTreino` carregam
ordem, tipo de etapa, duração, distância, alvos de FC e ritmo, repetições e blocos repetidos.

Valor para o coach (persona primária):

- **Elimina o retrabalho de transcrição:** hoje, coach que quer o treino no relógio do atleta
  precisa recriá-lo à mão no Garmin Connect (5-10 min por treino estruturado × atletas × treinos
  de qualidade/semana). Com o export, o treino aprovado vira arquivo importável em um clique —
  o tempo do coach volta para prescrição e análise.
- **Execução mais fiel = análise melhor:** treino no relógio guia o atleta em tempo real (alertas
  de pace/FC por step). Execução aderente à prescrição melhora a qualidade do dado realizado que
  o coach analisa depois (aderência, TSB, decoupling) — fecha o ciclo prescreve → executa → analisa.
- **Coach-in-the-loop preservado:** só planos com `reviewStatus` **aprovado** são exportáveis.
  Nada gerado por IA chega ao relógio do atleta sem o aval do coach.

Fundação técnica já existente: o SDK `com.garmin:fit` 21.205.0 já está no `pom.xml` (usado hoje
só para decode em `FitParseServiceImpl`) e suporta encode de mensagens `Workout`/`WorkoutStep`.
Os campos "PARA FUTURO" de exportação em `TreinoPlanejado` (`exportadoPara`,
`statusSincronizacao`) apontam que essa direção já estava prevista no modelo.

## What Changes

### Backend (`apps/menthoros-backend`)

- **`FitWorkoutEncoderService` (novo):** converte `TreinoPlanejado` + `EtapaTreino` em arquivo
  .fit de workout (`FileIdMesg` type=WORKOUT + `WorkoutMesg` + `WorkoutStepMesg` por etapa),
  usando o SDK já presente. Blocos repetidos (`blocoId`/`blocoRepeticoes`) e `repeticoes` viram
  steps de repeat do protocolo FIT.
- **Parser de alvos best-effort (novo):** interpreta os formatos canônicos que o planner
  realmente gera (patterns forçados no schema LLM em `IaServiceImpl`): `"5:30-5:45/km"` (ritmo,
  sempre faixa com sufixo) e `"140-150 bpm"` (FC absoluta) — mais variantes tolerantes para
  treino editado à mão (`"5:30"`, `"70-80% FCmáx"`, `"Z2"`/`"z2-z3"` via `zonaAlvo` do treino).
  Alvo não parseável → step **sem alvo** (open), o treino ainda exporta.
- **Endpoints novos** (controller dedicado `FitExportController`):
  - `GET /api/v1/planos/treinos/{treinoPlanejadoId}/fit` → um `.fit` (download binário);
  - `GET /api/v1/planos/semanas/{planoSemanalId}/fit` → `.zip` com os `.fit` de todos os
    treinos exportáveis da semana (rota `/semanas/` porque `GET /planos/{id}` existente recebe
    atletaId, não planoId — ver design D4).
- **Autorização (padrão `/me`, design D4):** ATLETA resolve o próprio `atletaId` pelo token e
  baixa apenas os próprios treinos; TECNICO/ADMIN apenas de atletas da própria assessoria
  (tenant guard). Ambos **somente** de plano com `reviewStatus` aprovado — senão 403 acionável.
- **CORS:** expor `Content-Disposition` no `CorsConfig` (hoje nenhum header é exposto — o front
  não conseguiria ler o nome do arquivo).

### Frontend (`apps/menthoros-front`)

- **Atleta (`AthletePlanPage`):** botão de download por treino na `WeeklyPlanList` + botão
  "Baixar semana (.zip)" no topo do plano. Visíveis apenas quando o plano está aprovado.
- **Coach (shell do coach, aba de plano):** mesma ação de download no `CurrentWeekPlan`/
  `PlanTabPanel`, para o coach baixar e enviar ao atleta por fora quando quiser.
- Download autenticado via blob (o cliente HTTP já injeta o token; endpoint retorna binário +
  `Content-Disposition` com nome de arquivo legível, ex. `treino-2026-07-16-intervalado.fit`).

### Fora de escopo

- **Push automático para o Garmin/Strava** (Garmin Training API exige aprovação de parceria) —
  o export é download manual; os campos `statusSincronizacao`/`exportadoPara` ficam intactos
  para a change futura de sync.
- Export de treino **realizado** (é o caminho inverso, já coberto pelo import).
- Formatos alternativos (.zwo, .tcx, .ics) — só .fit.
- Garantia de compatibilidade além do ecossistema Garmin: Coros/Suunto/Wahoo aceitam .fit de
  workout com graus variados de suporte; o alvo primário e validado é o Garmin Connect.
- Estruturar `fcAlvoEtapa`/`ritmoAlvo` em campos tipados no banco (candidata a change própria se
  o parse best-effort se mostrar insuficiente — ver Open Questions).
- Telemetria de "importou de fato no relógio" (invisível para nós; medimos download).

## Critérios de aceite

- **CA0 — Canal de entrega validado:** existe um caminho documentado e testado (task 0.1) para
  o .fit de workout chegar ao relógio; o resultado da validação está registrado no `tasks.md` e,
  se o canal for pior que o assumido (só USB), o re-escopo foi decidido com o founder antes dos
  blocos de implementação.
- **CA1 — Encode válido:** treino planejado com etapas vira .fit que (a) round-trip decode com o
  próprio SDK reproduz steps, durações, alvos e repetições; (b) importa sem erro pelo canal
  validado no CA0 (validação manual com conta real, registrada na task).
- **CA2 — Estrutura fiel:** etapas em ordem; AQUECIMENTO/DESAQUECIMENTO/RECUPERACAO mapeiam para
  as intensidades FIT correspondentes; duração usa distância quando `distanciaKm` presente,
  senão tempo, senão step aberto; **blocos persistidos expandidos com `blocoRepeticoes` N viram
  UM ciclo + repeat de N voltas no relógio (N×, nunca N²)**; bloco inconsistente cai no fallback
  expandido sem repeat, sempre correto (design D2).
- **CA3 — Alvos best-effort:** os formatos listados no What Changes produzem alvo FIT correto
  (validado por teste unitário por formato, incluindo a inversão pace→speed e o offset +100 de
  FC); string fora dos padrões → step sem alvo, sem falha, sem log de erro (dado de prescrição
  livre é rotina, não incidente).
- **CA4 — Treino sem etapas:** treino planejado sem `EtapaTreino` exporta como workout de step
  único (duração/distância do próprio treino, alvo da `zonaAlvo` se parseável, descrição nas notes).
- **CA5 — ZIP da semana:** contém um .fit por treino exportável do plano; treinos de descanso /
  sem conteúdo exportável ficam de fora; nomes de arquivo únicos e legíveis.
- **CA6 — Autorização:** ATLETA não baixa treino de outro atleta (404, padrão anti-enumeração do
  projeto); TECNICO não baixa de atleta fora da assessoria; plano não aprovado → recusa para
  ambos os papéis; sem vazamento cross-tenant (testes de autorização cobrindo os 3 eixos).
- **CA7 — Front:** botões aparecem só com plano aprovado; download dispara com nome de arquivo
  correto; erro de rede/permissão mostra mensagem curada (não engole a resposta do backend).
- **CA8 — Sem regressão:** `./mvnw clean test` e `npm run lint && npm run build` verdes.

## Métrica de sucesso

- **Leading (adoção do atleta):** ≥ 30% dos atletas ativos com plano aprovado baixam ≥ 1 .fit
  por semana, medido em 4 semanas após o release (log de download no backend — contagem por
  endpoint/atleta, sem tabela nova).
- **Impacto no coach:** zero treinos recriados manualmente no Garmin Connect pelo coach para
  atletas que usam o export (hoje 5-10 min por treino estruturado); verificação qualitativa com
  o coach fundador nas mesmas 4 semanas.
- **Critério de revisão:** se a adoção ficar < 10% em 4 semanas, investigar o funil (atleta não
  vê o botão? Garmin rejeita? alvo não chega no relógio?) antes de evoluir para push automático.

## Open Questions & Assumptions

- **Aberto (CRÍTICO, gate 0.1): canal de import no ecossistema Garmin.** O import de .fit de
  **workout** pelo Garmin Connect web/app não é garantido (o "Import" clássico é de atividade);
  o caminho manual clássico é USB → `GARMIN/NEWFILES`, inviável no celular. A task 0.1 valida o
  canal antes de qualquer encoder e aplica a matriz de decisão do design D0 (seguir /
  re-escopar com o founder / matar). A métrica de adoção do atleta só vale se existir canal sem
  cabo.
- **Aberto (product review): timing no roadmap.** O export é bloqueante para o pilot com as
  primeiras assessorias ou é pós-pilot? Se pós-pilot, compete por espaço com features de maior
  alavancagem do coach — decisão do founder ao sequenciar a sprint.
- **Débito de segurança registrado (fora de escopo, não herdar):**
  `PlanoTreinoController.buscarPlanoSemanal` permite qualquer ATLETA consultar o plano de
  qualquer `atletaId` do mesmo tenant (IDOR intra-tenant; só o tenant guard é aplicado).
  Esta change usa o padrão `/me` (design D4) e **não** corrige o endpoint existente — candidata
  a change própria de hardening.
- **Assumido: esporte = corrida** (`Sport.RUNNING` no encode). O produto hoje é centrado em
  corrida; se `TipoTreino` ganhar modalidades, o encoder recebe o mapeamento na change que as
  introduzir.
- **Assumido: os formatos canônicos do planner são os do schema LLM** (`"M:SS-M:SS/km"`,
  `"NNN-NNN bpm"` — patterns forçados em `IaServiceImpl`), com tolerância para texto editado à
  mão. Task 0.2 confere contra o banco de dev **antes** de fechar o parser; formatos fora do
  previsto entram no parser ou caem no fallback documentado.
- **Assumido: a métrica de adoção é computável com os logs de prod** (agregação por
  atleta/semana por 4 semanas). Task 0.5 confirma o pipeline; senão, acordar alternativa antes
  de construir o bloco 3.
- **Assumido: um alvo por step.** O protocolo FIT aceita um target por `WorkoutStepMesg`. Quando
  a etapa tem ritmo **e** FC, ritmo vence (mais prescritivo para corrida) e a FC vai nas notes
  do step. Confirmar com o founder se a precedência incomoda na prática.
- **Assumido: download não altera estado.** `exportadoPara`/`statusSincronizacao` não são
  escritos nesta change — são semântica de *push sync* futuro; download é stateless e repetível.
  Se o coach quiser ver "atleta baixou?", isso é a métrica de sucesso (log), não estado do treino.
- **Aberto: zona de FC do relógio ≠ zonas do Menthoros.** Alvo por zona (`"Z2"`) é resolvido
  pelas zonas configuradas **no dispositivo do atleta**, que podem divergir das zonas calculadas
  pelo Menthoros. Mitigação possível (fora do MVP): exportar sempre em bpm absoluto usando as
  zonas do atleta no Menthoros — exige FCmáx/zonas confiáveis por atleta (conversa com
  `add-zone-confidence-management`). No MVP, zona vai como zona.
- **Aberto: compatibilidade não-Garmin.** Se atletas com Coros/Suunto reportarem falha de import,
  avaliar ajustes de encode (ex.: nomes ASCII, versão de protocolo) em follow-up.

## Rollback

Change 100% aditiva: zero migration, nenhuma escrita de estado (download não toca
`exportadoPara`/`statusSincronizacao`), endpoints e botões novos condicionados a plano aprovado.
Rollback = reverter o PR em cada repo (backend e frontend, independentes); nenhum dado a migrar
de volta, nenhum estado órfão. O único efeito residual é o header CORS
`exposedHeaders("Content-Disposition")`, inócuo sem os endpoints.

## Riscos e mitigações

- **Não existe canal de import de workout sem cabo** (Alto impacto, Média probabilidade —
  achado do pre-mortem): sem canal web/app, o fluxo do atleta morre e a métrica é inalcançável.
  Mitigação: gate 0.1 valida o canal antes de qualquer código de produção, com matriz de
  decisão explícita (design D0).
- **Repetição N² no relógio** (Alto impacto se escapar — achado do pre-mortem): blocos são
  persistidos expandidos; repeat ×N ingênuo multiplicaria de novo, e round-trip decode e Garmin
  Connect aceitariam o arquivo. Mitigação: des-expansão com verificação de janelas idênticas +
  fallback expandido sem repeat (design D2); teste 4×→4× no CI.
- **Garmin rejeita o arquivo ou grava steps errados** (Alto impacto, Média probabilidade):
  encode de workout tem pegadinhas — offset de FC +100, **unidades dos setters tipados (s/m/m/s,
  não as do wire format)**, repeat por message_index, `serialNumber` uint32z ≠ 0. Mitigação:
  walking skeleton com import real antes do resto (task 0.3/0.4); teste unitário por conversão;
  round-trip decode no CI (CA1).
- **Parse de alvos frágil** (Médio): strings livres variam quando o coach edita à mão.
  Mitigação: parser parte dos patterns canônicos do schema do planner; task 0.2 inventaria o
  banco real; fallback nunca quebra o export (CA3); classe pura e barata de estender.
- **Vazamento de autorização no download** (Alto impacto, Média probabilidade — o "padrão
  existente" dos endpoints de plano contém um IDOR intra-tenant, ver Open Questions): endpoint
  binário novo implementado de boa-fé sobre o padrão errado herdaria o vazamento. Mitigação:
  design D4 fixa nominalmente o padrão `/me` (`resolverAtletaIdAtual`) + CA6 com testes dos 3
  eixos (outro atleta do MESMO tenant, outro tenant, plano não aprovado); security-reviewer no
  QA gate; contrato formalizado como requirements verificáveis em
  `specs/fit-workout-export/spec.md` (achado do pre-mortem cross-model — evita drift do
  contrato de autorização durante a implementação).
- **Nome/acentos quebram no relógio** (Baixo): devices antigos truncam/mutilam UTF-8 no nome do
  workout. Mitigação: nome curto e normalizado (sem depender de acento para significado);
  descrição completa vai nas notes.
- **Feature de atleta sem tração** (Médio — persona primária é o coach): atleta pode ignorar o
  botão. Mitigação: métrica de adoção com critério de revisão explícito antes de investir em
  push automático; o ganho do coach (não transcrever) existe desde o primeiro download.
