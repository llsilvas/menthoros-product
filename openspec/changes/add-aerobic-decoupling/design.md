# Design — add-aerobic-decoupling

## Contexto

Decoupling aeróbico (Pa:HR) = deterioração do fator de eficiência `velocidade/FC` entre a 1ª e a 2ª metade de um esforço aeróbico contínuo. O dado de entrada já existe no domínio; falta o cálculo + a exposição. Esta change adota a **Opção 1** (derivar dos segmentos persistidos), sem tocar a ingestão.

Referências (estado atual):
- Entidade: `entity/TreinoRealizado.java` (agregados do treino) + `entity/EtapaRealizada.java:48-76` (segmentos: `ordem`, `duracao`, `distanciaKm`, `fcMedia`, `fcMax`, `paceMedia`, `velocidadeMedia`, `potenciaMedia`, `tipoEtapa`).
- DTO de saída: `dto/output/TreinoRealizadoOutputDto.java` (`@JsonInclude(NON_NULL)`, lista `etapasRealizadas`), montado por `mapper/TreinoMapper.toOutputDto`. Retornado por `TreinoRealizadoController` em `marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`.
- Numerador análogo já existente (agregado): `skills/race/PaceRegressionCalculator.java:74-76` (`pace / (avgHr/lthr)`).
- Front: `types/TreinoRealizado.ts` (interface `TreinoRealizado` com `etapasRealizadas`); dialogs `TreinoRealizadoDialog.tsx` / `DetalheTreinoDialog.tsx`; tokens `semantic.*` (`theme/tokens.ts`).

## Decisão 1 — Cálculo (helper backend, derivado)

Novo `services/helper/DecouplingCalculatorService` com assinatura pura sobre os segmentos:

```
Double calcular(List<EtapaRealizada> etapas):
  1. filtrar segmentos elegíveis: fcMedia > 0 e velocidade (ou pace) válida;
     descartar aquecimento/desaquecimento se tipoEtapa permitir identificá-los.
  2. gate de aplicabilidade (Decisão 2) — se não passa, return null.
  3. ordenar por `ordem`; particionar por TEMPO ACUMULADO em 1ª/2ª metade
     (o segmento que cruza o ponto médio pode ser dividido proporcionalmente
     ou alocado pela maior fração — decidir no 1.x).
  4. para cada metade: velocidade e FC ponderadas por duração → EF = velMédia / fcMédia.
  5. decoupling% = (EF1 - EF2) / EF1 * 100.  (positivo = piora; pode ser negativo = melhora/“coupling”).
  6. return arredondado (1 casa).
```

- **Velocidade vs. pace:** usar `velocidadeMedia` (km/h) diretamente como saída aeróbica (pace é o inverso; EF com velocidade evita inversão de sinal). Se só houver `paceMedia`, converter para velocidade.
- **Derivado, não persistido:** computado a cada montagem do DTO. Sem coluna, sem migration (AC3, AC5).
- **Reuso:** se a conversão pace↔velocidade ou a ponderação por duração já existir em `TssCalculatorService`/util, reusar em vez de duplicar.

## Decisão 2 — Gate de aplicabilidade (não calcular sobre intervalado)

Decoupling sobre um treino intervalado é **ruído**. O gate retorna `null` (não aplicável) quando:
- `< 2` segmentos elegíveis, **ou**
- alguma metade fica sem FC ou sem velocidade válida, **ou**
- o esforço **não é steady**. Critério (open question, decidir no 1.x):
  - **Recomendado:** baixa variância de zona/FC entre segmentos (esforço homogêneo) — robusto, independe da classificação manual.
  - **Fallback:** `TipoTreino` ∈ {contínuos: rodagem/longo/tempo}; excluir explicitamente intervalado/fartlek.

`null` é semântico ("não aplicável"), distinto de zero. O front trata `null` como estado dedicado (AC4).

## Decisão 3 — Exposição no contrato

Campo aditivo em `TreinoRealizadoOutputDto`:

```java
@Schema(description = "Decoupling aeróbico Pa:HR (% de queda de eficiência da 1ª p/ 2ª metade); "
                    + "null quando não aplicável (esforço não contínuo ou dados insuficientes)",
        example = "4.2")
Double decouplingPercentual
```

