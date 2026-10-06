# add-athlete-best-efforts — Melhores Esforços por atleta (janela 42 dias, cálculo interno)

**Tamanho:** L · **Trilha:** Full (backend + front)
**Status:** proposta
**Criado:** 2026-09-17

## Why

O intervals.icu tem uma visão "Best Efforts" que coach e atleta já conhecem: os melhores tempos
do atleta em distâncias de referência (400m, 800m, 1.5k, 1mi, 3k, 5k, 10k) numa janela rolante de
42 dias, com tempo e pace/km. O Menthoros hoje só expõe "Seus PRs" (`GET /me/recordes`), que é
outra coisa: recordes **de todos os tempos** em três distâncias longas (5k/10k/21k), derivados da
distância+duração **totais** do treino.

A diferença importa: PR diz "o melhor que você já fez na vida"; melhor esforço diz "o quão rápido
você está **agora**". É o sinal de evolução de curto prazo que o coach usa para ajustar ritmo de
prova e prescrição, e que o atleta usa como prova visível de progresso entre provas.

**Decisão de arquitetura (founder, 2026-09-17):** calcular internamente, a partir dos **streams**
(dado por segundo) que o intervals.icu expõe, em vez de consumir o best effort pré-calculado do
provedor. Motivos: independência da análise do intervals.icu, cobertura futura de qualquer fonte
(Strava, `.fit`) pelo mesmo algoritmo, e o dado derivado alimenta outras features (projeção de
prova, limiar "de agora"). O custo: é uma change L (algoritmo + persistência + backfill), e os
números podem divergir levemente da tela do intervals.icu por diferença de metodologia.

## What Changes

- Novo conceito de **melhor esforço**: melhor tempo por distância de referência dentro de janela
  rolante (default 42 dias), com pace/km derivado — distinto e coexistente com o recorde pessoal.
- **Ingestão**: buscar os streams (`time`, `distance`) de cada atividade de corrida na ingestão do
  intervals.icu e computar o melhor esforço por distância na hora (janela rolante sobre a distância
  acumulada). Persistir **só o resultado derivado** (nunca o stream cru).
- **Backend**: nova tabela `tb_melhor_esforco`, algoritmo de janela, serviço de agregação na janela
  de 42 dias, e endpoints `GET /api/v1/atletas/{id}/melhores-esforcos` (coach) e
  `GET /api/v1/atletas/me/melhores-esforcos` (atleta), espelhando o par de `recordes`.
- **Backfill**: ação do coach para computar os esforços dos treinos já ingeridos (passivo finito),
  no molde do backfill de laps.
- **Front**: tabela "Melhores Esforços" (distância × tempo × pace/km) numa nova aba "Esforços" da
  página Progresso do atleta, e no perfil do atleta visto pelo coach.

## Capabilities

### New Capabilities

- `athlete-best-efforts` — melhor esforço por distância de referência em janela rolante, computado
  internamente a partir de streams.

### Modified Capabilities

- `intervals-icu-activity-ingestion` — passa a buscar streams e persistir os esforços derivados.
- `athlete-progress` — página Progresso ganha a aba "Esforços".
- `coach-athlete-profile` — perfil do atleta visto pelo coach ganha a tabela.

## Impact

**Código:** método de streams no client, DTO de stream, algoritmo de janela, entidade/repository,
migration, endpoints, e hook/adapter/componente no front.

**Banco:** migration aditiva `tb_melhor_esforco` (uma linha por treino × distância com esforço).

**Risco:** médio. Algoritmo de janela tem casos de borda (GPS gap, tempo parado, activity curta);
divergência de número vs. intervals.icu; +1 chamada HTTP por atividade de corrida (rate limit).

## Open Questions & Assumptions

1. **[VERIFICAR no Bloco 0] Contrato do endpoint de streams**: formato da resposta, se `time` é
   tempo em movimento ou decorrido, frequência de amostragem, e o custo em rate limit de uma
   chamada por atividade. Definir antes de codar.
2. **[ASSUMIDO] v1 = intervals.icu streams apenas.** Strava e `.fit` (records do parser) reutilizam
   o mesmo algoritmo+tabela, mas ficam para follow-up — a independência de v1 é da *computação*,
   não da *fonte do dado*.
3. **[ASSUMIDO] Distâncias** = 400m, 800m, 1.5k, 1mi, 3k, 5k, 10k. 1.5k e 1mi coexistem apesar de
   próximos.
4. **[ASSUMIDO] Janela** = 42 dias rolantes, configurável (`menthoros.best-efforts.window-days`).
5. **[ASSUMIDO] pace/km** é sempre derivado (tempo ÷ distância), nunca vem da fonte.
6. **[ACEITO] Sem paridade exata com o intervals.icu** — metodologias diferentes (tratamento de
   tempo parado, suavização de GPS) produzem números próximos, não idênticos.

## Métrica de sucesso

**Antes:** 0% dos atletas têm visão de melhor esforço em janela rolante.
**Depois:** 100% dos atletas com intervals.icu conectado têm a tabela preenchida pelas distâncias
que possuem esforço (vazio explícito onde não há). Sem regressão no endpoint de recordes.

## Critérios de aceite

- **CA1:** `GET /me/melhores-esforcos` devolve `200` com a lista ordenada por distância; cada item
  tem `distancia`, `tempoSegundos`, `paceMinKm` (derivado) e `data`.
- **CA2:** Atleta sem intervals.icu conectado (ou sem esforços na janela) devolve `200 []`.
- **CA3:** `GET /me/...` resolve o atleta do JWT; `GET /{id}/...` exige TECNICO/ADMIN do tenant;
  atleta acessando `/{id}` de outro atleta recebe `404`.
- **CA4:** A aba "Esforços" renderiza a tabela com estados de loading/erro/vazio explícitos.
- **CA5:** O endpoint de `recordes` e a aba "Provas"/"Seus PRs" continuam inalterados.
- **CA6:** Para uma activity com streams conhecidos, o algoritmo devolve o mesmo melhor esforço que
  uma janela rolante de referência (teste golden com fixture).
