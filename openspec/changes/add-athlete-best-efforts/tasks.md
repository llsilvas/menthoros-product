# tasks — add-athlete-best-efforts

Dois repositórios: `apps/menthoros-backend` e `apps/menthoros-front`, branches
`feature/add-athlete-best-efforts` em cada um.

## 1. Backend — client HTTP e serviço compartilhado

- [x] 1.1 **Feito (2026-09-18).** Validado contra a conta de teste (Leandro): `ACTIVITY:READ`
      cobre `pace-curves` (Bearer funcionou); `DataCurve` tem pontos exatos (desvio 0,00%) nas 7
      distâncias-alvo — tolerância ajustada pra 1% (design.md §5). Achado operacional (sem impacto
      no código): um script `urllib` avulso sem `User-Agent` nenhum bateu no bot-protection do
      Cloudflare do intervals.icu (403, "error code: 1010") — não é falha de auth, e não afeta
      `IntervalsIcuClientImpl` (mesmo `WebClient`/Reactor Netty já usado pelos outros métodos em
      produção, sem esse problema).
- [x] 1.2 **Feito.** `IcuPaceCurveDto` (`dto/intervalsicu/`) — mapeia só
      `list[].distance`/`list[].values`.
- [x] 1.3 **Feito** (2 testes, `IntervalsIcuClientImplTest$BuscarPaceCurves`, WireMock). GET com
      Bearer, query `type=Run&curves=42d`, desserializa; erro HTTP → `IntervalsIcuApiException`.
- [x] 1.4 **Feito.** `IntervalsIcuClientImpl.buscarPaceCurves` — mesmo estilo de `listarAtividades`.
      *verify:* 32/32 em `IntervalsIcuClientImplTest`.
- [x] 1.5 **Feito.** `MelhorEsforcoDto` (`dto/output/`) — record compartilhado (design.md §1).
- [x] 1.6 **Feito.** Teste (CA1): curve com pontos exatos nas 3 distâncias testadas (400m/800m/5k)
      → 3 `MelhorEsforcoDto` com tempo/pace corretos.
- [x] 1.7 **Feito.** Teste (CA2): atleta sem `IntegracaoExterna` ativa → lista vazia, sem chamada
      ao client (`verify(..., never())`).
- [x] 1.8 **Feito.** Teste (CA3): distância a 6% do alvo (fora da tolerância de 1%) não entra na
      lista.
- [x] 1.9 **Feito.** `MelhorEsforcoServiceImpl` — algoritmo de extração (design.md §5). Formatação
      de pace implementada direto (aritmética inteira em segundos), não reaproveitando
      `ThresholdInferenceService.formatarPace` como o design.md sugeria — esse usa `BigDecimal` de
      minutos decimais, com round-trip double→BigDecimal desnecessário para este caso; mesmo
      formato de saída (`mm:ss/km`). **Cache implementado com `@Cacheable` no `CacheManager`
      compartilhado** (`CacheConfig`) em vez de um Caffeine dedicado — TTL 30min (default do
      manager) em vez dos 5min originalmente cogitados; design.md §6 atualizado com a decisão real.
      *verify:* 4/4 em `MelhorEsforcoServiceImplTest`; `./mvnw clean test` → 3734/3734, 0 falhas.

## 2. Backend — perfil do coach

- [x] 2.1 **Feito.** Teste (CA1): `melhoresEsforcosPreenchidoQuandoAtletaConectado` — atleta
      conectado com dados → `melhoresEsforcos` preenchido.
- [x] 2.2 **Feito.** Teste (CA5): `melhoresEsforcosFalhaNaoQuebraPerfil` — serviço lança →
      `avisos` inclui `"melhoresEsforcos"`, resto do perfil carrega normal.
- [x] 2.3 **Feito.** `AtletaPerfilCoachOutputDto` ganha o campo `melhoresEsforcos`; wiring em
      `buscarPerfil` via `buscarLista`, janela fixa `42d`.
      *verify:* 26/26 em `CoachAthleteProfileServiceImplTest`.
- [x] 2.4 **Feito.** `@Schema` no campo novo do DTO.
- [x] 2.5 **Feito.** Contador Micrometer `melhores_esforcos.perfil.exibido` (tag
      `preenchido=true|false`), incrementado em `buscarPerfil` — cobrado pelos mesmos 2 testes de
      2.1/2.2 (verificam a contagem via `SimpleMeterRegistry`).
      **Efeito colateral necessário:** `CoachAthleteProfileServiceImplTest` trocou `@InjectMocks`
      por construção manual do service (padrão já usado em outros testes com `MeterRegistry` real —
      `AtletaWorkoutAnalysisServiceImplTest`, `AtletaTreinoFeedbackServiceImplTest` — porque um
      `SimpleMeterRegistry` real não é um `@Mock`, e `@InjectMocks` só resolve campos mockados).
      *verify:* `./mvnw clean test` → 3736/3736, 0 falhas.

## 3. Backend — endpoint do atleta

