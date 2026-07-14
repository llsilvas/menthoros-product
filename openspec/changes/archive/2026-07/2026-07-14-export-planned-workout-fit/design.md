# Design: export-planned-workout-fit

> Refinado em 2026-07-14 após pre-mortem adversarial contra o código real — 3 achados críticos
> mudaram o design original: (1) blocos são persistidos **expandidos** no banco (não marcados),
> (2) o canal de import de workout no Garmin Connect precisa ser validado antes de tudo,
> (3) o padrão de autorização a reusar é o dos endpoints `/me`, **não** o do
> `PlanoTreinoController` (que tem um IDOR intra-tenant pré-existente, registrado como débito).

## D0 — Gate de canal de entrega (antes de qualquer encoder)

O "Import" do Garmin Connect web historicamente aceita arquivos de **atividade**; import de
.fit de **workout** pela UI não é garantido — o caminho manual clássico é copiar via USB para
`GARMIN/NEWFILES` do device (inviável no celular). Se o único canal for desktop+cabo, a métrica
de adoção do atleta é inalcançável e a change muda de natureza.

Primeira ação da task 0: validar o canal com um .fit de workout de amostra (antes de escrever
qualquer encoder de produção) e registrar o resultado. Decisão em três saídas:

- **Canal web/app funciona** → seguir o design como está.
- **Só USB funciona** → re-escopo com o founder: manter o download com instruções de USB
  (valor cai, mas o ganho do coach de não transcrever continua) ou repriorizar rumo à
  Garmin Training API (parceria) — decisão de produto, não desta change.
- **Nada funciona** → matar a change antes de custo afundado.

## D1 — Estrutura do arquivo .fit de workout

Sequência de mensagens:

1. `FileIdMesg` — `type=WORKOUT`, `manufacturer=DEVELOPMENT`, **`product`** (obrigatório no
   conjunto recomendado), `timeCreated` (epoch FIT, 1989-12-31) e `serialNumber` derivado do id
   do treino com **garantia de ≠ 0** (`uint32z`: zero significa "campo omitido" e some do
   arquivo — derivação de UUID pode produzir 0; usar `hash | 1` ou similar).
2. `WorkoutMesg` — `wktName` (exibido no relógio), `sport=RUNNING`, `numValidSteps`.
3. N × `WorkoutStepMesg` — `messageIndex` sequencial a partir de 0.

Encode via `FileEncoder` do SDK (mesma classe dos testes round-trip do parser). Exige
`java.io.File`: `Files.createTempFile(...)`, ler bytes, deletar no `finally`. Workout tem
poucos KB — sem streaming.

**Unidades: usar os setters TIPADOS do SDK, que aplicam o scale do wire format internamente**
(confirmado nos sources do jar 21.205.0): `setDurationTime` em **segundos**,
`setDurationDistance` em **metros**, `setCustomTargetSpeedLow/High` em **m/s**. As unidades do
wire format (ms, cm, mm/s) NÃO devem aparecer no código — misturar as duas camadas dá erro de
100-1000× que um round-trip com a mesma conversão errada dos dois lados não pega. Única
convenção manual que permanece: o offset **+100** dos alvos de FC em bpm absoluto (semântica do
protocolo, não scale — valores 0-100 = % da FC máxima, >100 = bpm+100).

`wktName`: `"<TipoTreino> <dd/MM>"` (curto — displays truncam); a `descricao` completa do
treino vai em `notes` do primeiro step (ou do step único, CA4).

## D2 — Mapeamento EtapaTreino → WorkoutStepMesg

**Premissa corrigida pelo pre-mortem: o banco persiste blocos JÁ EXPANDIDOS.**
`TreinoPlanejadoServiceImpl.expandirBlocoParaAdicao` grava N cópias físicas de cada sub-etapa
(todas com o mesmo `blocoId` e `blocoRepeticoes=N`); o schema do planner LLM força
`repeticoes=1` por etapa. Aplicar "emitir steps + repeat ×N" sobre etapas expandidas produziria
**N² execuções** no relógio — e round-trip decode e Garmin Connect aceitariam o arquivo.

Estratégia de repetição — **des-expandir com verificação, senão emitir expandido:**

1. Agrupar etapas consecutivas por `blocoId`; com `blocoRepeticoes=N > 1`, dividir a sequência
   em N janelas e verificar que são idênticas (mesmos tipo/duração/distância/alvos por posição).
2. Verificação OK → emitir **uma** iteração + `WorkoutStepMesg` de repeat
   (`durationType=REPEAT_UNTIL_STEPS_CMPLT`, `durationValue` = `messageIndex` do primeiro step
   da janela, `targetValue=N`).
3. Verificação falha (bloco editado pelo coach depois da expansão, dados legados) → **fallback
   seguro: emitir as etapas expandidas como steps individuais, sem repeat** — mais verboso no
   relógio, mas sempre correto. Nunca inferir repeat de dados inconsistentes.
4. `repeticoes > 1` em etapa avulsa: mesmo tratamento defensivo (step + repeat), embora o
   planner atual sempre grave 1.

