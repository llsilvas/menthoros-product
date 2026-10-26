# Design — coach-zonas-pace-fc-prescricao

## Contexto

Estado do código em 2026-10-26 (verificado):

- `ZonaTreinoService` (`services/helper`): `calcularZonasFC(fcMax, fcLimiar)` → 5 `ZonaFC`
  (Friel %LTHR; `fcMax` ignorado); `calcularZonasPace(paceLimiar)` → 6 `ZonaPace` com fatores
  `{1.15,1.25},{1.05,1.15},{0.98,1.05},{0.95,1.00},{0.90,0.97},{0.82,0.90}`; `calcularZonas(atleta)`
  → 6 `ZonaCompleta` com Z6.fc = Z5.fc. Com `paceLimiar == null` devolve `0.00–0.00`.
- `PaceZoneCalculator.calcularZonasAjustadasPorTsbProntidao(paceLimiar, tsb)` → zonas + `ajusteSegundos`
  (0 / 3 / 7 / 12). A versão sem "Prontidao" está `@Deprecated`.
- `ZoneResolver` resolve `Zona` (enum v2) para bpm/pace, com fallback sintético `5.83` quando falta
  `paceLimiar` — correto para o push, errado para exibir.
- `EtapaFcValidator.zonaEsperadaFC(tipoEtapa, tipoTreino, zonas)` tem a tabela "faixa típica por tipo".
- `IntervalsIcuTargetParser`: `PACE_FAIXA ^(\d{1,2}):([0-5]\d)-(\d{1,2}):([0-5]\d)(/km)?$`,
  `FC_BPM ^(\d{2,3})-(\d{2,3})\s*bpm$`, `ZONA ^z([1-5])(-z?[1-5])?$` (sem Z6).
- `Atleta`: `paceLimiar` (BigDecimal min/km), `fcLimiar`, `dataUltimoTesteFc`, `dataUltimoTestePace`;
  `getFcLimiarCalculada()` nunca é null (fallback 0,85 × FCmax etária).
- `CoachAthleteProfileController` em `/api/v1/coach/atletas/{atletaId}/perfil` — padrão de
  `@RequireTenant(resourceParamIndex = 0)` + `404` cross-tenant.
- Front: `TreinoEditDialog.BlocoCard` tem `TextField "Zona alvo"` → `fcAlvoEtapa`; `RPE` por etapa
  descartado em `camposDe()`; `StepRow.ritmoAlvo` preservado mas sem campo; `selectWorkoutProfile`
  já deriva a zona predominante das etapas; `TreinoAddDialog.QuantRow` repete o texto livre.
- Spec `athlete-today-workout` já expõe por etapa `alvoPrimario: 'FC' | 'PACE' | 'NENHUM'`, derivado
  (FC vence se os dois existem).
- `coach-meta-intensidade-editor` (change aberta, 2026-08-02) desenhou o seletor de meta no modelo
  Garmin (escolha única por etapa); sua dependência `fix-fc-alvo-base-inconsistente` foi arquivada
  em 2026-09-01.

## Decisões

### D1 — Endpoint próprio, não campo no `/perfil`

`GET /api/v1/coach/atletas/{atletaId}/zonas` (`CoachAthleteZonesController`, tag `coach-athlete-zones`).
O `/perfil` já é agregação com partial-failure e `avisos`; zonas são consultadas pelo editor
(dialog) e pelo painel de revisão de plano, que **não** passam pelo perfil. Um endpoint pequeno e
cacheável no front (por `atletaId`) evita acoplar o dialog ao agregado.

```json
{
  "modelo": "LTHR_FRIEL",
  "ancoras": {
    "paceLimiarMinKm": 5.00, "dataUltimoTestePace": "2026-09-12",
    "fcLimiar": 168, "dataUltimoTesteFc": "2026-09-12", "fcLimiarEstimada": false
  },
  "ajusteFadiga": { "segundosPorKm": 7, "tsbProntidao": -12.3 },
  "disponibilidade": { "pace": true, "fc": true, "motivoPace": null },
  "zonas": [
    { "numero": 1, "nome": "Recuperação", "pace": { "minSegKm": 352, "maxSegKm": 382 }, "fc": { "min": 126, "max": 143 } },
    { "numero": 6, "nome": "Sprint",      "pace": { "minSegKm": 253, "maxSegKm": 277 }, "fc": null, "motivoFc": "FC_NAO_ESTABILIZA" }
  ]
}
```

