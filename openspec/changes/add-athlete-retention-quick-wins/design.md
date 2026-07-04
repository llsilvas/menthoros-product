# Design: add-athlete-retention-quick-wins

## Contexto

DoR gate (`spec-reviewer`) retornou **NOT READY** na primeira submissão, com 4 gaps críticos e 3
secundários. Este documento resolve cada um, com verificação direta contra o código real (backend
`develop` + frontend `develop`).

## Achados da verificação contra o código real

### D0.1 — Migration V50 (Feature B) violava os Table Design Standards do backend

DDL original em `tasks.md` (B.1) tinha 4 problemas frente ao padrão observado em migrations
recentes (`V46__Create_checkin_prontidao_table.sql` como referência):

| Problema | Original | Corrigido |
|---|---|---|
| `id` sem default | `UUID PRIMARY KEY` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
| Sem `tenant_id` | ausente | `tenant_id UUID NOT NULL` (guardrail obrigatório) |
| Timestamp sem timezone | `TIMESTAMP` | `TIMESTAMPTZ` |
| Default não idiomático | `DEFAULT CURRENT_TIMESTAMP` | `DEFAULT NOW()` |
| Índice tenant-scoped ausente | nenhum | `idx_kudos_tenant_atleta ON tb_kudos(tenant_id, atleta_id, created_at DESC)` |

DDL final (V50, confirmado livre — última migration aplicada é V49):

```sql
-- =====================================================================
-- V50: Cria a tabela tb_kudos (reconhecimento do coach para o atleta)
--
-- Rollback (se necessário): DROP TABLE IF EXISTS tb_kudos;
-- Feature aditiva pura — sem impacto em dado existente; reversão segura.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tb_kudos (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id   UUID        NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    coach_id    UUID        NOT NULL REFERENCES tb_usuario(id) ON DELETE CASCADE,
    motivo      VARCHAR(20) NOT NULL CHECK (motivo IN ('CONSISTENCIA','MELHORA','ESFORCO','SUPERACAO','VOLTA')),
    data        DATE        NOT NULL DEFAULT CURRENT_DATE,
    tenant_id   UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_kudos_atleta_coach_motivo_data UNIQUE (atleta_id, coach_id, motivo, data)
);

CREATE INDEX IF NOT EXISTS idx_kudos_tenant_atleta ON tb_kudos(tenant_id, atleta_id, created_at DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ V50 - tb_kudos criada com sucesso';
END$$;
```

`motivo` como `VARCHAR` + `CHECK` (não uma tabela de lookup) é consistente com `nivel_prontidao` em
`tb_checkin_prontidao` (V46) — mesmo padrão já estabelecido no codebase para enum-backed columns.
A coluna `data` + `UNIQUE (atleta_id, coach_id, motivo, data)` resolve o D0.6 abaixo.

### D0.6 — Achado do adversarial review (Codex): kudos não era idempotente (gap High)

Revisão adversarial (`/codex:adversarial-review`) apontou que o contrato original de kudos não
tinha nenhuma proteção contra duplicata: um duplo-clique, retry de rede após timeout, ou submit
repetido criaria múltiplos registros idênticos (mesmo atleta/coach/motivo), poluindo os "últimos 3"
exibidos na Home e corrompendo o sinal futuro do Retention Radar.

**Decisão:** regra de unicidade por dia — um coach não pode dar o **mesmo motivo** ao **mesmo
atleta** mais de uma vez no **mesmo dia** (constraint `uk_kudos_atleta_coach_motivo_data` acima).
Diferente de `tb_checkin_prontidao` (que é upsert por data — o atleta "edita" o check-in do dia),
kudos é um **evento**, não um estado — por isso a violação de unicidade retorna **409 Conflict**
(não um upsert silencioso), deixando explícito para o coach que já reconheceu esse motivo hoje.
Motivos diferentes no mesmo dia continuam permitidos (ex.: `CONSISTENCIA` de manhã + `ESFORCO` à
tarde, após um treino difícil) — a regra bloqueia só o caso de duplicata acidental (clique duplo,
retry), não a expressividade do recurso.

