**Tamanho:** M · **Trilha:** Full

> **Change posterior ao épico `add-season-plan-macrocycle`, fora do MVP dele** (decisão D5 do épico,
> 2026-11-22). Reusa o modelo, o motor, o versionamento e as telas do épico; não é um dos 10 tickets.

## Status

- ready-for-human (2026-11-22): bloqueado pelos tickets 2, 3 e 5 do épico e pelas decisões de produto
  listadas em "Aberto antes de começar".

## Why

No épico, toda temporada é ancorada em uma prova-alvo: `PlanoTreino.prova` é obrigatória e a duração é
derivada da data da prova. O atleta sem prova marcada fica só com o plano semanal reativo, e a aba
Temporada dele mostra apenas o estado vazio com "Cadastrar prova-alvo".

Na rotina de uma assessoria, boa parte da carteira passa meses sem prova: entressafra, construção de
base, manutenção. O treinador planeja esses períodos como ciclos com objetivo, duração curta e um teste
no fim, e hoje não tem onde registrar isso no Menthoros. Sem o ciclo, o planejado contra o realizado e o
delta de decisão no nível da temporada só existem para quem tem prova.

## What Changes

- `PlanoTreino` ganha `tipoTemporada` (`PROVA` | `DESENVOLVIMENTO`), `objetivoCiclo` e `dataFim`; `prova`
  passa a ser opcional apenas quando o tipo é `DESENVOLVIMENTO`
- O motor determinístico gera o ciclo a partir de objetivo, duração e baseline do atleta, usando só as
  fases BASE e BUILD e a flag `descarga` — sem PEAK, TAPER nem RACE_WEEK
- `TemplateMetodologia` ganha os parâmetros do ciclo de desenvolvimento por objetivo
- Geração sempre manual pelo treinador, nascendo em `PROPOSTA`, com as mesmas regras de aprovação,
  ajuste, versionamento e bloqueio por calibração do épico
- Aprovar uma temporada de prova arquiva o ciclo de desenvolvimento ativo do atleta
- Aba Temporada: o estado "sem prova-alvo" ganha a ação de criar ciclo de desenvolvimento; cabeçalho e
  KPIs trocam a prova pela data de fim e pelo objetivo
- "Minha temporada" do atleta mostra objetivo, semana N de M e data de fim no lugar da contagem até a
  prova
- Marco final opcional de teste de campo, quando `add-running-field-tests` existir

Fora desta change: retorno de lesão como objetivo de ciclo (o motor semanal já trata
`RETURN_TO_TRAINING`), renovação automática do ciclo e geração por LLM.

## Capabilities

### Modified Capabilities

- `season-plan-macrocycle`: temporada sem prova-alvo (tipo, objetivo, duração, fases permitidas,
  exclusividade com a temporada de prova)
- `season-plan-ui`: ação de criar ciclo no estado sem prova-alvo; cabeçalho, KPIs e bloco do atleta sem
  prova

## Critérios de aceite

- **Dado** um atleta sem prova-alvo e fora da calibração, **quando** o treinador gera um ciclo de
  desenvolvimento de 8 semanas com objetivo de base, **então** o sistema cria um `PlanoTreino` em
  `PROPOSTA`, do tipo `DESENVOLVIMENTO`, sem prova, com 8 `SemanaPlanejada` e fases apenas BASE ou BUILD.
- **Dado** a mesma entrada (objetivo, duração, template e baseline), **quando** a geração roda duas
  vezes, **então** as semanas são idênticas.
- **Dado** um pedido de temporada do tipo `PROVA` sem prova, **quando** é enviado, **então** a resposta é
  422 e nada é criado.
- **Dado** um ciclo em `PROPOSTA`, **quando** o atleta abre o app, **então** não vê "Minha temporada".
- **Dado** um ciclo `ATIVO`, **quando** o treinador aprova uma temporada de prova para o mesmo atleta,
  **então** o ciclo é arquivado com motivo e a temporada de prova passa a ser a única `ATIVO`.
- **Dado** um atleta em calibração, **quando** o treinador tenta gerar o ciclo, **então** a resposta é
  422 com o motivo, como na temporada de prova.
- **Dado** um atleta sem prova-alvo, **quando** o treinador abre a aba Temporada, **então** vê as ações
  "Cadastrar prova-alvo" e "Criar ciclo de desenvolvimento".
- **Dado** a flag `macrociclo.desenvolvimento.enabled=false`, **quando** o treinador abre a aba,
  **então** o estado sem prova-alvo é o do épico, sem a ação nova.

## Métrica de sucesso

% de atletas ativos sem prova-alvo com temporada ativa nas assessorias do piloto. Meta inicial de 40%
em 60 dias, a calibrar com o primeiro ciclo — é hipótese, não há linha de base.

## Aberto antes de começar (grilling desta change)

- Objetivos do primeiro corte: só base e manutenção, ou também desenvolvimento de velocidade?
- Duração: faixa permitida e default (proposta: 4 a 16 semanas, default 8).
- Fim do ciclo: arquivar na data de fim e avisar o treinador, ou manter ativo até ele decidir?
- Marco final: o ciclo espera `add-running-field-tests`, ou sai antes com fim só por data?

## Open Questions & Assumptions

**Premissas assumidas:**

- O treinador planeja períodos sem prova como ciclos com objetivo e data de fim. **Hipótese**, baseada
  na prática de periodização (período preparatório geral, blocos de acumulação), não validada com as
  assessorias fundadoras.
- O índice único parcial do épico (um `ATIVO` por atleta) vale para os dois tipos: ciclo de
  desenvolvimento e temporada de prova não coexistem ativos.
- A integração com o plano semanal (tickets 8 e 9) lê `SemanaPlanejada` e não depende da prova.
  **Conferir no código** antes de implementar; se depender, entra como task.
- Os gatilhos de replanejamento por desvio e lesão valem para o ciclo; o de mudança de prova não se
  aplica.

**Em aberto:** os quatro itens de "Aberto antes de começar".

## Bloqueado por

- `add-season-plan-generate-tracer` (ticket 2), `add-season-plan-complete-proposal` (ticket 3) e
  `add-season-plan-approve-athlete-view` (ticket 5).
- Recomendado: um ciclo de temporada de prova rodando no piloto antes de começar.

## Dependências e rollout

- Flag: `macrociclo.desenvolvimento.enabled=false`, subordinada a `macrociclo.enabled`.
- Relação com `add-running-field-tests`: o marco de teste é opcional e entra quando ela existir.
- Migration aditiva: colunas novas e `prova_id` anulável com CHECK por tipo; nenhuma linha existente
  muda (todas são do tipo `PROVA`).
