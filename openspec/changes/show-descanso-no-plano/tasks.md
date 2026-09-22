# Tasks — show-descanso-no-plano

## 1. Tipos e adaptadores (TDD)

- [ ] 1.1 `descansos` no tipo do plano (cliente curado) + adaptador que intercala descansos e treinos
      por dia
      verify: `npm run test:run` — plano com/sem descansos (CA2)

## 2. Plano do treinador (TDD)

- [ ] 2.1 Cartão de descanso no `PlanoDetalhePanel` com motivo (CA1, CA5)
- [ ] 2.2 "Prescrever treino neste dia" → criação com dia preenchido (CA3)
      verify: Testing Library + E2E Playwright do fluxo

## 3. Home do atleta (TDD)

- [ ] 3.1 Estado `DESCANSO` com motivo (CA4)
      verify: `selectTodayState.test.ts`

## 4. Entrega

- [ ] 4.1 `npm run lint && npm run build && npm run test:run` + E2E
- [ ] 4.2 Validação real com o plano do Leandro gerado pelo backend
