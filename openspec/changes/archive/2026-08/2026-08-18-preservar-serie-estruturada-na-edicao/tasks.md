# tasks — preservar-serie-estruturada-na-edicao

Repos afetados:
- `apps/menthoros-front` · branch `feature/preservar-serie-estruturada-na-edicao`
- `apps/menthoros-backend` · branch `feature/preservar-serie-estruturada-na-edicao`

> **Ordem importa.** O backend (seção 3) pode ir primeiro e sozinho — corrige o `blocoId` sem
> depender do front. O front (seções 1–2) depende só do contrato já existente. Os PRs são
> independentes; nenhum quebra o outro se mergeado antes.

## 0. Pré-requisito — conferir antes de criar a branch do front

- [x] **0.1** `expandir-serie-timeline-revisao` (menthoros-front **#78**) mergeada em `develop`.
      A task 2.5 assume o laço de expansão do `liveBlocks`; sem ele a base é outra e o merge
      conflita. `gh pr view 78 --json state -q .state` deve retornar `MERGED`.

## 1. Modelo de etapas compartilhado (front)

- [x] **1.1** Extrair `StepRow` / `BlockRow` / `SubStep` / `EtapaItem` e `serializarItens` de
      `TreinoAddDialog.tsx:55-79,105-127` para `features/coach/components/etapas/`.
      Extração pura: `TreinoAddDialog` passa a importar, sem mudança de comportamento.
- [x] **1.2** Testes do `TreinoAddDialog` seguem verdes sem alteração — é a prova de que a extração
      não mudou nada.
- [x] **Validação:** `npm run test:run` → 123 arquivos, 991 testes, 0 falhas

## 2. Hidratação inversa e editor por lista (front)

- [x] **2.1** Teste que falha — **round-trip** (CA1): `serializarItens(itensFromEtapas(etapas))`
      reproduz as etapas originais, para uma série heterogênea (2 pares Z4/Z1 + 2 pares Z5/Z1).
      É o teste que mais protege este design.
- [x] **2.2** Testes de `itensFromEtapas`: agrupa por `blocoId` (CA2), infere sem `blocoId` (CA3),
      não inventa bloco em etapas heterogêneas (CA4), degrada para avulsos quando `reps` não divide
      o grupo, exige uma etapa `INTERVALADO` na janela, e **bloco com 1 repetição** vira sub-etapas
      avulsas em vez de `BLOCO` degenerado.
- [x] **2.3** **Paridade com o Java:** comentário cruzado nos dois arquivos de teste
      (`etapaItem.test.ts` ↔ `IntervalsIcuWorkoutConverterTest.java`) e os mesmos cenários de
      agrupamento cobertos dos dois lados — bloco explícito, inferência sem `blocoId`, série
      heterogênea, e a exigência de etapa `INTERVALADO` na janela.

      **Entregue parcialmente, e vale registrar:** os fixtures são equivalentes em cenário, não
      idênticos em dados — cada suíte usa os valores que fazem sentido no seu lado (o Java trabalha
      com `EtapaTreino` e `Duration`, o TS com strings de formulário). Isso significa que a
      divergência aparece como teste vermelho apenas se ela mudar o **comportamento** coberto; uma
      divergência sutil em dado de borda pode escapar. Compartilhar fixtures de verdade exigiria um
      arquivo de dados comum aos dois repos — desproporcional agora, e a alternativa real é o
      follow-up de unificar a regra no backend.
- [x] **2.4** Implementar `itensFromEtapas`.
- [x] **2.5** **Ajustar `TreinoPlanejadoPatch.etapas`** de `EtapaTreinoDto[]` para
      `EtapaInputPayload[]` (`types/PlanoReview.ts:97`). Sem isso não compila: `serializarItens`
      devolve `EtapaInputPayload[]`, e `EtapaTreinoDto` não tem `subEtapas`. Não é mudança de
      contrato — o backend já aceita (`TreinoPlanejadoPatchDto.etapas` é `List<EtapaInputDto>`);
      o tipo do cliente TS é que estava estreito. Conferir se há outro consumidor do campo.
- [x] **2.6** `TreinoEditDialog`: quatro `BlocoState` → `EtapaItem[]`; adicionar, remover, reordenar.
- [x] **2.7** **Preservar a guarda `blocosMudados`** (`:415`), agora rastreando a lista de itens:
      `handleSalvar` só inclui `patch.etapas` se a lista mudou. Teste do CA7 — alterar apenas o TSS
      e verificar que o patch **não** contém `etapas`.
- [x] **2.8** Soft-warning ao remover aquecimento ou desaquecimento de um treino que os tinha:
      confirmação não-bloqueante antes de salvar. Não valida no backend.
- [x] **2.9** `liveBlocks` e os totais derivam dos itens. Verificar que o laço de expansão criado em
      `expandir-serie-timeline-revisao` **simplifica** em vez de duplicar.
- [x] **2.10** Teste de componente: abre série heterogênea, altera uma etapa, salva — as demais
      preservam conteúdo e ordem (CA1); treino simples preservado (CA6).
- [x] **Validação:** `npm run lint` sem issues · `npm run build` ok · `npm run test:run` → **991 testes, 0 falhas**

## 3. `blocoId` preservado no patch (backend)

- [x] **3.1** Teste que falha (CA5): patch com `BLOCO` de 4 repetições → 8 etapas com o mesmo
      `blocoId` e `blocoRepeticoes=4`.
- [x] **3.2** `aplicarEtapasPatch` expande os blocos gerando um `UUID` por `BLOCO` e construindo via
      `buildEtapaSimples` — o mesmo caminho da adição. Manter `expandirRepeticoes` para o payload
      legado `INTERVALADO(rep=N)`.
- [x] **3.3** Teste de não-regressão: patch de treino simples segue gravando 3 etapas sem `blocoId`
      (CA6); payload legado continua expandindo.
- [x] **Validação:** `./mvnw clean verify` → **2617 unitários + 103 IT, 0 falhas**

## 4. Fechamento

- [x] **4.1** `/qa` nos dois repos — `code-reviewer` (backend) e `frontend-reviewer`. Zero Critical.
      **Quatro achados Important, todos corrigidos:**
      - *backend*: a unificação trouxe as validações da adição para o PATCH (`BLOCO` vazio e
        `blocoRepeticoes > 20` passam a dar 422) sem teste nem registro. Três testes adicionados e
        a tabela de contrato documentada no `design.md`.
      - *front*: **etapa adicionada nunca era salva** — não havia seletor de tipo, então
        `emptyStep()` nascia com `tipoEtapa: ''` e `serializarItens` descartava o item em silêncio.
      - *front*: **a guarda `blocosMudados` valia pela metade** — `distanciaKm` e `duracaoMin` são
        derivadas das etapas e ficavam fora dela. O reviewer provou com o próprio fixture do PR
        (cabeçalho `PT50M`, etapas somando 30min): mudar só o TSS reescreveria a duração.
      - *front*: `role="alertdialog"` sem captura de foco nem Escape → `role="alert"`.

      Padrão comum aos dois bugs do front: **testes que exercitavam o caminho sem verificar o
      resultado**. O de adicionar etapa só checava o contador aparecer; o de edição administrativa
      olhava `patch.etapas` e ignorava os campos derivados.
- [x] **4.2** PR backend → `develop` — menthoros-backend **#72**
- [x] **4.3** PR front → `develop` — menthoros-front **#79**
- [ ] **4.4** **Pendente — não bloqueia o arquivamento, mas não foi feito.** Validar em ambiente real — **o E2E não substitui isto**: ele mocka a API, então prova
      o payload que sai do browser, não o backend gravando o `blocoId`. Validar em ambiente real: abrir um fartlek na revisão, salvar sem alterar, conferir que
      as etapas não mudaram; depois editar uma repetição e conferir que só ela mudou.

## E2E

- [x] **E2E** `tests/e2e/coach/plan-review-edicao.spec.ts` — **2 casos, verdes**, com o corpo do
      PATCH interceptado no browser: a série sai como `BLOCO(5)` e a edição de TSS não envia
      `etapas`. Suíte E2E completa: **48 specs, 0 falhas**.

      Armadilha encontrada ao escrever: o `CoachLayout` só busca os planos depois do gate de
      consentimento e onboarding (`liberado`), então o mock de `/users/me` precisa vir completo.
      Sem isso a tela carrega vazia e o teste passa por engano, sem nunca renderizar a lista — o
      mesmo modo de falha que o `CLAUDE.md` descreve para os E2E de coach existentes.

      Justificativa registrada quando a task foi escrita: o `CLAUDE.md` do front lista "editar um treino planejado" como fluxo crítico com E2E
      obrigatório, e **esta change muda o fluxo de escrita** — diferente de
      `expandir-serie-timeline-revisao`, que era só renderização e por isso pôde deferir.
      Aqui o E2E é devido: o round-trip grava no plano do atleta.

      Não existe spec da tela de revisão hoje (`tests/e2e/` cobre auth, atletas, dashboard,
      coach/inbox), então esta change inclui criar a primeira — seed de plano + auth + edição.
      Se o ambiente inviabilizar, registrar aqui o motivo antes do PR, não depois.

## Fechamento (2026-08-18)

- PR backend **#72** e PR front **#79** mergeados em `develop`.
- **Lapso corrigido depois do merge:** os três testes de contrato de erro do PATCH, escritos no
  quality gate em resposta ao `code-reviewer`, ficaram sem commit — o #72 mergeou sem eles. Eles
  existiam localmente e passavam; o `git add` do momento pegou só o outro arquivo. Recuperados no
  PR **#73**, que é só teste. Sem impacto em produção, mas registra que o achado do gate ficou
  temporariamente sem a cobertura que o motivou.
- **Task 4.4 segue aberta.** O E2E mocka a API: prova o payload que sai do browser, não o backend
  gravando o `blocoId`. Só a validação em ambiente real fecha essa lacuna.

## Riscos

- **Reescrita grande do `TreinoEditDialog`** (754 linhas). Mitigação: extrair o modelo primeiro
  (seção 1) e manter os testes existentes do dialog verdes como rede.
- **Regra de inferência duplicada** (Java + TS). Aceita conscientemente; gatilho de revisão em
  "Dívida aceita" no `design.md`.
- **Coach pode salvar treino sem aquecimento.** Verificado: o backend não valida estrutura no patch.
  É decisão de produto, não descuido — registrada nos non-goals do `proposal.md`.

## Follow-ups

- Unificar a inferência no backend e expor o agrupamento no `EtapaTreinoDto` (ver "Dívida aceita").
- **Editar treino de plano aprovado não re-sincroniza o relógio.** Verificado: o push só reage a
  `PlanoAprovadoEvent` (`IntervalsIcuPushListener:71-72`) e `TreinoPlanejadoServiceImpl` não publica
  evento. Defeito pré-existente, mas esta change torna a edição de intervalados viável e portanto
  mais frequente — o desalinhamento entre backend e relógio do atleta fica mais provável.
- **Telemetria de "estrutura preservada"** em produção (sugestão do product-review). "Zero perda" é
  hoje uma afirmação de teste, não um fato monitorado. Fora do escopo por não haver instrumentação
  equivalente em nenhuma outra área do produto — introduzir a primeira é decisão própria.
- **Sinal proposta-IA vs edição-do-coach** (sugestão do product-review): o patch corrigido é o lugar
  natural para capturar o que o treinador muda em relação ao que a IA propôs. Não implementado aqui;
  registrado para que a oportunidade não passe em silêncio.
