# Tasks — fix-tss-planejado-divergente

**Tamanho:** S · **Trilha:** Full

Branch: `feature/fix-tss-planejado-divergente` em `apps/menthoros-backend`.

**A branch `feature/testes-carga-referencia` é referência, não base.** Ela tem a correção
(`949d0ff`) e os cinco `RefCarga*` já escritos, mas também carrega o `f9e754b`, que foi **refutado
com evidência** e superado por `fix-tsb-recalculo-resiliente`. Portar seletivamente; nunca
mergear a branch inteira.

---

## 0. Discovery — feita no `/change` (2026-07-31), resultado no `design.md`

- [x] **0.1 Mapear quem consome `tssPlanejado`.** Concluído (com uma correção pelo caminho):
  **ligados** são `TreinoPlanejadoServiceImpl` e o `SkeletonComplianceChecker` via
  `PlannerShadowService`. Sem chamador: `TrainingPrescriptionGuardSkill`, `getDiferencaTss` e a view
  da V9. A premissa de "guard-rail cego" foi retirada; a de "compliance checker desligado" também
  estava errada e foi corrigida — o levantamento inicial truncou a saída com `head -3`.
- [x] **0.2 Origem de `metaTssSemanal`.** Perdeu a urgência pelo mesmo motivo — passa a ser assunto
  de `planner-engine-enforcement`.

- [ ] **0.3 Confirmar o mapa antes de mexer.** Refazer o levantamento no `develop` do dia da
  implementação: se `planner-engine-enforcement` tiver entrado no meio, o quadro muda e a
  severidade sobe.
  - **Sem `head`/`| head -N` no levantamento.** Foi truncagem que produziu o mapa errado da
    primeira vez; contar arquivos (`grep -rl | wc -l`) antes de olhar linha a linha.
  - Checar também se `planner-engine.shadow` foi ligado em algum ambiente — se sim, a janela de
    calibração já está sendo contaminada e a urgência sobe.
  - `verify:` `grep` de chamadores dos seis consumidores, resultado anexado à task.

## 1. Rede de segurança antes da correção

- [ ] **1.1 Portar os testes de referência** de `feature/testes-carga-referencia`
  (`RefCargaTest`, `RefCargaBordaTest`, `RefCargaEdgeTest` — `PingTest` não tem valor, descartar).
  - Adaptar ao estado atual do `develop`: eles foram escritos antes da
    `fix-tsb-recalculo-resiliente` reescrever o `TsbServiceImpl`.
  - **Devem passar ANTES da correção**, exceto os que afirmam a convergência — esses são o red.
  - **Cherry-pick com `--no-commit` e revisar o diff antes de commitar.** A branch contém o
    `f9e754b`, refutado; nada garante sozinho que o `949d0ff` não dependa dele.
  - `verify:` `./mvnw clean test` verde, com os testes de convergência falhando pelo motivo certo,
    **e** o diff aplicado conferido contra os arquivos que o `f9e754b` toca.

- [ ] **1.2 Teste de convergência (o red).** Grade de (duração × RPE) afirmando que o caminho
  planejado e o realizado **calculado só por RPE** produzem o mesmo TSS (CA1). Deve falhar agora,
  com a divergência de 2,4×–6× visível na mensagem.
  - **Não comparar contra o pipeline realizado completo** (FC, pace, etapas, elevação): ele diverge
    de propósito, e a grade daria red falso.
  - `verify:` falha por desigualdade numérica, não por erro de compilação ou setup.

## 2. Correção

- [ ] **2.1 Unificar `calcularTssEstimado(Duration, Integer)`** para
  `h × converterRpeParaIf(rpe)² × 100`, com o mesmo clamp de IF do caminho realizado.
  - Referência: `949d0ff` da branch antiga.
  - Documentar no JavaDoc **por que** as duas fórmulas existiam e o que a divergência causava — o
    próximo a ler precisa entender que a mudança de escala é intencional.
  - `verify:` os testes de 1.2 passam a verde; `./mvnw clean test` verde.

- [ ] **2.2 Guard: teste unitário isolado.** Cobrir no `TrainingPrescriptionGuardSkillTest` que a
  soma de `tssEstimado` das sessões fica na mesma escala da meta (CA3).
  - **Não** escrever teste de integração nem afirmar mudança de comportamento em produção: o skill
    **não tem chamador** em `src/main`. Prometer "planos que antes escapavam agora são bloqueados"
    descreveria um efeito que não existe.
  - `verify:` teste unitário verde; nenhuma asserção depende de fluxo real.

## 3. Dados históricos — Q1 decidida: recalcular só os `PENDENTE`

- [x] **3.1 Decisão registrada** no `proposal.md` e no `design.md` (2026-07-31).

- [ ] **3.2 Snapshot antes de tocar em qualquer linha.** Tabela ou dump com
  `(treino_planejado_id, tss_planejado_anterior, migrado_em)`.
  - É o que torna a operação auditável e o rollback trivial. Sem isso, reverter exige recomputar a
    fórmula antiga — possível, mas é reconstrução, não reversão.
  - `verify:` snapshot com a mesma contagem de linhas que a migração vai tocar.

- [ ] **3.3 Recálculo de TODAS as linhas com `tssPlanejado` (CA4), via aplicação.**
  - **Decidido: job/serviço que chama `calcularTssEstimado` já corrigido**, não `UPDATE` com a
    fórmula reescrita em SQL. Duplicar a fórmula criaria uma segunda fonte de verdade que diverge na
    próxima mudança — e esta change existe justamente porque duas fontes divergiram.
  - **Altera dado existente → gate de confirmação do `CLAUDE.md`.** Não rodar sem aprovação
    explícita no momento.
  - Conferir a contagem no ambiente alvo antes de aplicar (em dev eram 129).
  - `verify:` zero linhas com `tssPlanejado` na escala antiga; contagem tocada igual à do snapshot.

- [ ] **3.4 Rollback documentado e testado em dev.**
  - Restaurar a partir do snapshot da 3.2, não recomputando.
  - `verify:` executado em dev, com os 129 voltando aos valores originais.

## 4. Verificação

- [ ] **4.1** Convergência planejado × realizado em toda a grade (CA1).
- [ ] **4.2** Recalcular por mudança de duração produz valor na escala certa (CA2).
- [ ] **4.3** Guard bloqueia plano excessivo (CA3), conforme a conclusão da 0.1.
- [ ] **4.4** Nenhuma linha em escala antiga; snapshot existe e o rollback foi provado (CA4).
- [ ] **4.5** `./mvnw clean test` verde.
