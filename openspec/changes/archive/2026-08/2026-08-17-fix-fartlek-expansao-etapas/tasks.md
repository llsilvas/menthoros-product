# tasks — fix-fartlek-expansao-etapas

Repo afetado: `apps/menthoros-backend` · branch `feature/fix-fartlek-expansao-etapas`

## 1. Expansão de fartlek tipado como PRINCIPAL

- [x] **1.1** Teste que falha: `IaServiceImplFartlekExpansaoTest` cobrindo CA1 e CA2 —
      etapa `PRINCIPAL` + descrição `"Fartlek leve Z2-Z3, 4x (1min forte + 2min leve)"` deve expandir
      em 8 etapas; etapa `PRINCIPAL` + `"Corrida contínua em Z2"` deve permanecer intacta.
      Invocar `expandirEtapasAgregadas` por reflexão, como já faz `IaServiceImplFcValidationTest`.
      → falhou com `Expected size: 8 but was: 1`, confirmando o diagnóstico.
- [x] **1.2** Ampliar o guard de `IaServiceImpl:902`: `PRINCIPAL` entra nos detectores, mas só
      prossegue se a descrição casar um dos padrões.
      **Decisão sobre a Open Question: a ambiguidade entrou nesta change.** Ampliar o guard sem
      fechá-la criaria regressão nova — qualquer etapa `PRINCIPAL` com "Nx M min" na descrição
      viraria N tiros de M metros. Fix mínimo: lookahead `(?!\s*min)` no `REPETICOES_PATTERN`,
      posicionado antes do `\s*` para que `\s*min` não seja contornado por backtracking.
      Efeito colateral positivo: `"5 x 2 min forte + 2 min leve"` passa a cair no caminho por tempo,
      que é o correto — antes vencia o `NxDist` por ser avaliado primeiro.
- [x] **1.3** Teste de não-regressão (CA5): `INTERVALADO` com `"6x400m Z5"` continua produzindo o
      mesmo resultado pelo caminho `NxDist`. Adicionado também teste da desambiguação minuto/metro.
- [x] **Validação:** `./mvnw clean test -Dtest='IaServiceImplFartlekExpansaoTest,IaServiceImplFcValidationTest,IntervalsIcuWorkoutConverterTest,TreinoServiceConsistenciaValidatorTest'`
      → **Tests run: 77, Failures: 0, Errors: 0** · BUILD SUCCESS

## 2. Agrupamento inferido no converter

> Abordagem revista durante a implementação — ver "Revisão da abordagem" no `proposal.md`.
> Motivo: `EtapaTreinoLlmDto` alimenta o JSON schema do LLM (`IaServiceImpl:146` +
> `enforceAllRequired:120-125`), então adicionar `blocoId` ao record obrigaria o modelo a inventá-lo.
> Caminho mapeado e descartado: `PlanoServiceImpl:551` → `TreinoMapper.toEntity` (MapStruct, mapeia
> por nome, sem DTO intermediário) → `EtapaTreino`.

- [x] **2.1** Teste que falha (CA3): 8 etapas sem `blocoId` formando 4 pares idênticos viram
      `WorkoutStep.bloco(reps=4)` com 2 sub-steps. → falhou antes do fix, junto com o teste de
      convivência com aquecimento/desaquecimento avulsos.
- [x] **2.2** `IntervalsIcuWorkoutConverter.inferirBloco()` — no ramo `blocoId == null`, escolhe a
      janela que cobre mais etapas (empate → mais repetições) e monta o bloco; sem ao menos duas
      janelas equivalentes, emite a etapa isolada. Reusa `etapasEquivalentes`.
- [x] **2.3** Testes de guarda: CA4 (progressivo heterogêneo não vira bloco falso) e CA4b (`blocoId`
      explícito mantém precedência — coberto pelos testes pré-existentes `desExpandeBlocoConsistente`
      e `fallbackParaBlocoInconsistente`, que seguem verdes).
- [x] **Validação:** `./mvnw clean test -Dtest='IntervalsIcuWorkoutConverterTest'`
      → **Tests run: 22, Failures: 0, Errors: 0** · BUILD SUCCESS

## 3. Fechamento

- [x] **3.1** `./mvnw clean verify` → **2609 unitários + 103 IT, 0 falhas** · BUILD SUCCESS
      (primeira execução falhou com 148 erros de `ApplicationContext`: daemon do Docker parado,
      Testcontainers sem subir. `Failures: 0` em ambas — nenhum teste de lógica quebrou.)
