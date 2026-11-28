**Tamanho:** S · **Trilha:** Fast

# add-injury-clearance-coach — desmarcar a lesão abre a volta aos treinos

**Design:** https://claude.ai/artifact/5Y2fzou7t87vH7V9YQAyc5#play-fad9a36280da (versão 7,
`1795863599-622a`). Esta change não tem tela; ela é a regra que o painel "Sua decisão" descreve ("a
lesão fica no histórico com a data de hoje como fim", "volta aos treinos por 30 dias"). As telas são
da `add-injury-clearance-flow`.

## Why

Hoje só o coach desmarca a lesão, pelo `AtletaDialog` (`PUT /api/v1/atletas/{id}`, `TECNICO`/`ADMIN`).
O `AtletaInputDto` não tem `dataUltimaLesao`, então desmarcar grava só `temLesao = false`. O
`InjuryPolicyResolver` decide a fase assim:

1. `temLesao = true` → `RECOVERY` + revisão (`INJURY_ACTIVE`).
2. `dataUltimaLesao` nos últimos 30 dias (`planner-engine.injury.recent-window-days`) →
   `RETURN_TO_TRAINING` (`INJURY_RECENT`).
3. `descricaoLesao` preenchida → sem fase forçada, mas revisão obrigatória
   (`INJURY_DESCRIPTION_UNSTRUCTURED`).
4. Fluxo normal.

Com `dataUltimaLesao` vazia, desmarcar pula o passo 2: o planner sai da recuperação direto para a meta
da temporada. A descrição fica preenchida e o passo 3 pede revisão em toda semana dali em diante.

Caso real (homelab, 27/11): atleta com lombalgia, realizado de 16,2 → 6,8 → 1,5 km nas últimas
semanas, plano da semana 30/11 em `RECOVERY` com 8,95 km. A semana 2 da temporada pede 20 km e longão
de 8 km. Desmarcar a lesão hoje levaria a geração seguinte a mirar 20 km sem fase de retorno.

## What Changes

- `AtletaServiceImpl.updateAtleta`: na **transição** `temLesao` `true → false`, aplicar a liberação:
  - `dataUltimaLesao = hoje` (pelo `Clock` já injetado), o que ativa `RETURN_TO_TRAINING` pela janela
    configurada;
  - acrescentar a `historicoLesoes` uma linha `AAAA-MM-DD — <descricaoLesao anterior>` (ou
    `AAAA-MM-DD — lesão encerrada` quando a descrição estava vazia), preservando o histórico;
  - limpar `descricaoLesao`, para não cair em `INJURY_DESCRIPTION_UNSTRUCTURED` depois da janela.
- **Com `temLesao = false` no resultado, a `descricaoLesao` do payload é ignorada** e vale a gravada.
  Motivo (pre-mortem Codex, conferido): o `AtletaDialog` manda `descricaoLesao` mesmo com o checkbox
  desmarcado (`AtletaDialog.tsx:85`), e o MapStruct copia (`AtletaMapper.java:25`). Sem essa regra,
  o segundo `PUT` idêntico devolveria a descrição, que a liberação acabou de limpar, e depois da
  janela voltaria a revisão por `INJURY_DESCRIPTION_UNSTRUCTURED`. Com ela, dois `PUT` iguais dão o
  mesmo estado: o `PUT` continua idempotente.
- Sem transição (`false → false`, `true → true`, `false → true`), `dataUltimaLesao` e
  `historicoLesoes` não mudam.
- Os valores anteriores (`temLesao`, `descricaoLesao`) são lidos **antes** do
  `atletaMapper.updateEntity`.

Fora de escopo: endpoint novo, campo novo no contrato, mudança no front (o texto de ajuda no
`AtletaDialog` vai na `add-injury-clearance-flow`), sinal do atleta, reancorar a temporada.

## Impact

- Backend: `services/impl/AtletaServiceImpl.updateAtleta` + teste. Sem migration, sem contrato novo:
  `historicoLesoes` e `dataUltimaLesao` não estão no `AtletaInputDto` (o MapStruct não os toca) nem no
  `AtletaOutputDto`.
- Front: nenhum.
- Efeitos indiretos de preencher `historicoLesoes` (comportamento que já existe para quem tem
  histórico, e passa a valer para todo atleta liberado):
  - `AlertasPromptFormatter.formatarRestricoesLesoes` (`:304`) manda o histórico ao prompt da LLM
    como "HISTÓRICO DE LESÕES" e acrescenta alertas por palavra-chave (canelite, fascite,
    tendinite). O texto já ia ao prompt como "LESÃO ATIVA"; não é dado novo saindo.
  - `DisponibilidadePromptFormatter.calcularMaxDiasConsecutivos` (`:187`, fator 6 em `:248`) reduz
    em 1 o máximo de dias de treino **consecutivos** (piso 3) para qualquer atleta com histórico,
    **sem prazo**. Não reduz a frequência semanal: o efeito é intercalar descanso mais cedo, e é
    leve. Ver Open Questions.
- Lacuna conhecida, fora desta change: o atleta pode salvar outro rascunho de onboarding e concluir
  de novo (`OnboardingServiceImpl.salvarRascunho` não bloqueia depois de `COMPLETO`). A conclusão
  copia `temLesao`, data e histórico do rascunho (`:295-298`) e não passa por esta regra. Tratado na
  `add-injury-clearance-flow`.
- Rollback: reverter o commit; as linhas já gravadas ficam coerentes (data e histórico preenchidos).

## Critérios de aceite

- **CA1** — **Dado** atleta com `temLesao = true`, `descricaoLesao = "lombalgia"` e
  `historicoLesoes` vazio, **quando** o coach salva com `temLesao = false` em 28/11/2026, **então**
  `dataUltimaLesao = 2026-11-28`, `historicoLesoes = "2026-11-28 — lombalgia"` e `descricaoLesao`
  vazia.
- **CA2** — **Dado** `historicoLesoes` já preenchido, **quando** a liberação acontece, **então** a
  linha nova é acrescentada em nova linha e o texto anterior fica intacto.
- **CA3** — **Dado** `descricaoLesao` vazia, **quando** a liberação acontece, **então** a linha é
  `AAAA-MM-DD — lesão encerrada`.
- **CA4** — **Dado** atleta com `temLesao = false`, **quando** o coach salva com `temLesao = false`,
  **então** `dataUltimaLesao`, `historicoLesoes` e `descricaoLesao` seguem a regra atual (sem
  liberação).
- **CA5** — **Dado** atleta com `temLesao = false`, **quando** o coach salva com `temLesao = true` e
  descrição, **então** nada é gravado em `dataUltimaLesao` nem em `historicoLesoes`.
- **CA7** — **Dado** o atleta liberado em CA1, **quando** o coach repete o mesmo `PUT` (com
  `temLesao = false` e `descricaoLesao = "lombalgia"` no payload), **então** `descricaoLesao` continua
  vazia e `historicoLesoes` não ganha linha nova.
- **CA6** — **Dado** o atleta liberado em CA1, **quando** o `InjuryPolicyResolver` resolve em
  28/11/2026 com janela de 30 dias, **então** a fase é `RETURN_TO_TRAINING` e o motivo
  `INJURY_RECENT`.

## Métrica de sucesso

Dos atletas liberados depois do merge, 100% têm o primeiro plano gerado em `RETURN_TO_TRAINING`
(`tb_plano_semanal.planner_phase`), e nenhum plano seguinte dentro de 30 dias sai com
`coachReviewReason = INJURY_DESCRIPTION_UNSTRUCTURED`. Com N pequeno no piloto, isso é aceite, não
sinal de produto (revisão de produto). O sinal de produto é se o coach edita o plano
`RETURN_TO_TRAINING` gerado depois da liberação: pouca edição indica que a fase de retorno acerta a
carga.

## Open Questions & Assumptions

- **Premissa:** "hoje" é a data do `Clock` do servidor, não do fuso do tenant. Mesmo critério das
  outras datas de `AtletaServiceImpl` (`LocalDate.now(clock)`).
- **Premissa:** `historicoLesoes` é texto livre sem formato; uma linha por evento basta. Conferido:
  ninguém faz parse estruturado; o único uso além do prompt é a busca por palavra-chave do
  `AlertasPromptFormatter`, que continua funcionando com a linha datada.
- **Aberto (decisão do founder):** aceitar o `-1` permanente no máximo de dias **consecutivos** para
  todo atleta liberado? A proposta aceita: o efeito é leve (não corta frequência semanal), é o
  comportamento atual para quem declarou histórico no onboarding, e mudar a regra de disponibilidade
  fica fora de escopo.
- **Aberto:** a liberação deveria registrar quem liberou? Fica para a `add-injury-clearance-flow`,
  que cria a trilha de eventos.
- **Dependência:** `add-injury-clearance-flow` reusa esta regra para a confirmação do coach.
