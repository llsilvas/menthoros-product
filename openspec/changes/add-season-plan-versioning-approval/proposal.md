**Tamanho:** M · **Trilha:** Full

> Fatia **S4** do épico `add-season-plan-macrocycle`. Proposal, design (Decisão 4) e decisões vivem lá;
> esta change só delimita o escopo e os cenários que a fecham.

## Why

A temporada só vira ativa por aprovação explícita do treinador, e cada mudança depois disso precisa
preservar o que já foi executado e registrar o porquê — é o que permite comparar planejado contra
executado e capturar o delta de decisão no nível da temporada.

## What Changes

Tasks do épico: **3.1–3.10, 4.4–4.10, 4.14 (endpoints desta fatia)**.

- `MacrocicloVersionService`: rascunho a partir da versão ativa, salvar, aprovar, arquivar a anterior
- Cópia imutável das semanas passadas; `motivoVersao` obrigatório a partir da v2
- Recálculo que preserva semanas passadas e valores com `origemValor = COACH`
- Diff entre versões, por semana e campo, com origem
- Endpoints de rascunho, edição de semana e parâmetros, recálculo, validações, diff e aprovação

## Critérios de aceite

- **Dado** um rascunho de v2, **quando** o treinador aprova sem motivo, **então** recebe 422 e nenhuma
  versão é criada.
- **Dado** uma temporada aprovada na semana 7 de 18, **quando** a v2 é aprovada, **então** as semanas 1 a
  6 ficam idênticas às da v1.
- **Dado** um rascunho cuja soma de fases difere do total de semanas, **quando** é aprovado, **então**
  recebe 422.
- **Dado** uma semana concluída, em andamento ou a da prova, **quando** o treinador a edita, **então**
  recebe 422.
- **Dado** um valor editado pelo treinador, **quando** o rascunho é recalculado, **então** o valor com
  `origemValor = COACH` permanece.
- **Dado** duas versões, **quando** o diff é pedido, **então** lista semana, campo, valor anterior, valor
  novo e origem.
- **Dado** a aprovação de uma nova versão, **quando** termina, **então** há exatamente uma `ATIVO` e a
  anterior está `ARQUIVADO`, na mesma transação.

## Dependências e rollout

- Depende de: `add-season-plan-api-read-generate` (S3).
- Flag: `macrociclo.enabled`.
