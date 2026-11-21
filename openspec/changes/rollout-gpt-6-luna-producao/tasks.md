# Tasks — rollout-gpt-6-luna-producao

Prazo duro: `main` com a troca antes de **2027-01-14**. Todas as tasks são de ambiente (coach-fundador).

- [ ] 1.1 Conferir na conta OpenAI se há modelo fine-tunado (CA1).
- [ ] 1.2 Congelar o baseline com a consulta de aceite do proposal arquivado; registrar valores e data (CA2).
- [x] 2.1 Smoke no `develop`: 1 plano por arquétipo, 1 `simple`, 1 `expert`, 1 análise de treino; conferir
      `tb_llm_call` (CA3).
- [ ] 2.2 Ensaio do rollback: rebasear `chore/rollback-openai-para-gpt4o`, deploy num ambiente de teste,
      gerar 1 plano com gpt-4o; reaplicar e gerar 1 com gpt-6-luna (CA4).
- [ ] 3.1 1 semana de planos reais em `develop`; consulta de falha/p95 por semana e modelo (CA5).
- [x] 3.2 Avisar as assessorias do pilot; PR `develop → main`; registrar a data do merge (CA6).
      Front e backend **juntos**: menthoros-front#228 (política 2026-11-15) e o `develop → main` do backend,
      deploy em sequência. A versão da política é comparada por igualdade exata — com só um dos dois em
      produção, o aceite do cadastro e o consentimento de trajeto respondem 409 `CONSENT_VERSION_STALE`.
- [ ] 4.1 4 semanas pós-`main`: aceite vs baseline, n ≥ 20 (CA7). Registrar o resultado e arquivar.

## Registro

- 2.1: smoke no `develop` feito pelo coach-fundador (2026-11-20).
- 3.2: `main` com a troca em **2026-11-21** — menthoros-backend#253 (`97d714a`) e menthoros-front#228 (`e6267e6`),
  mergeados 10:12 UTC e deployados no mesmo dia, em sequência. Prazo de 2027-01-14 cumprido (CA6).
- Puladas antes da promoção, por decisão do coach: 1.2 (baseline), 2.2 (ensaio do rollback) e 3.1 (semana de
  medição em `develop`). O baseline ainda pode ser montado com as 4 semanas anteriores a 2026-11-21.
- 4.1: janela de 4 semanas até **2026-12-19**.