- **Pace em segundos/km inteiros**, não `BigDecimal` decimal-minuto: o front formata `5:52` sem
  erro de arredondamento e o contrato não vaza a representação interna (`5.87`).
- **`fcLimiarEstimada`** = `atleta.getFcLimiar() == null` (veio do fallback etário). O front mostra
  como estimativa; o push já não manda estimativa ao relógio (CA10 da change de FC).
- **Sem `paceLimiar`:** `pace: null` em todas as zonas e `disponibilidade.motivoPace = "SEM_PACE_LIMIAR"`.
  Não usar o fallback 5,83 do `ZoneResolver`. **Isso exige** que `ZonaTreinoService.calcularZonasPace`
  deixe de devolver `0.00–0.00` em silêncio — ver D3.
- Ajuste por fadiga vem de `PaceZoneCalculator.calcularZonasAjustadasPorTsbProntidao`, com o TSB
  de prontidão de **hoje** (mesma fonte que o prompt usa). É o que a IA usou; é o que o treinador
  precisa ver para entender por que Z2 não bate com a conta de cabeça.

Service: `CoachAthleteZonesService` (interface + impl), `@Transactional(readOnly = true)`,
`Idempotent: YES · Side Effects: NONE · Tenant-aware: YES`. Delega a `ZonaTreinoService` e
`PaceZoneCalculator` — **não reimplementa a conta** (foi assim que nasceu o BUG-CONF-001).

### D2 — Faixas de pace contíguas

| Zona | Hoje | Proposta |
|---|---|---|
| Z1 | 1,15–1,25 | igual |
| Z2 | 1,05–1,15 | igual |
| Z3 | 0,98–1,05 | **1,00–1,05** |
| Z4 | 0,95–1,00 | igual |
| Z5 | 0,90–0,97 | **0,90–0,95** |
| Z6 | 0,82–0,90 | igual |

Invariante (CA5): `paceMin(Zn) == paceMax(Zn+1)` para n = 1..5 — teste parametrizado em
`ZonaTreinoServiceTest`. Z3 agora começa exatamente no limiar (1,00): coerente com o nome "Tempo"
= sublimiar, e com Z4 "Limiar" = 0,95–1,00 terminando no limiar. A mudança é mínima (dois números)
e **só estreita**: nenhum pace que hoje cai em uma única zona muda de zona.

Consequência: `PlanoTreinoPromptBuilder` passa a listar faixas sem sobreposição → **eval gate**
(`./mvnw -Peval test -Dtest=EvalRunnerTest -Dmodo=candidato`), tabela no PR do backend. Não
revalidar os fatores contra Daniels aqui (Q2 do proposal): seria mudança de prescrição, não correção.

### D3 — `calcularZonasPace(null)` deixa de devolver zeros

Hoje devolve `ZonaPace(n, nome, 0.00, 0.00)`. Quem consome (prompt, `PlanoLlmValidator`,
`ZoneResolver`) ou já protege por `paceLimiar != null` ou usa o fallback antes de chamar. Mudar o
retorno para `Optional`/exceção mexeria em 15 chamadores — fora de proporção. Decisão: **manter a
assinatura** e o novo service checar `paceLimiar == null || signum() <= 0` **antes** de chamar,
devolvendo `pace: null`. Registrar em Javadoc do `ZonaTreinoService` que `0.00–0.00` é sentinela
"sem limiar" e que novos consumidores devem testar o limiar antes.

### D4 — Zona preenche dois eixos; o relógio recebe um

O modelo Garmin (`fix-fc-alvo-base-inconsistente`, design) é **uma** meta por etapa. A tabela do
atleta mostra pace **e** FC porque o treinador escolhe entre eles — mas o payload ao relógio é um.

Modelo da etapa no editor:

```ts
interface IntensidadeEtapa {
  zona: 'Z1'|'Z2'|'Z3'|'Z4'|'Z5'|'Z6'|'PERSONALIZADO'|null;  // null = sem objetivo
  ritmoAlvo: string | null;    // "4:37-4:58/km"  (canônico, casa PACE_FAIXA)
  fcAlvoEtapa: string | null;  // "168-178 bpm"   (canônico, casa FC_BPM)
  alvoPrimario: 'PACE' | 'FC' | 'NENHUM';
}
```

