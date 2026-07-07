# Design — add-aerobic-decoupling

## Contexto

Decoupling aeróbico (Pa:HR) = deterioração do fator de eficiência `velocidade/FC` entre a 1ª e a 2ª metade de um esforço aeróbico contínuo. O dado de entrada já existe no domínio; falta o cálculo + a exposição. Esta change adota a **Opção 1** (derivar dos segmentos persistidos), sem tocar a ingestão.

Referências (estado atual):
- Entidade: `entity/TreinoRealizado.java` (agregados do treino) + `entity/EtapaRealizada.java:48-76` (segmentos: `ordem`, `duracao`, `distanciaKm`, `fcMedia`, `fcMax`, `paceMedia`, `velocidadeMedia`, `potenciaMedia`, `tipoEtapa`).
- DTO de saída: `dto/output/TreinoRealizadoOutputDto.java` (`@JsonInclude(NON_NULL)`, lista `etapasRealizadas`), montado por `mapper/TreinoMapper.toOutputDto`. Retornado por `TreinoRealizadoController` em `marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`.
- Numerador análogo já existente (agregado): `skills/race/PaceRegressionCalculator.java:74-76` (`pace / (avgHr/lthr)`).
- Front: `types/TreinoRealizado.ts` (interface `TreinoRealizado` com `etapasRealizadas`); dialogs `TreinoRealizadoDialog.tsx` / `DetalheTreinoDialog.tsx`; tokens `semantic.*` (`theme/tokens.ts`).

## Decisão 1 — Cálculo (helper backend, derivado)

Novo `services/helper/DecouplingCalculatorService` com assinatura sobre os segmentos **e o tipo do treino (nullable)**:

```
Double calcular(List<EtapaRealizada> etapas, @Nullable TipoTreino tipoTreino):
```

> **Origem do `TipoTreino` (apurado no código):** `TreinoRealizado` **não** tem campo `tipoTreino` — o tipo vem de `treinoPlanejado.getTipoTreino()`, e `treinoPlanejado` é `@ManyToOne(LAZY)` **nullable** (treino manual ou importado do Strava sem plano vinculado → sem tipo). Portanto:
> - O `TipoTreino` é **opcional** no contrato. O **belt-and-suspenders (predicado 5) só dispara quando o tipo é conhecido**; quando `null`, o gate recai **apenas no CV (predicado 4)** — que é justamente o critério robusto e independente de classificação (o belt-and-suspenders é redundância, não a defesa primária). Isso evita esconder o decoupling de toda rodagem manual/Strava (a maioria dos realizados).
> - **Cuidado LAZY:** o mapper/service deve acessar `treinoPlanejado.getTipoTreino()` **dentro da transação** (ou com o plano já carregado) para não cair em `LazyInitializationException`; se indisponível, passar `null` (degrada para CV-only, seguro). Confirmar no 1.x.

Corpo do cálculo:
```
Double calcular(List<EtapaRealizada> etapas, tipoTreino):
  1. filtrar segmentos elegíveis: fcMedia > 0 e velocidade (ou pace) válida;
     descartar aquecimento/desaquecimento se tipoEtapa permitir identificá-los.
  2. gate de aplicabilidade (Decisão 2) — se não passa, return null.
  3. ordenar por `ordem`; particionar por TEMPO ACUMULADO em 1ª/2ª metade.
     O segmento que cruza o ponto médio é **DIVIDIDO PROPORCIONALMENTE por tempo**
     (decisão fechada): a fração antes do meio conta na 1ª metade, a depois na 2ª,
     com a duração/distância rateadas — sem alocação arbitrária por "maior fração".
  4. para cada metade: velocidade e FC ponderadas por duração → EF = velMédia / fcMédia.
  5. decoupling% = (EF1 - EF2) / EF1 * 100.  (positivo = piora; pode ser negativo = melhora/“coupling”).
  6. return arredondado (1 casa).
```

- **Velocidade vs. pace:** usar `velocidadeMedia` (km/h) diretamente como saída aeróbica (pace é o inverso; EF com velocidade evita inversão de sinal). Se só houver `paceMedia`, converter para velocidade.
- **Derivado, não persistido:** computado a cada montagem do DTO. Sem coluna, sem migration (AC3, AC5).
- **Reuso:** se a conversão pace↔velocidade ou a ponderação por duração já existir em `TssCalculatorService`/util, reusar em vez de duplicar.

