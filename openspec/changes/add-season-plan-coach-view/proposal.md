**Tamanho:** M · **Trilha:** Full

> Fatia **S5** do épico `add-season-plan-macrocycle`. Proposal, design e decisões vivem lá; a UI está
> descrita em `specs/season-plan-ui/spec.md` do épico. Esta change só delimita o escopo e os cenários.

## Why

Primeira fatia que o treinador vê: a aba Temporada no perfil do atleta, só leitura, com a ação de gerar
a proposta.

## What Changes

Tasks do épico: **7.1–7.5, 7.7, 7.12, 7.13, 7.15** (a 7.6 é da S10) e a parte da seção 9 que cabe a estas telas.

- Aba/seção `Temporada` em `CoachAthleteProfilePage`, no layout que estiver em `develop`
- `SeasonMapChart`, `SeasonKpiStrip`, `SeasonWeeksTable`, `SeasonMilestonesPanel`, `SeasonValidationsPanel`
- Service e tipos escritos à mão em `src/api`, consumidos via hook
- Rótulos: "Plano de temporada", "Semana da temporada"; fases Base, Construção, Pico, Polimento, Semana
  da prova (vocabulário do `CONTEXT.md`)

## Critérios de aceite

- **Dado** um atleta sem prova-alvo, **quando** abre a aba, **então** vê o estado vazio que orienta a
  cadastrar a prova.
- **Dado** uma prova-alvo sem temporada, **quando** abre a aba, **então** vê a ação "Gerar temporada".
- **Dado** um atleta em calibração, **quando** abre a aba, **então** a ação "Gerar temporada" está
  desabilitada com o motivo visível.
- **Dado** uma temporada em `PROPOSTA`, **quando** abre a aba, **então** vê o estado de proposta
  aguardando aprovação.
- **Dado** uma temporada `ATIVO`, **quando** abre a aba, **então** vê o mapa de fases, os KPIs, a tabela
  de semanas e os marcos.
- **Dado** erro na consulta, **quando** abre a aba, **então** vê o erro com "Tentar de novo", nunca o
  estado vazio.
- Contraste ≥ 4,5:1, alternativa textual no mapa, alvos ≥ 44 px.

## Dependências e rollout

- Depende de: `add-season-plan-api-read-generate` (S3) e de `redesign-coach-athlete-profile` em `develop`.
  Se o redesenho atrasar, entra no layout de seções atual e o redesenho reorganiza depois.
- Flag: `macrociclo.enabled`.
