# tasks — preservar-serie-estruturada-na-edicao

Repos afetados:
- `apps/menthoros-front` · branch `feature/preservar-serie-estruturada-na-edicao`
- `apps/menthoros-backend` · branch `feature/preservar-serie-estruturada-na-edicao`

> **Ordem importa.** O backend (seção 3) pode ir primeiro e sozinho — corrige o `blocoId` sem
> depender do front. O front (seções 1–2) depende só do contrato já existente. Os PRs são
> independentes; nenhum quebra o outro se mergeado antes.

## 0. Pré-requisito — conferir antes de criar a branch do front

- [ ] **0.1** `expandir-serie-timeline-revisao` (menthoros-front **#78**) mergeada em `develop`.
      A task 2.5 assume o laço de expansão do `liveBlocks`; sem ele a base é outra e o merge
      conflita. `gh pr view 78 --json state -q .state` deve retornar `MERGED`.

## 1. Modelo de etapas compartilhado (front)

- [ ] **1.1** Extrair `StepRow` / `BlockRow` / `SubStep` / `EtapaItem` e `serializarItens` de
      `TreinoAddDialog.tsx:55-79,105-127` para `features/coach/components/etapas/`.
      Extração pura: `TreinoAddDialog` passa a importar, sem mudança de comportamento.
- [ ] **1.2** Testes do `TreinoAddDialog` seguem verdes sem alteração — é a prova de que a extração
      não mudou nada.
- [ ] **Validação:** `npm run test:run`

## 2. Hidratação inversa e editor por lista (front)

- [ ] **2.1** Teste que falha — **round-trip** (CA1): `serializarItens(itensFromEtapas(etapas))`
      reproduz as etapas originais, para uma série heterogênea (2 pares Z4/Z1 + 2 pares Z5/Z1).
      É o teste que mais protege este design.
- [ ] **2.2** Testes de `itensFromEtapas`: agrupa por `blocoId` (CA2), infere sem `blocoId` (CA3),
      não inventa bloco em etapas heterogêneas (CA4), degrada para avulsos quando `reps` não divide
      o grupo, exige uma etapa `INTERVALADO` na janela, e **bloco com 1 repetição** vira sub-etapas
      avulsas em vez de `BLOCO` degenerado.
- [ ] **2.3** **Teste de paridade com o Java:** os fixtures de agrupamento de
      `IntervalsIcuWorkoutConverterTest` reproduzidos em `itensFromEtapas.test.ts`, com comentário
      cruzado em cada arquivo apontando para o outro. É o que faz a divergência aparecer como teste
      vermelho em vez de chamado do treinador (ver "Dívida aceita" no `design.md`).
- [ ] **2.4** Implementar `itensFromEtapas`.
- [ ] **2.5** **Ajustar `TreinoPlanejadoPatch.etapas`** de `EtapaTreinoDto[]` para
      `EtapaInputPayload[]` (`types/PlanoReview.ts:97`). Sem isso não compila: `serializarItens`
      devolve `EtapaInputPayload[]`, e `EtapaTreinoDto` não tem `subEtapas`. Não é mudança de
      contrato — o backend já aceita (`TreinoPlanejadoPatchDto.etapas` é `List<EtapaInputDto>`);
      o tipo do cliente TS é que estava estreito. Conferir se há outro consumidor do campo.
- [ ] **2.6** `TreinoEditDialog`: quatro `BlocoState` → `EtapaItem[]`; adicionar, remover, reordenar.
- [ ] **2.7** **Preservar a guarda `blocosMudados`** (`:415`), agora rastreando a lista de itens:
      `handleSalvar` só inclui `patch.etapas` se a lista mudou. Teste do CA7 — alterar apenas o TSS
      e verificar que o patch **não** contém `etapas`.
- [ ] **2.8** Soft-warning ao remover aquecimento ou desaquecimento de um treino que os tinha:
      confirmação não-bloqueante antes de salvar. Não valida no backend.
- [ ] **2.9** `liveBlocks` e os totais derivam dos itens. Verificar que o laço de expansão criado em
      `expandir-serie-timeline-revisao` **simplifica** em vez de duplicar.
- [ ] **2.10** Teste de componente: abre série heterogênea, altera uma etapa, salva — as demais
      preservam conteúdo e ordem (CA1); treino simples preservado (CA6).
- [ ] **Validação:** `npm run lint && npm run build && npm run test:run`

## 3. `blocoId` preservado no patch (backend)

- [ ] **3.1** Teste que falha (CA5): patch com `BLOCO` de 4 repetições → 8 etapas com o mesmo
      `blocoId` e `blocoRepeticoes=4`.
- [ ] **3.2** `aplicarEtapasPatch` expande os blocos gerando um `UUID` por `BLOCO` e construindo via
      `buildEtapaSimples` — o mesmo caminho da adição. Manter `expandirRepeticoes` para o payload
      legado `INTERVALADO(rep=N)`.
- [ ] **3.3** Teste de não-regressão: patch de treino simples segue gravando 3 etapas sem `blocoId`
      (CA6); payload legado continua expandindo.
- [ ] **Validação:** `./mvnw clean verify` (gate — `test` não roda os `*IT`)

## 4. Fechamento

- [ ] **4.1** `/qa` nos dois repos
- [ ] **4.2** PR backend → `develop`
- [ ] **4.3** PR front → `develop`
- [ ] **4.4** Validar em ambiente real: abrir um fartlek na revisão, salvar sem alterar, conferir que
      as etapas não mudaram; depois editar uma repetição e conferir que só ela mudou.

## E2E

- [ ] **E2E** O `CLAUDE.md` do front lista "editar um treino planejado" como fluxo crítico com E2E
      obrigatório, e **esta change muda o fluxo de escrita** — diferente de
      `expandir-serie-timeline-revisao`, que era só renderização e por isso pôde deferir.
      Aqui o E2E é devido: o round-trip grava no plano do atleta.

      Não existe spec da tela de revisão hoje (`tests/e2e/` cobre auth, atletas, dashboard,
      coach/inbox), então esta change inclui criar a primeira — seed de plano + auth + edição.
      Se o ambiente inviabilizar, registrar aqui o motivo antes do PR, não depois.

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
