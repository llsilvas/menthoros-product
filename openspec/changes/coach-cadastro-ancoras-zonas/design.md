# Design — coach-cadastro-ancoras-zonas

## Contexto

- Âncoras em `tb_atleta`: `fc_limiar int`, `fc_maxima int`, `data_ultimo_teste_fc date`,
  `pace_limiar numeric(5,2)` (minutos decimais), `data_ultimo_teste_pace date`. Nenhum caminho de
  escrita hoje.
- `CoachAthleteZonesServiceImpl` monta o `AthleteTrainingZonesOutputDto` a partir de `Atleta` +
  `ZonaTreinoService` + `PaceZoneCalculator` (ajuste por fadiga, informativo).
- Front: `AthleteZonesTable` (card recolhível), `useAthleteTrainingZones` (GET), cliente curado
  `CoachAthleteZonesService`. Hosts que renderizam o card (conferido em 2026-11-03):
  `PlanoDetalhePanel.tsx:556`, `TreinoEditDialog.tsx:436`, `TreinoAddDialog.tsx:292`.
  `CurrentWeekPlan.tsx:136` só consome o hook (seletor de zona), sem renderizar o card. Quem oferece
  edição: D7.

## Decisões

### D1 — Endpoint dedicado às âncoras, não o PUT do atleta

`PUT /api/v1/coach/atletas/{atletaId}/zonas/ancoras`, ao lado do `GET .../zonas` existente, mesmo
controller (`CoachAthleteZonesController`), mesmas regras de acesso (`TECNICO`/`ADMIN`, tenant via
`TenantContext`, outro tenant → 404).

Por que não estender o update do atleta: o formulário de atleta não tem esses campos, o DTO de
atleta é usado pelo cadastro e pela importação CSV, e a resposta que o diálogo quer é a **tabela de
zonas recalculada**, não o atleta. Endpoint pequeno, contrato focado, rollback isolado.

Corpo (`AthleteZoneAnchorsInputDto`):

```json
{
  "fc":   { "limiar": 168, "maxima": 186, "dataTeste": "2026-10-12", "origem": "TESTE_CAMPO" },
  "pace": { "limiarSegKm": 290, "dataTeste": "2026-10-12", "origem": "TESTE_CAMPO" }
}
```

- Grupo ausente/`null` = não alterar aquele eixo (CA3). Os dois ausentes → 400.
- Obrigatórios no grupo: `fc.limiar`, `pace.limiarSegKm`, `dataTeste`. Opcionais: `fc.maxima`
  (vazio = manter a vigente, D4) e `origem`. `dataTeste` obrigatório porque a confiança futura
  (`add-zone-confidence-management`) depende dele.
- Gravação por **`UPDATE` restrito às colunas do grupo presente**, com `WHERE id = :id AND tenant_id = :tenant`
  (`@Modifying` no `AtletaRepository`), não `save` da entidade inteira. Dois PUTs em eixos diferentes
  não se sobrescrevem (CA18). Depois do `UPDATE`, a resposta é montada relendo o atleta.
- Pace trafega em **segundos por km inteiros**, como `zonas[].pace` já trafega na resposta. A
  conversão para minutos decimais fica no backend (D3).
- Resposta: `200` com `AthleteTrainingZonesOutputDto` (o mesmo do GET).

### D2 — Prévia por simulação no backend

`POST .../zonas/simulacao`, mesmo corpo e mesma resposta, sem persistir. Implementação: extrair o
montador do GET para uma **função pura sobre um record** (`AncorasZonas`: limiares, máxima com flag de
estimada, datas, origens, TSB de prontidão — tudo que os fallbacks precisam). GET, PUT e simulação:
resolvem atleta e metadados **por tenant** primeiro, montam o record (a simulação sobrepõe os grupos
do corpo) e chamam a mesma função. A entidade gerenciada nunca recebe as âncoras simuladas — nada a
"esquecer de não salvar". Mesmo validador (D6) antes da simulação e do PUT.

