## 1. Corrigir o método de recálculo

- [x] 1.1 Em `IntervalsIcuActivityPersister.persistir`, trocar
      `tsbService.atualizarTsbDia(atleta.getId(), salvo.getDataTreino())` por
      `tsbService.recalcularDesde(atleta.getId(), salvo.getDataTreino())`.
      **Verify:** `./mvnw clean compile` sem erros — confirmado.

## 2. Atualizar o teste existente (seam único, `IntervalsIcuActivityPersisterTest`)

- [x] 2.1 Trocar as quatro ocorrências de `atualizarTsbDia` por `recalcularDesde` em
      `IntervalsIcuActivityPersisterTest.java` (linhas 107, 127, 219, 236 na versão atual),
      mantendo os argumentos e a semântica `never()`/com-argumentos de cada teste.
      **Verify:** `./mvnw clean test -Dtest=IntervalsIcuActivityPersisterTest` verde — confirmado
      (TDD: vermelho antes do fix, verde depois).

## 3. Validação completa

- [x] 3.1 Rodar a suíte completa para garantir que nenhum outro teste dependia do comportamento
      antigo.
      **Verify:** `./mvnw clean test` verde — confirmado, exit 0.

## 3b. Corrigir achado Medium do `security-reviewer` (import manual sem limite de retroatividade)

- [x] 3b.1 Tornar `IntervalsIcuActivityMapper.parseDataTreino` público e adicionar guard em
      `IntervalsIcuActivityIngestionServiceImpl.importarAtividade` (Passo 5b): rejeitar com
      `DomainRuleViolationException` (422) atividade anterior a `IntervalsIcuProperties.syncDaysBack`,
      antes de chamar `persister.persistir`.
      **Verify:** `./mvnw clean test -Dtest=IntervalsIcuActivityIngestionServiceImplTest` verde —
      confirmado (3 novos testes: atividade muito antiga rejeita, dentro do limite segue, data
      não parseável não bloqueia).
- [x] 3b.2 Rodar a suíte completa novamente após a segunda correção.
      **Verify:** `./mvnw clean test` verde — confirmado, exit 0.

## 4. Fechar o registro nas duas specs relacionadas

- [ ] 4.1 Após merge em `develop`, atualizar
      `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md` marcando o "achado
      colateral" como resolvido, com o link/número do PR.
- [ ] 4.2 Atualizar `proposal.md` de `remove-redundant-tsb-baseline-recalc` marcando o
      pré-requisito 1 (deste fix) como fechado.
