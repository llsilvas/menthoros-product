# Proposal: add-athlete-retention-quick-wins

**Tamanho:** S (3 × XS, mesmo repo) · **Trilha:** Full (backend pequeno + frontend)

## Status

Proposed (2026-07-03). Identificado durante auditoria de retenção do roadmap — 3 lacunas de alto
ROI e baixo custo, sequenciadas por ROI decrescente. Todas cabem antes da maratona de infra
(`add-llm-tool-use`, Sprint 10–11) por dependerem apenas de dado já existente e não bloquearem
nem serem bloqueadas por ela.

## Why

O discovery de retenção (`prd/product-discovery-retencao-atletas-90d.md`) já mapeou as causas de
churn. O Retention Loop 90d completo (Sprint 26+, founder-gated) resolve todas, mas é pesado e
depende de messaging/weekly-review ainda não construídos. As 3 features abaixo atacam as causas
nº3 (baixa percepção de progresso) e nº5 (pouca conexão coach-atleta) com custo XS cada,
**imediatamente**, usando dado que já existe hoje.

A ordem abaixo é a sequência de implementação proposta, por ROI decrescente.

---

### Feature A — Feedback pós-treino (ROI: 🔥🔥🔥🔥🔥 | XS, 2–3 dias)

**Problema:** após registrar treino manual (Sprint 9d), o atleta não recebe nenhum retorno.
Silêncio total. Nem um "bom trabalho". Isso é um killer de retenção: o atleta fez o esforço de
abrir o app, logar o treino, e não recebe nada de volta.

**Solução:** card/modal na Home ou pós-registro com resumo do treino + feedback determinístico
(template, sem IA). Exemplo:

> "Bom treino! 60 min de corrida, 10 km, TSS 62. Mantenha a consistência!"

**Todo o dado já existe** em `TreinoRealizadoOutputDto` (tipo, duração, distância, TSS) via
`GET /me/treinos`. O feedback é derivado de regras simples:
- `tipoTreino` → verbo ("Corrida", "Intervalado", "Longão")
- Duração + distância → display formatado
- `percepcaoEsforco` (RPE) + `tssCalculado` → template de tom
- Sem IA, sem endpoint novo, sem migrate — só template de UI.

**Sem dependências de outras changes** (dado do 9d já existe em develop).

---

### Feature B — Kudos do coach para o atleta (ROI: 🔥🔥🔥🔥🔥 | XS, 2–3 dias)

**Problema:** o coach aprova plano, edita treino, vê perfil do atleta — mas não tem nenhum botão
de "mandar um reconhecimento" sem esperar a mensageria completa (`add-athlete-coach-messaging`,
Sprint 25). O atleta abre a Home e não sente vínculo com o coach. Causa nº5 de churn (baixa
conexão coach-atleta).

**Solução:** `POST /coach/atletas/{id}/kudos` — endpoint simples (nova tabela `tb_kudos`:
`id`, `atletaId`, `coachId`, `motivo` (enum pré-definido: `CONSISTENCIA`, `MELHORA`, `ESFORCO`,
`SUPERACAO`, `VOLTA`), `createdAt`) + card na Home do atleta "Seu coach reconheceu sua consistência!"

**Benefícios:**
- Ponte de vínculo até a mensageria real (Sprint 25), custando ~1% do que ela custaria.
- O coach clica 1 vez no perfil do atleta — não precisa escrever nada.
- O atleta vê que o coach está presente mesmo sem chat.
- Dados alimentam o Retention Radar futuro (Sprint 26+) como sinal de engajamento do coach.

**Dependências:** perfil do atleta (Sprint 9f) — já em develop. Nenhuma dependência de changes
futuras.

---

### Feature C — Resumo semanal na Home do atleta (ROI: 🔥🔥🔥🔥 | XS, 3–4 dias)

**Problema:** o atleta vê o treino de hoje e métricas avulsas, mas não tem uma visão agregada
da semana — "afinal, valeu a pena essa semana?" (causa nº3: baixa percepção de progresso).

**Solução:** seção na Home "Seu resumo da semana" com:
- Nº de treinos realizados (de `GET /me/treinos?dias=7`)
- Volume total (km) (de `GET /me/treinos?dias=7`)
- Streak de semanas (reusa `calcularStreakSemanas` da 9.7)
- Forma atual (TSB/statusForma) (reusa `GET /me/home`)
- Próximo treino agendado (já vem de `GET /me/home`)

**Sem endpoint novo** — só adapter de UI sobre dados que todos os hooks da 9.5/9.6/9.7 já buscam.

**Dependências:** `wire-athlete-shell-to-endpoints` (9.5) — os hooks de Home (`useAthleteHome`,
`useAthleteReadiness`) já estão sendo criados lá; esta feature estende o adapter deles.

---

## Critérios de aceite

