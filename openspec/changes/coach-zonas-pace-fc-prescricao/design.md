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
- Front (reverificado em 2026-10-26, depois das PRs #168–170): `TreinoEditDialog` e `TreinoAddDialog`
  **compartilham `etapas/EtapasEditor.tsx`**. O `BlocoCard` de lá tem `TextField "Zona (FC)"`
  (`zonaAlvo` ↔ `fcAlvoEtapa`, :215) e, dentro de "detalhes", um campo `Ritmo` editável (`ritmoAlvo`,
  :241). RPE por etapa **já saiu**; `QuantRow` **não existe mais**. O rodapé do `TreinoEditDialog`
  ainda tem `TextField "Zona predominante"` (~:500) e RPE do treino, ambos editáveis.
  `selectWorkoutProfile` (`features/workout/profile/`) identifica a zona por **regex no texto**
  (`/z(?:ona\s*)?([1-5])\b/`) — não lê faixas numéricas e não conhece Z6.
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
  "fcMaxima": { "bpm": 175, "estimada": true },
  "disponibilidade": { "pace": true, "fc": true, "motivoPace": null },
  "zonas": [
    { "numero": 1, "nome": "Recuperação", "pace": { "minSegKm": 345, "maxSegKm": 375 }, "fc": { "min": 126, "max": 143 } },
    { "numero": 6, "nome": "Sprint",      "pace": { "minSegKm": 246, "maxSegKm": 270 }, "fc": null, "motivoFc": "FC_NAO_ESTABILIZA" }
  ]
}
```

- **Pace em segundos/km inteiros**, não `BigDecimal` decimal-minuto: o front formata `5:45` sem
  erro de arredondamento e o contrato não vaza a representação interna (`5.87`).
- **`fcLimiarEstimada`** = `atleta.getFcLimiar() == null` (veio do fallback etário). A tabela mostra
  as faixas como estimativa. **O seletor não copia bpm de limiar estimado para `fcAlvoEtapa`**:
  `IntervalsIcuFcAlvoResolver.resolverBpmLiteral` aceita qualquer bpm plausível sem exigir limiar
  medido, então um literal gravado a partir de estimativa furaria a proteção "sem limiar medido, sem
  meta" que vale para zona e percentual (comentário em `IntervalsIcuFcAlvoResolver:~67`). Com
  `fcLimiarEstimada = true` o seletor preenche só o pace, deixa a FC vazia com aviso "limiar de FC
  estimado — informe a FC à mão ou cadastre o limiar", e o eixo vai para PACE.
- **Sem `paceLimiar`:** `pace: null` em todas as zonas e `disponibilidade.motivoPace = "SEM_PACE_LIMIAR"`.
  Não usar o fallback 5,83 do `ZoneResolver`. **Isso exige** que `ZonaTreinoService.calcularZonasPace`
  deixe de devolver `0.00–0.00` em silêncio — ver D3.
- **`zonas[].pace` são as faixas BASE** (`ZonaTreinoService.calcularZonasPace`), as mesmas que
  `PlanoTreinoPromptBuilder:664` entrega à IA (`calcularZonas(atleta)`). Verificado em 2026-10-26:
  `PaceZoneCalculator.calcularZonasAjustadasPorTsbProntidao` **não tem chamador em produção** — o
  prompt nunca recebeu pace ajustado. Mostrar a faixa ajustada como "a que a IA usou" seria falso.
  Prescrever semana futura com a fadiga de hoje também seria errado: o cansaço de hoje não define o
  esforço da semana que vem.
- **`ajusteFadiga` é informativo**, calculado por `calcularZonasAjustadasPorTsbProntidao` com o TSB de
  prontidão de hoje: o front mostra o chip "hoje +7 s/km" e o treinador decide se corrige à mão. O
  seletor de zona **não** soma o ajuste ao preencher; o valor gravado é o da faixa base. O ajuste é
  recalculado a cada leitura (sem cache longo) e **não** altera alvos já persistidos.

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
  ritmoAlvo: string | null;    // "4:30-4:45/km"  (canônico, casa PACE_FAIXA; faixa base, sem ajuste)
  fcAlvoEtapa: string | null;  // "168-178 bpm"   (canônico, casa FC_BPM)
  alvoPrimario: 'PACE' | 'FC' | 'NENHUM';
}
```

