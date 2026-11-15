**Tamanho:** M · **Trilha:** Full

> Fatia **S6** do épico `add-season-plan-macrocycle`. Proposal, design e decisões vivem lá; a UI está
> descrita em `specs/season-plan-ui/spec.md` do épico. Esta change só delimita o escopo e os cenários.

## Why

Fecha o ciclo do treinador: ajustar a proposta, ver o que mudou e aprovar. Sem esta fatia, a temporada
só é aprovada por API.

## What Changes

Tasks do épico: **7.8–7.11, 7.14, 7.15** e a parte da seção 9 que cabe a esta tela.

- `CoachSeasonAdjustPage`: parâmetros, fases, tabela editável, alterações, validações e motivo
- Campo alterado com valor anterior e bloco de diff com origem
- Travas de semana (concluída, em andamento, prova) e confirmação de recálculo
- Bloqueio de aprovação por soma de fases e tratamento de conflito de versão

## Critérios de aceite

- **E2E:** gerar a proposta, ajustar uma semana, aprovar com motivo e ver a temporada `ATIVO` na aba.
- **Dado** um campo editado, **quando** a tabela renderiza, **então** mostra o valor anterior e a origem.
- **Dado** soma de fases diferente do total, **quando** o treinador tenta aprovar, **então** a aprovação
  está bloqueada com o motivo.
- **Dado** que outra sessão aprovou uma versão antes, **quando** o treinador aprova, **então** vê o
  conflito e não perde a edição.
- **Dado** uma semana concluída, em andamento ou a da prova, **quando** a tabela renderiza, **então** a
  semana não é editável.

## Dependências e rollout

- Depende de: `add-season-plan-versioning-approval` (S4) e `add-season-plan-coach-view` (S5).
- Flag: `macrociclo.enabled`.
