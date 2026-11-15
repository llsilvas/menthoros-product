## 1. Backend

- [ ] 1.1 Template de metodologia default global (épico 1.5, 1.6, 1.9)
- [ ] 1.2 Motor mínimo: fases por semanas mínimas e volume/`tssAlvo` com rampa (épico 2.1, 2.2, 2.3 sem descargas, 2.6)
- [ ] 1.3 Preencher `nome`, `descricao` e `objetivo` do `PlanoTreino` a partir da prova (épico 1.3b)
- [ ] 1.4 Teste de reprodutibilidade do motor
- [ ] 1.5 Endpoints de geração e leitura, guard de papel, filtro por assessoria, flag (épico 4.1, 4.2, 4.12, 4.12a, 4.13)
- [ ] 1.6 Testes: 403 do `ATLETA`, vazamento entre assessorias, 404 com a flag desligada (épico 4.12b)
- [ ] 1.7 Validar: `./mvnw clean test` + OpenAPI atualizado (épico 4.14)

## 2. Frontend

- [ ] 2.1 Service e tipos escritos à mão em `src/api`, consumidos via hook (épico 7.12)
- [ ] 2.2 Aba Temporada: KPIs e tabela de semanas (épico 7.1, 7.3, 7.4)
- [ ] 2.3 Estados: sem prova, prova sem temporada com "Gerar temporada", proposta, carregando, erro (épico 7.7)
- [ ] 2.4 Testes de componente da aba (épico 7.13) e contraste/alvos da seção 9
- [ ] 2.5 E2E: gerar a temporada e ver a tabela
- [ ] 2.6 Validar: `bun lint && bun run build && bun test:run` (épico 7.15)
