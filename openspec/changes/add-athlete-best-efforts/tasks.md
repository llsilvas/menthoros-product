# tasks — add-athlete-best-efforts

Dois repositórios: `apps/menthoros-backend` e `apps/menthoros-front`, branches
`feature/add-athlete-best-efforts` em cada um.

## 1. Backend — client HTTP e serviço compartilhado

- [x] 1.1 **Feito (2026-09-18).** Validado contra a conta de teste (Leandro): `ACTIVITY:READ`
      cobre `pace-curves` (Bearer funcionou); `DataCurve` tem pontos exatos (desvio 0,00%) nas 7
      distâncias-alvo — tolerância ajustada pra 1% (design.md §5). Achado operacional: chamadas
      sem User-Agent de navegador batem no bot-protection do Cloudflare do intervals.icu (403,
      "error code: 1010") — não é falha de auth. `IntervalsIcuClientImpl` já roda sobre
      `WebClient`, que manda um `User-Agent` padrão sensato; confirmar em 1.4 que isso não repete
      (se repetir, setar `User-Agent` explícito no `WebClient` da integração).
- [ ] 1.2 `IcuPaceCurveDto` (`dto/intervalsicu/`) — mapeia só `list[].distance`/`list[].values`.
- [ ] 1.3 Teste (WireMock): `IntervalsIcuClient.buscarPaceCurves` — GET com Bearer, query
      `type=Run&curves=42d`, desserializa a resposta.
- [ ] 1.4 `IntervalsIcuClientImpl.buscarPaceCurves` — implementação, mesmo estilo de
      `listarAtividades`.
- [ ] 1.5 `MelhorEsforcoDto` (`dto/output/`) — record compartilhado (design.md §1).
- [ ] 1.6 Teste que falha: `MelhorEsforcoServiceImpl.buscar(atletaId, janela)` — curve com pontos
      próximos dos 7 alvos → 7 `MelhorEsforcoDto` com tempo/pace corretos.
- [ ] 1.7 Teste que falha: atleta sem `IntegracaoExterna` ativa → lista vazia, sem chamada ao
      client.
- [ ] 1.8 Teste que falha: curve sem ponto dentro da tolerância pra alguma distância → essa
      distância não aparece na lista.
- [ ] 1.9 `MelhorEsforcoServiceImpl` — algoritmo de extração (design.md §5), cache (design.md §6).
      *verify:* os 3 testes (1.6–1.8) passam.

## 2. Backend — perfil do coach

- [ ] 2.1 Teste que falha (CA1): `CoachAthleteProfileServiceImpl.buscarPerfil` — atleta conectado
      com dados → `melhoresEsforcos` preenchido.
- [ ] 2.2 Teste que falha (CA5): `MelhorEsforcoServiceImpl.buscar` lança → `avisos` inclui
      `"melhoresEsforcos"`, resto do perfil carrega normal (mesmo padrão de `recordes`).
- [ ] 2.3 `AtletaPerfilCoachOutputDto` ganha o campo `melhoresEsforcos`; wiring em
      `CoachAthleteProfileServiceImpl.buscarPerfil` via `buscarLista`, janela fixa `42d`.
      *verify:* os 2 testes (2.1–2.2) passam.
- [ ] 2.4 `@Schema` no campo novo do DTO (convenção do `CLAUDE.md` do backend).
- [ ] 2.5 Teste que falha: `buscarPerfil` incrementa o contador Micrometer
      `melhores_esforcos.perfil.exibido` com tag `preenchido=true` quando `melhoresEsforcos` não é
      vazio, `preenchido=false` quando é vazio (instrumentação da métrica de sucesso, proposal.md).
      Implementação junto (mesmo padrão de métrica já usado no módulo — ver
      "External Call Resilience" no `CLAUDE.md` do backend).
      *verify:* o teste passa.

## 3. Backend — endpoint do atleta

- [ ] 3.1 Teste que falha (CA2): atleta sem integração → `integracaoConectada=false`, `marcas=[]`,
      `200`.
- [ ] 3.2 Teste que falha (CA3): atleta conectado sem dados suficientes na janela → lista parcial,
      sem 500.
- [ ] 3.3 Teste que falha: chamada ao intervals.icu falha → `502` com corpo padrão.
- [ ] 3.4 `MelhoresEsforcosOutputDto` + controller `GET /api/v1/atletas/me/melhores-esforcos?janela=`.
      *verify:* os 3 testes (3.1–3.3) passam.
- [ ] 3.5 `@Operation`/`@ApiResponses`/`@Tag` no controller (convenção do `CLAUDE.md` do backend).

## 4. Frontend — perfil do coach

- [ ] 4.1 Cliente da API (`src/api` curado — **NÃO** rodar `generate:api`, ver memória do projeto):
      tipo pro campo novo `melhoresEsforcos` do perfil.
- [ ] 4.2 Teste que falha: seção "Melhores Esforços" renderiza em `CoachAthleteProfilePage`
      (provável `DiagnosisTabPanel.tsx` — confirmar ao ver o layout; `recordes` NÃO está
      renderizado em nenhum lugar hoje, é DTO sem UI, então não há precedente visual pra copiar).
- [ ] 4.3 Implementação. *verify:* teste de 4.2 passa; `npm run lint && npm run build`.

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
