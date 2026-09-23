# Tasks — show-descanso-no-plano

Ordem por dependência: tipos → adaptador puro → telas do treinador → telas do atleta → entrega.
Cliente de API é **curado à mão**: nunca rodar `generate:api` (é destrutivo neste repo).

## 1. Tipos e ordenação (TDD)

- [ ] 1.1 `restDays?: RestDayDto[]` (`{ dayOfWeek: string; reason: string }`) em `PlanoSemanalDto`
      (`src/types/PlanoReview.ts`) e em `PlanoSemanal` (`src/types/PlanoSemanal.ts`), ambos opcionais
      verify: `npm run build` (tipos) — plano antigo sem o campo continua compilando
- [ ] 1.2 Helper puro que mistura treinos e descansos numa lista única ordenada por dia da semana,
      ignorando `dayOfWeek` inválido/desconhecido em vez de quebrar a tela
      verify: `npm run test:run` — CA6 (ordem segunda→domingo, sem duplicar dia), lista vazia, dia
      inválido, só treinos, só descansos

## 2. Plano do treinador (TDD)

- [ ] 2.1 Chip de descanso no `PlanoDetalhePanel` — rótulo "Descanso", motivo visível, sem
      duração/RPE/zona; `data-testid` próprio para o teste
      verify: `PlanoDetalhePanel.test.tsx` — CA1 e **CA2** (plano sem `restDays` renderiza igual ao de
      hoje: nenhum elemento novo)
- [ ] 2.2 Rótulo acessível do chip ("Descanso na quinta: <motivo>")
      verify: CA7, por `getByLabelText`/`toHaveAccessibleName`
- [ ] 2.3 "Prescrever treino neste dia" abre o `TreinoAddDialog` com `dataTreino` = data daquele dia
      da semana do plano (derivada de `semanaInicio`, como o `weekDatesFromInicio` do atleta faz)
      verify: CA3 — o dialog recebe a data certa; ao salvar, o plano recarrega e o chip some

## 3. Atleta (TDD)

- [ ] 3.1 `buildWeekAgenda` distingue **descanso prescrito** (com motivo) de **dia vazio**
      verify: `buildWeekAgenda.test.ts` — CA4, incluindo o caso de dia sem treino e sem descanso
- [ ] 3.2 `WeekAgendaRow` mostra o dia de descanso com o motivo
      verify: teste de componente — CA4 na tela
- [ ] 3.3 `selectTodayState` no dia de descanso prescrito mostra o motivo
      verify: `selectTodayState.test.ts` — CA5
- [ ] 3.4 **Decisão pendente (Open Question da proposta):** texto do motivo para o atleta — mostrar o
      `reason` técnico como veio, ou mapear por tipo de sinal para frase amigável. Decidir **antes**
      de 3.1; a escolha muda o que 3.1–3.3 asseguram

## 4. Entrega

- [ ] 4.1 `npm run lint && npm run build && npm run test:run`
- [ ] 4.2 E2E (Playwright) do fluxo do treinador: ver o descanso → prescrever treino → descanso some
      verify: mock do IdP antes do 1º `goto` e `waitForURL` antes de `evaluate` (convenção do repo)
- [ ] 4.3 Validação real com um plano do Leandro que tenha `restDays` — o de 22/09 21:14 (semana
      21/09, descanso na QUINTA com motivo do check-in) serve
- [ ] 4.4 **Destrava o gate 5.3 do backend:** só depois desta change em `develop` é que
      `add-descanso-explicito-por-fadiga` pode ir para `main`
