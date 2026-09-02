# atleta-cadastra-prova — Atleta cadastra a própria prova e o coach é avisado quando a preparação é curta

**Tamanho:** M · **Trilha:** Full
**Status:** proposta (grilling concluído em 2026-09-02)
**Criado:** 2026-09-02
**Design visual:** [canvas "Provas do Atleta"](https://claude.ai/code/artifact/98c34b33-9ad1-4dca-83a2-53a8733eb81a)

## Why

Hoje o atleta só informa prova no onboarding e depois não consegue criar, editar nem cancelar
nenhuma. O CRUD de provas exige `TECNICO`/`ADMIN`, e a única tela que o usa vive no shell legado
`ADMIN` — o coach não tem UI de prova no shell dele. Na prática, depois do onboarding ninguém
cadastra prova pela interface, e o coach descobre a inscrição do atleta por WhatsApp.

O gerador de plano já lê a prova-alvo e deriva a fase por semanas faltando, mas **nenhuma regra
compara o prazo com o mínimo de preparação que a literatura pede por distância** (ex.: maratona,
16 semanas). Uma maratona cadastrada para daqui a 8 semanas entra no plano em silêncio, e o coach
só percebe quando o taper chega cedo demais. Os campos `semanasPreparacao` e `inicioPreparacao`
existem na entidade `Prova` desde o início, trafegam nos DTOs e nunca foram lidos por lógica
nenhuma.

## What Changes

- **Atleta cria, edita e cancela as próprias provas** em `/api/v1/atletas/{atletaId}/provas`.
  Cancelamento é soft (`statusProva = CANCELADA`), preservando histórico. Prova com resultado
  registrado (`foiRealizada = true`) é intocável pelo atleta. Data mínima é amanhã.
- **Posse por `atletaId`**: `ATLETA` só alcança o próprio `atletaId`; `TECNICO`/`ADMIN` continuam
  alcançando qualquer atleta do tenant. A mesma regra fecha a brecha atual dos `GET` do
  `ProvaController`, que não têm `@PreAuthorize` nem checagem de posse.
- **Regra de semanas mínimas por distância**, tabela fixa em classe de domínio: 5 km → 8, 10 km →
  10, 21 km → 12, 42 km → 16. Distância livre (`distanciaKm`) cai na faixa mais próxima (até 7,5 /
  15 / 30 km; acima usa 16). A regra **nunca bloqueia**: marca a prova como "preparação curta" e
  avisa o coach.
- **Campos derivados preenchidos pelo service** em qualquer caminho de gravação (CRUD e
  onboarding): `semanasPreparacao` (tabela), `inicioPreparacao` (data da prova menos as semanas) e
  `distanciaKm` quando vier vazio (5 / 10 / 21,1 / 42,2). Não são editáveis pelo atleta. Sem o
  `distanciaKm` preenchido, o `TaperStrategy` do motor novo ignora a prova.
- **Prova-alvo única garantida no service**: marcar uma nova desmarca a anterior. Hoje só o
  onboarding faz isso; o CRUD aceita N alvos.
- **Notificação ao coach pela attention queue**: motivo novo `PROVA_ATLETA`, severidade `ALTA`
  para prova nova / alterada / cancelada e `CRITICA` quando a preparação é curta ou a alvo foi
  trocada. Condição do item é a flag nova `revisadaPeloCoach = false` na prova; o coach resolve
  com `PATCH /api/v1/atletas/{atletaId}/provas/{provaId}/ciente`. Edição que mude data,
  distância ou alvo zera a flag; edição só de nome não. O `SugestaoCoachGeneratorJob` exclui o
  motivo explicitamente.
- **Front do atleta**: rota nova `/athlete/races` ("Minhas provas": lista + formulário com nome,
  data, distância com "outra" em km, terreno rua/trail, tempo objetivo, switch de prova-alvo;
  `tipoProva` derivado no front). Sem item novo na bottom nav: a faixa da prova-alvo no topo da
  página **Plano** abre a lista, e a linha "próxima prova" da home passa a "Sem próxima prova ·
  Cadastrar" em vez de mandar pedir ao coach.
- **Front do coach**: card **Provas**, só leitura, na `CoachAthleteProfilePage`, com chips de
  alvo e "preparação curta", marcador "Nova"/"Alterada" e botão "Ciente". O item do Inbox leva
  nome, data e "N de M semanas" na evidência e seleciona o atleta, como os motivos atuais.

## Capabilities

### New Capabilities
- `prova-preparacao-minima`: regra de semanas mínimas por distância, campos derivados da prova e
  o alerta "preparação curta" que nunca bloqueia.
- `prova-atencao-coach`: notificação ao coach quando o atleta cria, altera ou cancela prova, com
  a flag de ciência e o endpoint que a resolve.

### Modified Capabilities
- `prova-crud`: autorização passa de "só `TECNICO`/`ADMIN`" para "`ATLETA` nas próprias provas,
  `TECNICO`/`ADMIN` no tenant"; `GET`s ganham a mesma checagem de posse; `DELETE` pelo atleta vira
  cancelamento soft; validações novas (data mínima amanhã, prova realizada imutável para o atleta,
  prova-alvo única).

## Impact

- **Backend** (`apps/menthoros-backend`): `ProvaController`, `ProvaServiceImpl`, `ProvaInputDto`,
  `Prova` (flag `revisadaPeloCoach` + migration), classe de domínio nova para a tabela de semanas,
  `MotivoAtencao`, `CoachAttentionSignalEvaluator`, `CoachAttentionQueueServiceImpl`,
  `CoachAttentionItemOutputDto` (evidência), `SugestaoCoachGeneratorJob`,
  `OnboardingServiceImpl` (passa a usar a derivação do service). Padrão de posse reaproveitado de
  `OnboardingServiceImpl.validarPosseOuCoach`.
- **Frontend** (`apps/menthoros-front`): rota e página novas no shell do atleta, faixa na
  `AthletePlanPage`, texto da linha de próxima prova em `WeekOverviewCard`, card na
  `CoachAthleteProfilePage`, `AttentionReason` + `REASON_LABEL`/`MOTIVO_TEXTO`, `ProvaService`
  (endpoint de ciente), tipos em `types/Prova.ts`.
- **Banco**: uma migration Flyway aditiva (`revisada_pelo_coach boolean not null default true`
  para não disparar alerta em massa nas provas já existentes).
- **Contrato de API**: `POST`/`PUT`/`DELETE` de provas passam a aceitar `ATLETA`; `GET`s passam
  a recusar atleta que não é dono (`404`, como o padrão de tenant). Endpoint novo de ciente.
- **Sem dependência nova.** Sem mudança no prompt nem no `PeriodizationPlanner`.

## Fora do escopo

- Tela de gestão de provas para o coach no shell dele (o coach vê e dá ciência; não edita).
- Regras próprias de ultra e triathlon; tabela de semanas configurável por assessoria; dois
  níveis de alerta (mínimo e recomendado).
- E-mail ao coach.
- Alterar plano semanal já gerado quando a prova cai nele — é a change irmã
  **`prova-no-plano-semanal`** (treino tipo `PROVA` garantido no dia, semana aprovada volta para
  revisão, execução fecha o resultado), que depende desta.
- Corrigir a divergência `RACE_WEEK` vs `PÓS-PROVA` entre `PeriodizationPlanner` e o formatter
  legado (já instrumentada em modo shadow).

## Dependências e ordem

- Nenhuma change bloqueia esta.
- `add-macrociclo-structure` (ativa, não implementada) passa a consumir a tabela de semanas por
  distância desta change em vez de definir a sua; anotar a dependência no proposal dela.
- `prova-no-plano-semanal` depende desta (flag, posse e derivação de `distanciaKm`).

## Critérios de aceite

1. **Given** um `ATLETA` autenticado **When** `POST /api/v1/atletas/{seuId}/provas` com data ≥
   amanhã **Then** `201`, prova criada com `semanasPreparacao`, `inicioPreparacao` e
   `distanciaKm` preenchidos e `revisadaPeloCoach = false`.
2. **Given** o mesmo atleta **When** `POST` em `/api/v1/atletas/{outroId}/provas` do mesmo
   tenant **Then** `404` e nada é criado.
3. **Given** o mesmo atleta **When** `GET /api/v1/atletas/{outroId}/provas` **Then** `404`.
   **When** `TECNICO` do tenant faz o mesmo `GET` **Then** `200`.
4. **Given** data de hoje ou passada no body **Then** `400`/`422` com mensagem de validação.
5. **Given** maratona (42 km) para daqui a 8 semanas **Then** a prova é criada,
   `inicioPreparacao < hoje`, o `ProvaOutputDto` expõe `preparacaoCurta = true`, e a attention
   queue do coach lista o atleta com motivo `PROVA_ATLETA`, severidade `CRITICA` e evidência
   "8 de 16 semanas".
6. **Given** prova de 30 km com `distancia = CUSTOMIZADA` **Then** `semanasPreparacao = 12`
   (faixa de 21 km). **Given** 80 km **Then** 16.
7. **Given** o atleta já tem prova-alvo A **When** cria B com `provaAlvo = true` **Then** A fica
   `provaAlvo = false`, B é alvo, e o motivo do item é "alvo trocada" com severidade `CRITICA`.
8. **Given** o coach chama `PATCH .../provas/{id}/ciente` **Then** `revisadaPeloCoach = true` e o
   atleta some da attention queue (se não houver outro sinal). **Given** o atleta depois edita a
   data **Then** a flag volta a `false` e o item reaparece. **Given** edita só o nome **Then** a
   flag não muda.
9. **Given** o atleta faz `DELETE` na própria prova **Then** `statusProva = CANCELADA`, a prova
   some das listagens e o coach recebe item `ALTA` "cancelada". `ADMIN` continua podendo deletar
   fisicamente.
10. **Given** prova com `foiRealizada = true` **When** o atleta tenta `PUT` ou `DELETE` **Then**
    `409`.
11. **Given** o `SugestaoCoachGeneratorJob` roda com itens `PROVA_ATLETA` na fila **Then**
    nenhuma `SugestaoCoach` é criada para eles e nenhum warn é logado.
12. **Given** onboarding concluído com prova-alvo **Then** a prova criada tem os campos derivados
    preenchidos e `revisadaPeloCoach = false`, sem alerta visual no onboarding.
13. **Front atleta:** `/athlete/races` lista provas futuras, destaca a alvo com "faltam N semanas"
    e "M recomendadas", mostra o chip "Preparação curta"; o formulário recalcula a mensagem da
    regra ao mudar data ou distância e avisa a troca de alvo; sem prova, a faixa do Plano e a
    linha da home levam ao formulário. Testes de componente cobrem os três estados da faixa.
14. **Front coach:** card **Provas** no perfil lista provas futuras com chips e o botão "Ciente"
    chama o endpoint e remove o marcador; o item do Inbox com motivo `PROVA_ATLETA` renderiza
    label e evidência sem quebrar os mapas exaustivos de `AttentionReason`.

## Métrica de sucesso

- **Zero provas "surpresa"**: 100% das provas futuras dos atletas do tenant estão cadastradas no
  sistema antes da semana de taper (hoje a maioria chega por mensagem).
- **Tempo do coach para tomar ciência de uma prova nova ≤ 1 dia** (diferença entre `createdAt`
  da prova e o `PATCH` de ciente), medido nos primeiros 30 dias após o deploy.
- Nenhum plano gerado com prova-alvo sem `distanciaKm` (o taper passa a valer para toda prova).

## Open Questions & Assumptions

**Premissas assumidas (fechadas no grilling de 2026-09-02):**
- A tabela 8/10/12/16 é o ponto de partida; o usuário confirmou que ela não é configurável por
  assessoria nesta change.
- Referência do alerta é a data de hoje (não o início da semana de plano corrente); recalculada
  em toda edição de data ou distância.
- A attention queue é calculada a cada `GET`, sem estado; por isso a flag de ciência vive na
  prova, não na fila.
- Provas já existentes no banco nascem com `revisadaPeloCoach = true` para não inundar a fila no
  deploy.
- O coach não precisa aprovar a prova para ela valer no planejamento.

**Em aberto (não muda specs nem tasks):**
- Texto final das mensagens da regra no formulário (o canvas traz uma versão).
- Se a evidência do item do Inbox deve incluir o tempo objetivo. Assumido: não.
