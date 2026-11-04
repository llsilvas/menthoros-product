# Tasks — coach-cadastro-ancoras-zonas (M · Full · backend + front)

> Branch coordenada nos dois repos: `feat/coach-cadastro-ancoras-zonas`. **Backend primeiro**: o PR
> do backend entra em `develop` e sobe no ambiente de testes antes de abrir o do front.
> Seguinte na fila: `coach-zonas-manuais` (depende desta).
> Revisões de 2026-11-03 incorporadas: produto (Go com refinos), pré-mortem Codex (8 riscos), UX do protótipo,
> DoR do `/implement init` (spec-reviewer + Codex: fallback de FC máxima, pace até 720, texto do aviso, teto da Z5, hosts).

## 0. Discovery

- [x] **0.1** Linha de base da métrica: por tenant, % de atletas ativos (de treinadores com revisão
  nos últimos 14 dias) com `pace_limiar > 0` e `fc_limiar` não nulo. Registrar no proposal — **provisória: homelab, n=6; reconferir em produção**
- [x] **0.2** Reconferir o número da próxima migration (último: V106) e fechar A1: listar os
  consumidores de `fc_maxima` (`getFcMaxima`, `getFcMaximaCalculada`, `getFcMaximaComFallback`) e
  confirmar que nenhum recalcula por idade quando há valor gravado. Registrar no proposal
  - verify: lista com arquivo:linha no proposal; A1 marcada resolvida ou virada em risco
- [ ] **0.3** **Adiada (2026-11-04, arquivamento): falta só a confirmação do enum com um treinador.** Fechar Q3 (critério no proposal) e confirmar com treinador o enum `FonteLimiar` (A2)
  - verify: decisão registrada no proposal. **Bloqueia 1.1** (o CHECK da migration trava o enum)
  - estado (2026-11-03): enum fechado e aplicado na V107 (A2); Q3 fechada como **pré-pilot** (ambos
    registrados no proposal). **Pendente:** a confirmação do enum com um treinador — por isso segue `[ ]`

## 1. Backend — migration e montagem pura (D2, D3, D5)

- [x] **1.1** Migration `V107__add_fonte_limiar_atleta.sql`; enum `FonteLimiar`; campos em `Atleta` — [CA7]
  - Validação: `./mvnw clean compile` + `docker compose up -d` e conferir Flyway
- [x] **1.2** Extrair o montador do GET para função pura sobre record `AncorasZonas`; GET passa a
  usá-la sem mudar a resposta (testes atuais do GET verdes) + expor `fonteLimiar*` — [CA7]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesServiceImplTest`
- [x] **1.3** Parametrizado 150..720 s/km: ida e volta da âncora exata; bordas das zonas ±1 s do
  cálculo direto — [CA17]
  - Validação: `./mvnw test -Dtest=PaceLimiarQuantizacaoTest`

## 2. Backend — escrita, simulação, reenvio (D1, D2, D4, D6, D8)

- [x] **2.1** `AthleteZoneAnchorsInputDto` + validador único (limites = CHECKs de V6, pace 150–720;
  máxima informada ou **gravada** `≥ round(limiar × 1,06)`, estimada nunca bloqueia;
  `dataTeste` via `AtletaHojeResolver`, ao menos um grupo); testes: sem nascimento e sem máxima
  gravada (limiar 185 aceito), máxima 169 com limiar 168 (rejeitada), 178 (aceita) — [CA4]
  - Validação: `./mvnw test -Dtest=AthleteZoneAnchorsValidatorTest`
- [x] **2.2** `UPDATE` por grupo no `AtletaRepository` (`@Modifying`, filtrado por tenant); service
  `salvarAncoras` relê e devolve as zonas; máxima vazia não altera — [CA1, CA2, CA3]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesServiceImplTest`
- [x] **2.3** Service `simular` com o mesmo validador e a função pura — [CA5]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesServiceImplTest`
- [x] **2.4** Extrair `sincronizarFcBestEffort` para componente; evento + `@TransactionalEventListener(AFTER_COMMIT)`
  síncrono após o grupo `fc`, para atleta conectado; log estruturado por salvamento — [CA15]
  - Validação: `./mvnw test -Dtest='IntervalsIcuOAuthServiceImplTest,*FcSync*Test'` (nome do teste do componente novo)
- [x] **2.5** Controller: `PUT .../zonas/ancoras` e `POST .../zonas/simulacao`, mesmas regras de
  acesso do GET; OpenAPI com `@ApiResponse` correto — [CA6]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesControllerTest` (isolado)