Preenchido no `TreinoMapper.toOutputDto` (que já tem a `List<EtapaRealizada>` da entidade) chamando o helper. `@JsonInclude(NON_NULL)` já é default do record → ausente quando `null`. Aparece em todas as respostas que retornam o DTO, sem novo endpoint.

## Decisão 4 — Front: indicador no detalhe do treino realizado

- **Tipo:** add `decouplingPercentual?: number` ao `TreinoRealizado` (`types/TreinoRealizado.ts`) + cliente curado (`src/api`).
- **Componente:** um `DecouplingBadge` (pequeno, reutilizável) — recebe `value: number | null`:
  - `null` → chip "Decoupling: n/d" + tooltip "disponível só em treinos contínuos".
  - número → `{value}%` colorido por faixa:
    - `< 5%` → `semantic.success[500]` (boa durabilidade)
    - `5–10%` → `semantic.warning[500]`
    - `> 10%` → `semantic.danger[500]`
  - tooltip: "Queda de eficiência (pace/FC) da 1ª para a 2ª metade. Menor é melhor."
- **Local:** detalhe do treino **realizado** — confirmar superfície no 0.x (candidatos: `TreinoRealizadoDialog`, card de treino realizado). Sem números crus reimplementados no componente; faixa centralizada numa função `decouplingTone(value)`.

## Contrato com a API (consumo)

| Endpoint (já existente) | Método | Muda? |
|---|---|---|
| `/api/v1/treinos/{id}/marcar-realizado` | POST | resposta ganha `decouplingPercentual` |
| `/api/v1/treinos/{atletaId}/lancar-treino` | POST | idem |
| `/api/v1/treinos/realizados/{id}` | PUT | idem |
| `/api/v1/treinos/realizados/{id}/enriquecer-strava` | POST | idem |

Nenhum endpoint novo. Multi-tenancy inalterada (os endpoints já validam tenant).

## Sequenciamento cross-repo

1. **Backend** (branch `feature/add-aerobic-decoupling` em `apps/menthoros-backend`): helper + gate + campo no DTO + wiring no mapper + testes → PR → merge em `develop`.
2. **Contrato:** regen scratch + port à mão do campo no cliente curado do front.
3. **Frontend** (branch `feature/add-aerobic-decoupling` em `apps/menthoros-front`): tipo + `DecouplingBadge` + integração no detalhe + testes → PR.

O front depende do contrato do backend mergeado. Não mergear local; integrar via PR.

## Impacto em testes

- **Backend:** `DecouplingCalculatorServiceTest` — caso contínuo (decoupling positivo conhecido), caso "melhora" (negativo), intervalado → `null`, <2 segmentos → `null`, metade sem FC → `null`, partição por tempo no segmento que cruza o meio. Ajustar `TreinoMapperTest`/fixtures para o campo novo.
- **Front:** `DecouplingBadge` — render por faixa (cor correta), estado `null` ("n/d"), tooltip; sem assert de cálculo (o cálculo é backend).

## Alternativas consideradas

- **Opção 2 — streams crus** (`/activities/{id}/streams` + entidade `TreinoAmostra`): habilita curva de decoupling e drift intra-segmento, mas exige nova ingestão, migration, volume de dados e backfill. **Rejeitada para v1** (non-goal/follow-up).
- **Persistir `decouplingPercentual` como coluna** (vs. derivar): exigiria migration e recálculo em backfill, sem ganho — o cálculo é barato sobre os segmentos já carregados. **Rejeitada**; manter derivado.
- **Calcular no front** a partir de `etapasRealizadas`: duplicaria regra de domínio no cliente (mesmo antipadrão que [[expose-form-status]] corrigiu). **Rejeitada**; backend é dono do cálculo.

## Não-objetivos (reafirmados)

- Streams/amostras 1–4 Hz e curva intra-treino (Opção 2 — follow-up).
- Pw:HR baseado em potência (corrida tem potência esparsa).
- Persistência/coluna do decoupling (mantido derivado).
