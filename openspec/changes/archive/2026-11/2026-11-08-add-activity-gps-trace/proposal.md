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

Esta change é **fundação de dado para os cards do atleta**, não uma feature do treinador. O valor
para o treinador é indireto e é uma **hipótese de aquisição**: cada card publicado leva "Treinado
por [treinador] · [assessoria]". Nenhuma tela do coach consome o trajeto nesta trilha; se um dia
o review do treino realizado quiser mostrar o mapa, é change própria com a tela junto.

## Escopo

1. **Parser FIT** (`FitParseServiceImpl`):
   - ler `position_lat`/`position_long` por `RecordMesg`, converter semicírculo → grau
     (`× 180 / 2³¹`);
   - guardar junto o `timestampSeg` e a FC do ponto (já lida), para que o front pinte o trajeto
     por zona; distância acumulada **não** é persistida (o front não precisa dela para os cards);
   - ler o modelo do dispositivo (`DeviceInfoMesg.getProductName()`, fallback
     `FileIdMesg.getProductName()`) e usar como **fallback** do campo `deviceName` já existente,
     sem sobrescrever o valor vindo do ping Garmin (design D1). Não há coluna nova para isso.
2. **Simplificação** em streaming (decimação ≥ 5 m no listener + Douglas-Peucker 10 m, teto de
   **400 pontos**). Os pontos brutos **não** são persistidos (design D3).
3. **Persistência** em `TreinoRealizado`: coluna `gps_trace JSONB NULL` com polyline codificada +
   arrays paralelos de tempo e FC (design D2). Migration `V113`, aditiva, sem backfill.
4. **Contrato:** endpoint novo `GET /api/v1/atletas/me/realizados/{id}/trajeto`; a lista
   `GET /me/treinos` ganha só `temTrajeto: boolean` (design D4). `404` quando não há trajeto ou o
   treino não é do atleta/tenant. **Sem endpoint para o coach**: não há tela que o consuma
   (product review).
5. **Sem reprocessamento:** o `.fit` não é retido após o parse (`GarminPingProcessorScheduler:174`
   e `FitUploadServiceImpl`), então treinos anteriores ao deploy ficam sem trajeto (design D5).

## Fora do escopo

- Desenhar o trajeto (front) — `athlete-share-cards-mapa`.
- Ocultar início/fim — decisão de produto: **não ocultar**; a transparência vai para
  `lgpd-trajeto-cards-compartilhamento`.
- Trajeto vindo do Strava ou intervals.icu (polyline pronta): a change deixa o campo pronto para
  receber, mas a ingestão dessas fontes é outra change.
- Mapa de fundo (ruas): não há serviço de tiles; só a linha.
- Reprocessar treinos anteriores ao deploy: não há `.fit` retido para reprocessar.
- Coluna `device_model`: o modelo entra no `deviceName` existente.
- Endpoint ou tela de trajeto para o coach: só com a tela que o use, em change própria.

## Critérios de aceite

**CA1 — Trajeto extraído e simplificado**
> **Dado** um `.fit` de corrida outdoor com N registros com GPS
> **Quando** ele é ingerido (Garmin ou upload)
> **Então** `TreinoRealizado.gpsTrace` tem entre 2 e 400 pontos (inclusive), o primeiro e o último
> coincidem com o primeiro e o último registro com GPS válido do arquivo, e cada ponto tem lat, lng,
> tempo relativo e FC (ou nulo).

**CA1b — Coordenada inválida não derruba a ingestão**
> **Dado** um `.fit` com registros cujo `position_lat` é nulo ou `0x7FFFFFFF`
> **Quando** ele é ingerido
> **Então** esses pontos são descartados, os demais formam o trajeto e a ingestão termina com
> sucesso.

**CA2 — Sem GPS, sem trajeto**
> **Dado** um `.fit` de esteira ou sem `position_lat`
> **Quando** ele é ingerido
> **Então** `gpsTrace` é nulo e a ingestão termina normalmente.

**CA3 — Modelo do dispositivo como fallback**
> **Dado** um upload manual de `.fit` de um Forerunner 265 (sem ping Garmin)
> **Quando** ele é ingerido
> **Então** `deviceName = "Forerunner 265"`. **Dado** o mesmo arquivo chegando por ping com
> `deviceName` próprio, o valor do ping prevalece. Sem `productName` no arquivo, `deviceName` fica
> nulo.