Alternativa descartada: fórmula no front. `ZonaTreinoService.PACE_FATORES` está em revisão
(`revalidar-fatores-pace-zonas`) e a FC tem o fallback etário; duas implementações divergiriam em
silêncio, e o treinador veria na prévia um número diferente do que vai ao relógio. POST e não GET
porque o corpo é estruturado e não queremos limiar fisiológico em query string/log de acesso.

Front chama a simulação com debounce de 300 ms quando o grupo do eixo ativo está válido no cliente.

### D3 — Conversão do pace

`pace_limiar = round(limiarSegKm / 60, 2, HALF_UP)`. Leitura já faz `paceLimiarMinKm × 60`.

Ida e volta da âncora é exata: para todo `s` em 150..720, `round(round(s/60, 2) × 60) == s`
(conferido em 2026-11-03, 571 valores, `HALF_UP`). **Mas as bordas das zonas não**: `ZonaTreinoService`
arredonda de novo (`:164`) antes da conversão para segundos, e 290 s → 4,83 → Z ×1,15 dá 333 s, contra
334 s calculando direto. Ampliar a escala da coluna não resolve (o arredondamento é no serviço).
Decisão: aceitar tolerância de **±1 s por borda** e garantir que simulação, PUT e GET devolvem as
mesmas faixas (CA17) — todos passam pela mesma função pura com o valor já quantizado em 2 casas.
Sem mudança de escala nesta change.

### D4 — Limiar obrigatório, máxima opcional

`getFcLimiarCalculada()` deriva a LTHR de `0.85 × FC máx` quando `fc_limiar` é nulo. Aceitar só a
máxima mudaria a LTHR estimada sem o treinador perceber: por isso `fc.limiar` é obrigatório.

A máxima é opcional (pré-mortem): se o diálogo pré-preenchesse a máxima estimada e o treinador só
tocasse no limiar, salvar gravaria a estimativa em `fc_maxima`, e o GET passaria a dizer
`estimada: false` (`CoachAthleteZonesServiceImpl:75` trata qualquer valor gravado como informado).
Então: o campo "FC máxima" começa **vazio** quando a vigente é estimada, com o valor estimado como
dica ("estimada: 186"); vazio no envio = não alterar.

**A validação cruzada da máxima só usa valor real** (DoR Codex, 2026-11-03): a máxima informada no
corpo ou, se vazia, `fc_maxima` **gravada**. Máxima estimada não valida nem bloqueia. Motivo: os dois
fallbacks divergem — `getFcMaximaCalculada()` dá 180 sem nascimento (`Atleta.java:205`) e
`getFcMaximaComFallback()`, que o GET exibe, dá 190 (`Atleta.java:220`); validar contra qualquer um
deles rejeitaria um limiar que o card mostra abaixo da máxima, ou bloquearia o treinador por causa de
um número que ele não digitou. Unificar os fallbacks segue fora do escopo.

**Máxima real ≥ topo da Z5.** `ZonaTreinoService.calcularZonasFC` ignora a máxima e faz Z5 =
100–106% do limiar (`ZonaTreinoService.java:49`, `:93`). Com limiar 168 e máxima 169, a Z5 iria a
178 bpm: o push descartaria o bpm literal acima da máxima e aceitaria a mesma intensidade em zona/%.
Em vez de cortar a Z5 (mudaria o GET e os 15 consumidores), a validação exige
`maxima ≥ round(limiar × 1,06)` sempre que há máxima real. Limiar 200 (teto do CHECK) pede 212,
dentro de 120–220.

### D5 — Origem do limiar

Migration `V107__add_fonte_limiar_atleta.sql` (reconferir o número no commit; último atual: V106):

```sql
ALTER TABLE tb_atleta
  ADD COLUMN fonte_limiar_fc   VARCHAR(20) NULL,
  ADD COLUMN fonte_limiar_pace VARCHAR(20) NULL,
  ADD CONSTRAINT ck_atleta_fonte_limiar_fc   CHECK (fonte_limiar_fc   IN ('TESTE_CAMPO','PROVA','LABORATORIO','RELOGIO_PLATAFORMA')),
  ADD CONSTRAINT ck_atleta_fonte_limiar_pace CHECK (fonte_limiar_pace IN ('TESTE_CAMPO','PROVA','LABORATORIO','RELOGIO_PLATAFORMA'));
```

