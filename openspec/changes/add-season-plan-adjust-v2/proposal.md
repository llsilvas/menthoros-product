**Tamanho:** M · **Trilha:** Full

> **Ticket 6** do épico `add-season-plan-macrocycle`. Proposal, design (Decisão 4) e decisões vivem no
> épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-approve-athlete-view` (ticket 5).

## Why

O treinador precisa mudar a temporada aprovada quando a realidade muda, sem reescrever o que já foi
executado e registrando o porquê.

## What Changes

Tasks do épico: **3.1 (rascunho a partir da ativa), 3.2, 3.3, 3.6, 3.8, 4.4, 4.5, 4.6, 4.8, 4.10 (v2), 7.8,
7.10, 7.11 (soma de fases), 7.14**, e a parte da seção 9 que cabe à tela de ajuste.

- Rascunho a partir da versão ativa; edição de semana e de parâmetros/fases
- Semanas concluídas, em andamento e a da prova são somente leitura
- Aprovação da v2 com motivo obrigatório; semanas passadas copiadas sem alteração
- Soma de fases igual ao total de semanas
- Tela de ajuste com travas e bloqueio de aprovação

## Critérios de aceite

- **Dado** um rascunho de v2, **quando** o treinador aprova sem motivo, **então** recebe 422 e nenhuma
  versão é criada.
- **Dado** uma temporada aprovada na semana 7 de 18, **quando** a v2 é aprovada, **então** as semanas 1 a
  6 ficam idênticas às da v1.
- **Dado** uma semana concluída, em andamento ou a da prova, **quando** o treinador a edita, **então**
  recebe 422, e na tela a semana não é editável.
- **Dado** soma de fases diferente do total, **quando** o treinador tenta aprovar, **então** recebe 422, e
  na tela a aprovação está bloqueada com o motivo.
- **E2E:** abrir o ajuste, editar uma semana futura, aprovar com motivo e ver a v2 na aba.

## Métrica de sucesso

% de temporadas com ao menos uma versão nova por ciclo (acompanhamento, não alvo).

## Open Questions & Assumptions

- Nenhuma.

## Bloqueado por

- `add-season-plan-approve-athlete-view` (ticket 5).
