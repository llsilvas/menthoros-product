**Tamanho:** S · **Trilha:** Full

> Fatia **S3** do épico `add-season-plan-macrocycle`. Proposal, design (Decisão 3) e decisões vivem lá;
> esta change só delimita o escopo e os cenários que a fecham.

## Why

Expõe a geração (manual, pelo treinador — D3) e a leitura da temporada, com o isolamento por papel e por
assessoria que garante que o atleta nunca vê uma proposta não aprovada.

## What Changes

Tasks do épico: **4.1–4.3, 4.11, 4.12, 4.12a, 4.12b, 4.13, 4.14 (endpoints desta fatia)**.

- `POST /api/v1/atletas/{atletaId}/macrociclo` (gera a proposta), `GET .../macrociclo/ativo`,
  `GET .../macrociclo/semana-atual`
- `GET /api/v1/atletas/me/temporada` (atleta, só `ATIVO`)
- `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` nos endpoints do treinador; filtro por `TenantContext`
- Flag `macrociclo.enabled` (default `false`)

## Critérios de aceite

- **Dado** um atleta com prova-alvo e sem temporada, **quando** o treinador gera, **então** nasce um
  `PlanoTreino` em `PROPOSTA` com as semanas.
- **Dado** uma temporada só em `PROPOSTA`, **quando** o atleta consulta a própria, **então** a resposta
  indica que não há plano.
- **Dado** um usuário `ATLETA`, **quando** chama qualquer endpoint do treinador, **então** recebe 403.
- **Dado** uma temporada da assessoria A, **quando** um treinador da assessoria B a consulta, **então**
  não a encontra.
- **Dado** um atleta em calibração, **quando** o treinador gera, **então** recebe 422 com o motivo.
- **Dado** `macrociclo.enabled=false`, **quando** qualquer endpoint é chamado, **então** o comportamento
  é 404, sem efeito colateral.

## Dependências e rollout

- Depende de: `add-season-plan-generator` (S2).
- Flag: `macrociclo.enabled=false`.
