# add-activity-gps-trace — trajeto GPS e modelo do dispositivo no treino realizado

**Tamanho:** M · **Trilha:** Full (schema de banco + contrato de API; dado sensível pela Política)
**Status:** proposta
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-backend`

> Primeira de três changes dos cards de compartilhamento de treino (canvas "Compartilhar treino —
> cards sociais", 2026-11-08). Esta é a fundação de dado; `athlete-share-cards` entrega os cards sem
> mapa e `athlete-share-cards-mapa` os com mapa. Sequência: esta → `athlete-share-cards` (paralelo
> possível) → `athlete-share-cards-mapa` (depende desta e de `lgpd-trajeto-cards-compartilhamento`).

## Why

O `.fit` que chega pela ingestão Garmin (`activityFiles`) e pelo upload manual traz, em cada
`RecordMesg`, `position_lat`/`position_long` (semicírculos). O `FitParseServiceImpl.java:101` lê só
timestamp e FC e descarta as coordenadas. Também lê `serialNumber` do `FileIdMesg`, mas não o
modelo do dispositivo.

Sem isso, nenhum card pode desenhar o trajeto, e a atribuição exigida pela Garmin ("Garmin [device
model]", API Brand Guidelines v6.30.2025, seção Visual and Social Media) fica genérica ("Garmin").

Para o treinador, o trajeto é contexto de análise que hoje ele só vê abrindo o Garmin Connect ou o
Strava: onde o atleta fez o longão, se o tiro foi em subida, se a volta foi a mesma de sempre.

## Escopo

1. **Parser FIT** (`FitParseServiceImpl`):
   - ler `position_lat`/`position_long` por `RecordMesg`, converter semicírculo → grau
     (`× 180 / 2³¹`);
   - guardar junto o `timestampSeg`, a `distance` acumulada e a FC do ponto (já lida), para que o
     front pinte o trajeto por zona;
   - ler o modelo do dispositivo pelo `DeviceInfoMesg` (`garminProduct`/`product`) ou `FileIdMesg`
     e expor como texto (ex.: `Forerunner 265`); nulo quando não houver.
2. **Simplificação** do trajeto antes de persistir (Douglas-Peucker, tolerância ~10 m, teto de
   ~400 pontos). Os milhares de pontos brutos **não** são persistidos.
3. **Persistência** em `TreinoRealizado`: coluna `gps_trace` (JSONB ou `TEXT` com polyline
   codificada + array paralelo de FC) e `device_model` (`VARCHAR(80)`). Migration `V113`.
4. **Contrato:** campos `gpsTrace` e `deviceModel` no DTO do treino realizado consumido pelo atleta
   (`AtletaTreinoController`, `GET /me/treinos` e detalhe) e pelo coach
   (`TreinoRealizadoController`). `gpsTrace` nulo quando a atividade não tem GPS (esteira, indoor,
   manual).
5. **Reprocessamento:** job ou endpoint administrativo para reprocessar os `.fit` já ingeridos
   **se** o arquivo original ainda estiver acessível. Se não estiver, aceitar que treinos antigos
   ficam sem trajeto e documentar.

## Fora do escopo

- Desenhar o trajeto (front) — `athlete-share-cards-mapa`.
- Ocultar início/fim — decisão de produto: **não ocultar**; a transparência vai para
  `lgpd-trajeto-cards-compartilhamento`.
- Trajeto vindo do Strava ou intervals.icu (polyline pronta): a change deixa o campo pronto para
  receber, mas a ingestão dessas fontes é outra change.
- Mapa de fundo (ruas): não há serviço de tiles; só a linha.

## Critérios de aceite

**CA1 — Trajeto extraído e simplificado**
> **Dado** um `.fit` de corrida outdoor com N registros com GPS
> **Quando** ele é ingerido (Garmin ou upload)
> **Então** `TreinoRealizado.gpsTrace` tem entre 2 e ~400 pontos, o primeiro e o último
> coincidem com o primeiro e o último registro com GPS do arquivo, e cada ponto tem lat, lng,
> tempo relativo e FC (ou nulo).

**CA2 — Sem GPS, sem trajeto**
> **Dado** um `.fit` de esteira ou sem `position_lat`
> **Quando** ele é ingerido
> **Então** `gpsTrace` é nulo e a ingestão termina normalmente.

**CA3 — Modelo do dispositivo**
> **Dado** um `.fit` de um Forerunner 265
> **Quando** ele é ingerido
> **Então** `deviceModel = "Forerunner 265"`; para um arquivo sem a mensagem, `deviceModel` é nulo.

**CA4 — Contrato**
> **Dado** o detalhe de um treino realizado com trajeto
> **Quando** o atleta chama o endpoint de detalhe
> **Então** a resposta traz `gpsTrace` e `deviceModel`; para outro tenant, 404 (isolamento mantido).

**CA5 — Limite de tamanho**
> **Dado** um `.fit` de ultramaratona com 60 mil registros
> **Quando** ele é ingerido
> **Então** o parser não estoura memória nem o teto de amostras atual (`MAX_AMOSTRAS`), e o
> trajeto persistido respeita o teto de pontos.

## Métrica de sucesso

- 100% dos treinos com GPS ingeridos após o deploy têm `gpsTrace` não nulo.
- Tamanho médio de `gps_trace` ≤ 8 KB por treino.
- Para o treinador: o detalhe do treino na visão do coach passa a mostrar o trajeto (consumido pela
  change de front), eliminando a ida ao Garmin Connect para "ver onde foi".

## Open Questions & Assumptions

- **Q1 — Formato de persistência.** JSONB (consultável, maior) ou polyline codificada do Google
  (compacta, ~5 bytes/ponto) + array de FC. Recomendação: **polyline codificada** em `TEXT` mais
  `gps_trace_fc` em `SMALLINT[]`. Decidir no `design.md`.
- **Q2 — Precisão do Douglas-Peucker.** 10 m preserva curvas de rua em escala de card; validar com
  3 arquivos reais (parque, rua, trilha).
- **Q3 — Reprocessamento.** O `.fit` baixado do Garmin é retido? Se não, treinos anteriores ao
  deploy não terão trajeto. Confirmar em `GarminPingProcessorScheduler`/`FitUploadServiceImpl`.
- **Premissa:** o front só precisa de lat/lng/FC/tempo; altitude e pace por ponto ficam para uma
  change futura se algum card pedir.

## Riscos e mitigações

- **Dado sensível (localização) no banco.** Já é tratado como sensível na Política (§ 2.1); a
  change não cria finalidade nova sozinha. Isolamento por `tenant_id` segue o padrão das demais
  colunas de `tb_treino_realizado`.
- **Memória no parser.** Acumular 60k pontos antes de simplificar pode pesar; simplificar em
  streaming (janela) ou aplicar decimação prévia por distância (1 ponto a cada 5 m) antes do DP.
- **Pendências do Full track:** `product-reviewer` e pre-mortem (`/codex:adversarial-review`) não
  rodaram; estão na task 0.
