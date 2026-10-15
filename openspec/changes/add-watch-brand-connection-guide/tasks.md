# Tasks — add-watch-brand-connection-guide

Repos: `apps/menthoros-backend` (bloco 1), `apps/menthoros-front` (blocos 2–4), `menthoros-product`
(bloco 5). Validação padrão: backend `./mvnw clean test`; front `npm run lint && npm run build`
(+ `npm test` nos componentes tocados). Ordem de deploy: backend antes do front (design D5).

## 0. Gate — decisões do founder (sem código)

- [ ] 0.1 Decisão do founder: expor as quatro marcas novas no chip do onboarding já, ou só as do
      beta (COROS, Suunto)? Registrar no proposal (Premissa 1). O rótulo "Em validação" já está
      decidido (product review) — não reabrir.
      Verify: Premissa 1 marcada como decidida, com data.
- [ ] 0.2 Congelar o proxy da métrica: consulta em `tb_integracao_externa` ×
      `tb_perfil_onboarding_atleta` contando atletas conectados por marca e quantos têm
      `ultimo_push`, excluindo marcas `SEM_PUSH`/`VIA_APP_PARCEIRO`, com o N. Registrar no proposal.
      Verify: números, N e data no proposal.
- [ ] 0.3 Demanda real e registro de intervenções: (a) distribuição de marcas em
      `tb_perfil_onboarding_atleta.dispositivo_marca` e `tb_waitlist` (WatchBrand) — se zero
      não-Garmin nos primeiros clientes, **adiar a change** e registrar; (b) criar a planilha
      semanal de intervenções manuais por atleta beta (quem, marca, o que foi preciso fazer), com
      responsável nomeado — pré-requisito do deploy.
      Verify: distribuição e link da planilha no proposal; responsável nomeado.

## 1. Backend — enum e prior (design D1, D2)

- [ ] 1.1 `DispositivoMarca`: adicionar `HUAWEI`, `AMAZFIT`, `SAMSUNG`, `WAHOO` ao final; atualizar o
      Javadoc (a referência à "feature futura de capacidade por dispositivo" passa a apontar para
      esta change e para C3/C4 do levantamento). **Commit próprio, primeiro da branch, junto com
      1.2** (design D5: forward-only).
      Verify: `./mvnw clean test` verde; `@Schema(example)` dos DTOs de onboarding continua válido.
- [ ] 1.2 `FontePriority.PRIORIDADE_DISPOSITIVO`: mapear os quatro valores novos com prior **3**
      (design D2).
      Verify: teste parametrizado `FontePriorityTest` cobrindo os **dez** valores — nenhum retorna
      10, e os quatro novos retornam 3 (CA1).
- [ ] 1.3 IT de onboarding: parametrizar o caso existente de `POST`/`GET .../onboarding` com as
      quatro marcas novas (CA2).
      Verify: `./mvnw clean test` verde, incluindo `OnboardingControllerIT`.
- [ ] 1.4 Teste integrado score → tier → calibração (achado alto do Codex): atleta sem histórico,
      onboarding completo com FC máxima e pace limiar, `dispositivoMarca` em cada uma das quatro
      marcas novas → score 35, tier B, calibração iniciada no primeiro snapshot; controle com
      `GARMIN` → 50, tier A. Documenta no teste por que as novas ficam em 3.
      Verify: teste verde; o cenário fica como guarda para a promoção futura de Wahoo/Huawei a 2.

## 2. Front — tipos e matriz (design D3)

- [ ] 2.1 `types/Onboarding.ts`: ampliar a union `DispositivoMarca` e `DISPOSITIVO_MARCA_LABELS`
      (Huawei, Amazfit, Samsung Galaxy Watch, Wahoo). Adicionar `labelDispositivoMarca(valor: string)`
      com fallback para o valor cru (front em cache recebendo valor desconhecido).
      Verify: `npm run lint && npm run build`; `OnboardingPerfilStep` passa a exibir dez chips (teste
      de snapshot/contagem atualizado).
- [ ] 2.2 Criar `features/athlete/watchCompatibility.ts` com os tipos de D3 e as dez entradas da
      tabela de D3, em PT-BR, curtas, com `verificadoEm: '2026-10'`, `docOficialUrl` e `fontes`
      (URLs do levantamento; Garmin cita o gate de 2026-07-14). Rótulos: `SUPORTADO` só Garmin;
      `EM_VALIDACAO` com `criterioPromocao` para COROS/Suunto/Wahoo/Huawei.
      Verify: teste unitário garante (a) uma entrada por valor de `DispositivoMarca`, (b) APPLE e
      SAMSUNG com `posicionamento = COMPATIVEL_VIA_APP` e `appParceiro` não vazio, (c) POLAR com
      `push = SEM_PUSH`, (d) AMAZFIT cita "T-Rex 3 Pro" e "Balance 2" nos avisos, (e) só GARMIN é
      `SUPORTADO` e as quatro nativas têm `criterioPromocao`, (f) nenhum `resumoParaCoach` contém
      "automaticamente" sem a condição "se o atleta" (CA5, CA6).

