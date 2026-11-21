# Tasks — alinhar-teto-pace-prompt-checker

- [x] 1.1 `calcularTetoPorTipo` arredonda para o segundo de cima (CA1), com teste.
- [x] 1.2 Regra de ativação: trecho em ritmo de prova como `TEMPO_RUN` (CA2); golden atualizado.
- [x] 2.1 `./mvnw clean verify`; eval candidato (CA3); PR → `develop`.

## Notas de entrega (2026-11-21)

- 1.1: teto no segundo de cima (melhor 5:45 → 5:39). 1.2: ativação em ritmo de prova como TEMPO_RUN.
- Achado no eval e corrigido aqui: a salvaguarda de #255 desfazia o recorte no teto (só reverte o que acelerou agora);
  etapa mais rápida que o teto com histórico mais lento que a zona passa a ser deslocada até ele.
- 2.1: verify verde (6803 + 348); 6 rodadas de eval, nenhuma PACE_TETO; 3 PACE_IMPLICITO isoladas no taper, sem
  reprodução. PR menthoros-backend#257.
