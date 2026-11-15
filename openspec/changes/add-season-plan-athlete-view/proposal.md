**Tamanho:** S · **Trilha:** Fast

> Fatia **S7** do épico `add-season-plan-macrocycle`. Proposal, design e decisões vivem lá; a UI está
> descrita em `specs/season-plan-ui/spec.md` do épico. Esta change só delimita o escopo e os cenários.

## Why

O atleta vê para onde a preparação vai: prova-alvo, fase atual e próximos marcos — só depois que o
treinador aprovou a temporada.

## What Changes

Tasks do épico: **8.1–8.4, 8.7** e a parte da seção 9 que cabe a este bloco. **8.5 e 8.6 mudam** (Q9):
atleta em calibração não tem temporada, então não há estado de calibração no bloco — sem temporada
`ATIVO`, o bloco não aparece.

- Bloco "Minha temporada" na área do atleta, consumindo `GET /api/v1/atletas/me/temporada`
- Prova-alvo com contagem de dias, fase atual, volume por semana, resumo da semana com CTA, próximos
  marcos, nota permanente de previsão

## Critérios de aceite

- **Dado** um atleta sem temporada `ATIVO` (sem temporada, só proposta, ou em calibração), **quando** abre
  a área, **então** o bloco não existe no DOM.
- **Dado** uma temporada `ATIVO`, **quando** abre a área, **então** vê a prova-alvo, os dias que faltam, a
  fase atual e os próximos marcos.
- **Dado** o bloco visível, **quando** renderiza, **então** traz a nota de que as semanas futuras são
  previsão e podem mudar.

## Dependências e rollout

- Depende de: `add-season-plan-api-read-generate` (S3). Só tem conteúdo real depois da S4 (aprovação).
- Flag: `macrociclo.enabled`.
