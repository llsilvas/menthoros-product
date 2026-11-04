# coach-zonas-manuais — o treinador informa as faixas de cada zona à mão

**Tamanho:** L · **Trilha:** Full
**Status:** em implementação desde 2026-11-04 — `coach-cadastro-ancoras-zonas` mergeada (front #182, backend #209)
**Criado:** 2026-11-03
**Repos afetados:** `apps/menthoros-backend`, `apps/menthoros-front` — PR coordenado, backend primeiro
**Protótipo:** canvas [Zonas do Atleta — Cadastro](https://claude.ai/artifact/8Zs7CV1pXrxUMeai5oqQTZ),
modo "Informar manualmente"

> Segunda de duas. `coach-cadastro-ancoras-zonas` entrega o diálogo e o modo "Calcular pelo limiar";
> esta acrescenta o modo manual. Separada porque muda a **fonte** das zonas para todos os consumidores
> de `ZonaTreinoService`, e não só a tela.

## Why

Parte dos atletas chega com zonas definidas fora do modelo de limiar: teste de laboratório com
limiares ventilatórios, zonas que o treinador usa há anos com aquele atleta, faixas de outra
plataforma. Converter isso em um único LTHR/pace de limiar distorce as faixas. Hoje a única saída é
aceitar o cálculo Friel (FC) e os fatores de pace — ou não usar as zonas do Menthoros.

## What Changes

- **Por eixo** (FC e pace, independentes), o atleta passa a ter um modo: `LIMIAR` (padrão, cálculo
  atual) ou `MANUAL` (faixas De/Até por zona gravadas).
- Persistência das faixas manuais (Z1–Z5 de FC; Z1–Z6 de pace), validadas: De < Até, contíguas ou
  com lacuna, sem sobreposição, dentro de limites fisiológicos.
- **`ZonaTreinoService` passa a devolver a faixa manual quando o eixo está em `MANUAL`.** Todos os
  consumidores herdam: prompt da IA, `ZoneResolver`, push intervals.icu/Garmin, seletor de zona do
  editor de etapas, card e `GET .../zonas` (que ganha `modo` por eixo).
- Diálogo: seletor "Calcular pelo limiar / Informar manualmente" por aba; o manual começa
  pré-preenchido com o cálculo; "Recalcular a partir do limiar" descarta as edições.
- Card: chip com o modo de cada eixo.

## Fora do escopo

- Número de zonas diferente de 6 (ou 5 de FC). Manual edita as faixas, não a estrutura.
- Zonas por tipo de terreno/prova, zonas de potência.
- Ajuste por fadiga sobre faixa manual: decidir em Q2, não implementar sem decisão.

## Critérios de aceite (fechados no `/implement init`; cenários em `specs/coach-athlete-zones/spec.md`)

- **CA1** — Eixo FC em `MANUAL` com Z2 = 140–150: o prompt da IA, o `ZoneResolver` e o push usam
  140–150 para Z2, não o Friel.
- **CA2** — Voltar o eixo para `LIMIAR` faz os consumidores voltarem ao cálculo; as faixas manuais
  daquele eixo são apagadas (Q1).
- **CA3** — Faixas sobrepostas ou De ≥ Até → `400` com a zona apontada; o diálogo mostra o mesmo
  erro antes de salvar.
- **CA4** — Pace em `MANUAL` e FC em `LIMIAR` coexistem (eixos independentes).
- **CA5** — `GET .../zonas` expõe `modo` por eixo; o card mostra "FC: pelo limiar · Ritmo: manual".
- **CA6** — Eval set em modo auditoria (determinístico) com as mesmas divergências do baseline
  anterior à change; etapa v2 de atleta em `MANUAL` resolvida com a faixa manual (`SessionResolverTest`).
- **CA7 (E2E)** — Treinador muda o ritmo para manual, edita Z2, salva; card e seletor de zona do
  editor de etapas mostram a faixa editada.

## Métrica de sucesso

% de atletas com ao menos um eixo em `MANUAL` 60 dias após o deploy, e quantos desses têm
treinos enviados ao relógio com a faixa manual — se ninguém usar, o modo é removido.

## Riscos e mitigações

- **Superfície grande**: 7 consumidores de faixa de zona (mapa em `design.md`). Mitigação: a precedência fica dentro
  de `ZonaTreinoService` (um ponto), não espalhada; teste de contrato por consumidor crítico.
- **Limiar muda e as faixas manuais não acompanham.** Mitigação: ao salvar novo limiar com eixo em
  `MANUAL`, o diálogo avisa e oferece recalcular.
- **Interação com `revalidar-fatores-pace-zonas`**: fatores novos mudam o pré-preenchimento do manual,
  não as faixas já gravadas.

## Open Questions & Assumptions

- **Q1 (decidida 2026-11-04)** — Voltar para `LIMIAR` **apaga** as faixas manuais daquele eixo, com confirmação no diálogo.
- **Q2 (decidida 2026-11-04)** — O ajuste por fadiga **vale igual** sobre pace manual (segue só informativo).
- **Q3 (decidida 2026-11-04)** — Lacuna entre zonas é aceita; sobreposição não.
- **A1** — Z6 continua sem faixa de FC também no modo manual (`FC_NAO_ESTABILIZA`).
- **UX (revisão do protótipo, 2026-11-03)** — "Recalcular a partir do limiar" descarta edições:
  pedir confirmação. Zona inválida sinalizada por `aria-invalid` + texto na própria linha, não só cor.
  Inputs De/Até com ≥ 44 px de altura.
- Q1–Q3 aprovadas pelo usuário em 2026-11-04 (task 0.1).
