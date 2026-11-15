**Tamanho:** M · **Trilha:** Full

> **Ticket 5** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 3, 4) e decisões vivem
> no épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-generate-tracer` (ticket 2).

## Why

Fecha a primeira volta do produto: o treinador aprova a proposta e o atleta passa a ver para onde a
preparação vai. A proposta nunca é visível ao atleta.

## What Changes

Tasks do épico: **3.1 (só aprovar a v1), 3.4, 4.3, 4.10 (v1), 4.11, 4.12b (atleta com proposta), 8.1–8.4,
8.7**, e a parte da seção 9 que cabe ao bloco do atleta. 8.5 e 8.6 saem (Q9: sem temporada, não há bloco).

- Aprovar a proposta: vira `ATIVO`, com quem e quando aprovou; a anterior `ATIVO` (se houver) é
  arquivada na mesma transação
- Leitura da semana da temporada corrente
- Leitura do atleta, só `ATIVO` e só a própria
- Ação "Aprovar" na aba do treinador
- Bloco "Minha temporada" na área do atleta: prova-alvo, dias que faltam, fase atual, próximos marcos e a
  nota de previsão

## Critérios de aceite

- **Dado** uma temporada em proposta, **quando** o treinador aprova, **então** ela vira `ATIVO` e há
  exatamente uma `ATIVO` para o atleta.
- **Dado** uma temporada só em proposta, **quando** o atleta consulta a própria, **então** a resposta
  indica que não há plano, e o bloco não existe no DOM.
- **Dado** uma temporada `ATIVO`, **quando** o atleta abre a área, **então** vê a prova-alvo, os dias que
  faltam, a fase atual, os próximos marcos e a nota de que as semanas futuras são previsão.
- **Dado** um atleta, **quando** tenta ler a temporada de outro atleta, **então** não consegue.

## Métrica de sucesso

Adoção do épico: ≥ 70% dos atletas com prova-alvo com temporada aprovada no piloto.

## Open Questions & Assumptions

- Nenhuma.

## Bloqueado por

- `add-season-plan-generate-tracer` (ticket 2).
