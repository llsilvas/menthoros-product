# ocultar-volume-alvo-vazio — não mostrar "alvo 0 km" ao coach

**Tamanho:** XS · **Trilha:** Fast
**Status:** proposta (2026-11-18)
**Origem:** rodada 3 da revisão cega (casos 10–12, arquétipo sem dados).

## Por que

Para atleta sem dados a LLM devolve `volumeAlvoKm` 0 (ou nulo), e o coach lê "alvo 0 km" ao lado do volume
planejado. É cosmético, mas confunde. O front usa `volumeAlvo` em `PlanoDetalhePanel`.

## O que muda

- Front: esconder o alvo quando for 0 ou nulo.

## Critérios de aceite

- **CA1** — GIVEN plano com `volumeAlvoKm` 0 ou nulo, THEN o painel do coach não mostra o alvo.
- **CA2** — GIVEN alvo > 0, THEN comportamento atual.