- [x] 3.1 **Feito** (`MelhorEsforcoServiceImplTest$BuscarParaAtleta`). Teste (CA2): atleta sem
      integração → `integracaoConectada=false`, `marcas=[]`, sem chamar o client.
- [x] 3.2 **Feito.** Teste (CA3): atleta conectado sem dados suficientes na janela →
      `integracaoConectada=true`, `marcas=[]`.
- [x] 3.3 **Feito** (`AtletaTreinoControllerTest$GetMelhoresEsforcos`, 5 testes). Chamada ao
      intervals.icu falha → `502` com corpo padrão (novo `@ExceptionHandler(IntervalsIcuApiException
      .class)` em `GlobalExceptionHandler` — não existia antes, essa exceção só era usada em
      caminhos assíncronos/best-effort até agora).
- [x] 3.4 **Feito.** `MelhoresEsforcosOutputDto` (dto/output/) +
      `MelhorEsforcoService.buscarParaAtleta` (novo método, cache próprio
      `melhores-esforcos-atleta` — key format diferente do `buscar` usado pelo coach, sem colisão)
      + `GET /api/v1/atletas/me/melhores-esforcos?janela=` em `AtletaTreinoController`.
      *verify:* 7/7 em `MelhorEsforcoServiceImplTest`, 31/31 em `AtletaTreinoControllerTest`.
- [x] 3.5 **Feito.** `@Operation`/`@ApiResponses`/`@Tag` (reaproveita o `@Tag` já existente do
      controller, `atleta-treinos`).
      **Efeito colateral:** `AtletaWorkoutAnalysisControllerTest` (outra slice `@WebMvcTest` do
      mesmo `AtletaTreinoController`) quebrou por faltar o `@MockitoBean` novo — corrigido.
      *verify:* `./mvnw clean verify` → 3744 testes unitários + 190 IT, 0 falhas.

## 4. Frontend — perfil do coach

- [x] 4.1 **Feito.** `MelhorEsforcoDto` + campo `melhoresEsforcos: MelhorEsforcoDto[]` em
      `AtletaPerfilCoachDto` (`src/types/AtletaPerfilCoach.ts`) — nenhum service novo (o
      `CoachAthleteProfileService.getProfile` já retorna o DTO inteiro).
- [x] 4.2 **Feito** (2 testes). `MelhoresEsforcosPanel.test.tsx` — estado vazio + renderização de
      distância/tempo formatado (`mm:ss`/`h:mm:ss`)/pace.
      **Correção de premissa:** `CoachAthleteProfilePage.tsx` **não usa `DiagnosisTabPanel`** (são
      duas telas distintas) e **não tem abas** — é um `Grid` de `SectionCard`s. `recordes` nunca
      teve UI própria (só DTO). Encaixe real: novo `<SectionCard title="Melhores esforços">` no
      grid principal, ao lado de "Treinos recentes"/"Provas".
- [x] 4.3 **Feito.** `MelhoresEsforcosPanel.tsx` (mesmo padrão de `RecentSignalsPanel.tsx`) +
      integração em `CoachAthleteProfilePage.tsx`. 3 fixtures de teste (`CoachAthleteProfilePage
      .test.tsx`, `CoachInboxPage.test.tsx`, `useAthleteProfile.test.ts`) ganharam
      `melhoresEsforcos: []` — o campo é obrigatório no tipo, `npm run build` achou os 3 pontos.
      *verify:* `npm run lint && npm run build` limpos; `npm run test:run` → 191 arquivos / 1572
      testes, 0 falhas.

## 5. Frontend — tela do atleta

- [ ] 5.1 Cliente da API: tipo + função pro endpoint `/atletas/me/melhores-esforcos`.
- [ ] 5.2 Teste que falha: componente `MelhoresEsforcosCard` — 3 estados (carregando, sem
      integração/CTA, lista de marcas).
- [ ] 5.3 Teste que falha (CA4): trocar o seletor de janela dispara nova chamada com a janela certa.
- [ ] 5.4 Teste que falha (CA5): erro na chamada mostra estado de erro localizado à seção, com botão
      de tentar de novo.
- [ ] 5.5 Implementação do componente + encaixe na tela de Progresso do atleta (escolher o ponto
      exato ao ver o layout atual).
      *verify:* os testes de 5.2–5.4 passam; `npm run lint && npm run build`.

## 6. Validação e fechamento

- [ ] 6.1 Backend: `./mvnw clean verify` verde.
- [ ] 6.2 Frontend: `npm run lint && npm run build && npm run test:run` verdes.
- [ ] 6.3 Smoke manual em `develop` com a conta do Leandro: perfil do coach mostra os mesmos valores
      da tela de Progresso do atleta, e ambos batem com o que aparece direto no intervals.icu
      (janela 42 dias).
- [ ] 6.4 PR backend `feature/add-athlete-best-efforts` → `develop`.
- [ ] 6.5 PR front `feature/add-athlete-best-efforts` → `develop`.
- [ ] 6.6 Registrar em `SPRINTS.md` a change de sequência `use-best-effort-for-threshold-inference`
      (D5 do proposal) como candidata a próxima, depois desta em produção.
