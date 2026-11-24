# Tasks — fix-etapas-sintetizadas-encaixe-total

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean test`.

## 1. Encaixe com sobra ≤ 0

- [ ] 1.1 Teste (vermelho) em `TreinoNormalizadorCorrigirDistanciasTest`: total 2,0 km, aquec 10 min e
      desaq 5 min sintetizados com distâncias que somam > 2,0 km, PRINCIPAL com ritmo 6:30–7:00 →
      bloco único de 2,0 km com duração pelo pace (CA1). Caso sem pace derivável continua vazio (CA3).
      verify: falha em develop.
- [ ] 1.2 `TreinoNormalizador.encaixarPrincipalNoTotal`: com `sobra <= 0` e pace derivável, devolver o
      bloco único (mesmo ramo da sessão curta); sem pace, manter `Optional.empty()`.
      verify: 1.1 verde; testes de encaixe existentes intactos (CA4).
- [ ] 1.3 Teste da receita TRES_ETAPAS (normalização completa) com o caso relatado: `duracaoMin` = soma
      das etapas e contador `plano_etapas_total_divergente` não incrementado (CA2).
- [ ] 1.4 Validação: `./mvnw clean test`; esperados de caracterização alterados registrados (CA5).
