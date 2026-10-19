# Tasks — add-watch-brand-connection-guide

Repos: `apps/menthoros-backend` (bloco 1), `apps/menthoros-front` (blocos 2–4), `menthoros-product`
(bloco 5). Validação padrão: backend `./mvnw clean verify` (o gate — `test` não roda os `*IT`); front
`npm run lint && npm run build` (+ `npm test` nos componentes tocados). Ordem de deploy: backend antes do front (design D5).

## 0. Gate — decisões do founder (sem código)

- [x] 0.1 Decisão do founder: expor as duas marcas novas (Amazfit, Samsung) no chip do onboarding
      já? Registrar no proposal (Premissa 1). O rótulo "Em validação", a **ordem por marca**
      (Garmin → Apple → Amazfit → COROS → Samsung → Polar) e a exclusão de Huawei/Suunto/Wahoo
      já estão decididos — não reabrir.
      Verify: Premissa 1 marcada como decidida, com data.
- [ ] 0.2 **ADIADA (2026-10-19):** Fora do código: o proxy da métrica é consulta de produto e só faz sentido com atletas beta conectados. Congelar antes do primeiro gate manual.
      Congelar o proxy da métrica: consulta em `tb_integracao_externa` ×
      `tb_perfil_onboarding_atleta` × `tb_treino_planejado` contando atletas conectados por marca e
      quantos têm ao menos um treino planejado com `sincronizado_em IS NOT NULL` nos 7 dias após
      `tb_integracao_externa.criado_em` (não existe `conectado_em`; o `conectadoEm` do DTO deriva
      de `criado_em` — a janela começa na criação da integração), excluindo marcas `SEM_PUSH`/`VIA_APP_PARCEIRO`, com o N. **Não usar
      `ultima_sincronizacao`** (webhook e pull também gravam; não distingue push). Registrar no proposal.
      Verify: números, N e data no proposal; a consulta cita `tb_treino_planejado.sincronizado_em`.
- [ ] 0.3 **ADIADA (2026-10-19):** Fora do código: depende de base real de atletas por marca e de um responsável nomeado pelo founder. Pré-requisito do deploy para clientes, não do merge.
      Demanda real e registro de intervenções: (a) distribuição de marcas em
      `tb_perfil_onboarding_atleta.dispositivo_marca` e `tb_waitlist` (WatchBrand) — se zero
      não-Garmin nos primeiros clientes, **adiar a change** e registrar; (b) criar a planilha
      semanal de intervenções manuais por atleta beta (quem, marca, o que foi preciso fazer), com
      responsável nomeado — pré-requisito do deploy.
      Verify: distribuição e link da planilha no proposal; responsável nomeado.

## 1. Backend — enum, prior, validação e perfil do coach (design D1, D2, D6, D7)

Ordem: 1.1 + 1.2 no primeiro commit (forward-only, D5); depois 1.5, 1.6, 1.3, 1.4.

- [x] 1.1 `DispositivoMarca`: adicionar `AMAZFIT` e `SAMSUNG` ao final; atualizar o
      Javadoc (a referência à "feature futura de capacidade por dispositivo" passa a apontar para
      esta change e para C3/C4 do levantamento). **Commit próprio, primeiro da branch, junto com
      1.2** (design D5: forward-only).
      Verify: `./mvnw clean verify` verde; `@Schema(example)` dos DTOs de onboarding continua válido.
- [x] 1.2 Prior no enum (design D2 revisado): `DispositivoMarca` ganha construtor com `prior` e
      método `prior()` (GARMIN 1; COROS, POLAR, SUUNTO 2; APPLE, AMAZFIT, SAMSUNG 3; OUTRO 4);
      `ConfidenceScorerImpl.pontuarFonteConfiavel` passa a ler `marca.prior()`; remover
      `FontePriority.PRIORIDADE_DISPOSITIVO` e `deDispositivo` e ajustar o Javadoc de
      `FontePriority`. Mesmo commit forward-only da 1.1.
      Verify: **criar** `DispositivoMarcaTest` parametrizado (`@EnumSource`) nos **oito** valores
      com o prior esperado; `ConfidenceScorerTest` continua verde (GARMIN 15, OUTRO 0) e ganha os
      casos APPLE/AMAZFIT/SAMSUNG = 0 (CA1).
