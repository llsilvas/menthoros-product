# Tasks — add-activity-treadmill-flag

## 0. Gates

- [x] 0.1 `product-reviewer` → Refine (2026-11-09): card Esteira antes da série, sem `VirtualRun`,
  gate numérico para a Curva. Incorporado.
- [x] 0.2 Pre-mortem Codex (2026-11-09): `INDOOR_RUNNING` não comprova esteira. Incorporado (D2).
- [x] 0.3 DoR (2026-11-09): `spec-reviewer` e Codex → NOT READY. Incorporado: flag por registro de
  fonte (D4, CA5), evidência real antes do PR (CA6), compatibilidade dos records (D5), migration (D6),
  métrica só Garmin. Descartado: "`GENERIC`/`STREET` podem não existir" — existem no
  `com.garmin.fit.SubSport` 21.205.0 (0 e 2).

## 1. Backend

Sequência: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 (1.3 depende de 1.1 e 1.2).

- [x] 1.1 `FitParseServiceImpl`: ler `SessionMesg.getSubSport()` no listener de sessão, levar em
  `SessaoBruta` e expor `FitSessionData.esteira` (`TREADMILL` → `true`; resto ou nulo → `false`).
  `FitSessionData`: `esteira` como último componente, construtor de compatibilidade com a assinatura
  atual (`false`) e `withEsteira(boolean)` (D5)
  verify: fixture sintética `TREADMILL` → `true`; `INDOOR_RUNNING`, `GENERIC`, `STREET`, `TRAIL`,
  `TRACK`, nulo e `corrida-15km-16laps.fit` → `false`; testes existentes compilam sem alteração
- [x] 1.2 Migration `V115__Add_esteira_to_treino_realizado.sql` (D6) e campo `esteira` em
  `TreinoRealizado` (`boolean`, default `false`)
  verify: Flyway sobe no teste de integração com Testcontainers
- [x] 1.3 `FitTreinoPersister.montarTreino` grava `esteira`; `IntervalsIcuActivityMapper` grava `true`
  só para `type = "Treadmill"`
  verify: CA1 e CA5 no `FitTreinoPersisterTest` (duplicata mantém `true`); CA3 com `Treadmill` →
  `true` e `Run`, `TrailRun`, `VirtualRun` → `false`
- [x] 1.4 `esteira` em `TreinoRealizadoOutputDto` (depois de `temTrajeto`, construtor de
  compatibilidade com `false`) via `TreinoMapper`
  verify: CA4 no teste do mapper; JSON de `GET /me/treinos` com `esteira` (`@WebMvcTest` isolado)
- [x] 1.5 Validação: `./mvnw clean verify` (2026-11-09): 6588 unitários e 323 IT verdes, incluindo
  `TreadmillFlagIT` (upload `.fit` TREADMILL/INDOOR_RUNNING → coluna V115 → `GET /me/treinos`);
  `AtletaTreinoControllerTest` (`@WebMvcTest`) isolado: 30 verdes

## QA (2026-11-09)

code-reviewer, security-reviewer e clean-code-reviewer: nenhum Critical/Major. Corrigidos: teste de
CA5 tautológico (agora prova que a duplicata não reescreve o flag) e nomes qualificados nos testes.
Limitação conhecida (D4): reenvio de `.fit` ou re-sync do intervals.icu sobre registro já existente
não atualiza `esteira` (`FitTreinoPersister` e `IntervalsIcuActivityPersister` só gravam na
inserção) — treino anterior à V115 fica `false`. Aceitos sem mudança: construtores de compatibilidade
posicionais (padrão do repo; revisitar na próxima feature que somar campo) e `withEsteira` usado só
em teste.

## 2. Evidência e handoff

- [ ] 2.1 CA6 — antes do PR: registrar aqui o `subSport` de 1 `.fit` real de esteira do pilot e o
  `type` de 1 payload real do intervals.icu de esteira. Sem arquivo, marcar a fonte como não validada
  no PR. **Depende do founder** (arquivos do pilot)
  - **Garmin `.fit` — validado (2026-11-09).** Atividade `25018820341` (corrida de 09/11, 6,06 km,
    42 min): `SessionMesg` `sport=RUNNING`, `subSport=TREADMILL`; `SportMesg` `name="Esteira"`;
    2515 records, nenhum com posição. `FitParseServiceImpl.parse` no arquivo real: `esteira=true`,
    `gpsSamples` vazio, 8 laps, `fcMedia=129`. O arquivo não traz TSS (calculado na ingestão) nem
    `productName` (o modelo vem do ping). Arquivo não versionado: dado de saúde do pilot.
  - **intervals.icu `type` — não validado.** Fonte marcada como não validada no PR e fora da métrica.
- [x] 2.2 Handoff do contrato: `esteira` no cliente curado do front entra em
  `athlete-share-cards-esteira` 1.1
- [ ] 2.3 Uma semana depois do deploy: SQL da métrica de sanidade (só `GARMIN`) e resultado aqui