- **Escolher Zn** copia `pace` e `fc` da zona (do endpoint, já com ajuste por fadiga) para os dois
  campos e aplica a **regra default** de `alvoPrimario` (D5). Z6 preenche só pace, força `PACE`.
- **Editar pace ou FC à mão** muda `zona` para `PERSONALIZADO` sem apagar o outro campo.
- **Limpar os dois** → `zona = null`, `alvoPrimario = 'NENHUM'` — "sem objetivo" como escolha, igual
  ao Garmin e ao CA2 da change absorvida.
- **Serialização** (`etapaItem.serializarItens`): `ritmoAlvo`, `fcAlvoEtapa`, `alvoPrimario`. Os dois
  primeiros já existem no `EtapaInputPayload`; `alvoPrimario` é o campo novo do contrato (D6).
- **Hidratação** (`itensFromEtapas`): se `fcAlvoEtapa` casa `FC_BPM` e/ou `ritmoAlvo` casa
  `PACE_FAIXA`, e as faixas coincidem com uma zona do atleta (tolerância 1 bpm / 2 s), `zona = Zn`;
  senão `PERSONALIZADO`. Texto que não casa nenhum regex (legado "trote leve") fica em
  `PERSONALIZADO` com o texto preservado e aviso (CA12). **Nada é descartado** ao abrir e salvar.

### D5 — `alvoPrimario`: regra default, treinador inverte

| Contexto da etapa | Default | Por quê |
|---|---|---|
| `tipoEtapa ∈ {INTERVALADO, TIRO}` ou zona ∈ {Z5, Z6} | `PACE` | FC leva 1–2 min para estabilizar; tiro de 800 m dura 3–4 |
| `tipoEtapa ∈ {AQUECIMENTO, RECUPERACAO, DESAQUECIMENTO}` ou zona ∈ {Z1, Z2} | `FC` | esforço leve e longo; pace sofre com relevo/calor |
| zona ∈ {Z3, Z4} em etapa `PRINCIPAL` | `FC` | mantém o comportamento atual (FC vence) para não mudar o push de planos existentes |
| só um eixo preenchido | o preenchido | — |

A regra é função pura no front (`defaultAlvoPrimario(tipoEtapa, zona)`), testada em unidade, e um
toggle de dois estados ao lado dos pills deixa o treinador inverter. **Q1 do proposal**: a tabela
acima é proposta minha a partir da prática comum; validar com um treinador antes de fixar os
defaults — a mecânica (regra + override) não depende dos valores.

Alternativa descartada: só regra, sem override. O treinador que prescreve longão por pace em pista
(plano, sem vento) perderia a escolha. Alternativa descartada: só escolha, sem default. Força um
clique a mais em toda etapa e a maioria segue a regra.

### D6 — `alvoPrimario` entra no contrato da etapa

Hoje é **derivado** no `IntervalsIcuWorkoutConverter.stepDeEtapa` (FC vence) e no
`/me/treinos/hoje`. Com D5 o treinador pode querer pace mesmo com FC preenchida → precisa persistir.

- `EtapaTreino.alvoPrimario VARCHAR(5) NULL` (migration `V<n+1>__add_alvo_primario_etapa_treino.sql`,
  `CHECK IN ('PACE','FC','NENHUM')`). `NULL` = legado → mantém a derivação atual (FC vence). Sem
  backfill: o comportamento dos planos existentes não muda.
- `EtapaInputDto.alvoPrimario` (opcional), `EtapaTreinoDto.alvoPrimario` (saída). `TreinoPlanejadoPatchDto`
  e `TreinoPlanejadoAddDto` herdam via `EtapaInputDto`.
- `IntervalsIcuWorkoutConverter.stepDeEtapa` e `AtletaTreinoHojeServiceImpl`: se `alvoPrimario != null`,
  obedecer; senão derivar como hoje. Um teste por caminho em cada.
- A IA **não** preenche `alvoPrimario` nesta change (schema do LLM intocado) — plano gerado nasce
  `NULL` e o treinador define ao editar. Follow-up: prompt v2 prescrever o eixo.

Identificador em inglês seria `primaryTarget`; o spec `athlete-today-workout` já publica
`alvoPrimario` no contrato do atleta — manter o mesmo nome nos dois lados pesa mais que a regra de
idioma (ver "Identifier Language": campo legado em PT é renomeado junto com change que já mexe na
entidade; aqui o campo é novo mas espelha um existente).

