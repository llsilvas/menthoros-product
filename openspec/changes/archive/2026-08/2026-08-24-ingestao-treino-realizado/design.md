# Design: ingestao-treino-realizado

Vocabulário de arquitetura: módulo, interface, implementação, profundidade, seam, adapter, leverage,
locality (skill `codebase-design`). Vocabulário de domínio: `CONTEXT.md` (ingestão de treino realizado,
treino que conta, TSS calculado, carga do dia).

## Contexto

O módulo nasce do `/improve-codebase-architecture` de 2026-08-22 (candidato 1 de 9). Teste de
deleção: apagar o módulo devolve a orquestração TSS → save idempotente → evento → carga a 10 chamadores — é
deep por construção. Hoje a orquestração existe em 11 versões, 4 delas incompletas.

### Os dez chamadores (e um método vazio) (estado em 2026-08-22)

| # | Caminho | Onde | Evento | `tssCalculado` | Carga do dia |
|---|---|---|---|---|---|
| 1 | FIT upload | `FitTreinoPersister:112` | sim | sim | sim |
| 2 | intervals.icu import | `IntervalsIcuActivityPersister:62` | sim | sim | sim |
| 3 | Strava sync | `StravaActivityServiceImpl:172,270` | **não** | **não** | sim |
| 4 | `lancarTreino` | `TreinoServiceImpl:345` | sim | **não** | sim |
| 5 | `registrarTreinoManualAtleta` | `TreinoServiceImpl:570` | sim | **não** | sim |
| 6 | `addTreino` | `TreinoServiceImpl:85` | **não** | **não** | sim (+ escrita dupla) |
| 7 | `updateTreino` | `TreinoServiceImpl:265` | não | **não** | **não** |
| 8 | ~~`deleteTreino`~~ | `TreinoServiceImpl:301` | — | — | **método vazio** — não apaga nada hoje; fora do escopo (pre-mortem #5) |
| 9 | reconciliação vincular/desvincular | `ManualReconciliationServiceImpl:80,118,156` | não | não | **não** |
| 10 | backfill de laps | `IntervalsIcuLapsBackfillPersister:61` | não | **não** | **não** |
| 11 | webhook Strava delete → `CANCELADO` | `StravaWebhookServiceImpl:121` | não | — | **não** |

## Decisões (sessão de grilling, 2026-08-22)

### D1 — Recálculo síncrono, na transação do chamador
O coach abre o dashboard logo após o upload e espera CTL/ATL atualizados. Um listener
`AFTER_COMMIT` leria métricas velhas no `GET` seguinte e precisaria de TX própria sem poder reverter o
treino. O evento continua existindo só para o que é genuinamente assíncrono (análise por IA).
*Alternativa rejeitada:* `TsbListener` assíncrono. *Residual:* a request paga o recálculo; o seam é
o lugar para trocar a política depois sem tocar os chamadores.

### D2 — Duas operações: `registrar` e `reprocessar`
Os chamadores têm dois gestos distintos: "este treino entrou" (1–6) e "este treino mudou ou saiu"
(7–11). No segundo a data pode ter mudado — o chamador precisa entregar a data anterior, porque
depois do `save` ela não é mais recuperável de lugar nenhum (nem a entidade nem o banco a guardam).
*Alternativa rejeitada:* um método idempotente "sincronizar", que obrigaria todo chamador a carregar
o estado anterior de qualquer forma, sem ganho.
*Pre-mortem #2 (Codex, DoR):* a primeira versão desta decisão expunha só `reprocessar(treinoId)`,
mas o texto de implementação pedia `min(data anterior, atual)` sem um parâmetro para recebê-la —
contrato inexequível. Corrigido: `reprocessar(treinoId, dataAnterior: LocalDate?)`.

### D3 — `tssCalculado` é a única verdade
O ingestor calcula uma vez; `TsbService` soma o campo dos treinos que contam em vez de recalcular.
`TssCalculatorService` fica com um chamador. Backfill único via `recalcularHistoricoCompleto`, que
passa a preencher o campo. *Alternativa rejeitada:* manter o recálculo ao vivo e tratar o campo
como cache — mantém os dois caminhos e a divergência latente.

### D4 — Dedup dentro; o chamador faz find-or-new antes, quando precisa de merge
`registrar` persiste a entidade recebida — **nova ou já gerenciada**. Dedup é o guard de corrida que
`TreinoDedupHelper.saveIdempotent` já faz (insert → `DataIntegrityViolationException` → busca a
existente): se a entidade era nova e a constraint `(atleta, externalId)` disparou, a linha existente
vence, o estado recebido é descartado e a existente é reprocessada — exatamente o contrato atual de
FIT e icu. Se a entidade já é gerenciada (caso Strava: `findByExternalIdAndAtletaId(...).orElseGet(new)`
→ merge → save, `StravaActivityServiceImpl:160-172`), o save é um UPDATE, `inserted=false`, nenhum
evento, e o pós-processamento completo roda — o re-sync continua recalculando TSS e carga a cada
ciclo, como hoje. **O merge de campos fica no chamador**, antes de `registrar`; o ingestor nunca
mescla. `inserted` sai no `SaveResult` só para log/contagem. `TreinoDedupHelper` vira implementação
privada. *Pre-mortem #2 (Codex):* a redação anterior ("dedup → TSS → save") era incompatível com o
find-or-new do Strava — corrigida aqui.

### D5 — Evento em toda inserção, nunca em reprocessamento
Regra única "treino novo → análise". Strava e `addTreino` passam a publicar. `reprocessar` e
duplicata não publicam. Controle de custo fica no `WorkoutAnalysisListener` (guard para lote
inicial), não na ingestão — senão cada fonte volta a ter política própria.

### D6 — `@Transactional` juntando a TX do chamador; tenant pela entidade
Se a carga falhar, o treino não pode ficar gravado com `tssCalculado` nulo (o estado que estamos
eliminando). Dos 10 chamadores, 3 rodam fora de request com `TenantContext` setado à mão; a entidade
já deriva `tenantId` no `@PrePersist` (`TreinoRealizado.java:241-246`). `recalcularHistoricoCompleto`
com seus blocos `REQUIRES_NEW` continua em `TsbService` — é outro gesto (lote).
*Residual aceito:* falha na carga derruba a ingestão inteira; preferível a dado pela metade.

### D7 — `dataTreino` é invariante da interface
O ingestor exige data não-nula e falha se não vier. O default "hoje" fica nos fluxos manuais,
resolvido **uma vez** com o `Clock` de `ClockConfig`. O ingestor não injeta relógio nem fuso
(candidato 7). Elimina o duplo `LocalDate.now()` em `addTreino`.

### D8 — Treino cancelado não conta — em **todo** leitor de carga (predicado null-safe)
`reprocessar` trata `CANCELADO` como "zera a contribuição"; `tssCalculado` fica para auditoria.
"Treino que conta" é **um** predicado de repositório (`statusSincronizacao IS NULL OR <> CANCELADO`
— NULL é o estado normal de FIT/manual, não pode ser tratado como cancelado) usado por
`TsbService` **e pelos produtores que somam `tssCalculado` direto** — levantamento original
(pre-mortem #4, Codex) mais a correção de DoR (Codex #3): `CoachDashboardServiceImpl:143`,
`TreinoServiceImpl:474` (resumo semanal), `RaceProjectionServiceImpl:184`, `InjuryRiskEvaluator:65`,
e **`PlanoServiceImpl.getDadosPlano:720-724`** (`findByAtletaIdAndDataTreinoBetween`) — é esta
query, não `PlannerShadowService:202`, que produz o histórico consumido pelo planner e pelos
formatters de prompt (`PlanoTreinoPromptBuilder:439,466`, `VariabilidadePromptFormatter:279,303,529`);
`PlannerShadowService` só lê o DTO já filtrado por ela. Sem isso o PMC e o resumo semanal
discordariam sobre o mesmo treino apagado. Bloco 1 aplica ao TSB; Bloco 2 roteia os produtores pelo
mesmo predicado (task 7.7) — a divergência entre PR1 e PR2 é conhecida e curta.
*Impacto:* PMC histórico de quem tem cancelados acumulados muda — correção, não regressão; aviso no
PR e in-app (Open Question do product review).

### D9 — `TsbService` é o único escritor de `MetricasDiarias`
`TreinoServiceImpl.atualizarVolumeDiario` é apagado. Como o ingestor sempre chama `atualizarTsbDia`
e ele recalcula volume e contagem a partir dos treinos que contam, a escrita incremental não tem
função.

### D10 — Nome e glossário
`IngestaoTreinoRealizadoService` / `IngestaoTreinoRealizadoServiceImpl`, seguindo a convenção
`Service`/`Impl` do ADR-0007 (interface com 1 implementação é convenção, não seam). Termos novos em
`CONTEXT.md`: ingestão de treino realizado, treino que conta, TSS calculado, carga do dia.

### D11 — Testes pelo seam, nenhum por reflexão
IT do ingestor sobre `AbstractIntegrationTest` (Testcontainers), parametrizado por `FonteDados`, mais
os casos de `reprocessar`. Testes dos chamadores passam a mockar o ingestor e verificam só o que o
chamador decide; asserts sobre `tsbService`/`setTssCalculado` são apagados, não migrados. Suíte de
`TssCalculatorService` e ITs de TSB intactos (o dataset de referência valida também o backfill).

### D3.1 — TSS do dispositivo é autoritativo quando existe
*Pre-mortem #3 (Codex):* `FitTreinoPersister:166-169` grava o TSS do próprio Garmin com
`metodoCalculoTss = "DISPOSITIVO"` e só cai no calculador quando o arquivo não traz TSS. A spec
anterior mandava o ingestor sobrescrever tudo com `calcularTss`. **Decisão:** o ingestor calcula
apenas quando `tssCalculado == null` ou `metodoCalculoTss != "DISPOSITIVO"`; o valor do dispositivo é
preservado em `registrar` e em `reprocessar`. *Consequência nova e intencional:* hoje o PMC
**ignora** o TSS do dispositivo (recalcula ao vivo) enquanto a projeção de prova o usa — com D3 os
dois passam a concordar, e o dataset de `TsbRecalculoEquivalenciaIT` pode mudar para treinos FIT
com TSS de dispositivo (registrar na task 0.2).

### D13 — Recalcular para a frente, não só o dia
*Pre-mortem #1 (Codex), confirmado em `TsbServiceImpl:85-86`:* `atualizarTsbDia(D)` deriva CTL/ATL
de `MetricasDiarias(D-1)`; logo mudar o TSS de um dia passado invalida **todos os dias seguintes**.
Isso já acontece hoje em todo import retroativo (Strava de 3 dias atrás, laps de ontem) — a spec
anterior herdava o defeito. **Decisão:** `TsbService` ganha `recalcularDesde(atletaId, data)` —
recalcula dia a dia de `data` até o último `MetricasDiarias` materializado (ou hoje), com
`atualizarMetaDados` só no último — e o ingestor chama `recalcularDesde(menor data afetada)` em
`registrar` e `reprocessar`. Custo: 1 dia no caso comum (treino de hoje); N dias no retroativo.
*Residual:* carga inicial em lote (Strava/icu com dezenas de atividades antigas) vira
O(atividades × dias) — mitigação: o scheduler de lote pode desligar o recálculo por treino e chamar
`recalcularHistoricoCompleto` uma vez ao final (follow-up, fora desta change; registrado em Riscos).
É também o gancho que `add-continuous-daily-load-management` precisa — aquela change estende a
janela (descanso explícito, dias futuros), não a cria.

### D12 — Uma change, dois blocos
Bloco 1 (seam + verdade única + caminhos 1–3 + backfill) fecha os bugs da projeção de prova e do
Strava. Bloco 2 (caminhos 4–11 + limpeza) só começa com o Bloco 1 mergeado. Duas changes dariam o
mesmo resultado com mais cerimônia e o risco de o Bloco 2 — onde estão os caminhos *sem* recálculo
nenhum — ficar na fila.

## Interface do módulo

Tudo que o chamador precisa saber:

```
IngestaoTreinoRealizadoService
  SaveResult registrar(TreinoRealizado treino, @Nullable String externalId)
  void       reprocessar(UUID treinoRealizadoId, @Nullable LocalDate dataAnterior)

SaveResult(TreinoRealizado treino, boolean inserted)   // já existe em TreinoDedupHelper
```

- **Invariantes de entrada:** `treino.dataTreino != null` (CA8); `treino.atleta != null`;
  `externalId` obrigatório quando `fonteDados` é externa (FIT, STRAVA, INTERVALS_ICU).
- **Ordem garantida em `registrar`:** `tssCalculado` (salvo D3.1) → save idempotente (D4) → evento
  (se inseriu) → `recalcularDesde(dataTreino)`. O chamador não reordena nem repete nenhum passo.
- **Entidade nova ou gerenciada:** ambas aceitas (D4). Quem precisa de merge no re-sync faz
  find-or-new antes e passa a gerenciada.
- **Erros:** `DomainRuleViolationException` para invariante violada; qualquer exceção da carga
  propaga e reverte a TX (CA9).
- **Transação:** `@Transactional` (REQUIRED). Chamar de fora de TX abre uma.
- **Tenant:** derivado da entidade; `TenantContext` não é lido.
- **Evento:** `TreinoRegistradoEvent(treinoId, tenantId)` publicado via `ApplicationEventPublisher`;
  entregue `AFTER_COMMIT` pelo listener existente.
- **`reprocessar` de id inexistente:** `DomainNotFoundException`. Não há remoção física hoje
  (`deleteTreino` é vazio, `TreinoServiceImpl:301`); se vier a existir, é outra change e deve
  capturar a data antes de apagar.
- **`dataAnterior`:** o chamador lê `treino.getDataTreino()` **antes** de mutar/salvar a entidade e
  passa esse valor; `null` quando a data não mudou (laps, cancelamento, reconciliação).

## Implementação (o que fica atrás do seam)

- **Dedup:** `TreinoDedupHelper.saveIdempotent` absorvido; visibilidade de pacote.
- **Treino que conta:** `TreinoRealizadoRepository.findQueContamByAtletaIdAndDataTreino(atletaId, data)`
  — `statusSincronizacao IS NULL OR statusSincronizacao <> CANCELADO`. Necessário porque o campo é
  nullable (`TreinoRealizado.java:119`) e **nenhum caminho FIT ou manual o define hoje** — em
  SQL/JPQL, `<> CANCELADO` sozinho excluiria NULL e derrubaria CA1/CA3 para esses treinos.
  `TsbServiceImpl.buscarTreinosDia` passa a usar esta consulta.
  *Pre-mortem #1 (Codex, DoR), confirmado no código.*
- **TSS:** calcula só quando nulo ou `metodoCalculoTss != DISPOSITIVO` (D3.1). Único chamador.
- **Carga:** `tsbService.recalcularDesde(atletaId, menorDataAfetada)` (D13); em `reprocessar` a
  menor data é `min(dataAnterior, treino.dataTreino)` quando `dataAnterior` foi passada, senão
  `treino.dataTreino`. `TsbServiceImpl.calcularTssDia` passa a somar `tssCalculado` (D3); o fallback
  "campo nulo → calcular" existe **só até o backfill rodar** e é removido no Bloco 2.
- **Guard de custo no listener:** `WorkoutAnalysisListener` ignora treinos com `dataTreino` anterior
  a N dias (config `workout-analysis.max-idade-dias`, default a decidir no Bloco 1).

### Diagrama

```
FIT ─┐                                  ┌─ dedup (tenant, fonte, externalId)
icu ─┤                                  │  tssCalculado ← TssCalculatorService
Strava ┤ registrar(treino, externalId) ──┤  save
manual ┘                                 │  TreinoRegistradoEvent  (só inserção)
                                         └─ TsbService.recalcularDesde(dataTreino)
laps ────┐
reconc ──┤                                          ┌─ recarrega treino por id
update ──┤ reprocessar(treinoId, dataAnterior?) ─────┤  tssCalculado (se conta e não é DISPOSITIVO)
webhook ─┘                                          └─ TsbService.recalcularDesde(min(dataAnterior, dataTreino))
```

## Achado de implementação (Bloco 1, Seção 3)

`TreinoDedupHelper.saveIdempotent`, chamado de dentro de um `@Transactional` ambiente (D6), tinha
um bug latente: o `INSERT` fica pendente até a próxima query no mesmo `EntityManager`, então a
violação de constraint só aparecia (a) fora do `try/catch` do próprio helper, como
`ConstraintViolationException` bruta não traduzida pelo Spring, e (b) já com a transação Postgres
"aborted" (25P02) — a própria query de fallback (`findByExternalIdAndAtletaId`) falhava também.
Esse mesmo defeito já existia em `FitTreinoPersister`/`IntervalsIcuActivityPersister` (ambos
`@Transactional`), só nunca exercitado por um teste que força a duplicata real.

Duas correções, ambas verificadas pelo `./mvnw clean verify` completo (0 falhas):
1. `TreinoDedupHelper.saveIdempotent` ganhou `entityManager.flush()` logo após o `save()`, dentro
   do `try`, e passou a capturar `ConstraintViolationException` (Hibernate) além de
   `DataIntegrityViolationException` (Spring) — corrige a tradução de exceção para chamadas diretas
   ao `EntityManager`.
2. `registrar` faz uma checagem prévia por `(externalId, atletaId)` antes de tentar inserir,
   evitando depender do catch de constraint no caminho sequencial (o caso comum e o que os testes
   exercitam). A corrida verdadeiramente concorrente (duas chamadas na mesma transação no mesmo
   nanossegundo) continua sendo um risco residual — o mesmo que já existia nos chamadores atuais —
   e corrigi-lo por completo exigiria propagação `NESTED` com savepoints, fora do escopo desta task.

## Achado de implementação (Bloco 1, Seção 5) — `IntervalsIcuActivityPersister` não migra para `registrar`

Ao tentar migrar `IntervalsIcuActivityPersister` (task 5.2), um conflito real de contrato: o
pre-mortem #10 de `intervals-icu-activity-ingestion` (arquivada) exige que `TreinoRegistradoEvent`
só seja publicado **depois** que TSS/TSB/reconciliação estão computados no mesmo commit —
verificado no design arquivado daquela change. `ReconciliationDecisionExecutor.executar` faz sua
própria persistência (`treinoRealizadoRepository.save` + `treinoReconciliacaoRepository.save`),
que exige `realizado.getId()` não-nulo — ou seja, reconciliação roda **depois** do insert mas
**antes** do evento.

`registrar()` não tem esse encaixe: seu evento é publicado como parte inseparável do próprio fluxo
(save → evento → carga), sem hook para um passo do chamador entre save e evento. E o sinal
`eraNovo` (D4, `treino.getId() == null` antes da chamada) não serve aqui — se o chamador salvasse
a entidade primeiro (para reconciliar), `registrar()` já veria um id preenchido e classificaria
como "entidade gerenciada" (D4), suprimindo o evento até para o primeiro insert real.

**Decisão:** `IntervalsIcuActivityPersister` permanece na implementação atual (direta, com
`TreinoDedupHelper`/`TssCalculatorService`/`TsbService`/`ApplicationEventPublisher`), sem migrar
para `registrar()`. Migrar exigiria expandir o contrato do seam (um hook pós-save/pré-evento) ou
relaxar a garantia de ordem do pre-mortem #10 — nenhuma das duas cabe no escopo desta change.
Registrado como candidato de follow-up, não como pendência desta change.

## Achado de implementação (Bloco 1, Seção 5) — `enriquecerTreinoComStrava` não migra para `reprocessar`

`StravaActivityServiceImpl.enriquecerTreinoComStrava` publica `TreinoRegistradoEvent` quando o RPE
chega atrasado (`rpePreenchido`). O `WorkoutAnalysisListener` só dispara análise quando
`percepcaoEsforco != null` — ou seja, para um treino sincronizado sem RPE, este é o **único**
disparo de análise que ele recebe. `reprocessar()` nunca publica evento (D5); migrar este método
para `reprocessar()` silenciaria a análise por IA para todo treino Strava sem RPE no momento do
sync inicial. **Decisão:** este método permanece com `eventPublisher.publishEvent` direto,
inalterado — não usa `TreinoDedupHelper` nem duplica `atualizarTsbDia`, então está fora do escopo
mecânico desta migração de qualquer forma. Recalcular TSS quando o RPE chega tarde (hoje não
acontece) fica como follow-up, não parte desta change.

## Achado de implementação (Bloco 1, Seção 5) — data mudou no re-sync do Strava não recalculava o dia antigo

Achado do pre-mortem Codex (`/qa`, 2026-08-22, alto): `syncSingleActivityById` e o loop de
`syncActivitiesInternal` fazem find-or-new por `externalId`, chamam `mergeActivityIntoTreino`
(que sobrescreve `dataTreino` incondicionalmente a partir de `activity.startDateLocal()`) e então
`registrar()` — cujo `recalcularDesde` só enxerga a data NOVA. Se o atleta editar o horário/data de
uma atividade já sincronizada no próprio Strava, o webhook de update dispara um re-sync que move o
treino de D1 para D2 sem nunca recalcular D1 em diante — violando o mesmo contrato que CA6/D13
garantem para `reprocessar`. **Confirmado como bug pré-existente** (`git show develop:...`: o código
anterior também só chamava `atualizarTsbDia` com a data nova, um único dia, sem propagação) — não é
uma regressão desta change, mas o gap é cobrível a custo baixo com a própria infraestrutura que esta
change introduz, no mesmo método já tocado pela task 5.3.

**Correção:** captura `dataAntiga = treino.getDataTreino()` antes de `mergeActivityIntoTreino`; se a
data mudou, chama `ingestaoTreinoRealizadoService.reprocessar(id, dataAntiga)` logo após `registrar`
— reaproveita o próprio seam (idempotente) em vez de reimplementar o recálculo. Coberto por
`StravaActivityServiceImplSyncTest.dataMudouNoStravaChamaReprocessarComDataAntiga`.

## Achado de QA — corrida de dedup pode desativar a integração Strava (verificado: pré-existente)

Achado do pre-mortem Codex (alto): uma corrida verdadeiramente concorrente em `TreinoDedupHelper`
(residual já documentado acima) propaga a exceção original; `syncActivitiesForAtleta` tem um
`catch (Exception e)` genérico que marca `integracao.setAtivo(false)` para qualquer erro não
tratado — incluindo essa corrida transitória, desativando uma integração saudável por um evento
raro e não relacionado a credenciais. **Verificado (`git show develop:...`):** tanto o
`catch (DataIntegrityViolationException e) { ...; throw e; }` de `TreinoDedupHelper` quanto o
`catch (Exception e)` de `syncActivitiesForAtleta` já existiam, inalterados, antes desta change —
não é uma regressão introduzida aqui. Fora do escopo do Bloco 1; candidato a follow-up separado
(diferenciar erro transitório/retryable de erro de credencial antes de desativar a integração).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Backfill muda PMC histórico (cancelados saem; treinos Strava/manual ganham TSS) | Rodar em stage primeiro; comparar com `TsbRecalculoEquivalenciaIT`; changelog para o treinador |
| Strava passa a publicar evento → custo de LLM no lote inicial | Guard de idade no listener (D5); medir volume em stage antes do default |
| Chamador esquece de migrar e continua chamando `tsbService` direto | Teste de arquitetura (ArchUnit ou grep no CI) — `TsbService.atualizarTsbDia` só pode ser chamado do ingestor (CA11 estendido) |
| `reprocessar` em TX do scheduler com entidade stale (`IntegracaoExterna`) | `reprocessar` recarrega o treino por id dentro da própria TX; não recebe entidade |
| `recalcularDesde` em carga inicial em lote: O(atividades × dias) (D13) | Medir em stage com atleta de 90 dias; follow-up: scheduler de lote chama `recalcularHistoricoCompleto` uma vez ao final |
| D3.1 muda o PMC de treinos FIT com TSS de dispositivo (hoje ignorado) | Task 0.2 registra o delta no dataset de referência antes de implementar |
| Agregadores fora do TSB divergem do PMC entre PR1 e PR2 (D8) | Janela curta; task 7.7 fecha; documentar no PR1 |
| Regressão no dataset de referência por treinos cancelados | Assumption registrada; atualizar dataset com nota se ocorrer |
| Backfill (`recalcularHistoricoCompleto`) muta CTL/ATL/TSB de produção; reverter o código não desfaz o dado já recalculado | Dump de `tb_metricas_diarias` antes de rodar em produção (task 6.2); stage é obrigatório antes de prod — ver task 6.2b |
| `intervals-icu-activity-sync-scheduler` está em implementação em paralelo; se o contrato de `IntervalsIcuActivityPersister` mudar antes da task 5.2, ela quebra | Task 5.2 confirma o status daquela change antes de começar |
| Corrida verdadeiramente concorrente em `registrar` (mesmo externalId, mesma transação, mesmo nanossegundo) faz a transação Postgres abortar (25P02) para a thread perdedora | Residual aceito, já presente nos chamadores atuais de `TreinoDedupHelper`; checagem prévia elimina o caminho comum. Tentativa de correção completa via `Propagation.NESTED` (savepoints) foi feita e **revertida** (2026-08-22): o `JpaDialect` deste projeto não suporta savepoints reais e a tentativa quebrou `IntervalsIcuActivityImportIntegrationTest`, caller não relacionado do mesmo helper. Comportamento aceito: a thread perdedora sofre rollback completo e limpo (nunca corrupção); o chamador/scheduler trata como falha transitória e reprocessa — ver `TreinoDedupHelperConcorrenciaIT` |
| `recalcularDesde` (por-registro, TX ambiente) pode correr concorrente com `recalcularHistoricoCompleto`/`TsbRecalculoExecutor` (blocos `REQUIRES_NEW`, delete+rebuild) para o mesmo atleta — achado do pre-mortem Codex, não investigado a fundo | Risco real mas de baixa probabilidade: `recalcularHistoricoCompleto` só roda no onboarding (atleta novo, sem `TreinoRealizado` concorrente ainda) e sob acionamento manual raro (`AtletaServiceImpl.recalcularMetricasAtleta`). Sem lock por atleta hoje — se ambos rodarem de fato ao mesmo tempo, o resultado é indeterminístico (não corrompe unicidade, mas pode deixar CTL/ATL com base errada silenciosamente). Fora do escopo desta change; registrar como follow-up se o gatilho manual for exposto ao treinador sem aviso |
| `IntervalsIcuActivityPersister` não migra para `registrar` (conflito de ordem evento/reconciliação, pre-mortem #10 de outra change) | Fica na implementação direta atual; duplica dedup/TSS/evento/carga só para este caller — ver "Achado de implementação (Seção 5)" |
| `first-party-ingestion-architecture` retomada cria 12º caminho | Dependência declarada no proposal; task 0.3 deixa nota naquela change |
| D5 amplia para o Strava a análise por IA visível ao atleta sem revisão do treinador (gap pré-existente: `AnaliseWorkoutController:31`) | Fora do escopo desta change (não muda autoridade do treinador); Open Question no proposal; guard de 4.4 filtra por idade e por `percepcaoEsforco` já existente |

## DoR (Definition of Ready)

`spec-reviewer` (2026-08-22): **READY COM RESSALVAS**, 3 achados, todos incorporados — rollback do
backfill (tabela de Riscos), dependência com `intervals-icu-activity-sync-scheduler` (idem, task
5.2), e as duas decisões "Aberto" ganharam tratamento explícito (guard de custo: default fixado só
após a task 5.5 de medição, sem bloquear o merge; nota in-app: task nova 6.2b).

Codex (`/codex:adversarial-review`, 2026-08-22, segunda rodada — DoR): **needs-attention (NOT
READY)**, 3 achados, **todos confirmados no código e corrigidos**:
1. **[alto] Predicado `<> CANCELADO` excluiria NULL** — confirmado: `TreinoRealizado.statusSincronizacao`
   é nullable e nenhum caminho FIT/manual o define. → D8 e a query de "treino que conta" agora são
   `IS NULL OR <> CANCELADO`.
2. **[alto] `reprocessar(treinoId)` não tinha como saber a data anterior** — confirmado: a interface
   só recebia o id. → D2 ganha parâmetro `dataAnterior`.
3. **[médio] Inventário da task 7.7 apontava para o lugar errado** — confirmado:
   `PlannerShadowService` lê de um DTO, a query real é `PlanoServiceImpl.getDadosPlano:720-724`. →
   inventário corrigido para nomear produtores/queries, não pontos de leitura.

## Pre-mortem cross-model (primeira rodada)

Codex (`/codex:adversarial-review`, 2026-08-22) — veredito **needs-attention**, 5 achados, **todos
verificados no código e incorporados**:

1. **[alto] Recálculo só do dia deixa a cadeia do PMC stale** — confirmado (`TsbServiceImpl:85-86`
   lê D-1). → D13 `recalcularDesde`. Defeito pré-existente em todo import retroativo; a spec
   anterior o herdava.
2. **[alto] Dedup-first apagava o merge do re-sync Strava** — confirmado
   (`StravaActivityServiceImpl:160-172`, find-or-new → merge → `saveIdempotent` com `inserted`
   ignorado de propósito). → D4 reescrito: entidade gerenciada aceita; merge fica no chamador.
3. **[médio] Single-truth apagava o TSS do dispositivo Garmin** — confirmado
   (`FitTreinoPersister:166-169`, `DISPOSITIVO`). → D3.1. Achado colateral: hoje PMC ignora e
   projeção usa — passam a concordar.
4. **[médio] Cancelado fora do PMC mas dentro dos agregadores** — confirmado (8 leitores somam
   `tssCalculado` sem filtro). → D8 ampliado + task 7.7.
5. **[médio] `deleteTreino` é no-op** — confirmado (`TreinoServiceImpl:301-303`, corpo vazio).
   → caminho 8 fora do escopo; `reprocessarDia` removido da interface; `reprocessar` de id
   inexistente lança `DomainNotFoundException`.

Residual aceito: custo de `recalcularDesde` em carga inicial em lote (ver Riscos).
