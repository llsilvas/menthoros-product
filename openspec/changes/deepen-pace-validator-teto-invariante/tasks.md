# Tasks — deepen-pace-validator-teto-invariante

Repo: `apps/menthoros-backend`. Validação do bloco: `./mvnw clean test`; antes do PR: `./mvnw clean verify`.
Sequência: 0 (descobrir) → 1 (corrigir comportamento) → 2 (mover, sem mudar comportamento) → 3 (limpar).
A grade vem antes de qualquer fix para catalogar todos os desacordos, não só os dois lidos no código.

## 0. Grade do invariante "normalizado não viola PACE_TETO"

- [ ] 0.1 `NormalizacaoDeTreinoInvarianteTetoTest` (novo, `@ParameterizedTest` + `@MethodSource`, sem
      dependência nova), pela interface `NormalizacaoDeTreino#normalizar` com colaboradores reais, no
      molde de `NormalizacaoDeTreinoInvarianteTotalTest`. Grade:
      - tipo: REGENERATIVO, CONTINUO, LONGO, TEMPO_RUN, FARTLEK, INTERVALADO, TIRO, PROVA;
      - atleta: com zonas de pace (limiar) e sem (`zonasPace == null`);
      - teto: derivado de `PaceHistoricoFormatter.calcularTetoPorTipo` sobre histórico sintético; um
        valor com segundo fracionário (ex.: 5:38,1) e um inteiro; e tipo sem histórico (sem teto);
      - ritmo do cabeçalho e de cada etapa: mais rápido que o teto, igual, mais lento, ausente;
      - teto mais lento que a zona inteira e teto dentro da zona.
      Invariante, para todo cenário aceito (sem `LLMException`): `PlanQualityChecker.check(plano,
      [PACE_TETO com o mesmo teto])` não contém violação `PACE_TETO`.
      O teste imprime o denominador e quantos foram rejeitados.
      verify: roda em `develop` e lista os cenários que violam, com nome legível.
- [ ] 0.2 Registrar aqui os achados: quais desacordos a grade confirmou (A1), se prompt e normalização
      recebem o mesmo histórico (A2), se PROVA aparece no mapa de teto e em quantos cenários (A3), e o
      valor de partida da métrica. Desacordo que não é regra de teto vira exceção catalogada com
      follow-up; não é corrigido aqui.
      verify: seção "Achados da grade" preenchida neste arquivo; decisão de A3 anotada no `proposal.md`.

## 1. Fechar os desacordos (comportamento)

- [ ] 1.1 Teto sem zonas de pace (CA2): `PaceValidatorTest` ganha os casos de etapa mais rápida que o
      teto com `zonas == null` — borda rápida igual ao teto ao segundo, amplitude preservada; etapa mais
      lenta que o teto intacta; sem teto intacta. Só então o código.
      verify: `./mvnw test -Dtest=PaceValidatorTest`
- [ ] 1.2 PROVA isenta no corretor (CA3): cabeçalho e etapas de treino PROVA não são deslocados pelo
      teto. `sanear` continua valendo para PROVA.
      verify: `./mvnw test -Dtest='PaceValidatorTest,NormalizacaoDeTreinoTest'`
- [ ] 1.3 PROVA isenta no verificador (CA4): `PlanQualityCheckerTest` ganha o caso; `verificarPaceTeto`
      pula PROVA.
      verify: `./mvnw test -Dtest=PlanQualityCheckerTest`
- [ ] 1.4 Demais desacordos de teto catalogados em 0.2, um teste por desacordo antes do fix.
      verify: grade 0.1 verde, sem exceção de teto em aberto.
- [ ] 1.5 Validação do bloco.
      verify: `./mvnw clean test`

## 2. Corrigir e verificar na mesma classe (sem mudar comportamento)

- [ ] 2.1 Teste de caracterização da ordem (CA6): a sequência de nomes de passo de cada família de
      receita, afirmada contra a lista de `develop`. Se já existir em
      `NormalizacaoDeTreinoCaracterizacaoTest`, reusar e não duplicar.
      verify: passa em `develop` antes de mover qualquer linha.
- [ ] 2.2 Mover o corpo de `corrigirPaceTetoPiso` e de `corrigirPaceZona` (com o desfazer do
      aquecimento/desaquecimento acelerado) para `PaceValidator`. Em `NormalizacaoDeTreino` os dois
      passos ficam nas mesmas posições e delegam. Tratamento de tipo de treino inválido
      (`IllegalArgumentException`/`NullPointerException` ignorados) vai junto, igual.
      verify: `./mvnw test -Dtest='NormalizacaoDeTreino*Test,PaceValidatorTest'` sem mudança de expectativa.
- [ ] 2.3 Mover a verificação de teto (laço de cabeçalho + etapas e `parsePaceMaisRapido`) para
      `PaceValidator`, devolvendo o que `PlanQualityChecker` precisa para montar `ViolacaoQualidade`
      com as mesmas mensagens. `PlanQualityChecker.verificarPaceTeto` delega.
      verify: `./mvnw test -Dtest=PlanQualityCheckerTest` sem mudança de expectativa.
- [ ] 2.4 Arredondamento "segundo de cima": um helper privado em `PaceValidator`, usado nos dois pontos.
      verify: `./mvnw test -Dtest=PaceValidatorTest`
- [ ] 2.5 Validação do bloco.
      verify: `./mvnw clean test`

## 3. Limpezas

- [ ] 3.1 `EvalDeterministicGrader`: apagar `tetoDasRegras`, usar `Constraint.tetoPorTipo()` da regra
      `PACE_TETO`. Sem regra, mapa vazio como hoje.
      verify: `./mvnw test -Dtest=EvalDeterministicGraderTest`
- [ ] 3.2 Atualizar o JavaDoc de `PaceValidator` (dono de corrigir e verificar ritmo contra teto, piso e
      zona) e remover de `NormalizacaoDeTreino` os comentários que descreviam a regra movida.
      verify: revisão do diff.
- [ ] 3.3 Gate final.
      verify: `./mvnw clean verify`; CA1–CA6 conferidos um a um; lista, no PR, de todo teste cuja
      expectativa mudou e por quê (CA5).

## Achados da grade

(preencher na task 0.2)
