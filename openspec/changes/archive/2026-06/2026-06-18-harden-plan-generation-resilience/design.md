## Context

`IaServiceImpl.validarENormalizarPlanoGerado` roda após a geração (e agora, pós-`introduce-plan-constraints`, ao lado do `PlanQualityChecker`). Hoje, na **primeira** violação estrutural ocasional da LLM ele lança `LLMException` → 503, descartando o plano inteiro e o custo do gpt-4o. Caso real (2026-06-17): `REGENERATIVO` com 2 etapas → ~83s de espera → 503.

Esta change torna a geração resiliente — **reparo determinístico primeiro, 1 retry com feedback depois, falha clara só no fim** — sem mudar as regras de validação.

## D1 — Classificação: reparável vs. requer-retry

A decisão central é quais violações têm reparo **determinístico, seguro e inequívoco** (não inventa estímulo de treino) e quais exigem nova geração.

```
VIOLAÇÃO                                  AÇÃO        JUSTIFICATIVA
──────────────────────────────────────    ────────    ────────────────────────────────────────
aquecimento/desaquecimento faltante       REPARO      etapa formulaica (zona fácil), não é o estímulo
3 tipos presentes, ordem trocada          REPARO      reordenar para o canônico — conteúdo intacto
repeticoes != 1 (etapas agregadas)        REPARO      expandir via expandirEtapasAgregadas (já existe)
─────                                      ─────
falta a etapa PRINCIPAL                    RETRY       sintetizar o estímulo é perigoso (decisão de treino)
violação de regras de intervalado          RETRY       semântica de coaching, não estrutura trivial
qualquer outra hard-fail estrutural        RETRY       conservador: não reparar o que não é inequívoco
```

Princípio: **só reparar o que é formulaico e não-decisório.** Na dúvida, retry (e, se esgotar, falha clara). Reparo nunca silencioso — sempre logado e contado.

## D2 — Dedup dos validadores "3 etapas"

Os 4 validadores idênticos (`REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`) viram um `validarEstrutura3Etapas(tipo)` com **ponto único de reparo**. Isso (a) remove duplicação, (b) concentra o reparo num lugar, (c) facilita a telemetria por tipo. As regras (3 etapas, ordem canônica) **não mudam** — só deixam de estar copiadas 4×.

## D3 — Loop reparo+retry (orquestração)

```
gerarPlanoSemanalAvancado:
  plano = LLM.gerar(prompt)
  resultado = validarEReparar(plano)        // repara o reparável; coleta violações residuais
  se residuais vazias        → retorna plano (reparado ou não)
  senão (1ª vez)             → retry: LLM.gerar(prompt + feedback(residuais)); validarEReparar de novo
  se ainda há residuais      → DomainRuleViolationException (msg ao treinador)   [A2]
```

- **Teto = 1 retry** (latência ~80s/tentativa; 2 retries → ~4min, inaceitável em fluxo síncrono). Reparo é sub-segundo, sempre tentado antes.
- **Feedback do retry:** injeta o motivo da rejeição residual no prompt ("a tentativa anterior falhou: <motivo>; corrija X"). Eficaz quando a LLM "se perdeu na estrutura"; ineficaz se a causa for ambiguidade do prompt (telemetria revela — ver Riscos).
- **Colaborador dedicado:** extrair a orquestração reparo+retry para uma classe própria (ex.: `PlanoResilienceService`/helper), **não** inflar o `IaServiceImpl` (~1500 linhas; coordenar com `refactor-iaservice-decomposition`).

## D4 — Telemetria (Micrometer, registry existente)

Contadores: `plano_violacao_estrutural{tipo}`, `plano_reparo_aplicado{tipo}`, `plano_retry{resultado=sucesso|falha}`, `plano_geracao_falha_final`. KPI de produto derivado: taxa de sucesso = (gerações − falha_final) / gerações. **Q1 (aberto):** definir o threshold de reparo-rate que dispara revisão do prompt — a telemetria precisa de alarme, não só painel. **Q2:** candidato a incluir custo/latência por geração (com/sem retry).

## D5 — Idempotência / segurança

- O retry **re-chama o LLM** — não há escrita em banco por tentativa (a persistência do plano acontece a jusante, uma vez, com o plano final). Logo, retry não corrompe estado.
- Reparo é transformação pura sobre o DTO em memória; determinístico.
- Multi-tenancy inalterado (mesmo `atleta`/tenant já resolvido a montante; nenhuma query nova de tenant).

## Riscos e mitigações (inclui pré-mortem the-fool)

> Pré-mortem — "tornamos resiliente e algo deu errado. Por quê?"

- **R1 — Reparo formulaico mascara um prompt ruim** (a LLM erra cada vez mais, reparo esconde). *Mitigação:* reparo nunca silencioso (log+counter por tipo); Q1 define o threshold de alerta. Reparo só do formulaico, nunca do estímulo.
- **R2 — Retry repete o erro** (causa = ambiguidade do prompt, não "se perdeu"). *Mitigação:* teto=1 evita espera longa; telemetria de retry-fail por tipo aponta o prompt como culpado (decisão futura, não nesta change).
- **R3 — Reordenar/sintetizar muda a intenção do treino** (reparo agressivo demais). *Mitigação:* D1 conservador — só aquecimento/desaquecimento (não-estímulo), reordenação dos 3 tipos já presentes, e expansão de repetições; nada que altere o estímulo principal.
- **R4 — Latência de 1 retry frustra o treinador** (~80s extra). *Mitigação:* reparo (sub-segundo) é sempre tentado primeiro; retry só quando irreparável; teto=1.
- **R5 — Loop/recursão acidental** (retry chamando retry). *Mitigação:* teto explícito = 1, contador de tentativas; teste "falha → retry falha → erro de domínio".
- **R6 — Integração com o `PlanQualityChecker`** (introduce-plan-constraints, já mergeado, roda no mesmo pós-geração). *Mitigação:* o checker é warn-only (mede aderência de coaching); o loop estrutural é independente — o checker roda sobre o plano **final** (reparado/retried). Ordenar: reparar/retry estrutural → checar aderência.
- **R7 — Erro final técnico vaza ao treinador.** *Mitigação:* A2 — `DomainRuleViolationException` com mensagem orientada ao treinador; detalhe estrutural só em log/telemetria.

## Fora de escopo

Mudar regras de validação; sinalização visual do reparo na UI (A1 — follow-up); eval ao vivo com LLM; decomposição completa do `IaServiceImpl` (`refactor-iaservice-decomposition`).