Steps de repeat não têm intensidade nem alvo. `numValidSteps` = total de steps emitidos,
incluindo repeats. `messageIndex` é calculado na emissão — nunca copiado de `ordem`.

Demais mapeamentos:

| EtapaTreino | WorkoutStepMesg | Regra |
|---|---|---|
| `tipoEtapa` (**String livre** na coluna, não enum) | `intensity` | AQUECIMENTO→WARMUP, DESAQUECIMENTO→COOLDOWN, RECUPERACAO→RECOVERY, PRINCIPAL/INTERVALADO→ACTIVE; **qualquer outro valor → ACTIVE** (default defensivo p/ dado legado/manual) |
| `descricaoEtapa` | `wktStepName` + `notes` | nome curto (≤ 16 chars úteis); texto integral em `notes` |
| `distanciaKm` presente | `durationType=DISTANCE`, `setDurationDistance` (**m**) | distância vence quando ambos presentes |
| senão `duracaoMin` (**Integer minutos** em EtapaTreino) | `durationType=TIME`, `setDurationTime` (**s**) | atenção: `TreinoBase.duracaoMin` é `java.time.Duration` — CA4 usa conversão própria, não a da etapa |
| nenhum | `durationType=OPEN` | atleta encerra no botão lap |
| alvo parseado (D3) | `targetType` + valores | um alvo por step; ritmo vence FC (FC vai nas notes) |
| sem alvo parseável | `targetType=OPEN` | nunca falha o export |

## D3 — Parser best-effort de alvos (classe pura, `FitTargetParser`)

**Formatos canônicos (o que o planner LLM realmente gera** — patterns forçados no schema em
`IaServiceImpl`): `ritmoAlvo` = `^\d{1,2}:[0-5]\d-\d{1,2}:[0-5]\d/km$` (**sempre faixa, sempre
com sufixo `/km`**) e `fcAlvoEtapa` = `^\d{2,3}-\d{2,3} bpm$`. `EtapaTreino` **não tem campo de
zona** — `zonaAlvo` existe só no nível do treino (`TreinoBase`), então alvo por zona se aplica
apenas ao step único do CA4. Reusar/espelhar a lógica dos parsers já existentes no backend
(`parseFcRange` em `IaServiceImpl`, validação de pace) — não criar um dialeto divergente.

| Padrão de entrada | Alvo FIT | Conversão |
|---|---|---|
| `"5:30-5:45/km"` (canônico) e tolerante sem `/km` | `targetType=SPEED`, `setCustomTargetSpeedLow/High` (**m/s**) | pace → m/s (`1000 / seg_por_km`); **inversão:** pace mais lento (5:45) → speed **low**, mais rápido (5:30) → speed **high** |
| `"5:30"` (único, tolerante — treino editado à mão) | idem | faixa sintética ±3% |
| `"140-150 bpm"` (canônico) e tolerante sem sufixo | `targetType=HEART_RATE`, `customTargetHeartRateLow/High` | **bpm + 100** (offset semântico do protocolo) |
| `"70-80% FCmáx"` (tolerante — não canônico hoje) | idem | valor cru 0-100 = % da FC máxima, sem offset |
| `"Z2"`, `"z2-z3"` (só via `zonaAlvo` do treino, CA4) | `targetType=HEART_RATE`, `targetHrZone` | zona resolvida pelo relógio; faixa → zona inferior (conservador) |
| qualquer outra coisa | ausente → `targetType=OPEN` | string original preservada nas notes |

Regras transversais: trim/normalização de caixa e acentos antes do match; parser **nunca
lança** — vazio é o caminho normal para formato desconhecido; sem `log.warn` por ocorrência
(prescrição livre é rotina — mesma filosofia do descarte silencioso do import). Os padrões
tolerantes existem porque `editadoPeloCoach`/`adicionadoPeloCoach` permitem texto fora do
schema do planner. A task 0 confere contra o banco de dev e ajusta a tabela antes de fechar.

## D4 — Endpoints e autorização

Controller dedicado `FitExportController` (o simétrico de import, `FitUploadController`, já é
dedicado):

- `GET /api/v1/planos/treinos/{treinoPlanejadoId}/fit`
  → `200` binário, `Content-Type: application/octet-stream`,
  `Content-Disposition: attachment; filename="treino-<data>-<tipo>.fit"`.
- `GET /api/v1/planos/semanas/{planoSemanalId}/fit`
  → `200` `application/zip`, `filename="plano-semana-<semanaInicio>.zip"`. Rota com segmento
  `/semanas/` de propósito: o `GET /api/v1/planos/{id}` existente recebe **atletaId** (não
  planoId) — colocar o ZIP em `/planos/{planoSemanalId}/fit` criaria duas semânticas de id na
  mesma collection e 404 "intermitente" no front. Plano aprovado sem nenhum treino exportável →
  `422` com mensagem curada (não ZIP vazio).

