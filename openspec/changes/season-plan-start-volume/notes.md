# Notas — season-plan-start-volume

## Validação dos dados (6.1, 2026-11-25)

Query só de leitura no banco do homelab, com as regras do `resolverVolume` (semanas de 2026-09-28 a
2026-11-16, treinos sem `CANCELADO`; `L0` de 2026-10-12 a 2026-11-22, sem `PROVA`), atleta
`d83c4c31-…` (conta de referência):

- Semanas: 29,2 · 30,0 · 25,3 · 18,2 · 3,7 · 23,4 · 16,2 · 6,8 → mediana (18,2 + 23,4) / 2 = **20,8 km**.
- `L0` = 7,37 → **7,4 km**.

Bate com o proposal. A regeneração pela tela depende do deploy da branch no dev; em 2026-11-25 a
temporada da conta já estava ACTIVE (o `generate` responde 409 enquanto houver ACTIVE).

## Métrica (6.2) — baseline

Rodar depois do deploy da V122. Uma linha por v1 aprovada (a v1 segue ACTIVE, ARCHIVED ou COMPLETED;
`approved_at` marca a aprovação). Temporadas anteriores à V122 ficam fora (`initial_volume_source` nulo).

```sql
with v1 as (
    select p.id, p.tenant_id, p.initial_volume_source, p.proposed_volume_km, p.initial_volume_km,
           exists (select 1 from tb_season_week w
                   where w.season_plan_id = p.id and w.value_source = 'COACH') as tem_semana_coach
    from tb_plano_treino p
    where p.season_status is not null
      and coalesce(p.version, 1) = 1
      and p.base_season_plan_id is null
      and p.approved_at is not null
      and p.initial_volume_source is not null
)
select count(*)                                                              as v1_aprovadas,
       round(100.0 * count(*) filter (where initial_volume_source <> 'COACH'
                                        and not tem_semana_coach) / nullif(count(*), 0), 1)
                                                                             as pct_sem_recalculo_nem_edicao,
       count(*) filter (where initial_volume_source = 'COACH')              as recalculadas,
       round(avg(initial_volume_km - proposed_volume_km)
             filter (where initial_volume_source = 'COACH'), 1)             as delta_medio_km,
       round(avg(abs(initial_volume_km - proposed_volume_km) / nullif(proposed_volume_km, 0) * 100)
             filter (where initial_volume_source = 'COACH'), 1)             as delta_abs_medio_pct
from v1;
```

A meta (≥ 60% das v1 de provas ≥ meia aprovadas sem recálculo nem edição) vale depois da change do
D10/Q3; para o recorte por distância, juntar `tb_prova` por `p.prova_id`.
