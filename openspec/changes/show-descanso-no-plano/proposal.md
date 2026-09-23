# show-descanso-no-plano — o treinador vê o descanso com motivo e pode trocá-lo por treino

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-09-22
**Revisado:** 2026-09-23 — 2ª revisão, após a DoR reprovar (`spec-reviewer` **e** Codex, ambos
NOT READY). Ver "O que a DoR derrubou".
**Depende de:** `add-descanso-explicito-por-fadiga` (backend, PR #142 **mergeado em `develop`**).
O backend não vai para `main` antes desta change (task 5.3 de lá).

## Why

A change de backend transformou o dia omitido em silêncio em **descanso com motivo**. Sem UI, o dado
existe na API e o treinador continua sem vê-lo — é a "janela cega" registrada como risco lá.

O descanso é uma proposta da IA como qualquer treino: o treinador precisa ver **por que** a IA tirou
a sessão e poder discordar.

## Contrato (verificado no código)

```ts
restDays: Array<{ dayOfWeek: string; reason: string }>
```

`PlanoSemanalOutputDto.restDays` (`dto/output/PlanoSemanalOutputDto.java:91`). Vazio quando a semana
é toda de treino **ou** o plano é anterior à feature. O front trata `undefined`, `null` e `[]` igual.

**`reason` é texto escrito pela LLM**, não um enum. O prompt pede que ela cite o sinal com valor e
limiar, e o validador só exige que exista e caiba em 200 caracteres. Exemplos reais de 22/09:

- `"Readiness do dia é DESCANSAR, TSB -11,8 (limiar -25)"`
- `"check-in de hoje: DESCANSAR"`
- `"Recuperação ativa após treino de quarta-feira."`

Isso tem consequência direta no desenho — ver "Texto para o atleta".

## O que a DoR derrubou (2026-09-23)

A 1ª versão foi reprovada pelos dois revisores. Três achados convergentes, todos verificados no
código antes de aceitos:

1. **CA5 (home do atleta) não era implementável.** A home consome `/me/home` → `AthleteHome`
   (`src/types/AthleteHome.ts:47`), que só tem `hoje`, `proximoTreino`, `realizadoHoje` e
   `metricasChave` — nenhum descanso. O `selectTodayState` já devolve `'DESCANSO'`
   (`selectTodayState.ts:26`), mas como *fallback de "não há nada"*, sem motivo de onde vir.
   A spec assumiu que a home usava o `PlanoSemanalOutputDto`. **CA5 sai do escopo** (ver Follow-ups).
2. **"Mapear por tipo de sinal" não tem de onde mapear** — `reason` é prosa da LLM. Ver "Texto para
   o atleta".
3. **O pré-preenchimento da data não existia.** A 1ª versão registrou como "Assumido (verificado)",
   mas o que foi verificado é que o *payload* aceita `dataTreino`; o *componente* não:
   `TreinoAddDialogProps` (`TreinoAddDialog.tsx:82`) não tem prop de data inicial, e `dataTreino`
   nasce de `useState('')` e é limpo no `resetForm` ao fechar. É uma task própria agora.

## What Changes

Front (`apps/menthoros-front`) apenas. Campo aditivo, já em `develop`.

- **Tipos (cliente curado à mão — NUNCA rodar `generate:api`):** `restDays` em `PlanoSemanalDto`
  (`src/types/PlanoReview.ts:113`) e em `PlanoSemanal` (`src/types/PlanoSemanal.ts:10`).

- **Plano do treinador** (`PlanoDetalhePanel.tsx`): descansos entram **na mesma lista de chips** dos
  treinos (`:606`), ordenados por dia, como chip de descanso — rótulo "Descanso", o `reason`
  **como veio** (é texto de treinador), sem duração/RPE/zona.
  Não vira grade de 7 dias: o painel é hoje uma lista achatada e virar grade é redesenho de tela
  estável, fora do valor desta change.

- **Discordar:** o chip oferece "Prescrever treino neste dia" → abre o `TreinoAddDialog` com a data
  daquele dia. Exige **prop nova** no dialog (ver tasks 2.3a/2.3b). O backend remove o descanso ao
  criar o treino (CA14 de lá); o front recarrega o plano.

- **Atleta — agenda da semana** (`buildWeekAgenda.ts` + `WeekAgendaRow.tsx`): hoje o dia sem treino é
  inferido por `workout === null`. Passa a distinguir **descanso prescrito** de **dia vazio**.

### Texto para o atleta

A decisão do founder foi mapear o motivo para linguagem de atleta, mantendo o texto técnico só no
painel do treinador. Mantida — mas **a forma muda**, porque `reason` é prosa da LLM e não traz o tipo
do sinal:

- Casar substring em texto livre é frágil e **erra**: o exemplo real cita *dois* sinais na mesma
  frase (Readiness e TSB), então palavra-chave isolada atribuiria o motivo errado. Um `reason` com
  redação nova (a LLM muda o texto a cada geração) cairia em nenhum padrão.
- **Decisão:** o atleta vê **uma frase fixa** — *"Seu treinador e a IA reservaram hoje para
  recuperação."* — e **nunca** o `reason` cru. Sem tabela de padrões, sem regex.
- **Por que isso é melhor que a tabela:** a frase fixa é correta para 100% dos casos e não pode vazar
  "TSB -11,8 (limiar -25)" para o atleta. Uma tabela de substrings acerta alguns e erra os outros em
  silêncio — o pior dos dois mundos.
- Quando o motivo por sinal virar informação de verdade para o atleta, o caminho é o **backend**
  devolver o tipo do sinal estruturado, não o front adivinhar. Fica como follow-up.

## Fora de escopo

- **Home do atleta (ex-CA5)** — exige o motivo no contrato `/me/home`; é change de backend.
- Converter treino em descanso pela UI.
- Grade de 7 dias no painel do treinador.
- Painel de métricas de aceitação do descanso.

## Critérios de aceite

- **CA1** — Given plano com `restDays: [{dayOfWeek: "QUINTA", reason: "Readiness do dia é DESCANSAR,
  TSB -11,8 (limiar -25)"}]`, when o treinador abre o painel, then vê um chip "Descanso" na posição
  da quinta, com **esse** texto, sem duração/RPE.
- **CA2** — Given `restDays` `undefined`, `null` ou `[]`, then a UI é **idêntica** à de hoje —
  nenhum elemento novo, nos dois consumidores (painel e agenda).
- **CA3** — Given um plano em `AGUARDANDO_REVISAO` com descanso na quinta, when o treinador clica
  "Prescrever treino neste dia", then o `TreinoAddDialog` abre com `dataTreino` = a data da quinta
  daquela semana.
  **CA3b** — Given um plano que **não** está em `AGUARDANDO_REVISAO`, then o chip de descanso não
  oferece a ação (o painel já guarda o "Adicionar treino" por `isAguardando`, `:621` — o chip segue a
  mesma regra).
  **CA3c** — Given o treinador abriu pela quinta, cancelou e abriu pelo sábado, then a data vem
  sábado (o dialog permanece montado e limpa o form ao fechar; inicializar `useState` uma vez não
  basta).
  **CA3d** — Given o treinador abriu pela quinta mas **editou a data** para sexta antes de salvar,
  then o descanso de quinta **permanece** e o treino cai na sexta — o efeito segue a data salva, não
  a de origem.
- **CA4** — Given o atleta abre a agenda da semana, then o dia de descanso prescrito aparece como
  descanso **com a frase fixa** (nunca o `reason` cru), e um dia sem nada continua como dia vazio —
  os dois estados são distinguíveis.
- **CA6** — Ordenação: treinos e descansos na mesma lista saem em ordem de dia (segunda→domingo).
  **Nenhum treino é descartado**: dois treinos no mesmo dia são permitidos pelo produto
  (`TreinoAddDialog.tsx:401`) e devem aparecer os dois. Se um dia tiver treino **e** descanso (dado
  inconsistente do backend), **o treino vence** e o descanso não é exibido.
- **CA7** — Acessibilidade: o chip tem rótulo acessível ("Descanso na quinta: <motivo>") e respeita o
  contraste do tema.
- **CA8** — Given uma semana **só com descansos** (nenhum treino), then o painel mostra os chips de
  descanso — e **não** "Nenhuma sessão disponível" (`PlanoDetalhePanel.tsx:600`). É justamente a
  semana que esta change existe para tornar visível.

## Métrica de sucesso

O treinador entende um dia sem treino lendo o plano, em vez de abrir o atleta e investigar. E a taxa
de descansos convertidos em treino passa a ser observável — insumo da task 5.4 do backend.

## Riscos

- **Vazar texto técnico para o atleta.** Endereçado pela frase fixa; CA4 testa que o `reason` cru não
  aparece na agenda.
- **Plano legado.** Todo plano anterior à feature tem `restDays` vazio; CA2 garante que nada muda.
- **`weekDatesFromInicio` mora em `features/athlete`** (`buildWeekAgenda.ts:55`) e o painel do coach
  precisa da mesma conta. Subir para um módulo compartilhado em vez de importar entre features.

## Follow-ups

- **Descanso na home do atleta** (ex-CA5): exige o motivo em `/me/home`.
- **Tipo de sinal estruturado no `restDays`**: hoje só há prosa. Com ele, o atleta pode ver o motivo
  real em linguagem própria, e o front para de depender de frase genérica.
- Grade de 7 dias no painel do treinador, se o treinador sentir falta.