Formalizados em Given-When-Then no `design.md` (D1) após o DoR gate apontar a versão narrativa
original como não-testável. Resumo:

### Feature A — Feedback pós-treino
- **CA-A1:** após registrar treino via `POST /api/v1/atletas/me/treinos` (retorna 201 com o
  `TreinoRealizadoOutputDto` no corpo), o atleta vê um card de confirmação com tipo, duração,
  distância e TSS — sem IA, sem endpoint novo.
- **CA-A2:** feedback usa templates determinísticos baseados no tipo de treino e RPE — ver tabela
  de casos (RPE alto/baixo/ausente, distância nula/zero, tipo desconhecido) no `design.md` D1.
- **CA-A3:** sem regressão — `npm run lint && npm run build && npm run test:run` verde.

### Feature B — Kudos
- **CA-B1:** coach clica "Reconhecer" no perfil do atleta (`/coach/athletes/:id`) → seleciona
  motivo → `POST /api/v1/coach/atletas/{atletaId}/kudos` → 201 com
  `{id, atletaId, coachId, motivo, createdAt}`.
- **CA-B2:** atleta vê o kudo na Home como card "Seu coach reconheceu sua {{motivo}}!" (últimos 3).
- **CA-B3:** atleta sem kudos não vê nada (estado vazio honesto, não card vazio).
- **CA-B4:** coach só pode dar kudos para atleta do próprio tenant — cross-tenant retorna 404
  (não 403/500), consistente com `CoachAthleteProfileController`.
- **CA-B5:** um coach não pode dar o mesmo motivo ao mesmo atleta mais de uma vez no mesmo dia —
  retry/duplo-clique/duplo-submit retorna 409 (não cria um segundo registro), sem impedir
  motivos diferentes no mesmo dia (achado do adversarial review, `design.md` D0.6).
- **CA-B6:** suíte backend verde (controller: 201, 404 cross-tenant, 400 motivo inválido, 409
  duplicata mesmo motivo/dia) + `npm run lint && npm run build && npm run test:run`.

### Feature C — Resumo semanal
- **CA-C1:** Home exibe "Seu resumo da semana" com treinos, volume, streak, forma atual e
  próximo treino — campos e formato exatos no `design.md` D1.
- **CA-C2:** todos os dados vêm de hooks já existentes (9.5/9.6/9.7) — zero endpoint novo.
- **CA-C3:** estado vazio honesto quando atleta não treinou na semana ("Você ainda não registrou
  treinos esta semana — todo treino conta!", nunca "0 treinos, 0 km" fabricado).

## Non-goals (fora do escopo desta change)

- Sem feedback gerado por IA (Feature A é 100% template determinístico).
- Sem mensageria/chat (Feature B é reconhecimento unidirecional, não substitui
  `add-athlete-coach-messaging`, Sprint 25).
- Sem histórico/timeline de kudos para o atleta (só os 3 mais recentes na Home).
- Sem analytics/telemetria de visualização dos cards novos.
- Sem persistência do card de feedback pós-treino entre sessões (efêmero, pós-submit).

## Rollback

Ver `design.md` D4 para o detalhamento por feature. Resumo: Features A e C são frontend-only
(revert de commit); Feature B é aditiva pura (nova tabela `tb_kudos`, sem alteração em tabela
existente) — rollback via `DROP TABLE IF EXISTS tb_kudos` + remoção dos 2 endpoints/UI.

## Métrica de sucesso

**Hipótese de produto a observar pós-launch (não é gate de aceite):** taxa de atletas que
registram treino em 2+ semanas consecutivas (aderência semanal, `GET /me/aderencia`, 9.6) deve
ser maior para atletas expostos a feedback pós-treino + resumo semanal + kudos do coach do que
para os que não são. Sem baseline hoje — observação informal, não bloqueia a implementação nem o
merge (ver `design.md` D2).

## Impact

- **Depende de (Feature A):** `manual-training-entry-lightweight` (9d) — dado de treino, já em `develop`.
- **Depende de (Feature B):** `athlete-profile-drilldown` (9f) — perfil do atleta, já em `develop`.
- **Depende de (Feature C):** `wire-athlete-shell-to-endpoints` (9.5) — hooks da Home, em implementação.
- **Repos:** `apps/menthoros-backend` (Feature B: 1 endpoint + 1 migration pequena) +
  `apps/menthoros-front` (A+B+C: cards/adapter na Home).
- **Não bloqueia nem é bloqueada por:** `add-llm-tool-use`, RAG, 9.5/9.6/9.7/9.8 — arquivos
  frontend parcialmente sobrepostos com 9.5/9.7/9.8 (Home), mas mudanças pontuais.
  Sequenciada **depois** de 9.5/9.8 para evitar PRs concorrentes em `AthleteHomePage`.
- **Roadmap:** inserida como Sprint 9.9 em `SPRINTS.md`, após 9.8.