- [x] 1.3 IT de onboarding: **criar** `OnboardingControllerIT` (não existe; o
      `OnboardingControllerTest` atual é slice com service e mapper mockados, não prova persistência)
      com `POST` → `GET .../onboarding` parametrizado nas duas marcas novas, autenticado com o
      post-processor `jwt()` e subject UUID (regra do `CLAUDE.md` do backend) (CA2).
      Verify: `./mvnw clean verify` verde, incluindo o `OnboardingControllerIT` novo.
- [x] 1.5 `@NotNull` em `AtletaOnboardingInputDto.dispositivoMarca` (design D7) + revalidação em
      `OnboardingServiceImpl.salvarRascunho` (`InvalidArgumentException`/`DomainRuleViolationException`
      conforme o padrão do service).
      Verify: `OnboardingControllerTest` — `POST` sem marca → 400 com o campo na resposta;
      `OnboardingServiceTest` — service rejeita marca nula; `AthleteOnboardingPage.isValid` já exige
      a marca na etapa 1, então nenhum teste do front muda (CA2).
- [x] 1.6 `AtletaPerfilCoachOutputDto.relogio` (design D6 revisado): record aninhado
      `RelogioDto(DispositivoMarca marca, String modelo)` com `@Schema`; em
      `CoachAthleteProfileServiceImpl.buscarPerfil`, `buscarNullable("relogio", avisos, …)` lendo
      `PerfilOnboardingAtletaRepository.findByAtletaIdAndTenantId` (injetar o repository); nulo sem
      aviso quando não há perfil **ou quando `dispositivoMarca` é nulo** (perfil pré-D7; modelo sem
      marca não é devolvido). Espelhar em `front/types/AtletaPerfilCoach.ts` (`relogio?:
      { marca: string; modelo: string | null } | null`) — `src/api` é curado à mão, não regenerar.
      Verify: `CoachAthleteProfileServiceImplTest` — com perfil (marca+modelo), sem perfil (nulo,
      `avisos` sem "relogio"), perfil com marca nula (nulo, sem aviso), repository lança (nulo, `avisos` contém "relogio");
      `./mvnw clean verify` verde (CA6).
- [x] 1.4 Teste integrado score → tier → calibração (achado alto do Codex): atleta sem histórico,
      onboarding completo com FC máxima e pace limiar, `dispositivoMarca` em cada uma das duas
      marcas novas, **`preenchidoPorCoach = true`** (é esse bônus que promove um tier: A ≥ 75,
      B ≥ 45) → score 35, tier C→B, calibração iniciada no primeiro snapshot; controle com `GARMIN`
      e o mesmo bônus → 50, tier B→A, calibração **não** iniciada. Segundo controle sem o bônus:
      GARMIN 50 → B, calibração iniciada. Documenta no teste por que as novas ficam em 3.
      Verify: teste verde; o cenário fica como guarda para qualquer promoção futura a 2.

## 2. Front — tipos e matriz (design D3)

- [x] 2.1 `types/Onboarding.ts`: ampliar a union `DispositivoMarca` e `DISPOSITIVO_MARCA_LABELS`
      (Amazfit, Samsung Galaxy Watch), **na ordem de prioridade do founder**
      (`Object.keys` do objeto de labels é o que ordena os chips do onboarding). Adicionar `labelDispositivoMarca(valor: string)`
      com fallback para o valor cru (front em cache recebendo valor desconhecido).
      Verify: `npm run lint && npm run build`; `OnboardingPerfilStep` passa a exibir **oito** chips
      na ordem Garmin, Apple, Amazfit, COROS, Samsung, Polar, Suunto, Outro (teste de contagem e
      ordem atualizado); teste unitário de `labelDispositivoMarca` com valor conhecido e desconhecido.