- **Escolher Zn** copia `pace` e `fc` da zona (do endpoint, faixa **base** — o ajuste por fadiga é só informativo, D1) para os dois
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

### D5 — `alvoPrimario`: sempre do treinador; a regra só pré-preenche

**Decisão de produto (2026-10-26): o eixo que vai ao relógio é escolha do treinador, sempre.** Cada
treinador trabalha de um jeito; o produto não impõe método. Consequências no editor:

- O toggle `Pace | FC` fica **sempre visível e habilitado** ao lado dos pills, em toda zona (Z1–Z5)
  e em "Personalizado". Trocar é um clique; não há confirmação nem aviso por "fugir da regra".
- A tabela abaixo é **só o valor inicial** quando o treinador escolhe uma zona e ainda não tocou no
  eixo. Depois que ele toca, o editor não volta a mexer (nem ao trocar de zona).
- Único caso sem toggle é físico: Z6 (não tem FC), atleta sem um dos limiares, FC de limiar apenas
  estimada (D1) — aí o eixo disponível é o único, e o editor diz por quê. Se **nenhum** eixo está
  disponível (Z6 de atleta sem `paceLimiar`; ou limpar o único valor), `alvoPrimario = NENHUM`, a
  etapa fica sem meta e o editor mostra "Z6 precisa do pace de limiar do atleta". Limpar um eixo
  com o outro preenchido move o `alvoPrimario` para o que sobrou; o toggle só habilita eixo que tem
  valor.
- Os avisos (CA12, CA13, FC fora da faixa típica) continuam **informativos**, nunca bloqueiam.

| Contexto da etapa | Pré-preenchimento | Por quê |
|---|---|---|
| `tipoEtapa ∈ {INTERVALADO, TIRO}` ou zona ∈ {Z5, Z6} | `PACE` | FC leva 1–2 min para estabilizar |
| `tipoEtapa ∈ {AQUECIMENTO, RECUPERACAO, DESAQUECIMENTO}` ou zona ∈ {Z1, Z2} | `FC` | esforço leve e longo |
| zona ∈ {Z3, Z4} em etapa `PRINCIPAL` | `FC` | mantém o comportamento atual do push |
| só um eixo preenchido | o preenchido | — |

A regra é função pura (`defaultAlvoPrimario(tipoEtapa, zona)`), testada em unidade, isolada para
ser substituída sem tocar no seletor. **Follow-up** (fora de escopo): lembrar a preferência do
treinador por tipo de etapa e usar isso como pré-preenchimento em vez da tabela — a prática de cada
um vira o default dele.

Alternativa descartada: regra sem override — contraria a decisão de produto. Alternativa descartada:
sem pré-preenchimento — força um clique a mais em toda etapa, e quem segue a prática comum pagaria
por quem não segue; o pré-preenchimento trocável atende os dois.

### D6 — `alvoPrimario` entra no contrato da etapa

Hoje é **derivado** em `EtapaAlvoResolver.resolver` (FC resolvida vence; sem FC, pace; sem nenhum,
`NENHUM`), que espelha a precedência de `IntervalsIcuWorkoutConverter.stepDeEtapa` — o Javadoc do
resolver exige que as duas mudem juntas e há teste comparando-os. O enum já existe:
`TreinoHojeDto.AlvoPrimario { FC, PACE, NENHUM }`. Com D5 o treinador pode querer pace mesmo com FC
preenchida → precisa persistir.

- **Reusar o enum existente**, sem criar um segundo: mover `AlvoPrimario` para `enums/` e ajustar os
  imports (mecânico) ou referenciar `TreinoHojeDto.AlvoPrimario` direto — escolher na task 2.2 o que
  gerar menos diff. Dois enums com os mesmos valores divergiriam em silêncio.
