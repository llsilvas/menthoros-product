## 1. Backend

- [ ] 1.1 V118: `tb_season_template` + seed default das 5 distâncias; índice `(tenant_id, prova_id)` em
  `tb_plano_treino`; índice único parcial de uma `PROPOSED` por atleta. Entidade `SeasonTemplate` +
  `SeasonTemplateRepository` (épico 1.5, 1.6, 1.9)
  - verify: `ddl-auto=validate` sobe no IT; repositório devolve o template de cada distância
- [ ] 1.2 Motor mínimo `SeasonPlannerService` com `Clock`: horizonte (D3), fases do seed + semanas
  extras na Base + corte condicionado ao CTL (D9), curva (D10), bases de partida com decaimento e
  fallbacks (D11), arredondamento (épico 2.1, 2.2, 2.3 sem descargas, 2.6 sem calibração)
  - verify: testes parametrizados com os exemplos numéricos dos critérios de aceite (20 sem. KM_42,
    KM_21 curta com CTL ≥ 40 e < 40, KM_42 a 3 sem. com `n = 0`, decaimento de 10 dias, limite de
    2 sem., base faltando)
- [ ] 1.3 `nome`, `descricao`, `objetivo` do `PlanoTreino` a partir da prova (épico 1.3b)
  - verify: teste do service confere os três campos
- [ ] 1.4 Reprodutibilidade: mesma entrada + `Clock` fixo → semanas idênticas
  - verify: teste unitário compara duas gerações campo a campo
- [ ] 1.5 Endpoints `POST /season-plans` e `GET /season-plans/current` (D1), `@PreAuthorize`
  `TECNICO`/`ADMIN`, filtro por assessoria, flag `season-plan.enabled` (D5), 200/409 em gerar de novo
  (D2), 422 dos casos de D3/D11, 404 com `code: SEASON_PLAN_DISABLED` (D12), lock da prova (D13)
  (épico 4.1, 4.2, 4.12, 4.12a, 4.13)
  - verify: testes de controller (`@WebMvcTest`) para 201/200/204/409/422/404 e o corpo do 404 da flag
- [ ] 1.6 Desmarcar a alvo sem substituta arquiva a temporada aberta (D7) em `ProvaServiceImpl` e
  `OnboardingServiceImpl`; os caminhos de desmarcar/cancelar/trocar carregam a prova com lock antes de
  arquivar (D13)
  - verify: teste unitário de cada caminho + caso no `ProvaTemporadaIT` + IT concorrente de duas
    threads (POST × desmarcar)
- [ ] 1.7 IT real: POST → GET; `ATLETA` 403 com flag on/off; assessoria B 404; flag off 404; POST
  concorrente gera uma só `PROPOSED` (épico 4.12b)
  - verify: `*IT` verde em `./mvnw clean verify`
- [ ] 1.8 Validar: `./mvnw clean verify` + OpenAPI atualizado (épico 4.14)
  - verify: BUILD SUCCESS; Swagger mostra os dois endpoints

## 2. Frontend

- [ ] 2.1 `src/api/seasonPlanService.ts` + tipos à mão; hook `useSeasonPlan(atletaId)` com gerar e ler;
  204 → sem temporada; 404 com `code: SEASON_PLAN_DISABLED` → flag off; outro 404 → erro (D12;
  épico 7.12)
  - verify: teste do hook cobre 200/204/404 da flag/404 comum/erro
- [ ] 2.2 `SeasonTabPanel` em `features/coach/components/panels/`, aba **Temporada** entre Diagnóstico e
  Plano no `CoachInboxPage`: faixa de proposta, KPIs, tabela (D6; épico 7.1, 7.3, 7.4)
  - verify: teste de componente renderiza KPIs e linhas
- [ ] 2.3 Estados: sem prova, prova sem temporada com "Gerar temporada", proposta, carregando
  (skeleton), erro com "Tentar de novo"; aba oculta com a flag off (épico 7.7)
  - verify: um teste por estado
- [ ] 2.4 Testes de componente + contraste/alvos da seção 9 (épico 7.13)
  - verify: `bun test:run` verde
- [ ] 2.5 E2E Playwright (API interceptada): abrir inbox → aba Temporada → gerar → ver tabela
  - verify: `bun test:e2e` verde
- [ ] 2.6 Validar: `bun lint && bun run build && bun test:run` (épico 7.15)

## 3. Métrica (D8)

```sql
select a.tenant_id,
       count(distinct p.atleta_id) as atletas_com_alvo,
       count(distinct pt.atleta_id) as atletas_com_temporada,
       round(100.0 * count(distinct pt.atleta_id) / nullif(count(distinct p.atleta_id), 0), 1) as pct
from tb_prova p
join tb_atleta a on a.id = p.atleta_id
left join tb_plano_treino pt on pt.prova_id = p.id and pt.season_status in ('PROPOSED','ACTIVE')
where p.prova_alvo and p.data_prova >= current_date and p.status_prova <> 'CANCELADA'
group by a.tenant_id;
```

Nomes de coluna conferidos na task 1.1 contra o schema real.
