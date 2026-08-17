# tasks — preservar-serie-estruturada-na-edicao

Repos afetados:
- `apps/menthoros-front` · branch `feature/preservar-serie-estruturada-na-edicao`
- `apps/menthoros-backend` · branch `feature/preservar-serie-estruturada-na-edicao`

> **Ordem importa.** O backend (seção 3) pode ir primeiro e sozinho — corrige o `blocoId` sem
> depender do front. O front (seções 1–2) depende só do contrato já existente. Os PRs são
> independentes; nenhum quebra o outro se mergeado antes.

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
      o grupo, e exige uma etapa `INTERVALADO` na janela.
- [ ] **2.3** Implementar `itensFromEtapas`.
- [ ] **2.4** `TreinoEditDialog`: quatro `BlocoState` → `EtapaItem[]`; adicionar, remover, reordenar;
      `handleSalvar` emite `serializarItens(itens)`.
- [ ] **2.5** `liveBlocks` e os totais derivam dos itens. Verificar que o laço de expansão criado em
      `expandir-serie-timeline-revisao` **simplifica** em vez de duplicar.
- [ ] **2.6** Teste de componente: abre série heterogênea, salva sem alterar, patch idêntico;
      treino simples preservado (CA6).
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
