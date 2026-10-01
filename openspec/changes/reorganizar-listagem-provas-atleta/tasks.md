# Tasks — reorganizar-listagem-provas-atleta

Branch `feature/reorganizar-listagem-provas-atleta` em `apps/menthoros-front` (único repo tocado).

## 1. Frontend

- [ ] 1.1 `raceAdapters.ts` — `buildAthleteRaceList`: trocar o comparator para ordem cronológica
  (futuras ascendente, passadas descendente depois das futuras), removendo o `Number(b.alvo) -
  Number(a.alvo)` como critério primário (CA1, CA2).
  - verify: `raceAdapters.test.ts` — caso com prova-alvo futura distante + prova não-alvo mais
    próxima → a não-alvo aparece primeiro; caso com prova passada + prova futura não-alvo → a
    futura aparece primeiro.
- 1.2 `raceAdapters.ts` (ou `AthleteRacesPage.tsx`, decidir no commit) — derivar a categoria visual
  de cada prova a partir da lista já ordenada: `alvo` | `proxima` | `futura` | `historico`. A
  categoria `proxima` só se aplica à primeira prova futura da lista quando ela não é `alvo` (CA3,
  CA4, CA6).
  - verify: teste cobrindo os 4 critérios de categoria isoladamente (sem renderizar componente).
- [ ] 1.3 `AthleteRacesPage.tsx` (`RaceCard`) — aplicar a cor por categoria:
  - `alvo`: mantém o destaque atual (borda lime, ícone, label) — sem mudança visual.
  - `proxima`: nova cor dedicada (`semantic.info`).
  - `futura`: estilo neutro atual, sem mudança.
  - `historico`: cor esmaecida nova, distinta das demais.
  - verify: `AthleteRacesPage.test.tsx` (ou novo teste de `RaceCard` isolado) — snapshot/assert de
    `data-categoria` (novo atributo, no padrão de `data-alvo` já existente) para os 4 casos.
- [ ] 1.4 Validação: `npm run lint && npm run build && npm run test:run`.

## 2. QA
- [ ] 2.1 `/qa` — code-reviewer + clean-code-reviewer (frontend), já que é Fast track (sem
  security-reviewer obrigatório — sem dado sensível nem contrato novo envolvido).
