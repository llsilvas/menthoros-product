# Design: add-athlete-engagement-signals

## Contexto

Duas features pequenas e independentes, ambas derivadas de dado que já existe em `develop`:
streak de consistência (Home) e próxima prova/meta (Progresso, tab Provas). Seguem o mesmo
princípio de reconciliação sem fabricar dado das changes irmãs (`wire-athlete-shell-to-endpoints`,
`wire-athlete-progress-to-endpoints`).

## Contrato real dos DTOs (fonte: backend em develop)

```
TreinoRealizadoOutputDto[]  { dataTreino, distanciaKm, tipoTreino, ... } — GET /me/treinos?dias=N (existe, máx 30)
ProvaOutputDto[]            { nome, data, distanciaKm, ... }             — NOVO GET /me/provas (espelha /{atletaId}/provas)
```

## D0 — Decisões

### D0.1 — Streak calculado client-side, sem endpoint novo

`GET /me/treinos?dias=30` já cobre ~4 semanas cheias. Streak = função pura
`calcularStreakSemanas(treinos, hoje?)`:
1. Agrupar treinos por semana ISO (segunda a domingo).
2. Semana "consistente" = ≥1 treino no agrupamento.
3. Streak = contar semanas consistentes consecutivas, começando da semana atual (ou da anterior,
   se a atual ainda está em andamento e sem treino registrado ainda) e andando para trás até achar
   a primeira semana sem treino.
4. Streak = 0 → **não renderizar** o card (não mostrar "0 semanas"), para não pressionar
   negativamente o atleta logo no primeiro uso ou após uma pausa.

### D0.2 — `/me/provas` como espelho do endpoint do coach

`ProvaController` já expõe `GET /atletas/{atletaId}/provas` (sem `@PreAuthorize`, mas usado hoje só
pelo fluxo do coach que já resolve `atletaId` via UI). Para o atleta, replicar o padrão de
segurança dos demais `/me/*` do `AtletaProgressController`: `@PreAuthorize("hasRole('ATLETA')")` +
`resolverAtletaIdAtual()`, sem receber `atletaId` no path (elimina risco de IDOR por construção).

### D0.3 — "Próxima prova" é filtro client-side, não um endpoint dedicado

`GET /me/provas` retorna todas as provas do atleta (passadas e futuras) — o mesmo formato que
`ProvaController.listarProvas` já entrega. O frontend filtra `data >= hoje` e pega a mais próxima;
sem prova futura → CTA. Evita um endpoint "próxima prova" dedicado para uma lógica trivial.

## D1 — Matriz de reconciliação

| Card | Tratamento | Origem |
|---|---|---|
| Streak (Home) | **Derivar** | `calcularStreakSemanas` sobre `GET /me/treinos?dias=30` |
| Próxima prova (Progresso/Provas) | **Mapear + filtrar** | `GET /me/provas`, filtro `data >= hoje`, ordenado por `data` asc |
| Streak = 0 | **Ocultar** | não exibir "0 semanas" — ver D0.1.4 |
| Sem prova futura | **Adiar (CTA honesto)** | "peça ao seu coach para cadastrar sua próxima meta" |

## D2 — Hooks/serviço (idêntico ao padrão já estabelecido)

- `useAthleteProvas` (novo hook, `{ data, loading, error, refetch }`), método `getProvas()` no
  serviço curado do atleta (estender `AthleteShellService`/`AthleteProgressService` — o que já
  existir na branch de implementação; evitar criar um terceiro serviço).
- `calcularStreakSemanas(treinos: TreinoRealizadoOutputDto[], hoje?: Date): number` — função pura,
  testável isoladamente sem mock de rede (casos: sem treino, streak ativo, streak quebrado,
  semana atual em andamento).

## Riscos e mitigações (pré-mortem)

- **R1 — Streak "0" visível desmotiva o atleta.** *Mitigação:* card oculto quando streak = 0
  (D0.1.4), não renderizado como número negativo.
- **R2 — Regra de "semana consistente" (≥1 treino) parece fraca/generosa demais.** *Mitigação:*
  v1 deliberadamente simples (paridade com o discovery, que recomenda regra explicável antes de
  score sofisticado); refinar limiar é iteração futura, não bloqueia esta change.
- **R3 — `/me/provas` sem filtro de tenant** exporia prova de outro atleta. *Mitigação:*
  `resolverAtletaIdAtual()` (mesmo padrão testado dos demais `/me/*`) elimina o vetor — sem
  `atletaId` no path, não há IDOR possível.
- **R4 — CTA de "sem prova" empurra o atleta pro coach sem contexto.** *Mitigação:* copy explícita
  ("peça ao seu coach"), não um erro genérico.

## Fora de escopo

Retention Radar/Next Best Action (coach-facing, Sprint 26+); qualquer notificação push/e-mail
automática ao atleta (viola coach-in-the-loop); gamificação além do streak simples (badges,
pontos, etc. — não avaliado neste discovery); edição de prova pelo atleta (permanece TECNICO/ADMIN).