### D7 — Front: um hook, um seletor, duas superfícies

- `useAthleteTrainingZones(atletaId)` em `src/hooks/` (shape de `useAtletas`: `zones, loading, error,
  fetchZones`). Serviço curado `CoachAthleteZonesService` em `src/api/services/` (fachada, não saída
  crua — convenção do `CLAUDE.md` front). Tipos em `src/types/AthleteTrainingZones.ts`.
  `useAthleteZones` (distribuição de tempo por zona, `/me/metricas/zonas`) é **outra coisa** — não
  renomear nem fundir.
- `ZoneSelector` em `src/features/coach/components/etapas/ZoneSelector.tsx`: segmented Z1–Z6 +
  Personalizado, dois campos de valor, toggle de eixo, avisos. Props: `zones | null`,
  `value: IntensidadeEtapa`, `tipoEtapa`, `onChange`, `disabled`. Substitui o `TextField` em
  `BlocoCard` (edit) e `QuantRow` (add). Cores das zonas via `activeTheme.zones` (`ZoneKey` já é
  `Z1–Z5`; **estender para `Z6`** em `tokens.ts`/`theme.premium.ts` — hoje o tipo não tem Z6).
- `AthleteZonesTable` em `src/features/coach/components/AthleteZonesTable.tsx`: `<details>`-like
  (MUI `Accordion`, recolhido), 6 linhas, chips de ajuste e idade do limiar (> 90 dias → aviso,
  mesmo limiar de `Atleta.limiaresDesatualizados`). Usada em `PlanoDetalhePanel` (entre métricas e
  treinos) e no topo do `TreinoEditDialog`/`TreinoAddDialog`.
- `TreinoTag` / `TreinoCard`: linha de meta vira `Zn · pace · fc` com o primário em destaque. Adapter
  puro `buildIntensityLineFromEtapa(etapa, zones)` em `features/coach/adapters/` — testável sem DOM.
- Avisos (CA13, CA12, CA14) seguem o padrão do aviso de remoção de aquecimento já existente no
  dialog: faixa inline `role="alert"`, não bloqueia salvar.
- `RPE` por etapa removido de `BlocoCard`; `zonaAlvo` global removida do footer; a zona do treino
  passa a ser exibida (não editável) a partir de `selectWorkoutProfile(...).targetZone`. O patch
  **continua enviando `zonaAlvo`** derivada, para o backend que a lê (`PlanoLlmValidator`, badge).

### D8 — Legado no editor (CA12)

Hidratar não inventa: `fcAlvoEtapa = "trote leve"` vira `PERSONALIZADO` com o texto no campo FC e
aviso "não vira alvo no relógio — escolha uma zona para converter". Salvar sem mexer **não altera**
o campo (a guarda `blocosMudados` já existe). `"60-70% FCmax"` legado: o parser trata como % LTHR
(decisão de `fix-fc-alvo-base-inconsistente`); o editor mostra o texto como veio e o bpm resolvido
em cinza ao lado — não reescreve o percentual em bpm sem o treinador escolher a zona.

## Riscos

| Risco | Mitigação |
|---|---|
| Tabela de pace muda o prompt e a IA passa a prescrever diferente | D2 só estreita Z3/Z5 (nenhum pace muda de zona onde já era único); eval gate em modo candidato no PR |
| Mostrar o fallback 5,83 ou `0:00` como zona real | CA3 + D3: service checa limiar antes; teste com `paceLimiar = null` e `= 0` |
| `alvoPrimario` persistido muda o push de planos antigos | `NULL` = derivação atual; sem backfill; teste de regressão no converter com `alvoPrimario == null` |
| Dois seletores divergirem (add × edit) | Um `ZoneSelector`; `QuantRow` e `BlocoCard` só o montam |
| Teste de componente passar com zona errada (mock = código) | CA10/CA16 afirmam **valores** de bpm/pace vindos do endpoint, e o E2E usa backend real |
| `ZoneKey` sem Z6 quebrar `activeTheme.zones[...]` | Estender o tipo e os mapas de cor/label antes do seletor; `tsc` acusa os pontos |
| Regra de `alvoPrimario` (D5) não bater com a prática do treinador | Q1 bloqueante: validar antes de fixar; a mecânica regra+override não depende dos valores |
