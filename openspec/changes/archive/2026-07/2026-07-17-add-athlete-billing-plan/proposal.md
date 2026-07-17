**Tamanho:** M · **Trilha:** Full (toca dois repositórios — backend e frontend — e muda contrato
de API em 4 DTOs; critério de escalada do `config.yaml` já satisfeito por multi-repo)

## Why

Hoje não existe nenhum registro de cobrança do atleta com a assessoria no Menthoros. O único
conceito próximo é `PlanoAssessoria` (enum `GRATUITO/BASIC/PRO/ENTERPRISE` em `Assessoria.java`),
que é o plano **SaaS da assessoria com a Menthoros** — não tem relação com o pagamento do
**atleta para a assessoria**. `Atleta.java` tem `@ManyToOne Assessoria assessoria` como tenant
scope, mas nenhum campo de cobrança.

O treinador hoje controla vencimento e tipo de plano de cada atleta fora do Menthoros (planilha,
memória, ou outro sistema) — sem visibilidade centralizada de quem está em dia. Trazer esse dado
para dentro do roster/perfil elimina uma fonte externa e reduz o risco de perder o vencimento de
um atleta, sem exigir nenhuma integração com gateway de pagamento (fora de escopo, ver "Open
Questions").

## What Changes

- **Dois novos campos em `Atleta`** (`entity/Atleta.java`): `dataVencimentoPlano` (`LocalDate`,
  nullable) e `tipoPlanoAtleta` (novo enum `TipoPlanoAtleta`: `MENSAL`, `TRIMESTRAL`,
  `SEMESTRAL`, `ANUAL` — nullable, `@Enumerated(EnumType.STRING)`). Preenchimento manual pelo
  treinador, sem obrigatoriedade no cadastro.
- **Novo enum derivado `StatusVencimentoPlano`** (`EM_DIA`, `PROXIMO_VENCIMENTO`, `VENCIDO`) —
  **não persistido**, calculado em tempo de leitura a partir de `dataVencimentoPlano` vs. a data
  atual (constante `DIAS_ALERTA_VENCIMENTO = 7` — ver design.md D3). Ausente (`null`, omitido via
  `@JsonInclude(NON_NULL)`) quando `dataVencimentoPlano` é nulo.
- **DTOs ganham campos aditivos** (`dataVencimentoPlano`, `tipoPlanoAtleta`,
  `statusVencimentoPlano`): `AtletaInputDto`, `AtletaOutputDto`, `AtletaPerfilCoachOutputDto`
  (montado em `CoachAthleteProfileServiceImpl`) e `CoachAtletaResumoDto` (montado em
  `CoachDashboardServiceImpl.montarResumo`, que já recebe `LocalDate hoje` como parâmetro — reuso
  direto para o cálculo do status, ver design.md D3).
- **Frontend — edição:** `AtletaDialog.tsx` (`components/features/atleta/`) ganha os dois campos
  editáveis (data + seletor de tipo de plano) — é o único formulário de edição de atleta hoje
  (`CoachAthleteProfilePage.tsx` é somente leitura, ver "Open Questions").
- **Frontend — exibição:** `CoachAthleteProfilePage.tsx` exibe os dados no perfil;
  `CoachAthletesPage.tsx` ganha uma coluna no grid do roster com badge de status (reusa o
  componente `StatusBadge` já existente — sem componente novo).
- **Sem gateway de pagamento, sem notificação ativa (push/email/job agendado)** — o "alerta" é
  puramente um indicador visual calculado no momento da leitura.

## Capabilities

### New Capabilities

- `athlete-billing-plan`: registra data de vencimento e tipo de plano do atleta com a assessoria,
  com status de vencimento derivado (`EM_DIA`/`PROXIMO_VENCIMENTO`/`VENCIDO`) exibido no perfil e
  no roster do coach.

### Modified Capabilities

<!-- Nenhuma capability existente muda de comportamento — os campos são aditivos e opcionais em
toda a cadeia (entidade, DTOs, telas). -->

## Impact

**Entidades e banco:** 1 migration aditiva (`V57`): `ALTER TABLE tb_atleta ADD COLUMN
tipo_plano_atleta VARCHAR(20)` + `ADD COLUMN data_vencimento_plano DATE` — ambas nullable, sem
backfill. Sem impacto em dado existente.

**APIs:** nenhum endpoint novo — reusa `PUT /api/v1/atletas/{id}` (já existente,
`AtletaController.atualizarAtleta`) para edição. 4 DTOs ganham campos aditivos, compatíveis com
clientes existentes (nada é removido/renomeado): `AtletaInputDto`, `AtletaOutputDto`,
`AtletaPerfilCoachOutputDto`, `CoachAtletaResumoDto`.

**Frontend:** 3 arquivos tocados (`AtletaDialog.tsx`, `CoachAthleteProfilePage.tsx`,
`CoachAthletesPage.tsx`) + 2 arquivos de tipos (`types/Atleta.ts`, `types/Coach.ts`). Cliente API
curado (`src/api`) precisa refletir os campos novos nos tipos correspondentes.

**Comportamento:** nenhuma regressão — todo atleta existente tem os dois campos novos `null` até
o treinador preencher; `statusVencimentoPlano` fica ausente até lá (omitido da resposta, mesmo
padrão de outros campos derivados nullable no DTO).

**Dependências:** nenhuma — não há gateway de pagamento nem infraestrutura de notificação
envolvida.

## Critérios de aceite

1. **Given** um atleta recém-criado sem dados de cobrança, **when** o coach visualiza o perfil ou
   o roster, **then** os campos de vencimento/plano estão ausentes na resposta (omitidos, sem
   erro) e nenhum badge de status aparece.
2. **Given** um atleta com `dataVencimentoPlano` no passado, **when** o coach visualiza o
   perfil/roster, **then** `statusVencimentoPlano = VENCIDO` e o badge exibido é vermelho
   (`danger`).
3. **Given** um atleta com `dataVencimentoPlano` entre hoje e 7 dias no futuro (inclusive),
   **when** o coach visualiza, **then** `statusVencimentoPlano = PROXIMO_VENCIMENTO` e o badge é
   amarelo (`warning`).
4. **Given** um atleta com `dataVencimentoPlano` mais de 7 dias no futuro, **when** o coach
   visualiza, **then** `statusVencimentoPlano = EM_DIA`.
5. **Given** o coach edita um atleta via `AtletaDialog.tsx` definindo `tipoPlanoAtleta` e
   `dataVencimentoPlano`, **when** salva (`PUT /api/v1/atletas/{id}`), **then** os valores são
   persistidos e refletidos tanto no perfil quanto no roster sem reload manual do outro lado.
6. **Given** dois atletas de tenants (assessorias) diferentes, **when** cada coach consulta seu
   próprio roster, **then** os dados de cobrança nunca vazam entre tenants (mesma garantia de
   isolamento já existente via `assessoria`/`TenantContext`, sem alteração nesta change).

## Métrica de sucesso

**Proxy mensurável (achado do `spec-reviewer` — a métrica original era só qualitativa, sem
sinal medível):** `% de atletas ativos com dataVencimentoPlano preenchido`, consultável
diretamente no banco (`SELECT count(*) FILTER (WHERE data_vencimento_plano IS NOT NULL) * 100.0
/ count(*) FROM tb_atleta WHERE ativo = true` por tenant), medido 2 e 4 semanas após o deploy —
sinal de adoção do campo pelo treinador, sem precisar de telemetria de produto nova. Um segundo
proxy, mais direto sobre o valor do badge: **nº de atletas que ficam `VENCIDO` por mais de 14
dias sem edição de `dataVencimentoPlano`** — se esse número for alto, o badge está sendo visto e
ignorado (ou o treinador não olha o roster com frequência suficiente, ver achado do
`product-reviewer` já registrado acima); se baixo, o badge está mudando comportamento.

Nenhum dos dois exige job agendado nem canal de notificação — são consultas pontuais (ou uma
query periódica manual do founder), compatíveis com o escopo de dados desta v1. Tempo/esforço do
treinador para saber quais atletas estão com pagamento vencido continua sendo o racional de
produto (hoje depende de controle externo ao Menthoros), mas a validação agora tem um sinal
mensurável em vez de ser só qualitativa com o founder/coach piloto.

## Open Questions & Assumptions

- **Assumido:** o threshold de "próximo do vencimento" é 7 dias — constante isolada
  (`DIAS_ALERTA_VENCIMENTO`, design.md D3), ajustável sem migration se o valor não servir na
  prática.
- **Assumido:** a edição acontece via `AtletaDialog.tsx` (já existente, cadastro/edição de
  atleta) — `CoachAthleteProfilePage.tsx` é somente leitura hoje (confirmado: nenhuma referência a
  edição/save nesse arquivo) e não ganha um formulário de edição próprio nesta change.
- **Fora do escopo (confirmado com o usuário):** gateway de pagamento (Stripe/Asaas/Mercado
  Pago), cobrança automática, notificação push/email/in-app, job agendado. O "alerta" é só um
  indicador visual computado na leitura.
- **Fora do escopo:** `tipo_plano_atleta` é um enum fechado (`MENSAL/TRIMESTRAL/SEMESTRAL/ANUAL`)
  — sem opção de texto livre/"personalizado" nesta v1.
- **Aberto:** se o founder quiser no futuro notificar o coach ativamente (não só um badge
  passivo) quando um vencimento se aproxima, isso é uma change separada (exigiria job agendado e
  canal de notificação — escopo maior, avaliado e descartado nesta rodada).
- **Risco assumido (achado do `product-reviewer`, verdict Refine — decisão do usuário mantida
  deliberadamente):** a revisão de produto levantou dois riscos de adoção — (1) editar só via
  `AtletaDialog.tsx` (fora do perfil do coach) cria fricção de contexto; (2) um badge passivo sem
  notificação ativa pode nunca ser visto se o coach não abrir o roster com frequência. Ambos os
  pontos foram explicitamente decididos pelo usuário nesta rodada (escopo mínimo, sem
  notificação ativa, reuso do formulário existente) — não são lacunas de design, são
  trade-offs conscientes de v1. Registrados aqui para reavaliação pós-uso real: se o founder
  perceber que o badge não muda comportamento, os candidatos a follow-up são (a) edição inline
  no perfil do coach (D4 do design.md) e (b) um digest semanal por e-mail dos vencimentos
  próximos — ambos fora do escopo desta change.
