**Tamanho:** XS · **Trilha:** Fast

## Status

- ready-for-agent (2026-09-13): spec produzida a partir do achado colateral documentado em
  `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md` e confirmado como pré-requisito
  Important pela revisão adversarial do Codex sobre a change `remove-redundant-tsb-baseline-recalc`
  (item 1 de 3 a fechar antes daquela remoção ser segura). Seam único identificado
  (`IntervalsIcuActivityPersisterTest`), pronta para `/implement init
  fix-intervals-icu-retroactive-tsb-recalc`.
- Implementado (2026-09-13): fix principal commitado (`159268c`, troca `atualizarTsbDia` →
  `recalcularDesde`). QA (`code-reviewer` aprovado sem ressalvas, `clean-code-reviewer` só Minor)
  encontrou um achado Medium real do `security-reviewer`, não coberto pela análise de risco
  original: o endpoint manual `POST /activities/import` não tinha limite de retroatividade, ao
  contrário do scheduler (`syncDaysBack=90`) — uma atividade muito antiga faria `recalcularDesde`
  reprocessar milhares de dias **dentro da transação síncrona do request HTTP** do coach (antes do
  fix, `atualizarTsbDia` custava O(1) sempre; depois, o custo escala com a idade da atividade).
  Corrigido no mesmo escopo (`1d92c5b`): `IntervalsIcuActivityIngestionServiceImpl.importarAtividade`
  agora rejeita com 422 (`DomainRuleViolationException`) atividades anteriores ao mesmo teto de
  `syncDaysBack`, usando `IntervalsIcuActivityMapper.parseDataTreino` (tornado público) para
  checar a data antes de chamar o persister.
- Verificação final (2026-09-13): `security-reviewer` confirmou o achado Medium **fechado** —
  ordem dos checks preservada, sem bypass, mensagem de erro sem PII. Achado residual Low aceito:
  quando `parseDataTreino` não consegue parsear `startDateLocal` (ausente/formato não coberto), o
  guard é pulado por design ("validação best-effort") e a atividade segue sem teto de
  retroatividade. Exploração baixa — `startDateLocal` vem da resposta da API do intervals.icu, não
  é input direto do coach na request. Aceito como está; não corrigido nesta change.
- DoR (2026-09-13): `spec-reviewer` — READY. Codex adversarial — NOT READY, 3 achados
  (concorrência sem serialização por atleta, custo O(N²) em backfill, teste só verifica
  delegação). Investigados e quantificados (ver "Open Questions & Assumptions" e "Risco/Rollback")
  — nenhum é um risco novo introduzido por este fix; todos são propriedades já aceitas do caminho
  canônico `IngestaoTreinoRealizadoServiceImpl.registrar`, usado hoje por Strava/`.fit`/reconciliação
  manual. Decisão: prosseguir com a implementação.

## Problem Statement

Quando o treinador ou o atleta conecta o intervals.icu e o sistema importa uma atividade
individual que aconteceu no passado (não hoje), os dias seguintes a essa atividade ficam com
CTL/ATL/TSB desatualizados — o sistema não sabe que a carga de treino mudou retroativamente, e
o treinador pode ver um estado de prontidão do atleta (TSB) que não reflete a atividade recém
importada.

## Solution

`IntervalsIcuActivityPersister.persistir` passa a chamar `TsbService.recalcularDesde` (que
propaga a recorrência CTL/ATL a partir do dia afetado até hoje) em vez de
`TsbService.atualizarTsbDia` (que só atualiza o dia importado, sem tocar nos dias seguintes já
materializados).

## User Stories

1. Como treinador, quero que a métrica de prontidão (TSB) do atleta reflita corretamente uma
   atividade importada retroativamente do intervals.icu, para que eu não tome decisões de plano
   com base num dado defasado.
2. Como atleta que conecta o intervals.icu depois de já ter treinado há alguns dias sem
   registrar nada no Menthoros, quero que meu histórico de carga fique correto assim que a
   sincronização acontecer, para que meu plano seguinte considere a carga real, não uma carga
   subestimada.
3. Como desenvolvedor do motor de treino, quero que todos os caminhos de ingestão de treino real
   usem o mesmo método correto de recálculo de TSB (`recalcularDesde`, não `atualizarTsbDia`
   isolado) para importações potencialmente retroativas, seguindo o próprio contrato documentado
   em `TsbService`, para não ter dois comportamentos divergentes no mesmo tipo de operação.

## Implementation Decisions

- **Módulo alterado:** `IntervalsIcuActivityPersister` (`br.com.menthoros.backend.services.helper`).
- Trocar `tsbService.atualizarTsbDia(atleta.getId(), salvo.getDataTreino())`
  (`IntervalsIcuActivityPersister.java:64`) por
  `tsbService.recalcularDesde(atleta.getId(), salvo.getDataTreino())`.