## Decisão 2 — Gate de aplicabilidade (não calcular sobre intervalado) — **FECHADO**

Decoupling sobre intervalado é **ruído** e, pior, **erode a confiança** no diagnóstico. Este é o ponto de maior risco da change: o gate é o critério de aceite de prioridade máxima (AC1), acima da exatidão do número. **Princípio: na dúvida, `null`.** Falso-negativo (esconder num treino talvez elegível) é aceitável; falso-positivo (número sobre intervalado) é inaceitável.

Retorna `null` se **qualquer** predicado falhar (todos testáveis):

1. **Elegibilidade** — após descartar `tipoEtapa` ∈ {AQUECIMENTO, DESAQUECIMENTO/VOLTA_CALMA} (quando identificável) e segmentos sem `fcMedia > 0` ou sem velocidade válida, restam **≥ 2** segmentos.
2. **Duração sustentada** — Σ duração dos elegíveis ≥ **20 min** (`DURACAO_MIN_SEG` calibrável). Drift aeróbico é ruído em esforço curto.
3. **Metades válidas** — cada metade (partição por tempo, Decisão 1) tem ≥1 segmento elegível com FC e velocidade.
4. **Steady por variabilidade** (robusto, independe da classificação manual):
   - `CV(fcMedia por segmento) ≤ 0.10` **E** `CV(velocidadeMedia por segmento) ≤ 0.15`, onde `CV = desvioPadrão / média`.
   - **Robustez à segmentação arbitrária:** o CV é calculado **apenas sobre segmentos ≥ `MIN_SEG_DURACAO` (60s)** — laps muito curtos (botão de lap / ruído GPS) são excluídos do CV para não inflá-lo/deflá-lo artificialmente. Se, após esse filtro, restarem `< 2` segmentos para o CV, o esforço é considerado não avaliável → `null`. *(Alternativa considerada: CV ponderado por duração; o filtro por duração mínima é mais simples e igualmente defensável para o v1.)*
   - Intervalado/fartlek têm picos e vales → CV alto → reprovado. Thresholds calibráveis.
5. **Belt-and-suspenders (só quando o tipo é conhecido)** — se `tipoTreino != null` **e** ∈ {INTERVALADO, FARTLEK, TIRO}, retorna `null` **mesmo que o CV passe** (protege contra treino real mal-segmentado, ex.: 2 laps grosseiros de um HIIT). Quando `tipoTreino == null` (treino manual/Strava sem plano), este predicado é **pulado** — o CV (predicado 4) é a defesa.
6. **Sanidade** — qualquer FC/velocidade/duração `= 0`, nula ou implausível → `null`.

**Aquecimento/desaquecimento não rotulados — coberto pelo próprio gate:** quando `tipoEtapa` não identifica warmup/cooldown, um aquecimento progressivo (rampa) ou um cooldown fazem a velocidade/FC variar entre segmentos → **elevam o CV → reprovam no predicado 4 → `null`**. Ou seja, o gate de variabilidade é a rede de segurança: um treino que "parece" contínuo mas tem rampas embutidas cai em "não aplicável", coerente com "na dúvida, null". (Warmup/cooldown *rotulados* são descartados antes, predicado 1.)

`null` é semântico ("não aplicável"), distinto de zero. O front trata `null` (e a ausência do campo, `undefined`) como estado dedicado (AC4).

