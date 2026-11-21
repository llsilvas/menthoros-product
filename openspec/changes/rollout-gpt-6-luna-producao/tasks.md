# Tasks — rollout-gpt-6-luna-producao

Prazo duro: `main` com a troca antes de **2027-01-14**. Todas as tasks são de ambiente (coach-fundador).

- [ ] 1.1 Conferir na conta OpenAI se há modelo fine-tunado (CA1).
- [ ] 1.2 Congelar o baseline com a consulta de aceite do proposal arquivado; registrar valores e data (CA2).
- [ ] 2.1 Smoke no `develop`: 1 plano por arquétipo, 1 `simple`, 1 `expert`, 1 análise de treino; conferir
      `tb_llm_call` (CA3).
- [ ] 2.2 Ensaio do rollback: rebasear `chore/rollback-openai-para-gpt4o`, deploy num ambiente de teste,
      gerar 1 plano com gpt-4o; reaplicar e gerar 1 com gpt-6-luna (CA4).
- [ ] 3.1 1 semana de planos reais em `develop`; consulta de falha/p95 por semana e modelo (CA5).
- [ ] 3.2 Avisar as assessorias do pilot; PR `develop → main`; registrar a data do merge (CA6).
      Front e backend **juntos**: menthoros-front#228 (política 2026-11-15) e o `develop → main` do backend,
      deploy em sequência. A versão da política é comparada por igualdade exata — com só um dos dois em
      produção, o aceite do cadastro e o consentimento de trajeto respondem 409 `CONSENT_VERSION_STALE`.
- [ ] 4.1 4 semanas pós-`main`: aceite vs baseline, n ≥ 20 (CA7). Registrar o resultado e arquivar.
