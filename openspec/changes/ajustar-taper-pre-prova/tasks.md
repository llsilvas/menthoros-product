# Tasks — ajustar-taper-pre-prova

- [x] 0.1 Ler o prompt e o skeleton da fase SEMANA_PROVA; registrar as faixas de pace enviadas (CA2).
- [x] 0.2 Coach define a ativação por nível (CA1).
- [x] 1.1 Implementar (planner ou prompt) com teste.
- [ ] 2.1 Eval candidato + rodada da revisão cega só com o arquétipo taper (CA3).

## Notas de entrega (2026-11-20)

- 0.1: o ritmo incoerente vinha de duas fontes — `RecuperacaoPromptFormatter` (pace fixo 6:30–7:30 e FC por
  % da FCmáx em todo prompt) e a fixture do taper (histórico de outro atleta sob o teto "pace demonstrado").
- 0.2: coach — strides para todos (20–30 min Z1/Z2 + 4–6 × 20 s, 24–48h antes); avançado pode trocar por
  2–3 km em ritmo de prova na quarta/quinta.
- 1.1: regra obrigatória no `PeriodizacaoPromptFormatter`; recuperação aponta para as Zonas de Treino
  Calculadas; fixture do taper com histórico coerente. Verify verde (6764 + 343). PR menthoros-backend#252.
- 2.1: eval candidato `gpt-6-luna` sem violação; 3 planos do taper com ativação no sábado e ritmo dentro das
  zonas (tabela no PR). Falta a leitura do coach (CA3) — com um só candidato, sem par cego.
