## 1. Corrigir o método de recálculo

- [ ] 1.1 Em `IntervalsIcuActivityPersister.persistir`, trocar
      `tsbService.atualizarTsbDia(atleta.getId(), salvo.getDataTreino())` por
      `tsbService.recalcularDesde(atleta.getId(), salvo.getDataTreino())`.
      **Verify:** `./mvnw clean compile` sem erros.

## 2. Atualizar o teste existente (seam único, `IntervalsIcuActivityPersisterTest`)

- [ ] 2.1 Trocar as quatro ocorrências de `atualizarTsbDia` por `recalcularDesde` em
      `IntervalsIcuActivityPersisterTest.java` (linhas 107, 127, 219, 236 na versão atual),
      mantendo os argumentos e a semântica `never()`/com-argumentos de cada teste.
      **Verify:** `./mvnw clean test -Dtest=IntervalsIcuActivityPersisterTest` verde.

## 3. Validação completa

- [ ] 3.1 Rodar a suíte completa para garantir que nenhum outro teste dependia do comportamento
      antigo.
      **Verify:** `./mvnw clean test` verde.

## 4. Fechar o registro nas duas specs relacionadas

- [ ] 4.1 Após merge em `develop`, atualizar
      `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md` marcando o "achado
      colateral" como resolvido, com o link/número do PR.
- [ ] 4.2 Atualizar `proposal.md` de `remove-redundant-tsb-baseline-recalc` marcando o
      pré-requisito 1 (deste fix) como fechado.
