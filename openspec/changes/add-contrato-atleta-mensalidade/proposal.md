# add-contrato-atleta-mensalidade — O proprietário controla a mensalidade de cada atleta sem planilha

**Tamanho:** L · **Trilha:** Full

> Full porque toca os dois repositórios, cria duas tabelas e remove duas colunas de `tb_atleta`
> (migration com backfill), muda o contrato de API de quatro DTOs e introduz endpoints restritos
> a um papel (`PROPRIETARIO`) com dado financeiro por tenant.

## Status

Nasceu da sessão de grilling e domain modeling de 2026-09-21 (26 decisões fechadas com o
founder). Glossário atualizado em `CONTEXT.md` da raiz: **Contrato do atleta**, **Mensalidade**,
**Baixa** e **Proprietário**. É a primeira de duas changes; a segunda é
`add-aviso-mensalidade` (Radar + e-mail ao atleta) e depende desta.

Substitui o bloco "Payment Control System" do `artifacts/docs/ROADMAP_IMPLEMENTACAO.md`, que
descrevia cinco tabelas, 24 endpoints e quatro schedulers a partir de um `PAYMENT_CONTROL_PLAN.md`
que não existe no repositório. O roadmap não foi usado como fonte.

## Revisão de produto (2026-09-21, `product-reviewer`)

**Veredito: Go.** Escopo mínimo dentro das decisões, critérios testáveis, coach-in-the-loop
preservado. Três pontos ficam para o founder, registrados em "Open Questions & Assumptions":
prioridade em `SPRINTS.md`, evidência de demanda das fundadoras e posicionamento (paridade ou
diferenciação). Buyer e usuário coincidem nesta fase (quase todo treinador é proprietário): o
argumento comercial é "chega de planilha", e segue de pé quando surgirem técnicos não
proprietários, porque quem compra é quem vê o valor. A change é neutra ao loop de aprendizado
da IA (é operação, não sugestão) e não compete com as iniciativas de moat pelo mesmo orçamento.

## Why

O atleta paga a assessoria por fora do Menthoros (Pix, dinheiro, transferência). O treinador
controla quem está em dia numa planilha ou de cabeça. A change `add-athlete-billing-plan`
(2026-07) trouxe dois campos soltos para `Atleta` (`tipoPlanoAtleta`, `dataVencimentoPlano`) e um
badge derivado no roster, mas parou aí: não há valor, não há registro de pagamento, e a data de
vencimento não avança sozinha. No segundo mês o badge está errado ou o treinador editou a data à
mão em cada atleta — a mesma rotina da planilha, só que dentro do app.

Esta change troca os dois campos por um modelo que se sustenta sozinho: um **contrato** por atleta
(periodicidade, valor, dia de vencimento) que gera **mensalidades** automaticamente enquanto
estiver ativo, e a **baixa** como gesto explícito do proprietário. O Menthoros não movimenta
dinheiro: registra, deriva o status e, na change seguinte, avisa.

Cobrança B2B (assessoria paga a Menthoros) já existe em `Assinatura` e não é tocada.

## What Changes

### Backend (`menthoros-backend`)

- **Entidade `ContratoAtleta`** (`tb_contrato_atleta`, 1:1 com `Atleta` ativo, tenant-scoped):
  `periodicidade` (`PeriodicidadeContrato`: MENSAL/TRIMESTRAL/SEMESTRAL/ANUAL), `valor`
  (`BigDecimal`, nullable), `diaVencimento` (1–31), `inicio` (`LocalDate`), `encerradoEm`
  (nullable — contrato ativo é `encerradoEm == null`), `avisoAtletaAtivo` (boolean, default
  `true`, consumido pela change 2).
- **Entidade `Mensalidade`** (`tb_mensalidade`, N:1 com contrato, tenant-scoped): `vencimento`,
  `valor` (cópia do contrato no momento da geração, nullable), `status` (`StatusMensalidade`:
  EM_ABERTO/PAGA/CANCELADA), `pagoEm`, `valorPago`. `UNIQUE (contrato_id, vencimento)`.