- [x] **3.2** `/qa` — `code-reviewer`, `clean-code-reviewer`, `security-reviewer` + camada cross-model
      (Codex). Zero Critical. Dois findings aceitos e corrigidos em `5980357`:
      - **Convergência cross-model** (code-reviewer + Codex, independentes): a inferência agrupava
        qualquer par repetido, tratando repetição como sinônimo de série. Um ondulado
        `10min Z2 / 5min Z3 / 10min Z2 / 5min Z3` virava `2x (...)`. Corrigido: a janela precisa
        conter uma etapa `INTERVALADO`. Teste `naoInfereBlocoEmOnduladoSemIntervalado`.
      - **clean-code**: `inferirBloco` devolvia resultado por dois canais (mutava a lista recebida e
        retornava o consumo). Agora retorna `BlocoInferido`, alinhado ao `tentarMontarBloco`.

      Findings rejeitados, com o motivo:
      - *security-reviewer, Medium — "O(n³) em `inferirBloco`, DoS"*: **incorreto**. `janelaEquivalente`
        faz short-circuit na primeira divergência, então o custo por posição é O(disponível), não
        O(disponível²). Medido empiricamente em três cenários (todas distintas, todas iguais,
        quase-periódico adversarial): crescimento quadrático em todos — n=500 → 62k–80k comparações,
        592 µs. Para as dezenas de etapas de um treino real, irrelevante.
      - *Codex — "não há change-id/tasks.md/OpenSpec" e "test evidence ausente"*: **falso**, o Codex
        recebeu só o diff, sem o repositório.
      - *Codex, Major — "`PRINCIPAL` amplia heurística frágil"*: o code-reviewer verificou que
        `expandirEtapasAgregadas` só é chamado para `INTERVALADO`/`TIRO`/`FARTLEK`
        (`IaServiceImpl:387,405`), e a expansão ainda exige casar o padrão.
      - *Codex, Major — desempate `A A A A` → `4x A` vs `2x(A+A)`*: empate real, mas `4x A` é a
        leitura natural. Não acionável.
- [x] **3.3** PR **menthoros-backend #71** → `develop`, squash merge em `deb74b9` (2026-08-17)
- [x] **3.4** Decisão da task 1.2 registrada no `proposal.md` (seção "Revisão da abordagem" e
      Open Questions) e na própria task 1.2.

## Commits

- `30aba85` fix(ia): expande fartlek quando o LLM tipa a etapa como PRINCIPAL
- `b8ab7ac` fix(intervals-icu): infere bloco de repetição em etapas sem blocoId
- `5980357` fix(intervals-icu): só infere bloco quando a janela tem etapa INTERVALADO
- `7062c58` fix(plano): 500 ao buscar plano depois de rejeitar e gerar de novo
- `9ff3bd2` docs(openspec): change fix-fartlek-expansao-etapas *(menthoros-product)*

## 4. Escopo ampliado — 500 ao buscar plano (fora da change original)

> **Decisão do usuário, 2026-08-17:** corrigir dentro deste PR em vez de abrir change própria. Foi
> sinalizado que isso junta dois bugs sem relação na mesma branch, contra a diretriz do `CLAUDE.md`
> ("nunca misturar mudanças de changes diferentes"). Registrado aqui porque a alternativa —
> descobrir isso depois pelo histórico — é pior.

Sintoma: `GET /api/v1/planos/{atletaId}` respondia **500** (`NonUniqueResultException`) depois de
**rejeitar um plano e gerar outro**. Bloqueava a própria validação do fix de fartlek.

- [x] **4.1** Teste que falha: `PlanoSemanalBuscaAtualTest` reproduz com plano REJEITADO + plano novo
      na mesma semana → falhou com a mesma exceção do log de produção.
- [x] **4.2** `PlanoSemanalRepository.findAtivosPorAtleta` — a query passa a excluir `REJEITADO`,
      alinhando-se ao predicado do índice parcial `uk_plano_semanal_atleta_semana_ativo` (V52), que
      já definia rejeitado como não-ativo. Retorna `List` ordenada em vez de `Optional`.
- [x] **4.3** `PlanoServiceImpl:853` usa o primeiro da lista; 5 stubs em `PlanoServiceImplTest`
      atualizados.
- [x] **Validação:** `./mvnw clean verify` → **2614 unitários + 103 IT, 0 falhas**

Nota de diagnóstico: a primeira tentativa de fix ordenava por `semanaInicio desc`, o que **não
resolveria** — rejeitar e regerar produz dois planos da *mesma* semana. Só depois de o usuário
informar o cenário exato ("rejeitando um plano e gerando novamente") ficou claro que o critério é o
`reviewStatus`, não a ordenação.

## Validação em ambiente real (2026-08-17)

Confirmada pelo usuário após subir o backend na branch: o fartlek passou a chegar **expandido** —
timeline do detalhe do plano mostra **12 blocos** com `Z4 Limiar 25%` / `Z1 Recuperação 75%`
alternando, no lugar do bloco `PRINCIPAL` único. O `TreinoEditDialog` passou a contar as etapas
`INTERVALADO` e exibir `5×`. O 500 do `GET /api/v1/planos` também sumiu.

Ficou visível, na validação, que a timeline da tela de revisão desenha a série agregada enquanto a
do detalhe desenha expandida — tratado na change própria `expandir-serie-timeline-revisao`
(menthoros-front **#78**).

## Follow-ups fora do escopo (não fazer aqui)

- `aplicarEtapasPatch` (`TreinoPlanejadoServiceImpl:410-423`) descarta `blocoId` ao editar na tela de
  revisão — desfaz o agrupamento no push seguinte.
- `TreinoEditDialog` (`:407-450`) colapsa qualquer série em um único par esforço/recuperação,
  perdendo heterogeneidade ao salvar.