Nomes no ZIP: `treino-<data>-<tipo>[-<n>].fit` — sufixo numérico de desambiguação quando dois
treinos colidem (entry duplicada em `ZipOutputStream` lança `ZipException` e derruba o download
inteiro).

**Cadeia de autorização — seguir o padrão dos endpoints `/me`, NÃO o do
`PlanoTreinoController`:** o `buscarPlanoSemanal` existente deixa qualquer ATLETA passar
qualquer `atletaId` do mesmo tenant (IDOR intra-tenant pré-existente — **registrado como débito
de segurança independente** no proposal; não é escopo desta change corrigi-lo, mas é proibido
herdá-lo):

1. Tenant guard (`tenantId` do contexto) — cross-tenant não existe (404).
2. ATLETA: resolver o próprio `atletaId` pelo token (padrão `resolverAtletaIdAtual` de
   `AtletaProgressServiceImpl`) e exigir que o treino/plano pertença a ele — senão 404
   (anti-enumeração).
3. TECNICO/ADMIN: atleta do recurso deve pertencer à assessoria.
4. `PlanoSemanal.reviewStatus` aprovado — senão **403** com mensagem acionável ("aguardando
   aprovação do coach"); aqui não é 404: o dono do recurso sabe que ele existe.

Download é stateless: nenhuma escrita em `exportadoPara`/`statusSincronizacao` (semântica do
push sync futuro). Adoção medida por log estruturado no service (endpoint, atletaId, treinoId)
— sem tabela nova; confirmar na task 0 que os logs de prod são agregáveis por atleta/semana ao
longo de 4 semanas (senão a métrica de sucesso é incomputável).

**CORS:** `CorsConfig` hoje não expõe headers — sem `exposedHeaders("Content-Disposition")` o
JS cross-origin nunca lê o filename e o parse no front vira código morto. Entra no escopo
backend desta change.

## D5 — Frontend

- **Atleta — `WeeklyPlanList`:** `IconButton` de download por treino, visível apenas com plano
  aprovado (status já chega no DTO de `useAthletePlan`). **Topo da `AthletePlanPage`:** botão
  "Baixar semana (.fit)". Guard obrigatório: `PlanoSemanal.id` é **opcional** no tipo do front
  — sem id, botão de semana não renderiza (não chamar endpoint com `undefined`).
- **Coach — `PlanTabPanel`/`CurrentWeekPlan`:** mesma ação, mesma regra de visibilidade.
- **Download autenticado:** helper `downloadFile(url, filename)` em `src/shared/` usando o
  cliente HTTP existente com `responseType: 'blob'` + object URL + `a.click()`; filename do
  `Content-Disposition` (depende do CORS do D4) com fallback local.
- **Erros:** 403 (não aprovado) e 422 (semana sem treino exportável) exibem a mensagem curada
  do backend (aprendizado do QA de `fit-file-upload-ingestion` — não engolir).
- Lógica em adapter/hook, componentes só apresentação — convenção do repo.

## D6 — Validação de compatibilidade real como gate, não como fé

Risco nº 1 (canal, D0) e nº 2 (encode aceito mas errado no pulso) são atacados na task 0 em
duas camadas: primeiro o **canal** com arquivo de amostra, depois o **walking skeleton** do
encoder (1 treino real → .fit → import real → conferência visual dos steps no device), antes de
endpoint, ZIP e front. Round-trip decode com o próprio SDK entra no CI (CA1a), mas não
substitui o import real — o SDK aceita coisas que o Garmin recusa, e vice-versa.

## Pre-mortem (resumo — inclui achados do adversarial local de 2026-07-14)

- *"Não existe canal de import de workout no Garmin Connect"* → D0: validação de canal é a
  primeira ação da task 0, com matriz de decisão explícita (seguir / re-escopar / matar).
- *"Repeat ×N sobre blocos já expandidos → N² no relógio"* → D2 des-expande com verificação de
  janelas idênticas; inconsistência cai no fallback expandido-sem-repeat (verboso, correto).
- *"Unidades do wire format nos setters tipados → steps 1000× mais longos"* → D1 fixa a camada
  (setters tipados: s / m / m/s); testes unitários por conversão; round-trip não basta.
- *"Parser não reconhece o que o planner escreve"* → D3 partiu dos patterns reais do schema do
  planner (`/km`, `bpm`), com tolerância para texto editado à mão; task 0 confere no banco.
- *"Endpoint binário herda o IDOR do controller de planos"* → D4 manda seguir o padrão `/me` e
  registra o IDOR pré-existente como débito independente; CA6 testa os 3 eixos.
- *"Repeat aponta para índice errado e o relógio entra em loop"* → `messageIndex` calculado na
  emissão; round-trip decode verifica a estrutura expandida.
- *"ZIP vazio ou com nome duplicado"* → 422 curado; sufixo de desambiguação (D4).
- *"Filename nunca chega no front"* → CORS `exposedHeaders` no escopo (D4).
- *"Ninguém usa"* → métrica de adoção com critério de revisão; pipeline de logs confirmado na
  task 0 (senão a métrica é incomputável).