- `EtapaTreino.alvoPrimario VARCHAR(10) NULL` (**`NENHUM` tem 6 caracteres**; `VARCHAR(5)` rejeitaria
  "sem objetivo"). Migration `V106__add_alvo_primario_etapa_treino.sql` (último atual: V105; conferir
  no momento do merge — sessão paralela pode ter tomado o número), aditiva, nullable, `CHECK IN
  ('PACE','FC','NENHUM')`, sem backfill. `NULL` = legado → derivação atual. **`NENHUM` explícito**
  = o treinador escolheu "sem objetivo": nem FC nem pace vão ao relógio, mesmo que `fcAlvoEtapa` ou
  `ritmoAlvo` tenham texto. `NULL` com os dois campos vazios também resolve para `NENHUM`, mas por
  derivação — a diferença é que o explícito vence quando há texto.
- `EtapaInputDto.alvoPrimario` (opcional), `EtapaTreinoDto.alvoPrimario` (saída). `TreinoPlanejadoPatchDto`
  e `TreinoPlanejadoAddDto` herdam via `EtapaInputDto`.
- **O ponto único de mudança é `EtapaAlvoResolver`** (usado pelo `/me/treinos/hoje`) **e
  `IntervalsIcuWorkoutConverter.stepDeEtapa`** (push): se `alvoPrimario != null`, obedecer; senão
  derivar como hoje. `AtletaTreinoHojeServiceImpl` só consome o resolver — não muda. Um teste por
  caminho; o teste de paridade resolver × converter cobre também `alvoPrimario` explícito.
- **Equivalência de repetição:** `IntervalsIcuWorkoutConverter.etapasEquivalentes` (backend) e
  `VOCABULARIO_EDITOR.assinatura` (`etapaItem.ts`) hoje comparam `ritmoAlvo`/`fcAlvoEtapa` mas não
  `alvoPrimario`. Duas etapas iguais com eixos diferentes seriam agrupadas num bloco repetido e uma
  delas perderia a escolha do treinador. `alvoPrimario` entra na comparação nos dois lados, com teste
  de regressão em cada.
- **Eixo sem valor:** `alvoPrimario = PACE` com `ritmoAlvo` vazio (ou `FC` com `fcAlvoEtapa` vazio)
  resolve como `NENHUM` no relógio — não inventa alvo. O editor impede o estado (toggle só habilita
  eixo preenchido); o backend tolera por defesa.
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
  `value: IntensidadeEtapa`, `tipoEtapa`, `onChange`, `disabled`. Substitui os campos "Zona (FC)" e
  "Ritmo" do `BlocoCard` em `EtapasEditor.tsx` — **um único ponto**, que serve edit e add. Cores das zonas via `activeTheme.zones` (`ZoneKey` já é
  `Z1–Z5`; **estender para `Z6`** em `tokens.ts`/`theme.premium.ts` — hoje o tipo não tem Z6).
- `AthleteZonesTable` em `src/features/coach/components/AthleteZonesTable.tsx`: `<details>`-like
  (MUI `Accordion`, recolhido), 6 linhas, chips de ajuste e idade do limiar (> 90 dias → aviso,
  mesmo limiar de `Atleta.limiaresDesatualizados`). Usada em `PlanoDetalhePanel` (entre métricas e
  treinos) e no topo do `TreinoEditDialog`/`TreinoAddDialog`.
- `TreinoTag` / `TreinoCard`: linha de meta vira `Zn · pace · fc` com o primário em destaque. Adapter
  puro `buildIntensityLineFromEtapa(etapa, zones)` em `features/coach/adapters/` — testável sem DOM.
- Avisos (CA13, CA12, CA14) seguem o padrão do aviso de remoção de aquecimento já existente no
  dialog: faixa inline `role="alert"`, não bloqueia salvar.
- O `TextField "Zona predominante"` do rodapé do `TreinoEditDialog` deixa de ser editável: a zona do
  treino passa a ser exibida a partir de `selectWorkoutProfile(...).targetZone`. O patch **continua
  enviando `zonaAlvo`** derivada, para o backend que a lê (`PlanoLlmValidator`, badge). O RPE do
  treino fica.
