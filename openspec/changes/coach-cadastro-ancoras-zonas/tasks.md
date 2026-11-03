# Tasks — coach-cadastro-ancoras-zonas (M · Full · backend + front)

> Branch coordenada nos dois repos: `feat/coach-cadastro-ancoras-zonas`. **Backend primeiro**: o PR
> do backend entra em `develop` e sobe no ambiente de testes antes de abrir o do front.
> Seguinte na fila: `coach-zonas-manuais` (depende desta).
> Revisões de 2026-11-03 incorporadas: produto (Go com refinos), pré-mortem Codex (8 riscos), UX do protótipo.

## 0. Discovery

- [ ] **0.1** Linha de base da métrica: por tenant, % de atletas ativos (de treinadores com revisão
  nos últimos 14 dias) com `pace_limiar > 0` e `fc_limiar` não nulo. Registrar no proposal
- [ ] **0.2** Confirmar o número da próxima migration (último: V106) e quais hosts de
  `AthleteZonesTable` devem oferecer edição (`PlanoDetalhePanel`, `CurrentWeekPlan`, `EtapasEditor`)
- [ ] **0.3** Fechar Q3 (pilot depende de limiar cadastrado?) e confirmar com treinador o enum
  `FonteLimiar` antes da migration (A2)

## 1. Backend — migration e montagem pura (D2, D3, D5)

- [ ] **1.1** Migration `V107__add_fonte_limiar_atleta.sql`; enum `FonteLimiar`; campos em `Atleta` — [CA7]
  - Validação: `./mvnw clean compile` + `docker compose up -d` e conferir Flyway
- [ ] **1.2** Extrair o montador do GET para função pura sobre record `AncorasZonas`; GET passa a
  usá-la sem mudar a resposta (testes atuais do GET verdes) + expor `fonteLimiar*` — [CA7]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesServiceImplTest`
- [ ] **1.3** Parametrizado 150..600 s/km: ida e volta da âncora exata; bordas das zonas ±1 s do
  cálculo direto — [CA17]
  - Validação: `./mvnw test -Dtest=PaceLimiarQuantizacaoTest`

## 2. Backend — escrita, simulação, reenvio (D1, D2, D4, D6, D8)

- [ ] **2.1** `AthleteZoneAnchorsInputDto` + validador único (limites = CHECKs de V6, máxima
  informada ou vigente > limiar, `dataTeste` via `AtletaHojeResolver`, ao menos um grupo); testes com
  e sem data de nascimento — [CA4]
  - Validação: `./mvnw test -Dtest=AthleteZoneAnchorsValidatorTest`
- [ ] **2.2** `UPDATE` por grupo no `AtletaRepository` (`@Modifying`, filtrado por tenant); service
  `salvarAncoras` relê e devolve as zonas; máxima vazia não altera — [CA1, CA2, CA3]
- [ ] **2.3** Service `simular` com o mesmo validador e a função pura — [CA5]
- [ ] **2.4** Extrair `sincronizarFcBestEffort` para componente; chamar após commit do grupo `fc` para
  atleta conectado; log estruturado por salvamento — [CA15]
- [ ] **2.5** Controller: `PUT .../zonas/ancoras` e `POST .../zonas/simulacao`, mesmas regras de
  acesso do GET; OpenAPI com `@ApiResponse` correto — [CA6]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesControllerTest` (isolado)
- [ ] **2.6** Teste do `IntervalsIcuFcAlvoResolver` antes/depois do cadastro do limiar — [CA14]
- [ ] **2.7** Integração com PostgreSQL: limites dos CHECKs, simulação relida em transação separada,
  404 entre tenants (PUT e simulação), dois PUTs concorrentes em eixos diferentes — [CA4, CA5, CA6, CA18]
  - Validação: `./mvnw clean verify`
- [ ] **2.8** PR do backend → `develop`; conferir no ambiente de testes com um atleta real

## 3. Front — contrato e lógica (D7)

- [ ] **3.1** Cliente curado: `salvarAncoras`, `simular`; tipos de entrada; `fonteLimiar*` no DTO
- [ ] **3.2** Utilitários puros: `m:ss` ↔ segundos, validação local por eixo (limites do backend) — Vitest
- [ ] **3.3** `useAthleteTrainingZones`: invalidação por `atletaId` entre instâncias + descarte de
  resposta ultrapassada — [CA16]
- [ ] **3.4** Hook `useAthleteZoneAnchorsEditor` — estado, validação no blur, simulação com debounce
  300 ms e guarda de ordem, `salvar` com `loading`/`error`, invalidação após salvar — [CA11, CA12, CA16]
  - Validação: `npm run lint && npm run build && npm run test:run`

## 4. Front — UI (D7)

- [ ] **4.1** `AthleteZonesDialog`: MUI `Tabs` FC/Ritmo, âncoras (máxima vazia com dica quando
  estimada), origem, prévia barra + tabela, aviso de alcance ("próximos planos e treinos não enviados"),
  salvar com carregando, `fullScreen` abaixo de `sm` — [CA8, CA11, CA12]
- [ ] **4.2** `AthleteZonesTable`: prop `onEditar`, "Editar zonas", FC estimada com selo + CTA,
  "Ritmo não cadastrado" abrindo na aba Ritmo, origem junto da data — [CA8, CA9, CA10]
- [ ] **4.3** Ligar nos hosts definidos em 0.2 — [CA12, CA16]
  - Validação: `npm run lint && npm run build && npm run test:run`

## 5. E2E e entrega

- [ ] **5.1** `tests/e2e/coach/zonas-cadastro.spec.ts`: cadastrar pace de limiar de atleta sem ritmo
  e editar FC; asserção no card após salvar — [CA13]
  - Validação: `npm run test:e2e`
- [ ] **5.2** Atualizar `openspec/specs/coach-athlete-zones/spec.md` com o delta desta change ao arquivar
- [ ] **5.3** PR do front → `develop`
