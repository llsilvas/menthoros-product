## 1. Backend

- [ ] 1.1 Aprovar a v1: `ATIVO`, `aprovadoPor`, `aprovadoEm`, arquivamento do anterior na mesma transação (épico 3.1, 3.4, 4.10)
- [ ] 1.2 Leitura da semana da temporada corrente (épico 4.3)
- [ ] 1.3 Leitura do atleta, só `ATIVO` e só a própria (épico 4.11)
- [ ] 1.4 Testes: unicidade do `ATIVO`, atleta com proposta recebe "sem plano", atleta não lê outro atleta (épico 4.12b)
- [ ] 1.5 Validar: `./mvnw clean test` + OpenAPI atualizado

## 2. Frontend

- [ ] 2.1 Ação "Aprovar" na aba do treinador
- [ ] 2.2 Bloco "Minha temporada": prova-alvo, dias, fase, volume por semana, resumo da semana com CTA, próximos marcos, nota de previsão (épico 8.1–8.4)
- [ ] 2.3 Testes de componente: bloco ausente sem `ATIVO`, bloco com `ATIVO`
- [ ] 2.4 E2E: treinador aprova e o atleta vê o bloco
- [ ] 2.5 Validar: `bun lint && bun run build && bun test:run` (épico 8.7)
