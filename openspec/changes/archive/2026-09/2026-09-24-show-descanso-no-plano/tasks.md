# Tasks — show-descanso-no-plano

Ordem por dependência: tipos → helper puro → painel do treinador → agenda do atleta → entrega.
Cliente de API é **curado à mão**: nunca rodar `generate:api` (é destrutivo neste repo).

Revisado 2x em 2026-09-23. 1ª DoR: home do atleta saiu do escopo, e o `TreinoAddDialog` ganhou task
própria por não aceitar data. 2ª DoR: a agenda **já** dizia "Descanso" em todo dia sem treino, então
o dia vazio passa a dizer "Sem treino"; a ordenação passa a valer sempre; a frase fixa perdeu o
"hoje".

## 1. Tipos e helper de ordenação (TDD)

- [x] 1.1 `restDays?: RestDayDto[] | null` (`{ dayOfWeek: string; reason: string }`) em
      `PlanoSemanalDto` (`src/types/PlanoReview.ts`) e em `PlanoSemanal` (`src/types/PlanoSemanal.ts`)
      — nulável de verdade, não só opcional: o CA2 cobre `undefined`, `null` e `[]`
      verify: `npm run build`; plano antigo sem o campo continua compilando
- [x] 1.2 Helper puro que funde treinos e descansos numa lista ordenada por dia da semana, usado
      pelo painel **sempre** — inclusive com `restDays` vazio (CA2b)
      verify: `npm run test:run` — CA6 na íntegra: ordem segunda→domingo; **dois treinos no mesmo dia
      aparecem os dois** (não deduplicar treino); dia com treino **e** descanso → treino vence;
      `dayOfWeek` inválido/desconhecido é ignorado sem quebrar; listas vazias dos dois lados; e
      **lista só de treinos fora de ordem sai ordenada** (o caso do plano antigo)
- [x] 1.3 Subir `weekDatesFromInicio` (hoje em `features/athlete/adapters/buildWeekAgenda.ts:55`)
      para um módulo compartilhado — o painel do coach precisa da mesma conta e `features/coach` não
      deve importar de `features/athlete`. **O teste também muda**: `buildWeekAgenda.test.ts:2`
      importa a função de `./buildWeekAgenda` — ajustar o import (ou reexportar na origem)
      verify: `npm run test:run` do teste existente do adapter continua verde após a mudança de local

## 2. Painel do treinador (TDD)

- [x] 2.1 Chip de descanso no `PlanoDetalhePanel` — rótulo "Descanso", `reason` como veio, sem
      duração/RPE/zona, com `data-testid` próprio
      verify: `PlanoDetalhePanel.test.tsx` — CA1 e **CA2**: sem `restDays` (ausente, `null` e `[]`),
      nenhum chip de descanso e nenhuma frase aparece, e o conteúdo dos chips de treino é o mesmo de
      hoje — **exceto a ordem**, que passa a ser segunda→domingo (CA2b). Testar com a lista de
      treinos chegando fora de ordem, que é o caso em que as duas exigências se distinguem
- [x] 2.2 Semana só com descansos não cai no "Nenhuma sessão disponível" (`:600`)
      verify: CA8 — teste do painel, não só do helper
- [x] 2.3a **Prop nova no `TreinoAddDialog`**: data inicial, aplicada a cada abertura (o dialog fica
      montado em `CoachPlanReviewPage.tsx:336` e limpa o form no `resetForm` ao fechar — inicializar
      `useState` uma vez não basta)
      verify: `TreinoAddDialog.test.tsx` — CA3c (abrir pela quinta → cancelar → abrir pelo sábado dá
      sábado) e abertura pelo botão genérico, sem data, continua com o campo vazio
- [x] 2.3b Ação "Prescrever treino neste dia" no chip, passando a data daquele dia da semana do plano
      verify: CA3 (dialog abre com a data certa) e **CA3b** (plano fora de `AGUARDANDO_REVISAO` não
      oferece a ação — mesma guarda do botão existente, `:621`)
- [x] 2.4 Efeito segue a data salva, não a de origem
      verify: **CA3d** — abrir pela quinta, editar para sexta, salvar: o descanso de quinta permanece
- [x] 2.5 Rótulo acessível do chip
      verify: CA7, por `toHaveAccessibleName`

## 3. Agenda do atleta (TDD)

> A home saiu do escopo na revisão de 23/09: `AthleteHome` (`src/types/AthleteHome.ts:47`) não tem
> descanso e a home consome `/me/home`, não o plano. Virou follow-up de backend.

- [x] 3.1 `buildWeekAgenda` distingue **descanso prescrito** de **dia vazio**
      verify: `buildWeekAgenda.test.ts` — CA4, incluindo dia sem treino e sem descanso
- [x] 3.2 `WeekAgendaRow`: descanso prescrito → "Descanso" + frase fixa; dia vazio → **"Sem treino"**
      (hoje os dois dizem "Descanso", `:140`)
      verify: CA4 na tela; asserção explícita de que o `reason` cru **não** aparece; e **CA2c** — em
      plano sem `restDays`, o dia vazio diz "Sem treino" e nenhuma frase de recuperação aparece

## 4. Entrega

- [x] 4.1 `npm run lint && npm run build && npm run test:run`
- [x] 4.2 E2E (Playwright) do fluxo do treinador: ver o descanso → prescrever treino → descanso some
      verify: mock do IdP antes do 1º `goto` e `waitForURL` antes de `evaluate` (convenção do repo)
- [x] 4.3 Validação real com um plano que tenha `restDays`
      **Feito em 23/09.** Check-in DESCANSAR de hoje inserido no banco (autorizado pelo founder);
      geração em SEMANA_ATUAL produziu o plano `ae3813cf` (semana 21/09, `AGUARDANDO_REVISAO`) com
      `restDays: [{QUINTA, "Readiness do dia é DESCANSAR. TSB atual -11,8, abaixo do limiar."}]` e
      treino no sábado — aprovado em 20 s, 1ª tentativa, sem redistribuição.
      **CA1 na tela:** o chip de descanso apareceu com o motivo.
      **CA3 ponta a ponta com backend real:** "Prescrever treino neste dia" → diálogo abriu em
      2026-09-24 → salvou → `rest_days` virou `[]` e o treino entrou na quinta com
      `adicionado_pelo_coach = true`, com o REGENERATIVO de sábado intacto. É o trecho que o E2E não
      prova (lá o POST é mockado): quem remove o descanso é o backend, pelo CA14 da change dele.
- [ ] 4.4 **Destrava o gate 5.3 do backend:** só com esta change em `develop` é que
      `add-descanso-explicito-por-fadiga` pode ir para `main`