- **Status derivado `StatusMensalidade`… não persistido:** "vencida" é mensalidade EM_ABERTO com
  vencimento no passado. O enum de leitura `StatusVencimentoPlano` é renomeado para
  `StatusCobrancaAtleta` (EM_DIA/PROXIMO_VENCIMENTO/VENCIDO), calculado a partir das mensalidades
  em aberto do atleta, com a mesma janela de 7 dias.
- **Renovação automática:** `MensalidadeRenovacaoScheduler` diário (por tenant, com
  `TenantContext`, mesmo padrão do `SugestaoCoachGeneratorJob`) garante que todo contrato ativo
  tem uma mensalidade com vencimento ≥ hoje; gera as faltantes em sequência a partir da última
  (recupera dias perdidos, teto de 24 por execução). Contrato sem nenhuma mensalidade começa no
  próximo vencimento a partir de hoje — nunca no passado. A mesma regra roda na criação do
  contrato, para a primeira mensalidade existir na hora. Geração e mutações do contrato
  serializadas por lock no contrato.
- **Endpoints, todos `hasAnyRole('PROPRIETARIO','ADMIN')` e no tenant do token:**
  - `GET /api/v1/atletas/{id}/contrato` — contrato + mensalidades (ordenadas por vencimento desc).
  - `PUT /api/v1/atletas/{id}/contrato` — cria ou edita (upsert). Edição vale para mensalidades
    ainda não geradas; as em aberto mantêm valor e vencimento.
  - `POST /api/v1/atletas/{id}/contrato/encerrar` — `encerradoEm = agora`; mensalidades em aberto
    ficam como estão.
  - `POST /api/v1/mensalidades/{id}/baixa` — `{pagoEm, valorPago}`; `valorPago` default = valor.
  - `DELETE /api/v1/mensalidades/{id}/baixa` — desfaz, volta a EM_ABERTO.
  - `POST /api/v1/mensalidades/{id}/cancelar` — EM_ABERTO → CANCELADA. Só EM_ABERTO cancela.
- **DTOs de atleta** (`AtletaOutputDto`, `AtletaPerfilCoachOutputDto`, `CoachAtletaResumoDto`):
  perdem `tipoPlanoAtleta` e `dataVencimentoPlano`; `statusVencimentoPlano` vira
  `statusCobranca` e ganha ao lado `proximoVencimento` (`LocalDate`, vencimento da mensalidade em
  aberto mais antiga). Visíveis a todo treinador; **nunca carregam valor**. `AtletaInputDto`
  perde os dois campos.
- **Migration `V96`** (expand-only): cria as tabelas e faz backfill do contrato (todo atleta com
  `data_vencimento_plano` vira contrato ativo com periodicidade do tipo ou MENSAL, dia e início
  da data legada, valor nulo). Nenhuma mensalidade é criada na migration; a primeira vem da
  renovação. As colunas legadas ficam no banco, não mapeadas; o `DROP` (`V97`) vai na change 2.

### Frontend (`menthoros-front`)

- `AtletaDialog.tsx` perde os campos de plano e vencimento.
- `CoachAthleteProfilePage.tsx` ganha a seção **Cobrança**, renderizada só para `PROPRIETARIO`:
  formulário do contrato (periodicidade, valor, dia de vencimento, início, aviso ao atleta),
  botão de encerrar, lista de mensalidades com baixa / desfazer baixa / cancelar. Para os demais
  treinadores a seção não existe; o badge de status no cabeçalho do perfil continua.
- `CoachAthletesPage.tsx`: coluna "Vencimento" passa a ler `proximoVencimento` +
  `statusCobranca`. Sem valor.
- Cliente curado em `src/api` ganha `ContratoAtletaService`; tipos em `types/`.

## Capabilities

### New Capabilities

- `contrato-atleta`: registro do contrato comercial atleta ↔ assessoria, geração automática de
  mensalidades, baixa e cancelamento pelo proprietário, status derivado visível a todo treinador.

### Modified Capabilities

- `athlete-billing-plan` (spec canônica, se existir em `openspec/specs/`): substituída por
  `contrato-atleta`. Os campos soltos em `Atleta` deixam de existir.

## Fora do escopo

