# coach-cadastro-ancoras-zonas — o treinador cadastra os limiares que geram as zonas do atleta

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-11-03
**Repos afetados:** `apps/menthoros-backend`, `apps/menthoros-front` — PR coordenado, backend primeiro
**Protótipo:** canvas [Zonas do Atleta — Cadastro](https://claude.ai/artifact/8Zs7CV1pXrxUMeai5oqQTZ)
(artboards "Cadastro de zonas" e "Card Zonas do Atleta")

> **Primeira de duas.** Esta change entrega o modo **"Calcular pelo limiar"** do protótipo. O modo
> **"Informar manualmente"** (faixas De/Até por zona) é `coach-zonas-manuais`, que depende desta e
> muda o que os 15 consumidores de `ZonaTreinoService` leem — risco isolado lá.

## Why

As zonas do atleta já chegam ao treinador (`coach-athlete-zones`, card `AthleteZonesTable`), e
alimentam o prompt da IA, o push para intervals.icu/Garmin e o seletor de zona do editor de etapas.
**Mas o treinador não tem como dizer ao sistema quais são os limiares do atleta.**

Verificado em 2026-11-03:

- `tb_atleta` tem `fc_limiar`, `fc_maxima`, `pace_limiar`, `data_ultimo_teste_fc` e
  `data_ultimo_teste_pace`, e `ZonaTreinoService` calcula as zonas a partir deles.
- **Nenhum código grava esses campos.** Não existe DTO de entrada com eles, nem `setFcLimiar` /
  `setPaceLimiar` / `setFcMaxima` em `main/`. `AthleteThresholdUpdater` só escreve as estimativas
  em `tb_plano_metadados`.
- A spec canônica admite isso: o cenário "Sem pace de limiar" mostra "cadastre o pace de limiar do
  atleta" **sem link, porque não existe fluxo de cadastro de limiar no front**.

Consequência: atleta sem `pace_limiar` não tem zona de pace em lugar nenhum (card, seletor de etapa,
relógio), e a FC cai no fallback etário (`fcLimiarEstimada = true`). O treinador que fez um teste de
30 min com o atleta não tem onde registrar o resultado. A prescrição da IA continua sobre um número
que ele sabe estar errado.

**E o relógio fica sem meta de FC.** `IntervalsIcuFcAlvoResolver` usa `getFcLimiar()` (não a
estimada) de propósito: sem limiar medido, alvo de FC em % ou zona é **descartado** no push
(intervals.icu e Garmin). Cadastrar o limiar é o que libera meta de FC no relógio.

**Para a assessoria:** a IA passa a prescrever sobre o limiar real do atleta, e o relógio passa a
cobrar a FC certa. Sem isso, a promessa "zonas individualizadas" vale só para quem tem dado
importado, o que não é o caso dos atletas recém-cadastrados de uma assessoria em onboarding.

## What Changes

**Backend**
- `PUT /api/v1/coach/atletas/{atletaId}/zonas/ancoras` — grava as âncoras de FC (limiar, máxima,
  data do teste, origem) e/ou de pace (limiar, data do teste, origem). Devolve o
  `AthleteTrainingZonesDto` recalculado.
- `POST /api/v1/coach/atletas/{atletaId}/zonas/simulacao` — mesmo corpo, **não persiste**, devolve as
  zonas que aquelas âncoras gerariam. A prévia do diálogo vem daqui: a fórmula fica só em
  `ZonaTreinoService` (ver `design.md` D2).
- Migration aditiva: `fonte_limiar_fc` e `fonte_limiar_pace` em `tb_atleta` (enum `FonteLimiar`).
- `GET .../zonas` passa a devolver `ancoras.fonteLimiarFc` e `ancoras.fonteLimiarPace` (aditivo).
- Após salvar FC, reenvio best-effort de `lthr`/`max_hr` ao intervals.icu para atleta conectado
  (reaproveita `sincronizarFcBestEffort`; falha só gera log). **Decisão padrão — reversível.**
- Uma linha de log estruturado por salvamento (eixo, origem, se o anterior era estimado; valores
  fisiológicos em DEBUG, como `IntervalsIcuFcAlvoResolver` já faz). Sem tabela de histórico.
  **Decisão padrão — reversível.**
- Este PUT é o **único writer** das âncoras em `tb_atleta`. `add-running-field-tests`, quando
  aplicar o resultado de um teste, chama o mesmo service — não grava os campos por outro caminho.

**Frontend**
- Diálogo **"Zonas de <nome>"** com abas **Zonas de FC** e **Zonas de Ritmo**: campos de âncora,
  prévia das 6 zonas (barra + tabela) vinda da simulação, validação inline, salvar.
- Card `AthleteZonesTable`: botão **"Editar zonas"**; FC estimada mostra a tabela com selo
  "estimada" e o CTA "Cadastrar limiar de FC"; aviso **"Ritmo não cadastrado"** vira link que abre o
  diálogo na aba Ritmo; a origem aparece junto da data ("Teste de campo · 12 out").
- "Editar zonas" só no `PlanoDetalhePanel`; `TreinoEditDialog` e `TreinoAddDialog` mostram o card
  só leitura (sem diálogo sobre diálogo — `design.md` D7).
- Após salvar, **todos** os consumidores montados de `useAthleteTrainingZones` daquele atleta
  recarregam (`PlanoDetalhePanel`, `CurrentWeekPlan`, `TreinoEditDialog`, `TreinoAddDialog`), não só o
  host do diálogo.

## Fora do escopo

- Faixas manuais por zona (modo "Informar manualmente") → `coach-zonas-manuais`.
- Mudar os fatores de pace → `revalidar-fatores-pace-zonas`. A prévia mostra o que o backend
  calcula hoje, qualquer que seja o fator.
- Status de confiança da zona (vencida, incoerente) → `add-zone-confidence-management`. Esta change
  só **grava** a origem; quem a interpreta é aquela.
- Regenerar planos já gerados ou reenviar ao relógio treinos **já enviados** quando o limiar muda.
  Atenção: a maioria dos treinos já criados guarda alvo absoluto — o editor grava a faixa ao escolher
  a zona (`zoneSelectorLogic.ts:84`) e o `SessionResolver` gera "x-y bpm" — e **não muda**. Só etapa
  com alvo relativo (zona ou %) ainda não enviada é convertida no push com o limiar vigente. O
  diálogo promete só o que é verdade para todos: "Os próximos planos usam estes valores. Treinos já
  criados com alvo em bpm ou ritmo fixo não mudam."
- Escrever zonas nas configurações do Garmin Connect ou do intervals.icu além do `lthr`/`max_hr`
  acima. O push ao relógio já manda bpm absoluto (`GarminWorkoutPayloadMapper`), então a meta no
  relógio não depende das zonas configuradas na plataforma.
- Registro do resultado de teste de campo como treino → `add-running-field-tests`.
- Histórico de limiares (série temporal). Grava-se o valor vigente e a data do teste.

## Critérios de aceite

- **CA1** — Dado um atleta do tenant sem `pace_limiar`, quando o treinador envia
  `PUT .../zonas/ancoras` com `pace = { limiarSegKm: 290, dataTeste: "2026-10-12", origem: "TESTE_CAMPO" }`,
  então a resposta é `200`, `disponibilidade.pace = true`, `ancoras.paceLimiarMinKm ≈ 4.83` e as seis
  zonas trazem `pace` — as mesmas faixas que `ZonaTreinoService` produz para esse limiar.
- **CA2** — Dado `fc = { limiar: 168, maxima: 186, dataTeste, origem }`, quando o PUT é salvo,
  então `ancoras.fcLimiar = 168`, `ancoras.fcLimiarEstimada = false`, `fcMaxima = { bpm: 186, estimada: false }`.
  Dado `fc = { limiar: 168, maxima: null, ... }`, a máxima gravada não muda e, se era estimada,
  continua `estimada: true` — a estimativa nunca vira valor "informado" sem o treinador digitar.
- **CA3** — Dado um corpo com só `pace`, quando o PUT é salvo, então os campos de FC do atleta
  permanecem como estavam (e vice-versa). Grupo ausente = não alterar.
- **CA4** — Validação devolve `400` com o campo: `fc.limiar` ausente; `fc.maxima` informada — ou, se
  vazia, a **gravada** — `< round(fc.limiar × 1,06)` (topo da Z5; máxima estimada nunca bloqueia,
  `design.md` D4); `fc.limiar` fora de 100–200; `fc.maxima` fora de 120–220; `pace.limiarSegKm` fora de
  150–720 (2:30–12:00/km) — os mesmos limites dos CHECKs `ck_atleta_fc_limiar`, `ck_atleta_fc_maxima`
  e `ck_atleta_pace_limiar` de V6; `dataTeste` ausente, no futuro (data local do atleta, via
  `AtletaHojeResolver`) ou antes de 2000; corpo sem nenhum grupo. A simulação aplica as mesmas
  regras: nada que a prévia aceita é rejeitado ao salvar.
- **CA5** — `POST .../zonas/simulacao` com o mesmo corpo do CA1 devolve as mesmas zonas do CA1 e
  **não altera** `tb_atleta` (GET seguinte igual ao anterior).
- **CA6** — `atletaId` de outro tenant → `404` no PUT e na simulação; perfil sem `TECNICO`/`ADMIN` → `403`.
- **CA7** — `GET .../zonas` devolve `ancoras.fonteLimiarFc` / `fonteLimiarPace` gravados; `null`
  para atletas sem origem.
- **CA8** — No front, o card com zonas mostra "Editar zonas"; clicar abre o diálogo na aba FC com os
  valores atuais preenchidos.
- **CA9** — Dado atleta com `fcLimiarEstimada = true`, o card **continua mostrando** a tabela de FC
  (é o que a IA usa hoje), com selo "estimada" e o CTA "Cadastrar limiar de FC". Se também não houver
  `pace_limiar`, o cabeçalho do card mostra "Cadastrar zonas" em destaque.
- **CA10** — Dado atleta sem `pace_limiar` e com FC cadastrada, o card mostra a tabela de FC e o aviso
  "Ritmo não cadastrado" com link que abre o diálogo na aba Ritmo.
- **CA11** — No diálogo, alterar uma âncora válida atualiza a prévia em até ~500 ms com o resultado da
  simulação; âncora inválida mostra o erro no campo, esconde a prévia daquele eixo e desabilita "Salvar zonas".
- **CA12** — Salvar fecha o diálogo, mostra confirmação e o card exibe as novas faixas sem recarregar
  a página. Erro no PUT mantém o diálogo aberto com os valores e mostra a mensagem.
- **CA13 (E2E)** — Fluxo real: treinador abre o card de um atleta sem ritmo, cadastra pace de limiar
  4:50, salva, e o card mostra a coluna de ritmo preenchida. O mesmo spec cobre "Editar zonas" de FC.
- **CA14 (ponte com o push)** — Dado atleta sem `fc_limiar` e etapas não enviadas nos três formatos:
  (a) alvo relativo `Z2` ou `%` — o resolver descarta a FC antes e, depois de salvar
  `fc.limiar = 168`, resolve para a faixa de 168; (b) bpm literal gravado pelo editor de etapas
  (`aplicarZona`) — resolve igual antes e depois, sem recalcular. Teste de `IntervalsIcuFcAlvoResolver`
  com o atleta antes e depois.
- **CA15** — Dado atleta com intervals.icu conectado, salvar FC dispara o reenvio de `lthr`/`max_hr`;
  falha no intervals.icu não altera a resposta `200` nem desfaz a gravação.
- **CA16** — Com `PlanoDetalhePanel` e `CurrentWeekPlan` do mesmo atleta montados, salvar no diálogo
  atualiza o card e o seletor de zona do `CurrentWeekPlan` sem recarregar. Resposta de GET ou simulação que chega depois de uma mais nova (ou de outro atleta) é descartada.
- **CA17** — Para `limiarSegKm` em 150..720, as faixas de pace da simulação, da resposta do PUT e do
  GET seguinte são idênticas, e cada borda difere no máximo 1 s do cálculo direto a partir dos segundos.
- **CA18** — Dois PUTs concorrentes no mesmo atleta, um só com `fc` e outro só com `pace`, terminam
  com os dois eixos gravados (nenhum restaura o valor antigo do outro).

## Métrica de sucesso

- **Primária:** % de atletas ativos com `pace_limiar` **e** `fc_limiar` cadastrados, entre atletas de
  treinadores ativos (treinador com ao menos uma revisão de plano nos últimos 14 dias). Medida por
  query no banco, base na task 0.1. **Meta: ≥ 70% em 30 dias após o deploy.**
- **Secundária (valor, não preenchimento):** taxa de aceitação de planos pelo treinador nos 60 dias
  após o deploy, separando atletas pelo **estado atual** (`fc_limiar` gravado e `fonte_limiar_fc`
  não nula vs. estimado). Aproximação aceita: sem histórico de limiar (fora do escopo), um plano
  revisado antes do cadastro conta no grupo "cadastrado"; para reduzir o viés, considerar só planos
  revisados depois de `data_ultimo_teste_fc`. Se não houver diferença, cadastrar limiar não melhorou a
  prescrição e isso vira insumo para `revalidar-fatores-pace-zonas`.

## Riscos e mitigações

- **Precisão do pace.** `pace_limiar` é `numeric(5,2)` em minutos decimais: 4:50 = 4.8333 → 4.83 →
  289.8 s. Arredondar de volta dá 4:50, mas ida e volta não é garantida para todo segundo. Mitigação:
  teste parametrizado de ida e volta para 2:30–12:00 (D3; conferido exato para os 571 valores).
- **Limiar trocado muda a prescrição e o relógio.** É o objetivo, mas o treinador precisa saber. O
  diálogo diz: "Os próximos planos usam estes valores. Treinos já criados com alvo em bpm ou ritmo
  fixo não mudam." (DoR Codex: a versão anterior prometia que todo treino não enviado mudaria.)
- **Z5 acima da FC máxima** (DoR Codex). `calcularZonasFC` ignora a máxima; limiar 168 com máxima 169
  daria Z5 até 178. Mitigação: máxima real `≥ round(limiar × 1,06)` (CA4, D4).
- **Dois fallbacks de FC máxima** (DoR Codex). Validar contra estimativa rejeitaria limiar que o card
  mostra abaixo da máxima. Mitigação: validação cruzada só com máxima real (D4).
- **Fórmula duplicada no front** divergiria de `ZonaTreinoService` (e de `revalidar-fatores-pace-zonas`).
  Mitigação: prévia só via simulação (D2). Custo da simulação é só CPU (sem LLM).
- **Prévia aceita o que o banco rejeita** (pré-mortem). Mitigação: limites do DTO = CHECKs de V6; um
  só validador para simulação e PUT (CA4); teste de integração com PostgreSQL nos limites.
- **Estimativa promovida a dado informado** (pré-mortem). Mitigação: `fc.maxima` opcional; vazio =
  não alterar (CA2).
- **Simulação gravando por acidente** (pré-mortem). Mitigação: cálculo puro sobre record, atleta
  resolvido por tenant antes; teste de integração que relê em transação separada (D2, D9).
- **Grupo ausente sobrescrito por concorrência** (pré-mortem). Mitigação: `UPDATE` só das colunas do
  grupo presente, filtrado por tenant (D1, CA18). Dois treinadores no **mesmo** eixo: último vence, aceito.
- **Consumidor com zona velha** (pré-mortem). Mitigação: invalidação por atleta + descarte de resposta
  ultrapassada (D7, CA16).
- **Data perto da meia-noite** (pré-mortem). Mitigação: só `AtletaHojeResolver`, sem `@PastOrPresent`
  com o relógio do servidor (D6).
- **Quantização do pace** (pré-mortem). Ida e volta da âncora é exata para 150..720, mas o
  arredondamento intermediário de `ZonaTreinoService` muda borda em 1 s (290 s → Z ×1,15 = 333 vs 334).
  Aceito com tolerância ±1 s e igualdade entre simulação/PUT/GET (CA17).

## Open Questions & Assumptions

- **A1 (premissa)** — A FC máxima informada substitui a estimada (`fcMaxima.estimada = false`) e passa
  a ser o teto do push (`descarta FC acima de bpm`). Confirmar que nenhum outro consumidor recalcula a
  máxima por idade ignorando `fc_maxima` — **task 0.2**.
- **A2 (premissa)** — `FonteLimiar` = `TESTE_CAMPO`, `PROVA`, `LABORATORIO`, `RELOGIO_PLATAFORMA`
  (Garmin e intervals.icu detectam LTHR — fonte comum no dia a dia). "Estimada pela idade" não é
  origem gravável: é o que acontece quando não há valor. Fechar o enum antes da migration (o CHECK trava).
- **Decisões padrão (2026-11-03, reversíveis):** reenviar `lthr`/`max_hr` ao intervals.icu ao salvar
  (CA15); registrar cada salvamento só em log, sem tabela de histórico. Se o sinal "estimado → corrigido"
  for necessário para a métrica secundária, a tabela entra em change própria.
- **Q2** — Concorrência no mesmo eixo: `If-Match`/versão? Não agora; `UPDATE` por grupo resolve
  eixos diferentes (CA18).
- **Q3** — O pilot das primeiras assessorias depende de limiar cadastrado ou roda com estimativa?
  Define se esta change é pré-pilot. Critério: se o pilot vai mandar treino com meta de FC ao relógio
  (intervals.icu/Garmin), é pré-pilot — sem limiar medido o push descarta FC em zona/%. Afeta só a
  prioridade, não o escopo; fecha na task 0.3.
- **Resolvido (2026-11-03)** — A sincronização do intervals.icu **lê** `fc_limiar`/`fc_maxima` e
  envia ao intervals.icu; não grava em `tb_atleta`. Nada sobrescreve o que o treinador cadastra.
  `Atleta.getFcLimiarCalculada()` usa `0.85 × getFcMaximaCalculada()` quando `fc_limiar` é nulo, então
  cadastrar só a FC máxima já muda a LTHR estimada — o diálogo exige as duas juntas (D4).