## 3. Front — perfil do atleta (design D4)

- [ ] 3.1 Hook `useAthleteWatchBrand()` (ou reuso de `useOnboarding` sem `atletaId`) que devolve
      `{ marca, modelo, loading }` a partir de `GET .../onboarding`; `marca = undefined` em 404 ou
      `dispositivoMarca` nulo.
      Verify: teste do hook com os três casos (perfil com marca, perfil sem marca, 404).
- [ ] 3.2 Componente `WatchConnectionGuide({ marcaAtual?, conectado, modoLeitura? })`: acordeão
      com as dez marcas, a atual aberta no topo com chip de posicionamento (e, em `EM_VALIDACAO`,
      a frase "estamos validando com atletas; se o treino não chegar, avise seu treinador"),
      passos numerados, avisos em `Alert`, link da doc oficial, links do app parceiro, linha
      "Informações de <verificadoEm>"; demais fechadas sob "Outro relógio?". Sem `marcaAtual`:
      todas fechadas + dica "Informe seu relógio no onboarding". `modoLeitura` (coach) esconde
      qualquer ação. Responsivo (dialogs/cards se ajustam a telas menores — regra do workspace).
      Verify: testes de componente cobrindo CA3, CA4 e CA5 (texto exato dos rótulos).
- [ ] 3.3 Integrar no `IntervalsIcuConnectionCard`: botão "Conectar" **acima** do guia; frase de
      contexto muda por `conectado`; nenhum comportamento existente de conectar/desconectar/callback
      alterado.
      Verify: testes existentes do card verdes sem mudança de asserção de comportamento (CA8) +
      novo teste com a marca mockada em COROS.

## 4. Front — treinador (design D6) e chip

- [ ] 4.1 `CoachAthleteProfilePage`: buscar o perfil de onboarding do atleta (`useOnboarding(atletaId)`
      ou serviço direto) e renderizar a linha "Relógio: <marca> · <modelo> · <resumoParaCoach>" no
      cabeçalho (condicional, com "não verificado automaticamente" e "informada no onboarding, não
      confirmada"), chip de posicionamento e `avisos` de formato (COROS: um tipo de alvo por
      treino; Suunto: sem etapa por distância); `Alert` info para `SO_TREINO_REALIZADO`,
      `COMPATIVEL_VIA_APP`, `PARCIAL_POR_MODELO`; "Relógio não informado" sem perfil (CA6).
      Verify: teste da página com os casos POLAR, GARMIN e sem perfil.
- [ ] 4.1b `CoachAthleteProfilePage`: link "O que pedir ao atleta" abre o `WatchConnectionGuide`
      da marca em `modoLeitura` (dialog responsivo), sem botão de conectar.
      Verify: teste da página — clique abre o guia da marca certa; sem perfil, o link não aparece.
- [ ] 4.2 `SyncStatusChip`: tooltip de sucesso → "Enviado ao intervals.icu" (CA7).
      Verify: `SyncStatusChip.test.tsx` atualizado e verde.
- [ ] 4.3 `npm run lint && npm run build && npm test` no front inteiro.
      Verify: tudo verde; sem `any`, sem lógica de negócio no componente (matriz e hook fora dele).

## 5. Produto e docs (`menthoros-product`)

- [ ] 5.1 Promover `specs/watch-connection-guide/spec.md` (delta desta change) para
      `openspec/specs/watch-connection-guide/spec.md` no `/done`.
      Verify: spec canônica existe e cita o `verificadoEm` da matriz.
- [ ] 5.2 Dono da revisão do conteúdo: criar na seção "🧹 Governança" do Kanban
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

## Fora desta change (registrado para o próximo `/change`)

C3 `status-conexao-relogio`, C4 `push-compat-por-canal`, C5 `ingestao-sem-laps-fallback`,
C6 `reconciliacao-orfaos-por-canal`, unificação `WatchBrand`/`DispositivoMarca`,
`add-onboarding-watch-fit-hint` (linha informativa na etapa 1 do onboarding para
Polar/Apple/Samsung/Amazfit — decidido fora, pós-pilot), `add-athlete-watch-update` (atleta
atualiza marca/modelo após o onboarding; `salvarRascunho` já aceita), evento "guia aberto →
conectou".