- Gateway de pagamento, Pix, boleto, split — o Menthoros não movimenta dinheiro.
- Qualquer mudança na experiência do atleta: nada bloqueia, nada avisa (aviso é a change 2).
- Pausa de contrato, pagamento parcial, histórico de contratos por atleta, desconto recorrente.
- Relatório financeiro da assessoria.
- Gate por tier (`PlanoAssessoria`): vale para todo tier, fundadoras incluídas.
- Verificação de `maxAtletas` em runtime (gap conhecido, change própria).

## Dependências e ordem

- Não depende de nenhuma change ativa.
- `add-aviso-mensalidade` depende desta (usa `Mensalidade`, `avisoAtletaAtivo` e o status).
- Backend mergeia antes do front: o front lê `statusCobranca`/`proximoVencimento`, que só
  existem depois de `V97`.

## Critérios de aceite

1. **Given** atleta sem contrato, **when** qualquer treinador lê perfil ou roster, **then**
   `statusCobranca` e `proximoVencimento` estão ausentes e nenhum badge aparece.
2. **Given** proprietário cria contrato MENSAL, dia 10, início 2026-09-21, **when** a criação
   termina, **then** existe uma mensalidade EM_ABERTO com vencimento 2026-10-10 (primeiro dia 10
   ≥ início) e o status do atleta é EM_DIA.
3. **Given** contrato com dia 31 e período que cai em fevereiro, **when** a mensalidade é gerada,
   **then** o vencimento é o último dia de fevereiro.
4. **Given** contrato ativo cuja última mensalidade venceu ontem, **when** o scheduler roda,
   **then** existe uma nova mensalidade EM_ABERTO um período à frente, e rodar de novo não cria
   outra (`UNIQUE`).
5. **Given** scheduler parado por 3 meses num contrato MENSAL, **when** roda, **then** gera as
   três mensalidades faltantes em sequência.
6. **Given** mensalidade EM_ABERTO vencida há 2 dias, **when** um treinador (não proprietário) lê
   o roster, **then** vê `statusCobranca = VENCIDO` e `proximoVencimento`, e a resposta não
   contém nenhum campo de valor.
7. **Given** proprietário dá baixa sem informar `valorPago`, **then** a mensalidade fica PAGA com
   `valorPago = valor` e `pagoEm` informado; **when** desfaz, **then** volta a EM_ABERTO com os
   dois campos nulos.
8. **Given** mensalidade PAGA, **when** proprietário tenta cancelar, **then** 409 e nada muda.
9. **Given** proprietário edita o valor de 200 para 250, **then** as mensalidades EM_ABERTO
   mantêm 200 e a próxima gerada nasce com 250.
10. **Given** contrato encerrado com uma mensalidade EM_ABERTO, **when** o scheduler roda,
    **then** nenhuma mensalidade nova é gerada e a em aberto continua contando no status.
11. **Given** usuário `TECNICO` sem `PROPRIETARIO`, **when** chama qualquer endpoint de contrato
    ou mensalidade, **then** 403.
12. **Given** proprietário do tenant A, **when** chama `GET /atletas/{id}/contrato` de atleta do
    tenant B ou `POST /mensalidades/{id}/baixa` de mensalidade do tenant B, **then** 404 (mesmo
    padrão de `fix-tenant-validation-not-found`).
13. **Given** atleta em produção com `tipo_plano_atleta = TRIMESTRAL` e
    `data_vencimento_plano = 2026-10-05`, **when** `V96` roda e depois a renovação, **then**
    existe contrato ativo TRIMESTRAL, dia 5, início 2026-10-05, valor nulo, e uma única
    mensalidade EM_ABERTO em 2026-10-05. **Given** data legada 2026-03-05 (passado), **then** a
    única mensalidade vence no próximo dia 5 a partir de hoje — nenhuma dívida passada é criada.
    Atleta com data nula não ganha contrato.
16. **Given** scheduler e proprietário concorrendo (encerrar ou editar valor durante a geração),
    **then** ou a mensalidade nasce com as regras novas ou não nasce; nunca com snapshot antigo.
17. **Given** dois tenants com contratos ativos e falha no primeiro, **when** o scheduler roda,
    **then** o segundo é processado e nenhuma mensalidade cruza tenant.