- **`selectWorkoutProfile` precisa aprender a zona escolhida.** Hoje ele lê texto (`Z2` em
  `fcAlvoEtapa`/descrição) e ignora faixas numéricas; o seletor grava `"143-150 bpm"` em
  `fcAlvoEtapa`, então a zona derivada voltaria `null` ou, pior, outra, vinda de uma descrição
  antiga ("Corrida contínua Z2") que ganha da inferência. Solução: o `ZoneSelector` também grava a
  zona na etapa (`zonaEtapa`, campo do view-model do editor, sem novo campo de contrato) e o adapter
  entrega a `selectWorkoutProfile` a zona já resolvida como fonte de maior precedência; a regex passa
  a aceitar `Z6`. Etapas carregadas do backend (sem `zonaEtapa`) usam `matchZone` (D4, hidratação)
  contra as zonas do atleta antes de cair no texto.
- **Personalizado não ressuscita zona textual.** Etapa com `fcAlvoEtapa`/`ritmoAlvo` explícitos que
  não casam nenhuma zona (`matchZone` falha) é `PERSONALIZADO` e **não** cai no fallback de texto da
  descrição ("Corrida contínua Z2"): a zona derivada daquela etapa é `null`. Fallback textual só
  vale quando a etapa não tem alvo numérico. Teste: salvar personalizado, reabrir, zona não volta a Z2.
- **Treino só por distância.** `selectWorkoutProfile` hoje descarta etapas sem duração
  (`selectWorkoutProfile.ts:370`); a agregação da zona do treino passa a ponderar por distância quando
  não há duração, e retorna `null` (exibido como "—") se nenhuma etapa tem peso. Nunca derruba o
  salvar. `ProfileEtapaInput` (`features/workout/profile/input.ts:13`) passa a transportar a distância.
- **Limpar × preservar `zonaAlvo`.** `TreinoPlanejadoServiceImpl:364` preserva o valor quando
  `zonaAlvo` falta ou é nulo. Regra do front: **omitir** o campo (preserva) quando as `zones` ainda
  não resolveram (loading/erro) ou o treinador não alterou intensidade de nenhuma etapa; enviar
  `zonaAlvo = ""` (limpa; backend, task 2.6) **só** quando `zones` resolveu, alguma etapa de
  intensidade mudou e `null` é o resultado. Assim uma falha de carregamento nunca apaga a zona.

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
| Dois seletores divergirem (add × edit) | Um `ZoneSelector`; `EtapasEditor` (compartilhado por Editar e Adicionar) o monta uma vez |
| Teste de componente passar com zona errada (mock = código) | CA10/CA16 afirmam **valores** de bpm/pace vindos do endpoint, e o E2E usa backend real |
| `ZoneKey` sem Z6 quebrar `activeTheme.zones[...]` | Estender o tipo e os mapas de cor/label antes do seletor; `tsc` acusa os pontos |
| Pré-preenchimento de `alvoPrimario` (D5) não bater com a prática do treinador | É só valor inicial, trocável num clique e nunca reaplicado depois que o treinador toca; follow-up lembra a preferência dele |

### Pré-requisito de contrato — `atletaId` no plano

`PlanoSemanalOutputDto` traz `atletaNome` e **não** `atletaId` (verificado em 2026-10-26), e
`PlanoDetalhePanel` não usa o id. O painel precisa do id para chamar `/coach/atletas/{id}/zonas`.
Campo aditivo `atletaId` no DTO, no mapper e na spec de contrato, entregue **antes** do front
(task 3.0). Alternativa descartada: buscar o id por nome — frágil e vaza homônimos.

### Rollback

- **Front:** revert do PR. Nenhum dado depende dele; os campos gravados (`fcAlvoEtapa`, `ritmoAlvo`)
  já eram lidos pelo parser antes.
