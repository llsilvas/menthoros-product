# athlete-share-data — dados que os cards de compartilhamento precisam do backend

**Tamanho:** M · **Trilha:** Full (contrato de API, autorização, schema)
**Status:** proposta — nasce do DoR de `athlete-share-cards` (2026-11-08); precisa do próprio DoR
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-backend`, `apps/menthoros-front` (cliente curado)

> Bloqueia `athlete-share-cards-extra`. Não bloqueia `athlete-share-cards` (núcleo).

## Why

O DoR de `athlete-share-cards` encontrou quatro dados que o atleta não recebe e um sinal que ninguém
mede:

1. **Logo da assessoria:** `GET /api/v1/assessorias/me/logo` tem
   `@PreAuthorize("hasAnyRole('TECNICO','PROPRIETARIO','ADMIN')")`
   (`AssessoriaSettingsController.java:121`) — o atleta recebe 403.
2. **Nome do treinador** responsável pelo atleta, a confirmar se já chega (ver task 0.2 do núcleo).
3. **Nota do treinador publicável:** não existe nota por treino endereçada ao atleta; o que chega é
   a análise de IA (`reconhecimento`, `comoFoi`). O card "Nota do treinador" precisa de um texto do
   treinador **e** do opt-in dele para sair da plataforma.
4. **Melhor esforço com origem:** `AthleteMelhorEsforco` só tem distância, tempo e pace
   (`src/types/AthleteProgress.ts:43-48`), lido do intervals.icu; sem `treinoId`, data nem marca
   anterior, o card Recorde não sabe se o treino gerou o recorde nem a melhora.
5. **Evento de compartilhamento:** o front não tem telemetria; a métrica da trilha (cards por
   atleta, % com assinatura) não tem onde ser registrada.

## Escopo (a detalhar no DoR)

1. Liberar `GET /assessorias/me/logo` para `ATLETA` do mesmo tenant.
2. Nome do treinador no contrato do atleta. **Decisão do founder (2026-11-08):** o treinador vem do
   **cadastro da assessoria**, com **inclusão de técnico** feita ali — não de texto livre nem de
   claim do token. Estado atual: técnico já é `Usuario` com `UserRole.TECNICO` no tenant (contado em
   `AssessoriaSettingsServiceImpl.java:98`, limitado por `Assessoria.maxTecnicos`), mas não existe
   tela para a assessoria incluir técnicos nem vínculo atleta → técnico. Escopo decorrente:
   - inclusão/listagem de técnicos na tela de configurações da assessoria (respeitando
     `maxTecnicos`);
   - vínculo do atleta com o técnico responsável (a definir no DoR: campo no `Atleta` ou escolha no
     convite);
   - nome do técnico responsável no contrato do atleta (`GET /users/me` ou similar).
   Pode ser grande o bastante para virar change própria (`assessoria-cadastro-tecnicos`) — avaliar
   no DoR.
3. Nota do treinador por treino realizado com `publicavel` (opt-in, default falso) e onde o
   treinador escreve/marca — **decisão de produto pendente**: reaproveitar algum campo existente do
   review ou criar campo novo.
4. Melhor esforço com `treinoRealizadoId`, data e marca anterior — **decisão pendente**: calcular
   internamente (alinha com `add-athlete-best-efforts`, que já decidiu cálculo interno por streams)
   ou estender a leitura do intervals.icu. Provável dependência de `add-athlete-best-efforts`.
5. `POST /api/v1/atletas/me/eventos/compartilhamento` (modelo, formato, assinatura, destino,
   `treinoId`) com persistência mínima e deduplicação por treino/dia.

## Fora do escopo

- Os cards em si (`athlete-share-cards-extra`).
- Analytics genérico de produto: só o evento de compartilhamento.

## Critérios de aceite

A escrever no DoR, um por item do escopo; no mínimo: atleta recebe 200 no logo do próprio tenant e
404/403 no de outro; nota não publicável nunca aparece na resposta do atleta; melhor esforço traz
`treinoRealizadoId` do treino que o gerou; evento repetido no mesmo dia não duplica.

## Open Questions & Assumptions

- **Q1** Origem da nota do treinador (campo existente × novo) — founder.
- **Q2** Melhor esforço: esperar `add-athlete-best-efforts` ou estender intervals.icu — founder.
- **Q3** Retenção e uso do evento (LGPD: é dado de uso do titular) — confirmar com a Política.