- **Nenhuma outra mudança estrutural.** `IntervalsIcuActivityPersister` continua fora do seam
  `IngestaoTreinoRealizadoService.registrar()` — essa decisão já foi tomada e justificada na
  change arquivada `ingestao-treino-realizado` (conflito de ordem entre reconciliação e evento,
  pre-mortem #10 de `intervals-icu-activity-ingestion`). Este fix não reabre essa decisão; só
  corrige qual método de `TsbService` é chamado dentro da implementação direta já existente.
- **Efeito colateral aceito:** `recalcularDesde` é mais caro que `atualizarTsbDia` quando a
  atividade importada é de uma data muito antiga (reprocessa todos os dias entre a data e hoje).
  Isso é aceitável porque é o comportamento correto e idêntico ao que `IngestaoTreinoRealizadoServiceImpl`
  já faz para todo outro caminho de ingestão retroativa (FIT, Strava, reconciliação manual) — não
  é uma regressão de performance nova, é alinhar este caminho ao padrão já estabelecido.

## Testing Decisions

- Um bom teste aqui verifica que o método correto do `TsbService` é chamado com a data certa —
  comportamento observável da interação entre `IntervalsIcuActivityPersister` e seu colaborador,
  não detalhe de implementação interna do `TsbService` (que já tem sua própria suíte).
- **Módulo testado:** `IntervalsIcuActivityPersister`, via o teste unitário já existente
  `IntervalsIcuActivityPersisterTest`. É o seam mais alto disponível — não há necessidade de um
  seam novo.
- **Mudança necessária no teste existente:** as quatro ocorrências de `atualizarTsbDia` em
  `IntervalsIcuActivityPersisterTest.java` (linhas 107, 127, 219, 236 — duas asserções de
  chamada com argumentos, duas de `never()`) trocam para `recalcularDesde`, mantendo a mesma
  semântica de cada teste (import novo chama o recálculo; corrida de concorrência/duplicata não
  chama).
- **Prior art:** `IngestaoTreinoRealizadoServiceImplTest` já testa `recalcularDesde` sendo
  chamado com a data correta para os caminhos análogos — mesmo padrão de asserção.
- **Gate de validação:** `./mvnw clean test` (não precisa de `*IT` — não há mudança de schema,
  transação ou contrato externo).

## Out of Scope

- Migrar `IntervalsIcuActivityPersister` para o seam `IngestaoTreinoRealizadoService.registrar()`
  — decisão já tomada e justificada em outra change; não reaberta aqui.
- Qualquer mudança em `TsbService.recalcularDesde` ou `atualizarTsbDia` em si.
- A remoção da chamada redundante em `BaselineCalculatorImpl` (`remove-redundant-tsb-baseline-recalc`)
  — este fix é um pré-requisito dela, não a change em si. As outras duas lacunas apontadas pelo
  Codex (recálculo de `semanasProgressaoContinua` fora do caminho incremental; backfill de TSS
  legado pendente em produção) continuam abertas e fora do escopo deste fix.

## Métrica de sucesso

Uma atividade do intervals.icu importada com data retroativa (ex.: 5 dias atrás) atualiza
corretamente o CTL/ATL/TSB de todos os dias entre a data da atividade e hoje — verificável pelo
teste unitário atualizado e, manualmente, comparando `tb_metricas_diarias` antes/depois de um
import retroativo real em stage/HomeLab.

## Open Questions & Assumptions

- **Assumido:** não há nenhum motivo de design para `IntervalsIcuActivityPersister` ter usado
  `atualizarTsbDia` em vez de `recalcularDesde` especificamente — parece ter sido escrito antes
  de `recalcularDesde` existir como método público, ou uma simplificação não intencional. Não
  encontrada nenhuma nota no design.md arquivado de `ingestao-treino-realizado` que justifique
  essa escolha especificamente (a decisão documentada lá é sobre não migrar para o seam
  `registrar()`, não sobre qual método de `TsbService` chamar dentro da implementação direta).

## Risco/Rollback (investigação pós-Codex, 2026-09-13)

**Rollback:** reverter o commit único. Sem migration, sem contrato externo.

**Risco de concorrência (achado Codex #1):** `recalcularDesde` não serializa por atleta —
verdade, mas não é um risco novo. `IngestaoTreinoRealizadoServiceImpl.registrar` (o seam
canônico usado por Strava, `.fit` e reconciliação manual) já chama o mesmo método, sem
serialização, há meses em produção. `IntervalsIcuActivitySyncScheduler.runDailyIncrementalSync`
processa atletas e atividades em loop estritamente sequencial (sem `@Async`/paralelismo), então
este fix não amplia a exposição própria desse caminho — só herda o risco sistêmico já aceito.

**Risco de custo em backfill (achado Codex #2):** quantificado com números reais, não
suposição. `IntervalsIcuProperties`: `syncDaysBack=90`, `syncMaxActivitiesPerCycle=6` (scheduler
a cada 2h). Taxa empírica derivada de recálculo real em produção: ~57ms/dia (405 dias em ~23s,
observado em `docs/ia/01-otimizacao-recalculo-tsb.md`). `persistir` é o único
`@Transactional` da cadeia — cada atividade importada abre/fecha sua própria transação, não há
transação única para o ciclo inteiro. Pior caso de uma única transação: atividade mais antiga de
um backfill de 90 dias ≈ 90 × 57ms ≈ **5,1s**, num scheduler em background que nunca bloqueia
requisição de usuário. Sem evidência nos logs reais de hoje de que o mesmo padrão (já em uso por
Strava/`.fit`) tenha causado lentidão perceptível.

**Cobertura de teste (achado Codex #3):** a semântica de propagação dia-a-dia de
`recalcularDesde` já tem cobertura dedicada em `TsbServiceImplRecalculoSemanticaTest` e
`TsbServiceImplRecalculoHistoricoTest`. `IntervalsIcuActivityPersisterTest` testa só a
delegação — mesmo padrão de fronteira de teste usado no resto do código (ex.:
`BaselineCalculatorTest` não testa o `TsbService` internamente).

**Conclusão:** os três achados são reais como observações do sistema, mas nenhum é uma
regressão introduzida por este fix — são propriedades já aceitas do caminho `recalcularDesde`,
usado por todo outro canal de ingestão. Prosseguir com a implementação como planejada.
