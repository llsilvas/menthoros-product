# Tasks — add-injury-clearance-coach

## 1. Liberação na transição da lesão (backend)

- [ ] 1.1 Teste em `AtletaServiceImplTest` (`@Nested UpdateAtleta`): CA1–CA5 e CA7, com `Clock` fixo em
      2026-11-28. verify: `./mvnw test -Dtest=AtletaServiceImplTest` vermelho antes da 1.2.
- [ ] 1.2 `AtletaServiceImpl.updateAtleta`: ler `temLesao`/`descricaoLesao` antes do
      `updateEntity`; na transição `true → false`, gravar `dataUltimaLesao`, acrescentar a linha em
      `historicoLesoes` e limpar `descricaoLesao`; com `temLesao = false` no resultado, manter a
      descrição gravada em vez da do payload. JavaDoc com o efeito colateral novo.
      verify: teste da 1.1 verde.
- [ ] 1.3 CA6: teste do `InjuryPolicyResolver` com o snapshot do atleta liberado (ou conferir que o
      teste existente já cobre `dataUltimaLesao = hoje`). verify: `./mvnw clean test`.
- [ ] 1.4 Gate. verify: `./mvnw clean verify`.

## 2. Validação

- [ ] 2.1 Homelab (leitura): depois do merge e do deploy, o coach desmarca a lesão do atleta do caso
      real; conferir `data_ultima_lesao`, `historico_lesoes` e a fase do próximo plano gerado.