14. **Given** proprietário no perfil do atleta, **then** vê a seção Cobrança; **given** técnico
    não proprietário, **then** a seção não é renderizada e nenhuma chamada ao endpoint de
    contrato é feita.
15. **Given** `AtletaDialog`, **then** não há mais campos de tipo de plano nem vencimento.

## Métrica de sucesso

Rotina do treinador: **zero edições manuais de vencimento**. Hoje o proprietário edita
`dataVencimentoPlano` a cada ciclo em cada atleta. Depois: a única escrita recorrente é a baixa.
Medição: contagem de `PUT /atletas/{id}/contrato` por atleta por mês (alvo ≤ 1, criação) versus
`POST /mensalidades/{id}/baixa` (alvo ≈ 1 por atleta por período). Baseline: 10 assessorias
fundadoras; primeira leitura 30 dias após o merge.

## Riscos e mitigações

- **Migration só expande:** o `DROP` fica para a change 2, depois de janela em produção.
  Rollback = reverter binário; colunas legadas intactas.
- **Backfill não inventa dívida:** contrato migrado começa no próximo vencimento. Atletas que o
  modelo antigo marcava `VENCIDO` por data passada perdem o badge até a primeira mensalidade
  nova vencer — deliberado, registrado no design D7.
- **Scheduler por tenant:** `TenantContext` por tenant com `clear()` em `finally`, releitura do
  contrato por `(id, tenantId)`, IT com dois tenants.
- **Corrida scheduler × proprietário:** lock pessimista no contrato + `@Version`; `UNIQUE` como
  rede.
- **Valor vaza para treinador não proprietário:** os DTOs de atleta nunca têm valor; o valor só
  sai pelo endpoint de contrato, que exige `PROPRIETARIO`. Teste de contrato garante ausência do
  campo na serialização.
- **Duplicidade de mensalidade em corrida (scheduler + criação de contrato):** `UNIQUE
  (contrato_id, vencimento)`; a geração trata a violação como "já existe".

## Open Questions & Assumptions

- ✅ Só controle, sem gateway (decisão 2026-09-21).
- ✅ Um contrato ativo por atleta, sem histórico; edição vale para o futuro (decisão 2026-09-21).
- ✅ Sem pausa, sem parcial; cancelamento de mensalidade cobre lesão e férias (decisão 2026-09-21).
- ✅ Proprietário é o único que vê valor, dá baixa, cancela e edita; técnico vê só badge e data
  (decisão 2026-09-21). Nesta fase quase todo treinador é proprietário.
- ✅ Encerrar não mexe nas mensalidades em aberto (decisão 2026-09-21).
- ✅ `ADMIN` da Menthoros entra nos endpoints por consistência com o resto do código, não como
  operador esperado.
- ✅ Pre-mortem Codex (2026-09-21): cinco achados incorporados — ver design.md.
- ✅ O frontend lê as roles do token em `useUserInfo` (`roles`); a seção Cobrança é gated por
  `PROPRIETARIO` no cliente e o endpoint garante no servidor.
- **Premissa:** a spec canônica `athlete-billing-plan` pode não existir em `openspec/specs/` (a
  change de julho pode ter deixado só o delta). Se não existir, nada a arquivar.
- **Aberto (founder):** prioridade. O roadmap descartado punha isto como "Sprint 0, crítico";
  `SPRINTS.md` ainda não lista a change. Bloqueia o fechamento das fundadoras ou entra depois do
  piloto, já que a planilha segue funcionando? Registrar em `SPRINTS.md` antes do `/implement init`.
- **Aberto (founder):** evidência de demanda. A dor descrita no "Why" vem da leitura do código
  e do grilling, não de reclamação verbalizada por uma fundadora. Confirmar com ao menos uma
  antes de comprometer migration destrutiva em dois repos.
- **Aberto (founder):** posicionamento. Controle de mensalidade é paridade com outras
  plataformas de assessoria ou diferenciação? Muda como a feature entra no discurso comercial,
  não o desenho.
- **Aberto:** valor obrigatório na UI de criação? Recomendação: obrigatório no formulário, opcional
  no banco (backfill tem valor nulo). A change 2 só envia e-mail quando há valor.
