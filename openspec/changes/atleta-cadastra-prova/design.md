# Design — atleta-cadastra-prova

Motivação em `proposal.md`. Requisitos nas specs `prova-preparacao-minima`, `prova-atencao-coach`
e no delta de `prova-crud`. Telas no [canvas "Provas do Atleta"](https://claude.ai/code/artifact/98c34b33-9ad1-4dca-83a2-53a8733eb81a).

## Context

Estado atual que condiciona o desenho (levantado em 2026-09-02):

- `Prova` já tem `provaAlvo`, `statusProva`, `distancia` (enum `DistanciaProva` com só 5/10/21/42,
  persistido por **ordinal** em `smallint`), `distanciaKm`,
  `semanasPreparacao` e `inicioPreparacao`. Os dois últimos são persistidos e expostos em
  `ProvaInputDto`/`ProvaOutputDto`, mas nada os lê.
- `ProvaController` (`/api/v1/atletas/{atletaId}/provas`): `POST`/`PUT` exigem `TECNICO`/`ADMIN`,
  `DELETE` exige `ADMIN`, e os dois `GET` não têm `@PreAuthorize` nem `@RequireTenant` — a única
  proteção é o filtro de tenant em `ProvaServiceImpl.resolveAtleta`.
- `ProvaRepository` filtra `statusProva != CANCELADA` em todas as queries;
  `findByAtletaAndProvaAlvoTrue` devolve `List`. Só `OnboardingServiceImpl.criarOuAtualizarProvaAlvo`
  garante alvo única.
- Posse do atleta: `OnboardingServiceImpl.validarPosseOuCoach` compara
  `resolverAtletaIdAtual()` (tenant + `sub` do JWT → `Usuario` → `Atleta`) com o `atletaId` do
  path e lança `AccessDeniedException`. É o único lugar com essa regra.
- Attention queue (`CoachAttentionQueueServiceImpl`): calculada a cada `GET`, sem persistência,
  um item por atleta, corte em severidade `ALTA`, evidências como lista `label/value`. Motivo
  novo custa: `MotivoAtencao`, método puro em `CoachAttentionSignalEvaluator`, uma linha em
  `montarItem`, mapeamento (ou exclusão) em `SugestaoCoachGeneratorJob.MOTIVO_TIPO`, e os mapas
  exaustivos `AttentionReason`/`REASON_LABEL`/`MOTIVO_TEXTO` no front.
- `PlannerEngine` só aplica `TaperStrategy` quando `distanciaKm != null`.
- Front do atleta: bottom nav de cinco itens (Hoje, Plano, Progresso, Coach, Perfil), sem header.
  A "próxima prova" da home é uma linha dentro de `WeekOverviewCard`. Formulários usam
  `TextField type="date"` nativo e chips do onboarding. Não há `@mui/x-date-pickers`.
- `CoachAthleteProfilePage` é um grid de `SectionCard` locais; o Inbox seleciona o atleta e
  carrega o perfil no painel direito da mesma tela.

## Goals / Non-Goals

**Goals:**
- Uma única regra de posse ("atleta só no próprio `atletaId`") aplicada a todos os verbos de
  `ProvaController`.
- Uma única classe de domínio para a tabela de semanas, consumível depois por
  `add-macrociclo-structure`.
- Derivação de campos em um único ponto do service, válida para CRUD e onboarding.
- Notificação ao coach sem criar mecanismo novo de fila: reutilizar a attention queue com estado
  na prova.

**Non-Goals:**
- Não tocar em prompt, `PeriodizationPlanner`, `TaperStrategy` ou geração de plano.
- Não desacoplar a fila de revisão de `PlanoSemanal`.
- Não criar CRUD de prova no shell do coach.
- Não introduzir picker de data nem dependência de front.

## Decisions

### D1. Posse por `atletaId` no service, não só no controller

`ProvaServiceImpl` ganha um `resolveAtletaComPosse(atletaId)` que: resolve o atleta no tenant
(como hoje) e, se o principal tem papel `ATLETA` e não `TECNICO`/`ADMIN`, exige que o
`atletaId` seja o do `resolverAtletaIdAtual()`; violação lança a mesma exceção de "não
encontrado" (`404`). O controller passa a `@PreAuthorize("hasAnyRole('ATLETA','TECNICO','ADMIN')")`
em `GET`/`POST`/`PUT`/`DELETE`.

*Por que no service:* os `GET` hoje já dependem só do service; colocar a regra lá cobre todos os
verbos com um teste por verbo, e o `404` (não `403`) segue o padrão de tenant da spec. A
alternativa de um `@PreAuthorize` com SpEL comparando `sub` exigiria um bean auxiliar e deixaria a
regra fora do lugar onde o atleta é resolvido.

*Reaproveitamento:* o helper de "atleta do JWT" existe em `AtletaProgressServiceImpl` e em
`OnboardingServiceImpl`. Extrair para um componente `AuthenticatedAtletaResolver` em `security/`
e usar nos três lugares. Extração mínima, sem mudar comportamento dos dois existentes.

### D2. Tabela de semanas como classe de domínio pura

`domain/planner/RacePreparationRule` (record + método estático), sem Spring:

```
minimoSemanas(DistanciaProva, BigDecimal distanciaKm) -> int
distanciaNominalKm(DistanciaProva) -> BigDecimal   // 5 / 10 / 21.1 / 42.2
inicioPreparacao(LocalDate dataProva, int semanas) -> LocalDate
```

Faixas: `<= 7.5 → 8`, `<= 15 → 10`, `<= 30 → 12`, senão `16`. Distância padrão ignora
`distanciaKm`. Testes de tabela cobrem os quatro enums, os quatro limites de faixa e os dois
extremos (0,1 km e 200 km).

*Alternativa descartada:* tabela `tb_fase_periodizacao` (V5) já guarda durações por fase, mas é
tabela de consulta sem entidade, e o macrociclo vai precisar da mesma regra em código.

### D2b. Distância livre: valor novo `CUSTOMIZADA` no fim do enum

`DistanciaProva` não tem valor para distância livre; hoje `distanciaKm` é preenchido ao lado de um
dos quatro valores. Para "Outra" no formulário, o enum ganha `CUSTOMIZADA("OUTRA", "Outra", "Outra", 4)`
**como último constante** — `Prova.distancia` é `@Enumerated(ORDINAL)` em `smallint`, então só
anexar ao final preserva os ordinais 0-3 gravados. Comentário no enum registra a restrição
("novos valores só no fim; nunca reordenar"). Consumidores que precisam de caso novo: os `switch`
exaustivos em `PeriodizacaoPromptFormatter.resolverDistanciaKm` e `PlannerShadowService` (ambos
devolvem `distanciaKm`, que o enricher garante preenchido); no front, `types/Prova.ts` e
`DISTANCIA_PROVA_LABELS`; `OnboardingProvaAlvoStep` itera os labels e passa a filtrar
`CUSTOMIZADA` (onboarding continua só com as quatro distâncias). Validação: `CUSTOMIZADA ⇒
distanciaKm > 0`.

*Alternativa descartada:* migrar a coluna para `EnumType.STRING` antes. É a correção certa a longo
prazo, mas é mudança de dado em tabela existente com rollback próprio; fica como change de
higiene separada. Anexar ao fim não cria drift.

### D3. Derivação em um `ProvaEnricher` chamado pelo service

Método `aplicarDerivados(Prova)` invocado em `criarProva`, `atualizarProva` e em
`OnboardingServiceImpl.criarOuAtualizarProvaAlvo` antes do `save`. Preenche `distanciaKm` se
nulo e distância padrão, depois `semanasPreparacao` e `inicioPreparacao`. Sempre sobrescreve os
dois últimos, ignorando o que veio do DTO.

`ProvaOutputDto` ganha `preparacaoCurta` (boolean, calculado: `inicioPreparacao < hoje`) e
`semanasFaltando` (int, `floor(dias/7)`), para o front não recalcular.

### D4. Prova-alvo única no service

`criarProva` e `atualizarProva`, quando `provaAlvo = true`, desmarcam as demais via
`findByAtletaAndProvaAlvoTrue` (já devolve lista). O onboarding continua com a lógica dele, que já
faz isso; a regra passa a valer também no CRUD. A resposta da troca fica registrada para a
notificação (D6): o service devolve, junto com a prova, o nome da alvo anterior quando houve troca.

### D5. Cancelamento pelo atleta, deleção física só para ADMIN

`DELETE` no controller decide pelo papel: `ADMIN` → `deletarProva` (como hoje); `ATLETA` e
`TECNICO` → `cancelarProva` (`statusProva = CANCELADA`, `revisadaPeloCoach = false` se o ator é
atleta). Ambos `204`. Prova com `foiRealizada = true`: `409` para atleta em `PUT` e `DELETE`
(exceção nova `ProvaRealizadaImutavelException` mapeada no handler global).

Para o `PUT` do atleta, o mapper ignora os campos de resultado e os derivados: implementado com
um `ProvaAtletaInputDto` (subconjunto: nome, data, tipo, distância, `distanciaKm`, tempo
objetivo, `provaAlvo`) usado pelo controller quando o papel é `ATLETA`. É mais explícito que
"apagar campos do DTO completo" e o front do atleta só conhece esse contrato.

### D6. Flag `revisadaPeloCoach` e motivo `PROVA_ATLETA`

**Migration `V87`** (V85 e V86 já existem no repositório): `ALTER TABLE tb_prova ADD COLUMN
revisada_pelo_coach boolean NOT NULL DEFAULT true`, `motivo_revisao varchar(20) NULL`,
`alvo_anterior_nome varchar(100) NULL`, mais índice parcial `(atleta_id) WHERE
revisada_pelo_coach = false`. Default `true` para não inundar a fila no deploy.

**Quando zera** (só se o ator tem papel `ATLETA`): criação; cancelamento; `PUT` que altere
`dataProva`, `distancia`, `distanciaKm` ou `provaAlvo`. Comparação feita no service antes do
mapper aplicar o DTO. O motivo é **persistido** em `motivoRevisao` (enum `MotivoRevisaoProva
{ NOVA, DATA_ALTERADA, ALVO_TROCADA, CANCELADA }`) e, quando `ALVO_TROCADA`, o nome da alvo
substituída em `alvoAnteriorNome`; ambos limpos no "Ciente". A fila é calculada a cada `GET` e
não teria como reconstituir "qual alvo foi substituída" sem esse estado mínimo.

**Evaluator**: `avaliarProvaPendente(List<Prova> pendentes, LocalDate hoje)` →
`Optional<SinalAtencao>`: severidade `CRITICA` se alguma pendente tem `preparacaoCurta` ou
`motivoRevisao = ALVO_TROCADA`; senão `ALTA`. Evidências: `Prova` = nome, `Data` = dd MMM,
`Distância`, `Preparação` = "N de M semanas", `Motivo` = label do `motivoRevisao` ("alvo trocada:
antes <alvoAnteriorNome>").

**Limite da fila**: a fila corta em severidade `ALTA` e devolve no máximo 20 itens; um tenant com
muitos sinais pode deixar a prova de fora. O card **Provas** no perfil do atleta lê as pendentes
direto (`findPendentesRevisaoByAtleta`), sem passar pela fila, e é ele que carrega o "Ciente";
a fila é o caminho de descoberta, não a garantia. A spec diz isso explicitamente. `MotivoAtencao.PROVA_ATLETA(peso 45, suggestedAction "Revise a prova e o plano
das próximas semanas")` — peso entre `FADIGA` (50) e `SOBRECARGA` (40).

**Repositório**: `findPendentesRevisaoByAssessoria(tenantId)` (prova futura ou cancelada com
flag `false`), agrupado por atleta no service para evitar N+1.

**Job**: `SugestaoCoachGeneratorJob` ganha um conjunto `MOTIVOS_IGNORADOS = {PROVA_ATLETA}`
checado antes do lookup em `MOTIVO_TIPO`, sem log.

**Ciente**: `PATCH /api/v1/atletas/{atletaId}/provas/{provaId}/ciente`,
`@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, tenant via `resolveAtleta`, idempotente,
devolve `ProvaOutputDto`.

*Alternativa descartada:* item na fila de revisão de planos — 100% acoplada a
`PlanoSemanal.reviewStatus`; desacoplar é refatoração maior que a change. Janela de tempo sem
estado — some sem o coach ter visto, o oposto do objetivo.

### D7. Front do atleta: rota própria, sem item de menu

- Rota `/athlete/races` em `App.tsx` sob `RoleRoute allow={['ATLETA']}`, constante em
  `constants/routes.ts`. Página `AthleteRacesPage` (lista) e `AthleteRaceFormPage`
  (`/athlete/races/new`, `/athlete/races/:provaId/edit`) — páginas, não dialog, porque o
  formulário tem oito campos e mensagens de regra; no mobile dialog vira tela cheia de qualquer
  jeito.
- Hook `useAthleteRaces` (CRUD sobre `/api/v1/atletas/{meuId}/provas`; o `atletaId` vem do
  `useAthleteProfile`/JWT que a home já usa). `useAthleteProvas` (leitura via `/me/provas`)
  continua para home e progresso.
- Formulário: distância como chips (5, 10, 21, 42, Outra → `TextField type="number"`), terreno
  como chips (Rua, Trail), `tipoProva` derivado (`21 → MEIA`, `42 → MARATONA`, senão
  `CORRIDA_RUA`/`TRAIL`). A mensagem da regra é calculada no front com a mesma tabela (`utils/
  racePreparation.ts`) para feedback imediato; o backend continua sendo a fonte no salvamento.
  Data com `min = amanhã`.
- `AthletePlanPage`: faixa `RaceTargetBanner` acima do card de volume, três estados (alvo /
  provas sem alvo / nenhuma prova), lendo de `useAthleteProvas`.
- `WeekOverviewCard`: texto "Sem próxima prova" + link "Cadastrar" para `/athlete/races/new`.

### D8. Front do coach: card e motivo

- `CoachAthleteProfilePage`: `SectionCard` "Provas" com `useProvas()` (já existe; `atletaId` vai
  em cada chamada, `fetchProvas(atletaId)`) filtrado a não canceladas futuras + canceladas pendentes; botão "Ciente" chama
  `ProvaService.marcarCiente` e invalida a lista e a attention queue (`reviewFetchPendentes`
  não; é `useAttentionQueue().refetch` via outlet context).
- `types/Coach.ts`: `AttentionReason` += `'PROVA_ATLETA'`; `coachInboxHelpers.ts`:
  `REASON_LABEL['PROVA_ATLETA'] = 'Prova do atleta'`, `MOTIVO_TEXTO` idem. Evidências já são
  genéricas em `AttentionOnlyRow`/`QueueRow`.

## Risks / Trade-offs

- [Atleta descobre `atletaId` de colega e tenta o CRUD] → posse no service para todos os verbos,
  `404` indistinguível; teste de integração por verbo com dois atletas do mesmo tenant.
- [Deploy com provas existentes inunda a fila] → default `true` na migration; só provas tocadas
  por atleta depois do deploy entram.
- [Fila de atenção com corte em `ALTA` esconde prova se houver muitos itens (máx. 20)] → o item
  do atleta consolida sinais, e a prova entra como evidência mesmo quando não é o motivo
  principal; o card no perfil não depende da fila.
- [Regra da tabela duplicada em front e back diverge] → o front usa a tabela só para feedback
  enquanto digita; o valor gravado e o chip da lista vêm do `ProvaOutputDto`. Teste de
  contrato: fixture do back gera os casos do teste do front.
- [Troca de alvo pelo atleta muda o rumo do próximo plano sem o coach ver] → severidade
  `CRITICA` e o item persiste até o "Ciente".
- [`resolverAtletaIdAtual` falha para usuário `ATLETA` sem `Atleta` vinculado] → mesma exceção
  que os endpoints `/me` já lançam; não é caso novo.
- [Onboarding passa a chamar o enricher e muda comportamento existente] → só preenche campos
  antes vazios; teste do onboarding ganha asserção dos derivados.

## Migration Plan

1. Backend: migration `V85` aditiva, deploy normal. Nada quebra para clientes antigos: os `GET`
   continuam `200` para `TECNICO`/`ADMIN`; o shell `ADMIN` legado continua funcionando.
2. Front: rota nova e card; sem feature flag, o acesso já é gated por papel.
3. Rollback: reverter o deploy do backend mantém a coluna (default `true`, inofensiva).

## Open Questions

Copy das mensagens da regra: decidido em 2026-09-02, usa a versão do canvas (ver proposal).

- Se `TECNICO` deve poder deletar fisicamente além de cancelar. Assumido: não, só cancelar; muda
  uma linha no controller.