**CA4 — Contrato e isolamento**
> **Dado** um treino realizado com trajeto
> **Quando** o atleta chama `GET /me/realizados/{id}/trajeto`
> **Então** recebe o JSON do design D2 mais `deviceName`; para um treino de **outro atleta do mesmo
> tenant** ou de **outro tenant**, 404; a lista `GET /me/treinos` traz `temTrajeto: true` para esse
> treino.

**CA5 — Limite de tamanho e memória**
> **Dado** um `.fit` de ultramaratona com 60 mil registros com GPS
> **Quando** ele é ingerido
> **Então** a lista GPS em memória nunca passa de `MAX_PONTOS_GPS` (20.000) — com GPS ruidoso a
> decimação dobra o passo em vez de crescer —, o trajeto persistido tem ≤ 400 pontos e
> `pg_column_size(gps_trace)` ≤ 8 KB. Acima de `MAX_AMOSTRAS`
> (200.000) o comportamento atual (`amostrasExcedidas`) se mantém e o trajeto fica nulo.

## Métrica de sucesso

- 100% dos treinos outdoor ingeridos após o deploy têm `gpsTrace` não nulo (query em `design.md`).
- P95 de `pg_column_size(gps_trace)` ≤ 8 KB, medido em staging com os arquivos de Q2.
- Para o treinador (medido na trilha, instrumentado em `athlete-share-cards`, não aqui): cards
  compartilhados por atleta ativo por semana; % de cards com assinatura "Treinado por" ligada.
  Esta change só garante que o dado existe.

## Open Questions & Assumptions

- **Q1 — Formato.** Resolvida: JSONB com polyline codificada + arrays paralelos (design D2).
- **Q2 — Precisão do Douglas-Peucker.** 10 m preserva curvas de rua em escala de card; validar com
  3 arquivos reais (parque, rua, trilha) na task 2.3.
- **Q3 — Reprocessamento.** Resolvida: o `.fit` não é retido; sem reprocessamento (design D5).
- **Premissa:** o front só precisa de lat/lng/FC/tempo; altitude e pace por ponto ficam para uma
  change futura se algum card pedir.
- **Premissa:** `DeviceInfoMesg.getProductName()` vem preenchido nos relógios recentes; em arquivos
  antigos pode vir nulo e o `deviceName` fica nulo — aceito.
- **Hipótese de produto (trilha inteira):** o valor para o treinador é divulgação orgânica via
  assinatura nos cards. É aposta, não pedido de assessoria do pilot. **Critério de parada:** se,
  8 semanas após `athlete-share-cards` em produção, menos de 10% dos atletas ativos tiverem gerado
  ao menos um card, `athlete-share-cards-mapa` não entra e a trilha para.
- **Pergunta ao founder:** esta trilha vem antes de algo que reduza minutos por revisão ou suba o
  acceptance rate do WeekSuggestion? O product review levantou a prioridade; a decisão é de
  roadmap, não desta spec.

## Rollback

Deploy reversível: a coluna `gps_trace` é nula e ignorada pela versão anterior; os endpoints novos
simplesmente deixam de existir. Remover a coluna exige `DROP` e passa pelo gate de confirmação.

## Riscos e mitigações

- **Dado sensível (localização) no banco.** Já é tratado como sensível na Política (§ 2.1); a
  change não cria finalidade nova sozinha. Isolamento por `tenant_id` segue o padrão das demais
  colunas de `tb_treino_realizado`.
- **Memória no parser.** Decimação on-line (≥ 5 m) antes do Douglas-Peucker (design D3).
- **Duas fontes de verdade para o modelo.** Evitado: sem coluna nova; `.fit` só preenche
  `deviceName` quando nulo (design D1).
- **Cardinalidade da lista GPS em memória.** Decimação por distância não limita o número de pontos
  (ultra de 100 km ou GPS ruidoso). Mitigação: teto rígido `MAX_PONTOS_GPS = 20_000` no listener;
  ao atingir, a lista é re-decimada com o passo dobrado (5 → 10 → 20 m) antes de continuar
  (design D3).
- **DoR:** `spec-reviewer` em 2026-11-08 → READY COM AJUSTES; Codex adversarial → NOT READY sobre a
  versão anterior (formato sem tempo por ponto, memória sem teto, `deviceModel` duplicado). Os três
  achados estão incorporados nesta revisão (D2, D3, D1). `product-reviewer` → **Refine**: endpoint
  do coach cortado, Why reescrito como fundação de card, métrica do coach trocada por funil na
  trilha, hipótese e critério de parada declarados. Incorporado.
