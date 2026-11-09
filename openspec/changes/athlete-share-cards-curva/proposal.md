# athlete-share-cards-curva — card de compartilhamento com curva de pace e FC

**Tamanho:** S · **Trilha:** Fast (só front, consome contrato de `add-activity-time-series`)
**Status:** proposta — **bloqueada pelo gate de adoção** de `athlete-share-cards-esteira`
**Criado:** 2026-11-09
**Repos afetados:** `apps/menthoros-front`
**Depende de:** `add-activity-time-series` (backend) em produção

> Referência visual: artboard "Compartilhar treino — cards sociais", seção **Esteira (sem GPS)**,
> `v2 J · Curva de pace e FC` (aprovado pelo founder em 2026-11-09).

## Why

O card Curva mostra como o treino evoluiu (progressivo, negativo, deriva de FC), não só o resultado.
Serve à esteira, que não tem mapa, e também à corrida de rua.

## Escopo

1. **Modelo `curva`** (v2 J): título com o rótulo do tipo de treino ("Corrida" sem rótulo), subtítulo
   com a distância ("10 km" ou "10 km na esteira" quando `esteira`), gráfico de linha do pace (lima,
   com área) e da FC (vermelha) no tempo decorrido, eixo de tempo (início, meio, fim até
   `duracaoSeg`), três blocos (Tempo, Pace médio, FC máxima) e assinatura. Disponível quando
   `realizado.temSerie === true`.
2. **Dados:** `useShareWorkout` busca `GET /me/realizados/{id}/serie` quando `temSerie`; falha vira
   `null` e o modelo some. Adapter puro `buildPaceHrCurve` converte a série em caminhos SVG.
3. **Picker:** rótulo "Curva"; ordem `plano, parciais, rota, stickers, curva, esteira, semana`;
   formato padrão story.
4. **"Mostrar FC"** esconde a linha e o bloco de FC máxima.

## Fora do escopo

- Zonas de FC na curva (nenhum endpoint do atleta expõe os limites).
- Marcar voltas ou tiros sobre a curva.

## Critérios de aceite

**CA1 — Curva**
> **Dado** um realizado com `temSerie: true` e série com velocidade e FC
> **Quando** o atleta escolhe "Curva"
> **Então** o card desenha as duas linhas, a de pace com o mais rápido no alto, e o `aria-label` do
> gráfico descreve pace e FC no início e no fim.

**CA2 — Buracos, paradas e picos**
> **Dado** uma série com baldes `null` ou velocidade abaixo de 0,5 m/s
> **Quando** a curva é gerada
> **Então** a linha se interrompe nesses trechos em vez de despencar, e a escala usa os percentis 5–95
> do pace para um pico isolado não achatar o resto.

**CA3 — Série incompleta**
> **Dado** uma série só com FC (ou só com velocidade)
> **Quando** a curva é gerada
> **Então** desenha só a linha disponível e esconde a legenda da outra. Com menos de 2 pontos úteis
> nas duas, o modelo não aparece.

**CA4 — Mostrar FC**
> **Dado** o modelo `curva`
> **Quando** "Mostrar FC" é desligado
> **Então** a linha de FC e o bloco de FC máxima somem do card e do PNG.

**CA5 — Falha da série**
> **Dado** que `GET /serie` falha
> **Quando** a tela carrega
> **Então** os demais modelos funcionam e "Curva" não aparece.

**CA6 — E2E**
> **Dado** um treino com série mockada no formato real da API
> **Quando** o atleta escolhe "Curva" e clica Salvar
> **Então** baixa um PNG 1080 × 1920.

## Métrica de sucesso

- Cards Curva gerados por semana (instrumentação de `athlete-share-cards-extra`).
- Para o treinador: hipótese de aquisição da trilha.

## Open Questions & Assumptions

- **Premissa:** a série chega calibrada e com pausas como `null` (`add-activity-time-series`, D3–D5);
  o front não recalcula nem suaviza.
- **Premissa:** o rótulo de `tipoTreino` serve de título ("Progressivo", "Contínuo").

## Riscos e mitigações

- **Curva ruidosa no pulso.** Os baldes do backend já integram no tempo; o front só corta paradas e
  outliers (CA2).
- **Curva compete com Rota no outdoor.** Aceito: públicos diferentes; Rota vem antes no picker.
