# rollout-gpt-6-luna-producao — levar a troca de modelo da OpenAI para produção

**Tamanho:** XS · **Trilha:** Fast (sem código; operação de ambiente e medição)
**Status:** aberta (2026-11-20)
**Origem:** passos de ambiente da `migrate-openai-retired-models` (seção 7 e 0.3), arquivada em 2026-11-20
com o código todo mergeado em `develop`.

## ⚠️ Prazo externo

A OpenAI desliga `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` e `gpt-4.1-mini` em **2027-01-14**. Enquanto `main`
não receber a troca (menthoros-backend#244 e seguintes), **produção segue no `gpt-4o`** e para de gerar
plano nessa data. O rollback para o `gpt-4o` também expira em 2027-01-14.

## Por que

`migrate-openai-retired-models` trocou as rotas `plano`, `expert` e `simple` para `gpt-6-luna` (plano e expert
com reasoning `medium`; simple com `none`). O código está em `develop` desde 2026-11-18. Falta validar no
ambiente, promover para `main` e medir — trabalho de operação, separado para não manter aberta uma change
de código já entregue.

## O que muda

Nada no código. Sequência de ambiente:

1. Checar modelo fine-tunado na conta OpenAI.
2. Congelar o baseline (aceite sem edição de volume, volume semanal; 4 semanas antes do corte).
3. Smoke no `develop` (Railway de testes): 1 plano real por arquétipo, 1 chamada `simple`, 1 `expert`, 1
   análise de treino.
4. Ensaio do rollback num ambiente de teste (branch `chore/rollback-openai-para-gpt4o`).
5. 1 semana de planos reais em `develop`; comparar falha e p95 com a semana anterior.
6. PR `develop → main`, com aviso às assessorias do pilot (janela sem provas-alvo).
7. 4 semanas pós-`main` medindo aceite contra o baseline.

## Critérios de aceite

- **CA1** — Sem modelo fine-tunado na conta, ou a lista registrada aqui com a decisão para cada um.
- **CA2** — Baseline registrado aqui (valores e data de corte) antes da promoção.
- **CA3** — Smoke sem falha: cada chamada gera resposta válida e o ledger (`tb_llm_call`) mostra
  `gpt-6-luna` como modelo servido nas três rotas.
- **CA4** — Rollback ensaiado: os dois lados (gpt-4o e de volta ao gpt-6-luna) sobem e geram plano.
- **CA5** — Falha e p95 da rota `plano` em `develop` não pioram de forma relevante contra a semana anterior.
- **CA6** — `main` com a troca **antes de 2027-01-14**; data do merge registrada aqui.
- **CA7** — Aceite em 4 semanas (n ≥ 20) sem queda > 5 p.p. contra o baseline. Queda maior → rollback
  (enquanto válido) e plano B (`plan-llm-provider-bakeoff`).

## Referências

- Procedimento de rollback, consultas SQL (CA9 de falha/p95 e aceite) e decisões:
  `changes/archive/2026-11/2026-11-20-migrate-openai-retired-models/proposal.md` (seção de rollout).
- Branch de rollback: `chore/rollback-openai-para-gpt4o` (menthoros-backend), cortada de `develop` logo
  após o #244 — rebasear em `develop` antes de usar.