- [x] 2.2 Criar `features/athlete/watchCompatibility.ts` com os tipos de D3 e as oito entradas da
      tabela de D3, em PT-BR, curtas, com `verificadoEm: '2026-10'`, `docOficialUrl` e `fontes`
      (URLs do levantamento; Garmin cita o gate de 2026-07-14). Rótulos: `SUPORTADO` só Garmin;
      `EM_VALIDACAO` com `criterioPromocao` para COROS; `NAO_COBERTO` para Suunto e Outro.
      Verify: teste unitário garante (a) uma entrada por valor de `DispositivoMarca`, (b) APPLE e
      SAMSUNG com `posicionamento = COMPATIVEL_VIA_APP` e `appParceiro` não vazio, (c) POLAR com
      `push = SEM_PUSH`, (d) AMAZFIT cita "T-Rex 3 Pro" e "Balance 2" nos avisos, (e) só GARMIN é
      `SUPORTADO` e COROS tem `criterioPromocao`, (f) nenhum `resumoParaCoach` contém
      "automaticamente" sem a condição "se o atleta", (g) a ordem do array é Garmin, Apple,
      Amazfit, COROS, Samsung, Polar, Suunto, Outro, e "Outro" cita Xiaomi (CA5, CA6).

## 3. Front — perfil do atleta (design D4)

- [x] 3.1 Hook novo e enxuto `useAthleteWatchBrand(atletaId?)` que devolve
      `{ marca, modelo, loading, error }` a partir de `OnboardingService.buscarRascunho` (busca no
      mount; reseta ao trocar de atleta). **Não reusar `useOnboarding`**: ele não busca no mount,
      expõe dez membros de edição e retém o perfil anterior quando a resposta vem vazia. Sem perfil
      o endpoint devolve **204** (corpo vazio → `undefined` no service), não 404: `marca = undefined`
      em 204 ou `dispositivoMarca` nulo; erro de rede vai para `error`, separado.
      Verify: teste do hook com quatro casos (perfil com marca, perfil sem marca, 204, erro) e
      troca de atleta populado → vazio limpa a marca.
- [x] 3.2 Componente `WatchConnectionGuide({ marcaAtual?, conectado, modoLeitura? })`: acordeão
      com as oito marcas, a atual aberta no topo com chip de posicionamento (e, em `EM_VALIDACAO`,
      a frase "estamos validando com atletas; se o treino não chegar, avise seu treinador"),
      passos numerados, avisos em `Alert`, link da doc oficial, links do app parceiro, linha
      "Informações de <verificadoEm>"; demais fechadas sob "Outro relógio?". Sem `marcaAtual`:
      todas fechadas + dica "Informe seu relógio no onboarding". `modoLeitura` (coach) esconde
      qualquer ação. Responsivo (dialogs/cards se ajustam a telas menores — regra do workspace).
      Verify: testes de componente cobrindo CA3, CA4 e CA5 (texto exato dos rótulos).
- [x] 3.3 Integrar no `IntervalsIcuConnectionCard`: botão "Conectar" **acima** do guia; frase de
      contexto muda por `conectado`; nenhum comportamento existente de conectar/desconectar/callback
      alterado.
      Verify: testes existentes do card verdes sem mudança de asserção de comportamento (CA8) +
      novo teste com a marca mockada em COROS.

## 4. Front — treinador (design D6) e chip

- [x] 4.1 `CoachAthleteProfilePage`: ler `profile.relogio` do `useAthleteProfile` já existente
      (design D6 revisado — **sem hook novo, sem request novo**; o `STUB_PROFILE` do teste da página
      ganha o campo) e renderizar a linha "Relógio: <marca> · <modelo> · <resumoParaCoach>" no
      cabeçalho (condicional, com "não verificado automaticamente" e "informada no onboarding, não
      confirmada"), chip de posicionamento e `avisos` de formato (COROS: um tipo de alvo por
      treino); `Alert` info para `SO_TREINO_REALIZADO`,
      `COMPATIVEL_VIA_APP`, `PARCIAL_POR_MODELO`; "Relógio não informado" sem perfil (CA6).
      Verify: teste da página com os casos POLAR, GARMIN, `relogio` nulo e `avisos` contendo
      "relogio" (linha mostra "Relógio indisponível", não "não informado").
- [x] 4.1b `CoachAthleteProfilePage`: link "O que pedir ao atleta" abre o `WatchConnectionGuide`
      da marca em `modoLeitura` (dialog responsivo), sem botão de conectar.
      Verify: teste da página — clique abre o guia da marca certa; sem perfil, o link não aparece.
