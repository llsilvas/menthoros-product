# Tasks — reorganizar-listagem-provas-atleta

Branch `feature/reorganizar-listagem-provas-atleta` em `apps/menthoros-front` (único repo tocado).

## 1. Frontend

- [x] 1.1 `raceAdapters.ts` — `buildAthleteRaceList`: trocar o comparator para ordem cronológica
  (futuras ascendente, passadas descendente depois das futuras), removendo o `Number(b.alvo) -
  Number(a.alvo)` como critério primário (CA1, CA2).
  - verify: `raceAdapters.test.ts` — 8 testes novos/reescritos (CA1-CA6 + casos de futura comum e
    múltiplas passadas) — todos verdes.
- [x] 1.2 `raceAdapters.ts` — campo `categoria: RaceCategory` (`alvo` | `proxima` | `futura` |
  `historico`) adicionado a `AthleteRaceView`, derivado dentro do próprio `buildAthleteRaceList` (a
  categoria depende da posição na lista já ordenada — `futuras[0]` é quem pode ser `proxima`, só se
  não for `alvo`). CA3, CA4, CA6 cobertos nos mesmos testes da 1.1.
- [x] 1.3 `AthleteRacesPage.tsx` (`RaceCard`) — `CATEGORY_STYLE` por categoria:
  - `alvo`: destaque atual preservado (borda lime, ícone, label "PROVA-ALVO").
  - `proxima`: borda `semantic.info` (azul), sem label.
  - `futura`: estilo neutro atual, sem mudança.
  - `historico`: borda esmaecida + `opacity: 0.65`.
  - `data-categoria` adicionado ao card, no padrão de `data-alvo`.
  - verify: `AthleteRacesPage.test.tsx` reescrito (ordem antiga removida, cobria o bug) — assert de
    `data-categoria` nos 3 cards (proxima/alvo/historico) — verde.
- [x] 1.4 Validação: `npm run lint && npm run build && npm run test:run` — 228 arquivos, 1928
  testes, 0 falhas.

## 2. QA
- [ ] 2.1 `/qa` — code-reviewer + clean-code-reviewer (frontend), já que é Fast track (sem
  security-reviewer obrigatório — sem dado sensível nem contrato novo envolvido).
