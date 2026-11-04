# Design — coach-zonas-manuais

## Contexto

`coach-cadastro-ancoras-zonas` (front PR #182, backend PR #209, ambos em `develop`) entregou o diálogo
de zonas, o `PUT .../zonas/ancoras` e o `POST .../zonas/simulacao`. As faixas de hoje são sempre
derivadas: FC por % do LTHR (Friel, `FC_LIMIAR_PERCENTUAIS`), pace por fatores sobre `paceLimiar`
(`PACE_FATORES`), ambos em `ZonaTreinoService`.

Mapeamento real dos consumidores (task 0.3, feito contra `develop` em `d778a91`):

| Consumidor | Como pede a faixa hoje | Recebe a faixa manual? | Teste de contrato |
|---|---|---|---|
| `PlanoTreinoPromptBuilder.formatarDadosFisiologicos` | `calcularZonas(atleta)` | sim — via `calcularZonas(Atleta)` | **sim** (CA1) |
| `ZoneResolver.bpm/pace` ← `SessionResolver` ← `IaServiceImpl` (schema v2) | escalares (`fcMax`, `fcLimiar`, `paceLimiar`) via `AthleteZones` | sim — `AthleteZones` passa a levar as faixas manuais | **sim** (CA1) |
| `IntervalsIcuFcAlvoResolver.faixaDaZona` (push intervals.icu, alvo `Zn`) | `calcularZonasFC(fcMaxima, fcLimiar)` | sim — passa a usar `calcularZonasFC(Atleta)` | **sim** (CA1) |
| `PlanoLlmValidator.contexto` → `ContextoNormalizacao` (`EtapaFcValidator`, `TreinoNormalizador` reescrevem bpm das etapas da v1) | `calcularZonasFC(escalares)`, só se `fcLimiar` ou `fcMaxima` gravados | sim — `calcularZonasFC(Atleta)`, e a condição passa a aceitar eixo FC em `MANUAL` | **sim** (FC manual sem limiar nem máxima não pode virar `zonasFC = null`) |
| `AtletaProgressServiceImpl` (distribuição por zona) | `identificarZonaFC(fc, atleta)` | sim — interno ao serviço | não |
| `CoachAthleteZonesServiceImpl.montar` (`GET .../zonas`, PUT, simulação) | `calcularZonas(escalares)` | sim | **sim** (CA5) |
| `PaceZoneCalculator` | `calcularZonasPace(paceLimiar)` | **não** — ver D5 | não |
| `GarminWorkoutPayloadMapper` | bpm/pace absolutos já gravados na etapa | herda: a etapa é resolvida na geração | não |
| `EvalFixtureExtractor` / `EvalPlanoJsonParser` | `AthleteZones` de 3 argumentos | não — fixture sem modo manual | coberto pelo eval (CA6) |
| `TssCalculatorService`, `NormalizacaoDeTreino`, `ProvaNoPlanoService`, `StravaActivityServiceImpl`, `IntervalsIcuActivityMapper`, `TreinoNormalizador` | usam o **escalar** `paceLimiar`/`fcLimiar` (rTSS, distância estimada, TRIMP) — não faixas de zona | **não, de propósito** — ver D6 | não |

O "15 consumidores" do proposal contava arquivos que importam `ZonaTreinoService`; os que de fato
consomem **faixa de zona** são os sete primeiros da tabela; quatro deles ganham teste de contrato.

## Decisões

### D1 — Modo por eixo + faixas em JSONB no próprio `tb_atleta`

Migration `V108__add_zonas_manuais_atleta.sql`, aditiva:

```sql
ALTER TABLE tb_atleta
    ADD COLUMN IF NOT EXISTS modo_zonas_fc   VARCHAR(10) NOT NULL DEFAULT 'LIMIAR'
        CONSTRAINT ck_atleta_modo_zonas_fc   CHECK (modo_zonas_fc   IN ('LIMIAR', 'MANUAL')),
    ADD COLUMN IF NOT EXISTS modo_zonas_pace VARCHAR(10) NOT NULL DEFAULT 'LIMIAR'
        CONSTRAINT ck_atleta_modo_zonas_pace CHECK (modo_zonas_pace IN ('LIMIAR', 'MANUAL')),
    ADD COLUMN IF NOT EXISTS zonas_manuais_fc   JSONB NULL,
    ADD COLUMN IF NOT EXISTS zonas_manuais_pace JSONB NULL,
    ADD CONSTRAINT ck_atleta_zonas_manuais_fc
        CHECK (modo_zonas_fc <> 'MANUAL' OR zonas_manuais_fc IS NOT NULL),
    ADD CONSTRAINT ck_atleta_zonas_manuais_pace
        CHECK (modo_zonas_pace <> 'MANUAL' OR zonas_manuais_pace IS NOT NULL);
```

Formato do JSON: `[{"zona":1,"min":120,"max":143}, ...]` — inteiros. FC em bpm (5 itens), pace em
**segundos por km** (6 itens; `min` = limite mais rápido, `max` = o mais lento — mesma convenção do
`PaceFaixa` do GET). Mapeado em `Atleta` com `@JdbcTypeCode(SqlTypes.JSON)` como
`List<FaixaZonaManual>` (record `zona, min, max`), padrão que o repo já usa (`PlanoSemanal`,
`SugestaoCoach`).

**Por que não uma tabela filha:** as faixas são sempre lidas e gravadas inteiras, só existem com o
atleta, e quem as consome já tem o `Atleta` carregado. Uma tabela `tb_atleta_zona_manual` traria
entidade, repositório, `tenant_id` próprio e um join em todo cálculo de zona por 11 linhas que nunca
são consultadas isoladamente. O `tenant_id` do atleta já isola o dado.

**Conversão de pace (s/km → min/km).** `ZonaTreinoService.ZonaPace` trabalha em min/km decimal. A
faixa manual vira `ZonaPace` com `BigDecimal.valueOf(seg).divide(60, 4, HALF_UP)` — escala **4**, não
a 2 do cálculo: com escala 2 a resolução é ~0,6 s e 272 s (4:32) voltaria do GET como 271,8 → 272 só
por sorte de arredondamento. Com escala 4 o `segundos()` do GET devolve sempre o inteiro digitado.
Teste de ida e volta para todo s/km de 120 a 900 na task 1.3.

**Rollback:** `ALTER TABLE tb_atleta DROP CONSTRAINT IF EXISTS ck_atleta_zonas_manuais_fc, DROP CONSTRAINT IF EXISTS ck_atleta_zonas_manuais_pace, DROP COLUMN IF EXISTS zonas_manuais_pace, DROP COLUMN IF EXISTS zonas_manuais_fc, DROP COLUMN IF EXISTS modo_zonas_pace, DROP COLUMN IF EXISTS modo_zonas_fc;`
— sem perda fora do próprio recurso. Desligar sem migration: um `UPDATE tb_atleta SET modo_zonas_fc='LIMIAR', modo_zonas_pace='LIMIAR'` devolve todos os consumidores ao cálculo.

### D2 — Precedência em um ponto: `ZonaTreinoService`

- Novos `calcularZonasFC(Atleta)` e `calcularZonasPace(Atleta)`: eixo `MANUAL` → as faixas gravadas;
  `LIMIAR` → o cálculo atual com os mesmos argumentos de hoje. `calcularZonas(Atleta)` e
  `identificarZona*(…, Atleta)` passam a usá-los.
- As sobrecargas por escalar (`calcularZonasFC(fcMax, fcLimiar)`, `calcularZonasPace(paceLimiar)`)
  continuam sendo "o cálculo pelo limiar" — usadas pela simulação, pelo `PaceZoneCalculator` e pelo
  pré-preenchimento do modo manual.
- `AthleteZones` ganha `@Nullable List<FaixaZonaManual> fcManual, paceManual` (construtor de 3
  argumentos mantido para o eval); `ZoneResolver.bpm/pace` passam a receber `AthleteZones` e
  delegam para um `ZonaTreinoService.calcularZonasFC/Pace(AthleteZones)`. O `IaServiceImpl` monta o
  `AthleteZones` por um fábrica `AthleteZones.de(Atleta)`, que é o único lugar que lê o modo.
- `IntervalsIcuFcAlvoResolver`, alvo `ZONE`: com FC em `MANUAL`, a faixa manual vale **mesmo sem
  `fcLimiar` medido** — foi o treinador quem escreveu os bpm, então não é estimativa etária (a razão
  do descarte atual). Alvo `PERCENT` continua exigindo `fcLimiar` medido.
- `PlanoTreinoPromptBuilder`: **todos** os fallbacks passam a considerar o modo — o ramo "sem dados
  testados (fórmula etária)" de `formatarDadosFisiologicos` (vale só sem limiar **e** sem eixo manual)
  e o "Pace Limiar inválido/zerado → USAR APENAS FC" de `validarEFallbacksDadosFisiologicos` (não
  dispara com pace em `MANUAL`). Com eixo manual, o bloco de zonas diz "definidas pelo treinador".
  Teste sobre o prompt completo, não só o bloco de zonas.
- **FC manual acima da máxima no push:** o alvo `ZONE` resolvido de faixa manual passa pela mesma
  barreira do bpm literal (`resolverBpmLiteral`: piso 40 e teto `fcMaximaComFallback`), em vez de ir
  direto ao relógio. Política única: faixa acima da máxima é descartada e registrada, venha de zona,
  manual ou literal. O PUT **não** bloqueia (o treinador pode saber de uma máxima maior que a
  estimada); o diálogo mostra o mesmo aviso "não vai ao relógio" que a change anterior já mostra.
- **Classificação de um valor (`identificarZonaFC/Pace`) com faixas manuais:** mesmo algoritmo de hoje
  — a zona é a mais alta cujo limite de entrada o valor alcança. Consequências, agora explícitas:
  borda compartilhada fica na zona de cima; valor dentro de uma lacuna fica na zona de baixo (a
  intensidade da de cima não foi alcançada); abaixo de Z1 é `0`; acima do topo é a última zona.
  Teste para os quatro casos.
- **Fadiga com pace manual sem `paceLimiar`:** `temPace` do `GET` passa a ser "tem limiar **ou** pace
  em `MANUAL`", então `ajusteFadiga.segundosPorKm` é calculado do TSB de prontidão também nesse caso.
  O aviso do prompt (`formatarAvisoAjuste`, sobre `tsbAtual`) é texto de delta e não muda.

### D3 — Contrato: `PUT .../zonas/manuais`, endpoint próprio

```
PUT /api/v1/coach/atletas/{atletaId}/zonas/manuais
{ "fc":   { "modo": "MANUAL", "faixas": [{"zona":1,"min":120,"max":143}, … 5 itens] },
  "pace": { "modo": "LIMIAR" } }
```

- Grupo ausente = não altera o eixo (mesma regra do PUT de âncoras). Ao menos um grupo.
- `modo: MANUAL` exige `faixas` completas; `modo: LIMIAR` ignora `faixas` e **apaga** as gravadas
  daquele eixo (Q1, ver abaixo).
- Resposta: o mesmo `AthleteTrainingZonesOutputDto` do GET.
- Endpoint próprio, não extensão de `.../ancoras`: o corpo de âncoras exige `limiar` e `dataTeste`
  (`@NotNull`), e um atleta com zonas de laboratório pode não ter um LTHR que o treinador queira
  gravar. Misturar os dois tornaria condicional toda a validação de D6 da change anterior.
- **Gravação atômica por eixo:** um `@Modifying UPDATE` por eixo, que escreve `modo_zonas_<eixo>` e
  `zonas_manuais_<eixo>` juntos, sem `@Transactional` no serviço — o padrão de
  `atualizarLimiarFc/Pace` (`AtletaRepository`), que existe justamente para dois PUTs em eixos
  diferentes não se sobrescreverem. Nunca `save` da entidade. Teste: dois PUTs de eixos diferentes
  em sequência preservam os dois (o mesmo CA18 da change anterior).
- **Faixa "pelo limiar" para o Recalcular:** com o eixo em `MANUAL`, cada `zonas[]` traz também
  `pacePeloLimiar`/`fcPeloLimiar` (o cálculo atual), só nesse caso. Sem `paceLimiar`, `pacePeloLimiar`
  vem ausente e o front desabilita "Recalcular" no ritmo com o texto "Sem pace de limiar". FC sempre
  tem (fallback etário, marcado por `fcLimiarEstimada`). Não usa a simulação, que exige limiar e data.
- Mesma postura de segurança do controller existente: `TECNICO`/`ADMIN`, sem `@RequireTenant`,
  atleta de outro tenant → `404`; sem `@Valid` (validação no serviço, para manter o caminho do campo).
- `GET .../zonas` ganha `modos: { fc: "LIMIAR"|"MANUAL", pace: "LIMIAR"|"MANUAL" }` (sempre presente)
  e `zonas[]` passa a trazer a faixa **efetiva**. `disponibilidade.pace` vira `true` com pace em
  `MANUAL` mesmo sem `paceLimiar`. `ajusteFadiga` segue igual (D5).
- Sem simulação para o modo manual: os valores digitados já são a faixa; a validação roda no front
  (mesmas regras) e no PUT.

### D4 — Validação (`AthleteZoneManualValidator`) — CA3

Erros em `InvalidZoneAnchorsException` (mesmo `fields` do PUT de âncoras), com o caminho
`fc.faixas[1].max` → `400`. Regras, por eixo em `MANUAL`:

1. Exatamente as zonas do eixo (FC: 1–5; pace: 1–6), cada uma uma vez.
2. `min < max` em toda zona (pace: `min` mais rápido < `max` mais lento, em s/km).
3. Limites: FC 40–230 bpm; pace 120–900 s/km (2:00 a 15:00/km).
4. Sem sobreposição e em ordem de intensidade: FC `Z(n+1).min ≥ Z(n).max`; pace
   `Z(n+1).max ≤ Z(n).min`. Borda compartilhada é aceita (o cálculo Friel já a produz: Z1 até 143,
   Z2 a partir de 143). **Lacuna é aceita** (Q3).
5. `faixas` chega **ordenada por zona** (Z1 primeiro); o índice do caminho é o índice do array, que
   por isso coincide com `zona − 1`. Fora de ordem é erro da regra 1. Na sobreposição, o erro vai no
   item de maior zona (o que "invadiu" o anterior): Z2 = 140–152 e Z3 = 150–160 → `fc.faixas[2].min`.
6. Os limites cobrem todo pré-preenchimento possível: o limiar de pace é limitado a 720 s/km e o de FC
   a 200 bpm pelo PUT de âncoras (= CHECKs de V6), então a Z1 de pace calculada vai até 900 s/km e a Z5
   de FC até 212 bpm — dentro de 120–900 e 40–230.

### D5 — Ajuste por fadiga sobre pace manual (Q2)

O ajuste é hoje **informativo** (`ajusteFadiga.segundosPorKm` no GET e um aviso no prompt) — nenhuma
faixa ajustada é consumida pela prescrição (`calcularZonasAjustadasPorTsb*` só tem o
`ajusteSegundos` lido). Por isso o modo manual não muda nada nele: é um delta em s/km a partir do TSB,
independente da origem da faixa. Nenhuma linha de `PaceZoneCalculator` muda.

### D6 — O que o modo manual **não** altera

`paceLimiar`/`fcLimiar` escalares continuam alimentando rTSS/TRIMP, estimativa de distância por
tempo (inclusive `TreinoNormalizador.corrigirDistanciasEtapasTemporais` da v1, que estima a distância
de aquecimento/recuperação por fatores fixos do limiar — divergência aceita: é estimativa de volume
de etapa por tempo, recalculada pelo realizado, e não alvo que vai ao relógio), projeção de prova, sincronização de `lthr` com o intervals.icu e o card de âncoras. O modo
manual troca **as faixas de zona**, não o limiar. Sem `paceLimiar`, esses cálculos mantêm os
fallbacks de hoje. Registrado para não virar escopo implícito.

### D7 — Front

- `AthleteZonesDialog`: por aba (Ritmo/FC), um `ToggleButtonGroup` "Calcular pelo limiar /
  Informar manualmente". Manual mostra a tabela com De/Até editáveis (`TextField`, ≥ 44 px), pace em
  `m:ss`. Pré-preenchimento: as faixas efetivas do GET (se o eixo já está manual, as gravadas; se não,
  o cálculo pelo limiar).
- "Recalcular a partir do limiar" repõe o cálculo atual do GET/simulação — com confirmação, porque
  descarta edições.
- Validação inline com as regras de D4, numa função pura `validateManualZones` em
  `features/coach/adapters/` (testável sem render). Linha inválida: `aria-invalid` + texto na linha.
- **Salvar com âncora e faixa manual alteradas na mesma edição:** duas chamadas em sequência —
  primeiro `PUT .../ancoras` (eixos em limiar com âncora alterada), depois `PUT .../manuais` (eixos
  com modo ou faixa alterados). Cada uma é idempotente por eixo. Se a segunda falha, o diálogo
  invalida o cache e recarrega (o estado mostrado passa a ser o gravado), mostra "Âncoras salvas;
  faixas manuais não — tente de novo" e o retry reenvia só a parte que falhou.
- `zoneSelectorLogic.aplicarZona` (editor de etapas) hoje descarta a FC quando
  `ancoras.fcLimiarEstimada`; passa a aceitar a FC também quando `modos.fc === 'MANUAL'` — a faixa
  foi escrita pelo treinador, não é estimativa. Sem essa mudança o seletor **não** herda a FC manual.
- Salvar: chama `PUT .../zonas/manuais` (método novo `salvarZonasManuais` no cliente curado
  `CoachAthleteZonesService`), pelo hook `useAthleteZoneAnchorsEditor` (que já orquestra o PUT de
  âncoras). Voltar um eixo `MANUAL` para "pelo limiar" pede confirmação (apaga as faixas, Q1).
- **Aviso de limiar novo com eixo manual:** alterar a âncora de um eixo que está em `MANUAL` mostra,
  antes de salvar, "As faixas manuais de <eixo> continuam valendo" apontando "Recalcular a partir do
  limiar" (proposal, riscos). Não bloqueia o salvamento. Antes, não depois do 200: o diálogo fecha
  ao salvar.
- Card/tabela (`AthleteZonesTable`): chip "FC: pelo limiar · Ritmo: manual" (CA5).
- `ZoneSelector` do editor de etapas consome o mesmo GET — herda a faixa efetiva de ritmo sem mudança;
  a de FC depende do ajuste em `aplicarZona` acima (CA7).

### D8 — Testes

- Backend: unitários de `ZonaTreinoService` (precedência por eixo, CA1/CA2/CA4), do validador
  (cada regra de D4, CA3), de `ZoneResolver`/`SessionResolver` com `AthleteZones` manual, de
  `IntervalsIcuFcAlvoResolver` (ZONE manual sem `fcLimiar`), do prompt builder (bloco com faixa
  manual); `@WebMvcTest` do PUT novo (200/400 com caminho/404); integração da migration (Testcontainers,
  padrão do repo) cobrindo JSONB ida e volta e os CHECKs.
- Front: Vitest do validador e do adapter; Testing Library do diálogo (alternar modo, editar, erro
  inline, recalcular com confirmação, salvar chama o endpoint certo); E2E Playwright (CA7).

## Decisões de produto (Q1–Q3 do proposal) — aprovadas pelo usuário em 2026-11-04

- **Q1 — voltar para `LIMIAR` apaga as faixas manuais** (política de perda de dado — exige aprovação explícita). Sem estado escondido: o que o GET mostra é o
  que existe. O custo (perder edições num clique errado) é coberto pela confirmação no diálogo.
  Guardar exigiria expor no GET as faixas inativas só para o pré-preenchimento.
- **Q2 — o ajuste por fadiga vale igual** (D5): é informativo e não toca faixa nenhuma hoje.
- **Q3 — lacuna aceita, sobreposição não.** É como zonas de laboratório costumam vir (limiares
  ventilatórios não fecham as bordas).

## Riscos

- **Conflito no front:** a branch `fix/coach-cadastro-ancoras-zonas-previa` (outra sessão, não
  mergeada em 2026-11-04) mexe em `AthleteZonesDialog.tsx` e `zoneAnchors.ts`. As tasks de front
  começam depois dela entrar em `develop`, ou rebaseiam sobre ela.
- **Faixa manual não acompanha novo limiar:** ao gravar âncora com o eixo em `MANUAL`, o diálogo
  avisa que as faixas manuais continuam valendo e oferece recalcular (proposal, riscos).
- **Eval (CA6):** o eval set **não tem limiar numérico** — o modo `candidato` chama a LLM real e o juiz
  está marcado "NÃO CALIBRADO" (`EvalRunnerTest`). O critério verificável é o do modo auditoria, que é
  determinístico: as fixtures existentes com o mesmo número de divergências de antes da change
  (baseline no `tasks.md`). O caso manual não vira fixture: o set é v1, selado por manifest, e o grader
  compara só tipo e TSS — fica num teste do `SessionResolver` (etapa v2 com faixa manual). O modo `candidato` roda se houver
  `OPENAI_API_KEY`, como registro, sem critério de aprovação.
