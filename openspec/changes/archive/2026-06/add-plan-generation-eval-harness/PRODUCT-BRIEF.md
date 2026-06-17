# Product Brief — `add-plan-generation-eval-harness`

> Diagnóstico product-lens (YC office-hours). Change de **infra/teste**, sem valor direto ao usuário final — é um meio, não um fim. O brief julga se vale o tempo de 1 dev solo **agora**.

## 1. Para quem é?

- **Usuário primário (real):** o próprio dev/CTO solo — quem vai executar a thread de modernização de IA (`debito-tecnico → migrate-plan-prompt-to-skills → llm-tool-use → llm-code-switching`), todas mutando o prompt.
- **Usuário indireto:** o treinador e o atleta, que recebem o plano gerado. Eles nunca veem o harness; sentem o efeito (plano não regride / não alucina) — ou não sentem nada, se der certo.

Honestidade: **não há usuário externo pedindo isso.** É uma rede que o dev constrói para si.

## 2. Qual a dor? (quantificar)

- `PlanoTreinoPromptBuilder.buildOptimizedPrompt`: **533 linhas, 8 formatters, 0 testes**. É o coração do produto (plano de treino por IA).
- **Frequência da dor:** toda mudança de prompt da thread de IA (4 changes seguidas) corre cega. Sem rede, uma regressão de qualidade do plano é **silenciosa** — ninguém percebe até um treinador reclamar de um plano ruim.
- **O que se faz hoje:** nada. Não há como afirmar se uma mudança melhorou ou piorou o plano. A calibração foi por tentativa-e-erro ("Fase 1/2/3/5").

## 3. Por que agora?

- **Gatilho real:** a thread de modernização vai começar. Construir a rede **depois** de migrar 8 formatters = migrar no escuro. A rede só tem valor **antes** das mutações.
- **Contra-gatilho (honesto):** o produto tem **~0 usuários reais** (Bloco 0 — identidade — acabou de sair). Construir eval elaborada antes de ter uso é um clássico de over-engineering. Tempo de dev solo é o recurso mais escasso.

## 4. Versão 10 estrelas (sem limite)

Harness de eval contínua: dataset de N atletas reais, scoring automático de qualidade do plano (aderência a constraints + heurísticas de coaching), regressão a cada commit, dashboard de "qualidade do plano ao longo do tempo", A/B de prompts em produção, detecção de alucinação por LLM-juiz.

## 5. MVP (menor coisa que prova a tese)

**A tese a provar:** "consigo modernizar o prompt sem regredir o plano, com prova objetiva."

O menor artefato que prova isso é a **Camada A — golden-master** de `buildOptimizedPrompt` para ~5 arquétipos. Determinístico, barato, pega regressão não-intencional no diff. **Só isso já destrava a migração com segurança.**

## 6. Anti-goal (o que NÃO construir agora)

- **Não** construir eval ao vivo com LLM real (Camada C) — não-determinística, custa tokens, e **não há baseline de uso real** para comparar. Prematuro.
- **Não** construir scoring de "qualidade de coaching" subjetivo — vira projeto próprio.
- **Não** transformar o `PlanQualityChecker` em guard de produção — fora de escopo; é prescription-guard, change futura.

## 7. Como saber que funcionou? (métrica, não vibe)

- **Métrica primária:** o golden-master **pega ≥1 regressão não-intencional** durante a thread de migração (ou seja, a rede já evitou um bug que iria silencioso).
- **Métrica secundária:** a migração `migrate-plan-prompt-to-skills` é concluída com **0 incidentes de qualidade de plano** atribuíveis a regressão não detectada.
- **Anti-métrica:** se ao fim da thread o harness nunca acusou nada e nunca foi consultado, ele foi over-engineering.

---

## ICE — priorização das 3 camadas

| Camada | Impacto (1-5) | Confiança (1-5) | Esforço (1-5) | ICE (I×C÷E) | Veredito |
|---|:---:|:---:|:---:|:---:|---|
| **A — Golden-master do prompt** | 5 | 5 | 1 | **25** | **GO agora** |
| **B — PlanQualityChecker (offline)** | 3 | 3 | 3 | **3** | **Thin / sob demanda** |
| **C — Eval ao vivo (LLM)** | 2 | 2 | 4 | **1** | **Defer** |

- **A** é desproporcionalmente barata e de alto impacto: é o trilho que torna a migração segura. Faça inteira.
- **B** só ganha valor quando a migração estiver produzindo planos para comparar. Recomendo **adiar o grosso** e implementar só o esqueleto do checker quando a primeira fatia do `migrate-plan-prompt-to-skills` precisar dele (constraint de intervalado já dá o primeiro caso). Não construir as 5 regras de uma vez sem uso.
- **C** depende de **uso real** para ter baseline. Defer até haver atletas/treinadores gerando planos.

---

## Recomendação: **GO — mas reduzir o escopo ao trilho**

A change está **certa no timing e no porquê** (rede antes da mutação), mas como escrita ela é **maior do que o MVP precisa**. Risco de gold-plating em estágio sem usuários.

**Ação concreta — reescopar a change:**
1. **Manter integral:** Camada A (golden-master) — seções 1, 2 da `tasks.md`.
2. **Reduzir:** Camada B → só o contrato `PlanQualityChecker` + a 1ª regra (intervalado), implementadas **junto** com a 1ª fatia de `migrate-plan-prompt-to-skills`, não antes. Mover as regras restantes para "conforme o domínio for migrado".
3. **Remover desta change:** Camada C (eval ao vivo) → vira backlog Pós-MVP, reaparece quando houver uso real.

Resultado: a change encolhe de **M** para **S/M**, entrega o valor de de-risco imediatamente, e não gasta tempo de dev solo construindo medição para um produto que ainda não tem o que medir em produção.

**Próximo passo:** se concordar, atualizo `proposal.md`/`tasks.md`/`design.md` para o escopo reduzido (A integral, B fatiada com a migração, C deferida) e ajusto a nota no SPRINTS.