Aditiva, nullable, sem backfill. Enum Java `FonteLimiar` com `@Enumerated(STRING)`. Exposta no GET
como `ancoras.fonteLimiarFc` / `fonteLimiarPace` (campos novos, `null` quando ausentes).

Rótulos no front: FC → Teste de campo · Prova recente · Laboratório · Relógio/plataforma; Pace →
Teste de campo · Prova recente · Relógio/plataforma. (Laboratório de pace é raro; o enum aceita, a UI
não oferece.)

Consumidor nesta change: o card mostra a origem junto da data do teste ("Teste de campo · 12 out").
Interpretação para confiança fica em `add-zone-confidence-management`.

### D6 — Validação

Bean Validation no DTO + validação cruzada no service:

| Campo | Regra |
|---|---|
| `fc.limiar` | obrigatório; 100–200 (= `ck_atleta_fc_limiar`, V6) |
| `fc.maxima` | opcional; 120–220 (= `ck_atleta_fc_maxima`, V6); informada ou **gravada** `≥ round(fc.limiar × 1,06)` (D4); estimada não entra |
| `pace.limiarSegKm` | obrigatório; 150–720 (2:30–12:00/km = `ck_atleta_pace_limiar` 2,5–12,0, V6:77) |
| `*.dataTeste` | obrigatório; ≤ hoje local do atleta; ≥ 2000-01-01 |

Os intervalos vêm dos CHECKs do banco (pré-mortem: o desenho anterior aceitava até 220/230 e o PUT
falharia no commit). Se um treinador precisar de LTHR > 200, a mudança é migration dos CHECKs, não
afrouxar só o DTO.

"Hoje" é **só** `AtletaHojeResolver` (fuso do atleta com fallback para timezone inválido), no
validador do service — nada de `@PastOrPresent`, que usa o `Clock` do servidor (`ClockConfig`). O
front valida contra a data local do navegador apenas como dica; a autoridade é o backend.

Erro no formato padrão de `400` do projeto, com o caminho do campo (`fc.maxima`).

### D7 — Front

- `CoachAthleteZonesService.salvarAncoras(atletaId, body)` e `.simular(atletaId, body)` no cliente
  curado; tipos `AthleteZoneAnchorsInput` em `src/types/AthleteTrainingZones.ts`; acrescentar
  `fonteLimiarFc`/`fonteLimiarPace` ao DTO.
- Hook `useAthleteZoneAnchorsEditor(atletaId, zonasAtuais)`: estado do formulário, validação local,
  simulação com debounce, `salvar()` com `loading`/`error`. Componente não chama service.
- `AthleteZonesDialog` em `src/features/coach/components/` — abas FC / Ritmo, `aba inicial` por prop
  (CA10 abre em Ritmo). Prévia: barra de zonas + tabela, mesmas cores `activeTheme.zones`.
  Texto fixo: "Os próximos planos usam estes valores. Treinos já criados com alvo em bpm ou ritmo
  fixo não mudam." (DoR Codex, 2026-11-03: o editor grava faixa absoluta ao escolher zona —
  `zoneSelectorLogic.ts:84` — e o `SessionResolver.java:171` gera "x-y bpm"; só alvo relativo em
  zona/% é convertido no push com o limiar vigente, `IntervalsIcuFcAlvoResolver:70`. A versão
  anterior do texto prometia que todo treino não enviado mudaria.)
- `AthleteZonesTable`: nova prop opcional `onEditar?: (aba: 'fc' | 'pace') => void`. Sem a prop, o
  card fica como hoje. Estado vazio (CA9) e link de ritmo (CA10) só aparecem quando há `onEditar`;
  sem ela, mantém o texto atual.
- **Só `PlanoDetalhePanel` passa `onEditar`.** `TreinoEditDialog` e `TreinoAddDialog` ficam só
  leitura: abrir o diálogo de zonas sobre outro diálogo empilha modais e perde o rascunho da etapa
  se o treinador se confundir. Eles recebem o valor novo pela invalidação abaixo.
