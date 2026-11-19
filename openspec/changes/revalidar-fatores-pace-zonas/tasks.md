# Tasks — revalidar-fatores-pace-zonas (S · Full · backend)

## 0. Fontes e decisão

- [x] **0.1** Confirmar nas fontes as tabelas de pace: Friel (*The Triathlete's Training Bible* ou
  *Fast After 50* — zonas de pace de corrida em % do limiar) e Daniels (*Daniels' Running Formula*,
  tabela VDOT: E/M/T/I/R). Registrar edição e capítulo em `design.md` — [CA1]
- [x] **0.2** Montar em `design.md` a comparação Menthoros × Friel × Daniels para limiares 4:00,
  5:00 e 6:30, e a distância em s/km por zona — [CA1]
- [x] **0.3** Decidir o modelo (Friel recomendado) e o mapeamento de Z6; registrar em `design.md`

## 1. Backend

- [x] **1.1** `ZonaTreinoService.PACE_FATORES` → fatores do modelo escolhido, contíguos; Javadoc
  com a citação — [CA2] [CA3]
  - Validação: `./mvnw test -Dtest=ZonaTreinoServiceTest,PaceZoneCalculatorTest,PaceZoneSemanticaTest`
- [x] **1.2** `ZonaTreinoServiceTest`: valores absolutos para limiar 5:00 por zona; teste de
  contiguidade parametrizado (se já não existir pela change irmã) — [CA2] [CA3]
  - Validação: `./mvnw test -Dtest=ZonaTreinoServiceTest`
- [x] **1.3** Ajustar testes que fixavam os fatores antigos (`PaceZoneSemanticaTest`,
  `TreinoNormalizadorZonaHelpersTest`, `EvalRunnerTest`) — afirmar os novos valores
  - Validação: `./mvnw clean test`
- [x] **1.4** `./mvnw clean verify` verde

## 2. Eval e validação

- [x] **2.1** `./mvnw -Peval test -Dtest=EvalRunnerTest -Dmodo=candidato` (`OPENAI_API_KEY`); colar
  a tabela no PR; comparar com auditoria e descrever a diferença nas rodagens leves — [CA4]
- [ ] **2.2** Um treinador revisa ≥ 1 plano gerado com as faixas novas; registrar aqui quem e quando
  — [CA5]

## 3. Fechamento

- [ ] **3.1** Atualizar `openspec/specs/fc-limiar-zones/spec.md`: fatores e fonte
- [ ] **3.2** Se `coach-zonas-pace-fc-prescricao` já estiver em produção, conferir que a tabela do
  treinador reflete os fatores novos (não há cache de zonas no front além do hook por sessão)

## Notas de entrega (2026-11-19)

- 0.1–0.3: fontes, comparação e decisão (Friel) no `design.md`.
- 1.1–1.4: `PACE_FATORES` de Friel; testes e golden atualizados; verify verde (6732 + 342, após corrigir
  um valor fixo em `CoachAthleteZonesAnchorsIT`). PR menthoros-backend#249.
- 2.1: eval candidato com `gpt-6-luna` (medium): 0 violações de qualidade e compliance nos 5 arquétipos;
  tabela no PR. O default do `EvalRunnerTest` ainda é `gpt-4o` — rodar com `EVAL_MODEL=gpt-6-luna`.
- 2.2 (CA5) pendente: revisão do coach de ≥ 1 plano com as faixas novas.
