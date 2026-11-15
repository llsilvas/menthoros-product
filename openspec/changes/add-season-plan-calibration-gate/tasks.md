## 1. Backend

- [ ] 1.1 Recusar a geração com 422 e motivo quando o atleta tem estágio de calibração (mesma fonte do status do onboarding)
- [ ] 1.2 Teste: atleta em calibração não gera; atleta graduado gera
- [ ] 1.3 Validar: `./mvnw clean test`

## 2. Frontend

- [ ] 2.1 Ação "Gerar temporada" desabilitada com o motivo e a semana de calibração
- [ ] 2.2 Teste de componente do estado de calibração
- [ ] 2.3 Validar: `bun lint && bun run build && bun test:run`