- [x] 4.2 `SyncStatusChip` (design D8): rótulo de sucesso "No relógio" → **"No intervals.icu"** e
      tooltip → "Enviado ao intervals.icu"; atualizar o Javadoc do componente e o comentário em
      `types/AtletaPerfilCoach.ts:49` (CA7).
      Verify: `SyncStatusChip.test.tsx` — matriz de rótulos e asserção de tooltip atualizadas;
      nenhum texto com "Garmin" ou "relógio" no caminho de sucesso.
- [x] 4.3 `npm run lint && npm run build && npm test` no front inteiro.
      Verify: tudo verde; sem `any`, sem lógica de negócio no componente (matriz e hook fora dele).

## 5. Produto e docs (`menthoros-product`)

- [x] 5.1 Promover `specs/watch-connection-guide/spec.md` (delta desta change) para
      `openspec/specs/watch-connection-guide/spec.md` no `/done`.
      Verify: spec canônica existe e cita o `verificadoEm` da matriz.
- [ ] 5.2 **ADIADA (2026-10-19):** Item do Kanban (`menthoros-brain`), com dono e data a definir pelo founder; fica como governança, não como código desta change.
      Dono da revisão do conteúdo: criar na seção "🧹 Governança" do Kanban
      (`menthoros-brain/10-Product/Kanban - Menthoros.md`) um item recorrente "Revisar
      `watchCompatibility.ts` (`verificadoEm` > 6 meses → reverificar nas fontes; promover
      `EM_VALIDACAO` → `SUPORTADO` quando o gate fechar)", com responsável e próxima data
      (2027-04). Opcionalmente a linha no `CLAUDE.md` da raiz (PR no `menthoros-infra`), mas o
      item com dono é o obrigatório.
      Verify: item no Kanban com nome e data.
- [x] 5.3 Atualizar o levantamento (`knowledge/engineering/levantamento-expansao-relogios-intervals-icu.md`):
      marcar C1+C2 como "→ `add-watch-brand-connection-guide`" e corrigir a premissa de que a marca
      não era persistida.
      Verify: seção 5 do levantamento aponta para a change.

## Ordem do beta e dos gates manuais (seção 6 do levantamento)

Segue a ordem de prioridade do founder, não a facilidade técnica: **Apple Watch** (Companion +
Watchletic) → **Amazfit** (um modelo com push e um sem) → **COROS** → **Samsung** (Health Sync +
Watchletic Wear OS) → **Polar** (só ingestão). Garmin já validado (2026-07-14). Huawei, Suunto
e Wahoo: sem gate nesta change (decisão do founder, 2026-10-15). Cada gate fechado promove a entrada na matriz (`verificadoEm`, rótulo).

## Fora desta change (registrado para o próximo `/change`)

C3 `status-conexao-relogio`, C4 `push-compat-por-canal`, C5 `ingestao-sem-laps-fallback`,
C6 `reconciliacao-orfaos-por-canal`, **Huawei, Suunto e Wahoo** (enum + guia + gate, quando houver
demanda medida), unificação `WatchBrand`/`DispositivoMarca`,
`add-onboarding-watch-fit-hint` (linha informativa na etapa 1 do onboarding para
Polar/Apple/Samsung/Amazfit — decidido fora, pós-pilot), `add-athlete-watch-update` (atleta
atualiza marca/modelo após o onboarding; `salvarRascunho` já aceita), evento "guia aberto →
conectou".

## Resultado (2026-10-19)

**Entregue:** backend #186 (1.6), #187 (1.1–1.5); front #157 (3.x, 4.2), #158 (4.1, 4.1b), #159 (2.1, 2.2);
docs `menthoros-docs` #2 (manuais). 0.1 decidida: Amazfit e Samsung expostos no chip (2026-10-19).

**Adiado, com motivo:** 0.2 e 0.3 (gate de produto/medição) e 5.2 (item do Kanban) — ver cada task.
Gate manual por marca (seção 6 do levantamento): nenhum fechado além do Garmin; COROS segue
`EM_VALIDACAO`. Follow-up registrado: o `GlobalExceptionHandler` não devolve `fields` em
`MethodArgumentNotValidException` com `problemdetails.enabled=true` (anterior a esta change).
