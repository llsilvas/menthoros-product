# Tasks — fix-tss-planejado-divergente

**Tamanho:** S · **Trilha:** Full

Branch: `feature/fix-tss-planejado-divergente` em `apps/menthoros-backend`.

**A branch `feature/testes-carga-referencia` é referência, não base.** Ela tem a correção
(`949d0ff`) e os cinco `RefCarga*` já escritos, mas também carrega o `f9e754b`, que foi **refutado
com evidência** e superado por `fix-tsb-recalculo-resiliente`. Portar seletivamente; nunca
mergear a branch inteira.

---

## 0. Discovery — feita no `/change` (2026-07-31), resultado no `design.md`

- [x] **0.1 Mapear quem consome `tssPlanejado`.** Concluído: dos seis consumidores, **apenas
  `TreinoPlanejadoServiceImpl` está ligado**. Guard, compliance checker, `getDiferencaTss` e a view
  da V9 têm zero chamadores em `src/main`. A premissa de "guard-rail cego" foi retirada da spec.
- [x] **0.2 Origem de `metaTssSemanal`.** Perdeu a urgência pelo mesmo motivo — passa a ser assunto
  de `planner-engine-enforcement`.

- [ ] **0.3 Confirmar o mapa antes de mexer.** Refazer o levantamento no `develop` do dia da
  implementação: se `planner-engine-enforcement` tiver entrado no meio, o quadro muda e a
  severidade sobe.
  - `verify:` `grep` de chamadores dos seis consumidores, resultado anexado à task.

## 1. Rede de segurança antes da correção

- [ ] **1.1 Portar os testes de referência** de `feature/testes-carga-referencia`
  (`RefCargaTest`, `RefCargaBordaTest`, `RefCargaEdgeTest` — `PingTest` não tem valor, descartar).
  - Adaptar ao estado atual do `develop`: eles foram escritos antes da
    `fix-tsb-recalculo-resiliente` reescrever o `TsbServiceImpl`.
  - **Devem passar ANTES da correção**, exceto os que afirmam a convergência — esses são o red.
  - `verify:` `./mvnw clean test` verde, com os testes de convergência falhando pelo motivo certo.

- [ ] **1.2 Teste de convergência (o red).** Grade de (duração × RPE) afirmando que o caminho
  planejado e o realizado produzem o mesmo TSS (CA1). Deve falhar agora, com a divergência de
  2,4×–6× visível na mensagem.
  - `verify:` falha por desigualdade numérica, não por erro de compilação ou setup.

## 2. Correção

- [ ] **2.1 Unificar `calcularTssEstimado(Duration, Integer)`** para
  `h × converterRpeParaIf(rpe)² × 100`, com o mesmo clamp de IF do caminho realizado.
  - Referência: `949d0ff` da branch antiga.
  - Documentar no JavaDoc **por que** as duas fórmulas existiam e o que a divergência causava — o
    próximo a ler precisa entender que a mudança de escala é intencional.
  - `verify:` os testes de 1.2 passam a verde; `./mvnw clean test` verde.

- [ ] **2.2 Guard: confirmar o efeito.** Com a correção, verificar que a regra de TSS passa a
  bloquear planos que antes escapavam (CA3), à luz da conclusão da 0.1.
  - `verify:` teste do `TrainingPrescriptionGuardSkill` cobrindo o caso limite.

## 3. Dados históricos — Q1 decidida: recalcular só os `PENDENTE`

- [x] **3.1 Decisão registrada** no `proposal.md` e no `design.md` (2026-07-31).

- [ ] **3.2 Migração que recalcula apenas `status_treino = 'PENDENTE'`** (CA4).
  - `UPDATE tb_treino_planejado SET tss_planejado = <nova fórmula> WHERE status_treino = 'PENDENTE'
    AND duracao_min IS NOT NULL AND percepcao_esforco_esperada IS NOT NULL`.
  - **Altera dado existente → gate de confirmação do `CLAUDE.md`.** Não rodar sem aprovação
    explícita.
  - Conferir a contagem **no ambiente alvo** antes de aplicar: em dev eram 38 de 129, mas o número
    muda com o tempo, e `PENDENTE` vira `REALIZADO` sozinho.
  - A fórmula tem de ficar idêntica à do código. Duplicá-la em SQL cria duas fontes que divergem na
    próxima mudança — avaliar recalcular via aplicação em vez de SQL puro.
  - `verify:` nenhum treino `REALIZADO`/`PERDIDO` foi tocado; todos os `PENDENTE` com inputs ficaram
    na escala nova.

- [ ] **3.3 Documentar a convivência das duas escalas** onde alguém vá tropeçar: JavaDoc de
  `TreinoPlanejado.tssPlanejado` e comentário na migração, dizendo que `status_treino` é o critério
  que separa uma escala da outra.
  - `verify:` quem ler a entidade descobre isso sem precisar do histórico do git.

## 4. Verificação

- [ ] **4.1** Convergência planejado × realizado em toda a grade (CA1).
- [ ] **4.2** Recalcular por mudança de duração produz valor na escala certa (CA2).
- [ ] **4.3** Guard bloqueia plano excessivo (CA3), conforme a conclusão da 0.1.
- [ ] **4.4** Dados históricos no estado decidido (CA4).
- [ ] **4.5** `./mvnw clean test` verde.
