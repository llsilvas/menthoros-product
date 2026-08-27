**Tamanho:** XS · **Trilha:** Fast

## Why

A change `landing-page-mvp-lancamento` publica a tabela de planos do lançamento do MVP, confirmada
pelo founder em 2026-08-27: Gratuito (≤10 atletas, 1 técnico, R$0), **Basic (≤20 atletas, 1 técnico,
R$99)**, Pro (≤50, 2, R$199), Enterprise (≤100, 5, R$349), **Scale (100+, ilimitado, R$599)**.

Ao conferir contra o backend antes de fechar a proposta, dois pontos divergem do que já está
implementado:

1. `CoachSignupServiceImpl` cria toda assessoria nova (auto-cadastro público) como `BASIC`, mas com
   `MAX_ATLETAS_BASIC = 10` — o mesmo limite do plano **Gratuito**, não os 20 atletas do Basic
   confirmado agora. Isso não é específico do programa fundador: **todo coach que se cadastra hoje**
   pelo `CoachSignupController` recebe esse limite desatualizado.
2. `PlanoAssessoria` (`enum` + `chk_plano` CHECK da migration `V2`) não tem o valor `SCALE` — nenhuma
   assessoria pode ser classificada nesse tier, nem administrativamente via
   `PATCH /api/admin/assessorias/{id}/assinatura`.

Sem este ajuste, a landing (`landing-page-mvp-lancamento`) publicaria uma promessa que o produto não
cumpre: uma assessoria fundadora que vira Basic no dia 61 do trial receberia 10 atletas, não os 20
anunciados na própria página que a convenceu a entrar.

## What Changes

Backend apenas (`apps/menthoros-backend`), aditivo — nenhuma coluna nem dado existente é removido.

- `CoachSignupServiceImpl`: `MAX_ATLETAS_BASIC` de `10` para `20` (`MAX_TECNICOS_BASIC` permanece `1`,
  já correto).
- `PlanoAssessoria` (`enum`): novo valor `SCALE`.
- Nova migration Flyway (`V83__...`, próxima livre): recria `chk_plano` incluindo `SCALE` (e mantendo
  `GRATUITO`, hoje ausente do CHECK apesar de existir no enum Java — ver Open Questions).

## Acceptance Criteria

1. **Basic com 20 atletas.** Given um auto-cadastro público via `POST` do `CoachSignupController`,
   When a assessoria é criada, Then `plano = BASIC`, `maxAtletas = 20`, `maxTecnicos = 1`.
2. **Scale é um plano válido.** Given uma chamada administrativa que define
   `PlanoAssessoria.SCALE`, When persistida, Then não viola `chk_plano` nem o `@Enumerated` do JPA.
3. **Sem regressão nos tiers existentes.** Given a suíte de testes atual de `CoachSignupServiceImplTest`,
   `AssessoriaMapperTest`, `AssessoriaSettingsServiceImplTest` e `AssinaturaServiceImplTest`, When
   rodada após a change, Then passa sem alteração de comportamento para `GRATUITO`/`BASIC`/`PRO`/
   `ENTERPRISE`.

## Open Questions & Assumptions

- **Assumido:** assessorias já criadas antes desta migration mantêm `maxAtletas = 10` (a mudança só
  vale para cadastros novos — a constante é lida só na criação, não há job de backfill). Aceitável
  porque o MVP ainda não tem assessorias reais em produção além de dados de teste/homelab; **conferir
  com o founder se algum dado real já existe antes de assumir que backfill é dispensável.**
- **Observação:** `chk_plano` (migration `V2`) nunca incluiu `GRATUITO`, apesar do enum Java já ter
  esse valor — inconsistência pré-existente, não introduzida por esta change. A nova migration
  aproveita para incluir `GRATUITO` também, fechando esse gap de graça (mesmo custo de migration).
- **Fora de escopo:** limites de atletas/técnicos de Pro/Enterprise/Scale não têm constante fixa no
  código — são definidos livremente pelo admin ao provisionar a assinatura
  (`AssessoriaInputDto.maxAtletas/maxTecnicos`). Não há necessidade de hardcodar esses valores; a
  tabela da landing é a referência de vendas, não um limite tecnicamente imposto para esses tiers.

## Métrica de sucesso

Nenhum coach cadastrado após esta change recebe um limite de plano diferente do publicado na landing —
zero divergência entre o que a página promete e o que o backend aplica no momento do cadastro.