`KudosService.registrar(...)` deve pré-validar via
`kudosRepository.existsByAtletaIdAndCoachIdAndMotivoAndData(...)` e lançar
`DuplicateResourceException` com mensagem clara ("Você já reconheceu a consistência deste atleta
hoje.") caso já exista — **`DuplicateResourceException` já está mapeada para 409 Conflict** no
`GlobalExceptionHandler` (`@ExceptionHandler(DuplicateResourceException.class)`, usada em
`AssessoriaServiceImpl`/`StravaActivityServiceImpl`) — não `DomainRuleViolationException`, que
mapeia para 422 e é para violação de regra de negócio, não duplicata. A constraint `UNIQUE` no
banco é a defesa de última linha contra race condition (dois requests concorrentes passando a
pré-validação); se disparar, `DataIntegrityViolationException` já é capturada genericamente pelo
handler existente (409 também) — sem necessidade de tratamento extra.

### D0.2 — `TreinoRealizadoOutputDto` e o endpoint de registro (Feature A) — confirmados sem gap

Verificado: `TreinoRealizadoOutputDto` tem `tipoTreino`, `duracaoMin` (String `"HH:MM:SS"`),
`distanciaKm` (`Double`, nullable), `tssCalculado` (`Integer`), `percepcaoEsforco` (`Integer`,
nullable). `POST /api/v1/atletas/me/treinos` retorna 201 com o DTO no corpo — a Feature A pode
consumir a resposta do próprio submit, sem round-trip extra.

### D0.3 — Role do coach (Feature B) — confirmado sem gap

`CoachAthleteProfileController` usa `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` — o novo
endpoint de kudos deve usar a mesma anotação (não `hasRole('TECNICO')` sozinho, que excluiria ADMIN
indevidamente).

### D0.4 — Hooks da Feature C — confirmados sem gap

`useAthleteHome`, `useAthleteReadiness` e `calcularStreakSemanas` (`streakAdapter.ts`) já existem em
`develop` (entregues por 9.5/9.7, ambas mergeadas). Sem bloqueio de dependência.

### D0.5 — Nome do coach para o card de kudos (Feature B, gap não coberto pela spec original)

O card "Seu coach reconheceu sua {{motivo}}!" não precisa exibir o nome do coach (a spec não pede
isso — é sempre "seu coach", singular, já que cada atleta tem um treinador). `coachNome` foi
removido do contrato de `GET /me/kudos/recentes` (ver D1 abaixo) para evitar buscar/expor dado que a
UI não usa — reduz superfície da query e do DTO.

## D1 — Critérios de aceite em Given-When-Then (substituem a versão narrativa do proposal.md)

### Feature A — Feedback pós-treino

**CA-A1** (dados do card)
```
GIVEN o atleta está na ManualTrainingFormPage
WHEN submete um treino e recebe 201 com TreinoRealizadoOutputDto
  {tipoTreino: 'CORRIDA', duracaoMin: '01:00:00', distanciaKm: 10.0, tssCalculado: 62, percepcaoEsforco: 6}
THEN PostWorkoutFeedbackCard renderiza, nesta ordem:
  - "🏃 Corrida" (emoji + label do tipoTreino)
  - "60 min" (duracaoMin formatado)
  - "10 km" (distanciaKm formatado, 1 casa decimal)
  - "TSS 62"
  - "Bom treino! Mantenha a consistência." (default, RPE entre 5 e 7)
AND exibe botão "Voltar para Home" que fecha o card e navega para /athlete/home
```

**CA-A2** (variações de template — tabela de casos)
| Caso | Condição | Texto extra |
|---|---|---|
| RPE alto | `percepcaoEsforco >= 8` | "Grande esforço! Respeite a recuperação." |
| RPE baixo | `percepcaoEsforco <= 4` | "Bom treino leve! Ativação no ponto." |
| RPE ausente | `percepcaoEsforco == null` | usa o texto default (não fabrica RPE) |
| Sem distância | `distanciaKm == null \|\| distanciaKm == 0` | omite a linha de distância (ex.: musculação) |
| Tipo desconhecido | `tipoTreino` sem mapeamento de emoji | usa label do enum sem emoji, nunca quebra |

**CA-A3** — `npm run lint && npm run build && npm run test:run` verde; `PostWorkoutFeedbackCard`
tem teste de componente cobrindo os 5 casos da tabela acima (função de template pura, sem mock de
rede).

### Feature B — Kudos

**CA-B1** (criação)
```
GIVEN um usuário autenticado com role TECNICO ou ADMIN, atleta do mesmo tenant
WHEN POST /api/v1/coach/atletas/{atletaId}/kudos com body {"motivo": "CONSISTENCIA"}
THEN retorna 201 com body {id, atletaId, coachId, motivo, createdAt}
```

**CA-B2** (leitura pelo atleta)
```
GIVEN um atleta autenticado com kudos recebidos
WHEN GET /api/v1/atletas/me/kudos/recentes
THEN retorna 200 com [{id, motivo, createdAt}, ...] — últimos 10, ordenados created_at DESC
```

**CA-B3** (card na Home)
```
GIVEN useKudosRecentes retorna ao menos 1 kudo
WHEN AthleteHomePage renderiza
THEN exibe card "Seu coach reconheceu sua {{motivo em texto}}!" para até os 3 mais recentes
  (motivo mapeado para texto: CONSISTENCIA→"consistência", MELHORA→"melhora", ESFORCO→"esforço",
  SUPERACAO→"superação", VOLTA→"volta por cima")
```

**CA-B4** (estado vazio honesto)
```
GIVEN useKudosRecentes retorna lista vazia
WHEN AthleteHomePage renderiza
THEN nenhum card de kudos é exibido (sem placeholder, sem "0 kudos")
```

**CA-B5** (isolamento de tenant — negativo)
```
GIVEN um TECNICO do tenant A e um atleta do tenant B (mesmo id de atleta não existe no tenant A)
WHEN POST /api/v1/coach/atletas/{atletaIdDoTenantB}/kudos
THEN retorna 404 (não 403 nem 500) — consistente com o padrão de outros endpoints coach→atleta
  (@RequireTenant já usado em CoachAthleteProfileController)
```

**CA-B6** — `./mvnw clean test` (controller: 201, 404 cross-tenant, 400 motivo inválido) +
`npm run lint && npm run build && npm run test:run` verde.

### Feature C — Resumo semanal

**CA-C1** (dado completo)
```
GIVEN o atleta tem 3 treinos nos últimos 7 dias somando 25.5 km, streak de 4 semanas,
  forma "BOM" (statusForma) e próximo treino "Intervalado" (de useAthleteHome)
WHEN AthleteHomePage renderiza a seção "Seu resumo da semana"
THEN exibe: "3 treinos", "25.5 km", "4 semanas seguidas", "Forma: Boa", "Próximo: Intervalado"
```

**CA-C2** — zero endpoint novo: `buildWeeklySummary` é função pura sobre dados já buscados por
`useAthleteHome`/`useAthleteReadiness`/`useManualTraining` (mesmo padrão de streak/próxima-prova
das mudanças 9.7/9.8 já implementadas nesta Home).

**CA-C3** (estado vazio honesto)
```
GIVEN o atleta não tem nenhum treino nos últimos 7 dias
WHEN AthleteHomePage renderiza
THEN a seção exibe "Você ainda não registrou treinos esta semana — todo treino conta!"
  (não mostra "0 treinos, 0 km" como se fosse um resumo válido)
```

**CA-C4** — `buildWeeklySummary` testado isoladamente com: dados completos, sem treinos, sem
streak (0), readiness ausente (`null` → "Forma: —", nunca fabrica um valor).

## D2 — Métrica de sucesso (revisão)

A métrica original ("aderência semanal 2+ semanas, informal, sem baseline") não é um gate de
aceite e não pode ser validada durante o desenvolvimento — é uma hipótese de produto, não um
critério de DoR. Reclassificada: mantida em `proposal.md` como **hipótese a observar pós-launch**,
removida da seção de Critérios de Aceite (que agora só contém os CAs testáveis do D1 acima). Nenhum
gate de implementação depende dela.

## D3 — Non-goals (adicionado ao proposal.md)

- Sem feedback gerado por IA (Feature A é 100% template determinístico).
- Sem mensageria/chat (Feature B é reconhecimento unidirecional, não substitui
  `add-athlete-coach-messaging`, Sprint 25).
- Sem histórico/timeline de kudos para o atleta (só os 3 mais recentes na Home).
- Sem analytics/telemetria de visualização do card de feedback ou do resumo semanal.
- Sem persistência do card de feedback pós-treino entre sessões (é efêmero, mostrado uma vez
  após o submit).

## D4 — Rollback e riscos

### Rollback
- **Feature A** (frontend-only): reverter o commit, redeploy. Sem dado persistido.
- **Feature B**: `DROP TABLE IF EXISTS tb_kudos;` (nova migration de rollback, se necessário) +
  remover os 2 endpoints + remover `KudosButton`/card na Home. Aditiva pura — não há coluna
  adicionada em tabela existente, então o rollback não arrisca dado de outras features.
- **Feature C** (frontend-only): reverter o commit.

### Riscos e mitigações
| Risco | Mitigação |
|---|---|
| `distanciaKm`/`percepcaoEsforco` nulos quebram o template do card (Feature A) | Cobrir os 5 casos de CA-A2 em teste de componente; nunca fabricar RPE/distância ausentes |
| Migration V50 sem `tenant_id` vazaria kudos entre tenants (Feature B) | Corrigido no D0.1 — `tenant_id NOT NULL` + índice composto + `@RequireTenant` no controller |
| `useAthleteHome`/`useAthleteReadiness` falham parcialmente → resumo semanal quebrado (Feature C) | `buildWeeklySummary` trata cada campo como opcional; falha de uma fonte não derruba as demais (mesmo padrão de partial-failure já usado no perfil do atleta) |
| `motivo` inválido (fora do enum) no POST de kudos | `@Valid` + `@Pattern`/enum no InputDto — 400, não 500 |

## Sequência de implementação (inalterada do tasks.md original, ordem A → B → C)

Ver `tasks.md` — refinado com os fixes acima (DDL corrigida, path variable `{atletaId}`
consistente, contratos de request/response explícitos, casos de teste explícitos por task).