- **Backend `alvoPrimario`:** a coluna é nullable e aditiva; com revert do código ela fica órfã e
  inócua (nenhum leitor). Não precisa de migration de volta. Etapas gravadas com o campo voltam à
  derivação antiga (FC vence) — o relógio pode mudar de eixo nessas etapas.
- **Backend D2 (fatores de pace):** revert dos dois números. **Planos já gerados com os fatores
  novos mantêm o texto de pace que a IA escreveu** — a mudança afeta só geração futura e a tabela
  exibida; não há reprocessamento de plano existente nem a favor nem contra.
- **Ordem de entrega:** PR do backend em `develop` (endpoint, `atletaId`, `alvoPrimario`, D2) **antes**
  de abrir o do front; o front depende do contrato no ambiente de testes.

### D9 — Decisões visuais (mockup + design critique, 2026-10-26)

Mockup no canvas **Zonas na prescrição** (https://claude.ai/artifact/35bHzwZJHiaj72FTq3Rbwb), com o
design system Menthoros instalado: painel de revisão, editor, 8 estados do `ZoneSelector`, cards.
A critique achou duas falhas objetivas e três de usabilidade; viram regra aqui.

| # | Regra | Por quê |
|---|---|---|
| V1 | **Rótulos de 11–12 px em `text-secondary` (`surface-400`, `#94A3B8`)**, nunca `text-muted` (`surface-500`, `#64748B`). `text-muted` só em hint terciária ≥ 12 px sobre `surface-900`. | `#64748B` sobre `surface-800` = 3,4:1 e sobre `surface-raised` = 3,0:1 — falha 4,5:1. `#94A3B8` = 6,4:1 |
| V2 | **Texto de alerta em `text-primary`; só o ícone na cor semântica** (`semantic-danger`/`semantic-warning`). | `#EF4444` a 12 px sobre `surface-800` = 4,3:1, falha por pouco |
| V3 | **Lime (`primary-500`) só em ação e seleção.** Em leitura (painel, cards, etapas expandidas) o eixo primário é `text-primary` + peso 600 e o secundário `text-secondary`. No editor, lime só no segmento selecionado do toggle `Relógio: Pace | FC`. "Personalizado" selecionado é `surface-raised` com borda `text-secondary`. | Regra do DS ("lime sem disciplina" foi defeito real); lime em leitura compete com Aprovar |
| V4 | **Ordem fixa pace → FC** em todo card, linha de etapa e pill. O primário se distingue só por peso/cor, nunca pela posição. | Em mono as colunas alinham; ordem variável obriga a reler cada card |
| V5 | **Editor: só a etapa em foco expandida.** As demais viram uma linha resumo (`chip da zona · pace · FC · relógio X`, aviso como ícone); clique expande. | Com 3 etapas o dialog já passava de 1200 px; um intervalado real passa de 2000 |
| V6 | **Toggle de eixo com rótulo visível "Relógio:"**, além do `aria-label`. | O propósito não pode depender de hint abaixo |
| V7 | **Personalizado não tem chip** no card; os valores bastam. "Sem meta" com borda sólida `surface-700`; tracejado só em dia de descanso. | "Pers." era críptico; tracejado significava duas coisas |
| V8 | **Alvos ≥ 40 px** nos segmentos de zona, **44 px** no toggle e botões. `role="radio"` em `radiogroup`, `role="alert"` nos avisos, `aria-describedby` do aviso para o campo que o gerou. | Toque em tablet; semântica para leitor de tela |
| V9 | **Chip da zona na cor `zone-N`, texto `primary-contrast`.** Borda esquerda do card segue o **tipo de treino** (`categorical-*`), não a zona. | Dois canais sem competir; já é assim hoje |
| V10 | **Z6 precisa de token `zone-6`** no DS, com lightness distinta de `zone-5`. No mockup, `categorical-magenta` como proposta. Task 4.3 adiciona o token no front e abre PR no DS. | Hoje `ZoneKey` para em Z5 |

Deixado para depois de ver renderizado: variante compacta da tabela de zonas (faixa horizontal de
6 chips, ~80 px) para quando expandir a tabela não empurrar a semana para fora da tela.
