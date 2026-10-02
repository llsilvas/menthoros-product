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
  - `historico`: fundo mais escuro (`elevation.base`) + borda esmaecida — sem `opacity` no card
    inteiro (ver 2.1, achado do Codex corrigido).
  - `data-categoria` adicionado ao card, no padrão de `data-alvo`.
  - verify: `AthleteRacesPage.test.tsx` reescrito (ordem antiga removida, cobria o bug) — assert de
    `data-categoria` nos 3 cards (proxima/alvo/historico) — verde.
- [x] 1.4 Validação: `npm run lint && npm run build && npm run test:run` — 228 arquivos, 1930
  testes, 0 falhas (após os fixes da 2.1).

## 2. QA
- [x] 2.1 `/qa` — frontend-reviewer + clean-code-reviewer + Codex review (cross-model), em
  paralelo. Nenhum achado Critical. **3 achados corrigidos**, dois com convergência forte
  (Codex + clean-code-reviewer independentemente no mesmo bug):
  - Prova-alvo já `realizada` (ex.: resultado lançado antes da data oficial) continuava em
    `futuras`/categoria `alvo` — banner "PROVA-ALVO" + chip "Realizada" no mesmo card. Corrigido:
    `realizada` agora força `historico`, independente da data.
  - `opacity: 0.65` no card de histórico derrubava o contraste do texto de data/distância abaixo
    de 4,5:1 (achado só do Codex, cálculo de contraste). Corrigido: fundo mais escuro em vez de
    opacity.
  - `hojeIso >= dataIso` duplicado em 3 funções (achado só do clean-code-reviewer). Extraído
    helper `isFutura()`.
  - 2 achados Minor do frontend-reviewer não bloqueantes, registrados mas não codificados agora:
    empate de data entre duas provas futuras sem critério de desempate explícito (cenário raro);
    mudança de cor do título confirmada como intencional (reforça a hierarquia).
  - Commit do fix: `b06018f`. Suíte completa após os fixes: 228 arquivos, 1930 testes, 0 falhas.