- Após salvar: invalidar **todas** as instâncias de `useAthleteTrainingZones` do mesmo atleta, não
  só a do host (pré-mortem: `CurrentWeekPlan.tsx:136`, `TreinoEditDialog.tsx:105` e
  `TreinoAddDialog.tsx:85` montam instâncias independentes). Mínimo: um emissor de invalidação por `atletaId` no módulo do hook (assinatura em
  `useEffect`), sem biblioteca nova.
- Guarda de resposta ultrapassada: o hook do GET e o da simulação descartam resposta cuja requisição
  não é a mais recente (contador ou `AbortController`) ou cujo `atletaId` mudou (CA16). Debounce não
  resolve ordem de chegada.
- Pace digitado como `m:ss`, convertido para segundos no hook.
- UX/a11y (revisão do protótipo, 2026-11-03):
  - Abas com MUI `Tabs`/`Tab` + `tabpanel` (setas e foco já resolvidos); nada de botão com `role="tab"` solto.
  - Validação de âncora **no blur** (e ao salvar), não a cada tecla; a simulação só dispara com o
    eixo válido. Erro no `helperText` do `TextField` com `error` (MUI liga `aria-invalid` e
    `aria-describedby`).
  - "Salvar zonas" mostra carregando e fica desabilitado durante o PUT; não fecha antes da resposta.
  - Alvos de toque ≥ 44 px; foco visível em tudo que é clicável (não remover outline do tema).
  - `Dialog fullScreen` abaixo de `sm`; campos de âncora empilham em uma coluna.
  - Barra de zonas é decorativa (`aria-hidden`); a tabela é a alternativa acessível.
  - Pace: `inputMode="numeric"` não serve (tem `:`); usar `TextField` texto com máscara `m:ss`.

### D8 — Reenvio ao intervals.icu e log

- Após o `UPDATE` do grupo `fc`, o service publica um evento e um
  `@TransactionalEventListener(phase = AFTER_COMMIT)` (síncrono) chama o reenvio — rollback não
  dispara envio, e a chamada HTTP não segura a transação. Se o atleta tem intervals.icu conectado, chamar o mesmo
  `sincronizarFcBestEffort` (extrair de `IntervalsIcuOAuthServiceImpl` para um componente reutilizável).
  Falha só gera log; não afeta a resposta (CA15).
- Garmin: nada a enviar. O push já manda bpm absoluto (`GarminWorkoutPayloadMapper:114`).
- Log por salvamento: INFO com `atletaId`, eixo, origem, `anteriorEstimado`; valores em DEBUG.

### D9 — Testes

- Backend: `@WebMvcTest` do controller (200, 400 por regra, 403); teste da função pura de montagem;
  parametrizado de D3/CA17 (150..720, ±1 s, igualdade simulação = PUT = GET); teste de
  `IntervalsIcuFcAlvoResolver` antes/depois do cadastro com os três formatos — zona, % e bpm literal
  gerado pelo editor (CA14). **Integração com PostgreSQL real**
  (padrão de testes de integração do repo) para: limites dos CHECKs (CA4), simulação sem escrita
  relida em transação separada (CA5), 404 entre dois tenants no PUT e na simulação (CA6), dois PUTs
  concorrentes em eixos diferentes (CA18). Rodar o `@WebMvcTest` isolado além do `verify` (contexto
  quebrado já passou no verify local).
- Front: adapter/hook (validação, conversão m:ss, debounce, resposta ultrapassada, invalidação entre
  instâncias) em Vitest; componente do diálogo e do card (estados CA8–CA12, CA16) com Testing Library.
- E2E (obrigatório — dado que alimenta o motor): `tests/e2e/coach/zonas-cadastro.spec.ts` (CA13).

## Rollback

Front: reverter o PR remove o diálogo; o card volta a ser só leitura. Backend: endpoints novos não
têm consumidor além do front; a migration é aditiva e pode ficar. Valores já gravados por
treinadores permanecem e continuam sendo usados — é o comportamento desejado.