- [x] **2.6** Teste do `IntervalsIcuFcAlvoResolver` antes/depois do cadastro do limiar, nos três
  formatos: zona, % e bpm literal no formato que `aplicarZona` grava — [CA14]
  - Validação: `./mvnw test -Dtest=IntervalsIcuFcAlvoResolverTest`
- [x] **2.7** Integração com PostgreSQL: limites dos CHECKs, simulação relida em transação separada,
  404 entre tenants (PUT e simulação), dois PUTs concorrentes em eixos diferentes — [CA4, CA5, CA6, CA18]
  - Validação: `./mvnw clean verify`
- [x] **2.8** PR do backend → `develop`; conferir no ambiente de testes com um atleta real
  - PR #209 mergeado em 2026-11-04. Conferência com atleta real no ambiente de testes não registrada (adiada).

## 3. Front — contrato e lógica (D7)

- [x] **3.1** Cliente curado: `salvarAncoras`, `simular`; tipos de entrada; `fonteLimiar*` no DTO
- [x] **3.2** Utilitários puros: `m:ss` ↔ segundos, validação local por eixo (limites do backend) — Vitest
- [x] **3.3** `useAthleteTrainingZones`: invalidação por `atletaId` entre instâncias + descarte de
  resposta ultrapassada — [CA16]
- [x] **3.4** Hook `useAthleteZoneAnchorsEditor` — estado, validação no blur, simulação com debounce
  300 ms e guarda de ordem, `salvar` com `loading`/`error`, invalidação após salvar — [CA11, CA12, CA16]
  - Validação: `npm run lint && npm run build && npm run test:run`

## 4. Front — UI (D7)

- [x] **4.1** `AthleteZonesDialog`: MUI `Tabs` FC/Ritmo, âncoras (máxima vazia com dica quando
  estimada), origem, prévia barra + tabela, aviso de alcance (texto exato em D7: "Os próximos planos
  usam estes valores. Treinos já criados com alvo em bpm ou ritmo fixo não mudam."), **mais, quando
  houver FC máxima informada, a ressalva: "Treinos com alvo em bpm acima da FC máxima informada deixam
  de ser enviados ao relógio."** (a máxima real vira o teto do push: `IntervalsIcuFcAlvoResolver`,
  coberto por `AntesEDepoisDoCadastro`; origem: ponytail-review do PR do backend, item 1),
  salvar com carregando, `fullScreen` abaixo de `sm` — [CA8, CA11, CA12]
- [x] **4.2** `AthleteZonesTable`: prop `onEditar`, "Editar zonas", FC estimada com selo + CTA,
  "Ritmo não cadastrado" abrindo na aba Ritmo, origem junto da data — [CA8, CA9, CA10]
- [x] **4.3** Ligar `onEditar` + diálogo só no `PlanoDetalhePanel`; `TreinoEditDialog`/`TreinoAddDialog`
  seguem só leitura e atualizam pela invalidação (D7) — [CA12, CA16]
  - Validação: `npm run lint && npm run build && npm run test:run`

## 5. E2E e entrega

- [x] **5.1** `tests/e2e/coach/zonas-cadastro.spec.ts`: cadastrar pace de limiar de atleta sem ritmo
  e editar FC; asserção no card após salvar — [CA13]. Pré-condição: seed de atleta do tenant de
  teste com plano em `AGUARDANDO_REVISAO` e `pace_limiar` nulo (reaproveitar o seed existente do E2E
  de revisão, se houver; senão criar via API no `beforeAll`)
  - Validação: `npm run test:e2e`
- [x] **5.2** Atualizar `openspec/specs/coach-athlete-zones/spec.md` com o delta desta change ao arquivar
- [x] **5.3** PR do front → `develop` — PR #182 mergeado em 2026-11-04

## Follow-ups do `/qa` do front (2026-11-03)

Não bloqueiam o PR; sem change própria ainda. **Adiados no arquivamento (2026-11-04).**

- [ ] **F1** Data "futura" validada com o dia do navegador (`zoneAnchors.ts`); o backend decide pelo fuso
  do atleta. Tornar a comparação informativa ou usar o dia do atleta
- [ ] **F2** Duplicações: `ROTULO_FONTE` (tabela) e `ORIGENS` (diálogo) são o mesmo mapa; extrair
  `CampoAncora` para os 7 campos repetidos; trocar o `JSON.stringify` do "alterado" por comparação
  por campo; imports `../../../` para `@/`
- [ ] **F3** Botão "Editar zonas" com `position: absolute` sobre o acordeão da tabela