> **Thresholds = heurística v1 (não lei da física).** `CV_FC_MAX=0.10`, `CV_VEL_MAX=0.15`, `DURACAO_MIN_SEG=20min`, `MIN_SEG_DURACAO=60s` são **estimativas iniciais** ancoradas em "steady = baixa variação", vivem como **constantes nomeadas** (não mágicos inline) e são **calibráveis sem mudar contrato**. **Critério de revisão pós-release:** com o sinal de adoção + a taxa de `null` observada em treinos reais, revisar os thresholds (ex.: se a taxa de `null` for altíssima em rodagens legítimas, afrouxar; se aparecer decoupling em treino claramente variável, apertar). Registrar essa revisão como follow-up.

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
- **Componente:** um `DecouplingBadge` (pequeno, reutilizável) — recebe `value: number | null | undefined`:
  - `null` **ou `undefined`** (a API omite o campo quando não aplicável, via `NON_NULL` → o front recebe `undefined`; ambos tratados de forma idêntica) → chip "Decoupling: n/d" + tooltip "disponível só em treinos contínuos".
  - número → `{value}%` colorido por faixa **+ a linha de interpretação** (número passivo é fácil de ignorar; a leitura em palavras aumenta a chance de o coach agir). Copy **descritiva, não causal** (Opção 1 não separa fadiga de terreno/vento):
    - `< 5%` (inclui negativos) → `semantic.success[500]` · "eficiência bem sustentada"
    - `[5%, 10%]` → `semantic.warning[500]` · "eficiência caindo na 2ª metade"
    - `> 10%` → `semantic.danger[500]` · "queda de eficiência acentuada"
  - tooltip: "Queda do fator de eficiência (velocidade/FC) da 1ª para a 2ª metade. Menor é melhor. **Estimativa** em treino contínuo — pode refletir terreno/vento/calor, não só fadiga."
- **Funções centralizadas** (sem faixa/leitura hardcoded no JSX): `decouplingTone(value)` (faixa → token) e `decouplingLeitura(value)` (faixa → frase). Uma única fonte de verdade das faixas nas duas.
- **Sinal de adoção (opcional, deferível):** logar/emitir uma métrica leve quando o badge renderiza com valor não-nulo — fecha o buraco de "cobertura ≠ adoção" sem custo de produto. Deixar atrás de um util simples; não bloqueia a v1.
- **Local:** detalhe do treino **realizado** — confirmar superfície no 0.x (candidatos: `TreinoRealizadoDialog`, card de treino realizado).

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

- **Backend:** `DecouplingCalculatorServiceTest` — o gate é o alvo prioritário; cobrir **cada predicado** e as fronteiras (BVA):
  - **Cálculo (aplicável):** contínuo com decoupling positivo conhecido (número esperado exato); caso "melhora" (negativo); segmento que cruza o meio → partição proporcional confere.
  - **Gate → `null`:** intervalado por `TipoTreino`; CV de FC no limite (`0.10` passa, `0.11` reprova) e CV de velocidade no limite (`0.15`/`0.16`); duração no limite (`20 min` passa, `19` reprova); `<2` segmentos elegíveis; metade sem FC/velocidade; aquecimento/desaquecimento descartados antes do cálculo (não contaminam as metades); FC/velocidade/duração `= 0` → `null`.
  - **Belt-and-suspenders:** `TipoTreino` intervalado com CV baixo (2 laps grosseiros) → ainda `null`.
  - Ajustar `TreinoMapperTest`/fixtures dos endpoints para o campo novo (presente quando aplicável, ausente quando `null`).
- **Front:** `DecouplingBadge` — render por faixa (cor **e** linha de interpretação corretas nas 3 faixas + fronteiras 5/10), estado `null` ("n/d") + tooltip; `decouplingTone`/`decouplingLeitura` testadas nas fronteiras. Sem assert de cálculo (é backend).

## Alternativas consideradas

- **Opção 2 — streams crus** (`/activities/{id}/streams` + entidade `TreinoAmostra`): habilita curva de decoupling e drift intra-segmento, mas exige nova ingestão, migration, volume de dados e backfill. **Rejeitada para v1** (non-goal/follow-up).
- **Persistir `decouplingPercentual` como coluna** (vs. derivar): exigiria migration e recálculo em backfill, sem ganho — o cálculo é barato sobre os segmentos já carregados. **Rejeitada**; manter derivado.
- **Calcular no front** a partir de `etapasRealizadas`: duplicaria regra de domínio no cliente (mesmo antipadrão que [[expose-form-status]] corrigiu). **Rejeitada**; backend é dono do cálculo.

## Não-objetivos (reafirmados)

- Streams/amostras 1–4 Hz e curva intra-treino (Opção 2 — follow-up).
- Pw:HR baseado em potência (corrida tem potência esparsa).
- Persistência/coluna do decoupling (mantido derivado).
