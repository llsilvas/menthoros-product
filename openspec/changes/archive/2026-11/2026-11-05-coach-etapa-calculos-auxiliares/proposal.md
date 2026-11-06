**Tamanho:** S · **Trilha:** Fast

# Proposal — coach-etapa-calculos-auxiliares

## Why

O editor de etapas (`TreinoAddDialog` / `TreinoEditDialog`) pede ao treinador distância, duração,
pace e FC de cada etapa, mas não calcula nada entre eles: um tiro de 4 min a 4:50/km exige que o
treinador faça a conta da distância de cabeça, uma série de 4× não diz quanto soma, e um pace
digitado à mão vira "Personalizado" sem dizer em que zona do atleta cai. Cada um desses dados já
existe no editor — é só mostrar ou derivar.

Aberta em 2026-11-05 a partir de uso real da tela: a distância de uma etapa de série ficava em
branco com pace e duração preenchidos.

## What Changes

Somente `apps/menthoros-front`, no editor de etapas (`src/features/coach/components/etapas/`).

1. **Distância derivada de pace × duração** — ao mudar duração, pace ou zona, a distância da etapa
   é recalculada quando está vazia, zerada ou já derivada. Valor digitado pelo treinador não muda.
   Faixa de pace usa o ponto médio. Marcador `distanciaAuto` fica no view-model do editor e não vai
   ao contrato. **A distância derivada não vai ao PATCH**: o conversor do intervals.icu descarta a
   duração sempre que há distância (`IntervalsIcuWorkoutConverter.stepComMeta`, linha 384), então
   serializar o valor calculado transformaria um tiro de 4 min num tiro de 0,83 km no relógio
   (pre-mortem Codex em `add-etapa-duracao-segundos`, 2026-11-05). O campo derivado tem indicação
   visual ("calculado") e é recalculado ao reabrir o treino. Totais do dialog usam os itens, com
   o derivado. Parcialmente implementado, sem commit, na branch `feat/coach-etapa-distancia-auto`
   (worktree `.worktrees/coach-etapa-distancia-auto`): `recalcularDistancia` em `etapaItem.ts`,
   ligado no `BlocoCard` — ainda serializa o derivado e precisa do ajuste acima.
2. **Zona sugerida no "Personalizado"** — com pace ou FC digitados à mão, o seletor mostra em que
   zona do atleta o valor cai ("4:50/km cai em Z5 para este atleta"), usando `zonaPorValor`, que
   já alimenta o gráfico e o aviso `descricao-diverge`. Só informa; escolher a zona continua
   sendo o clique no rádio.
3. **Resumo da série no cabeçalho** — "Série" passa a mostrar o total do bloco já multiplicado:
   `4× · 24 min · 4,3 km`. Mesma conta de `totaisDeItens`, por bloco. Sem pace médio: misturar
   tiro com recuperação dá um número sem sentido.
4. **Distribuição por zona no total do dialog** — ao lado de "Total · km · min", a repartição do
   tempo por zona ("62% Z1–Z2 · 38% Z5"), a partir de `zonaPredominante().distribuicao`, que já
   é calculada e só mostra a zona predominante hoje. Denominador é o tempo total das etapas, não
   só o tempo com zona: o resto aparece como "sem zona", senão 5 min classificados num treino de
   60 virariam 100%.

**Consequência da distância derivada ficar fora do payload:** a etapa gravada não tem
`distanciaKm`, então o detalhe do atleta e o prompt da análise pós-treino
(`WorkoutAnalysisPromptDataBuilder.plannedStep`, `distance_km`) não recebem a estimativa. Aceito:
hoje esses lugares já ficam sem distância quando o treinador não a digita, e os dois têm duração
e pace, de onde a estimativa sai. Rollback: reverter o PR de front desfaz tudo; o risco principal
é o derivado vazar para o PATCH, coberto pelo CA9.

## Non-Goals

- **Duração derivada de distância ÷ pace.** `duracaoMin` da etapa é inteiro em minutos no contrato
  (`EtapaTreino.duracaoMin: Integer`; o front serializa com `parseInt`). 400 m a 4:00 dá 1,6 min,
  que viraria 2: erro de 25%. Preencher exige duração em segundos no contrato — change própria,
  `add-etapa-duracao-segundos`, que depende desta.
- Pace derivado de distância ÷ duração: pace vem da zona na maior parte dos casos, e digitar
  marca a etapa como `PERSONALIZADO`; o conflito com o seletor não compensa.
- Conferência da soma das etapas contra distância/duração do treino: já é derivado —
  `TreinoEditDialog` reescreve os dois campos a partir das etapas quando elas mudam, e
  `TreinoAddDialog` faz o mesmo quando há etapas.
- TSS estimado no front: conta do backend; duplicar arrisca números diferentes entre tela e plano.
- Nenhuma mudança de contrato, backend ou banco.

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `coach-athlete-zones`: o requisito "Zona como seletor no editor de etapas" ganha a sugestão de
  zona no modo Personalizado (item 2). Os itens 1, 3 e 4 são cálculo de apresentação sobre dados
  já prescritos e não mudam requisito de spec — ficam só nos critérios de aceite desta change.

## Critérios de aceite

1. **Distância derivada** — Given uma etapa com distância vazia, When o treinador informa
   `4` min e pace `4:50/km`, Then a distância mostra `0.83` marcada como calculada, e o PATCH
   leva `duracaoMin: 4` sem `distanciaKm`. Given o treino reaberto, Then a distância volta a
   mostrar `0.83` calculada.
2. **Faixa de pace** — Given pace `5:00-5:20/km` e `31` min, Then a distância é `6` (ponto médio,
   5:10/km).
3. **Valor manual vence** — Given distância digitada `7`, When a duração muda, Then a distância
   continua `7`.
4. **Derivada acompanha** — Given distância derivada `0.83` de 4 min, When a duração vai a 8,
   Then a distância vai a `1.66`. Given etapa carregada do backend com distância gravada, Then
   ela é tratada como digitada e não acompanha (o derivado nunca é gravado, então valor gravado
   é do treinador).
5. **Digitação parcial e limpeza** — Given distância derivada, When o pace está incompleto
   (`5:0`), Then a distância mantém o valor e continua derivada; ao completar `5:00/km`,
   recalcula. When a duração é apagada ou vai a `0`, ou o pace é apagado (campo vazio, não
   incompleto), Then a distância derivada é limpa (não há mais de onde derivar); digitada, fica. A derivação usa a duração em minutos inteiros, a mesma
   que o serializador envia (`parseInt`): `4.5` min deriva como 4.
6. **Zona sugerida** — Given atleta com zonas e etapa em Personalizado, Then o seletor mostra o
   eixo e a zona em que o valor cai: pace `4:50/km` → "Pace cai em Z5 para este atleta"; FC
   `150-158 bpm` → "FC cai em Z3". Given pace e FC em zonas diferentes, Then vale o eixo
   `alvoPrimario`; sem eixo, nada é sugerido. Given valor fora de todas as zonas, ou atleta sem
   zonas, Then nada é sugerido.
7. **Resumo da série** — Given série 4× com tiro 4 min/0,83 km e recuperação 2 min/0,25 km, Then o
   cabeçalho mostra `4× · 24 min · 4,3 km`; mudar as repetições ou uma etapa atualiza o resumo.
   Etapa sem tipo entra no resumo como hoje entra no total (limitação pré-existente de
   `totaisDeItens`, ver Open Questions).
8. **Distribuição** — Given treino de 30 min com 20 min em Z2 e 10 min em Z5, Then o total mostra
   `67% Z2 · 33% Z5`. Given 10 min Z1, 10 min Z2 e 10 min Z5, Then `67% Z1–Z2 · 33% Z5` (zonas
   vizinhas contíguas agrupadas, ordem crescente). Given 20 min em Z2 e 10 min sem zona, Then
   `67% Z2 · 33% sem zona`. Percentuais inteiros somam 100 pelo maior resto. Sem nenhuma zona
   derivável, nada é mostrado.
9. **Regressão** — `npm run lint && npm run build && npm run test:run` passam; E2E
   `tests/e2e/coach/plano-zonas-editor.spec.ts` e `plan-review-edicao.spec.ts` verdes, com um
   caso que afirma que o PATCH **não** leva o `distanciaKm` derivado e leva o digitado (fluxo
   coach-in-the-loop: o que grava no plano do atleta chega ao relógio).

## Métrica de sucesso

- Proxy mecânico: critérios 1–8 cobertos por teste de unidade/componente e o 9 por E2E.
- Rotina do treinador: numa série de N× o treinador preenche só duração e pace de cada etapa; a
  distância e os totais saem sem conta de cabeça. A distância derivada nunca é gravada, então a
  medida é de apresentação: na tela, nenhuma etapa com duração e pace fica com a distância em
  branco (E2E do CA1), e o PATCH nunca leva o derivado (CA9).

## Open Questions & Assumptions

- **Premissa:** ponto médio da faixa de pace é a estimativa certa para a distância. Alternativa seria
  o pace mais lento (distância mínima garantida); escolhido o médio por ser o que o atleta mira.
- **Decisão (2026-11-05):** distância derivada fica fora do payload. A versão anterior deste
  proposal a gravava e tratava valor gravado igual à conta como derivado; caiu pelo achado do
  conversor do relógio. Consequência: `volumePlanejadoKm` do treino continua somando o derivado
  (vem dos itens), mas a etapa gravada não tem `distanciaKm`.
- **Aberto:** formato da distribuição quando há mais de três zonas (lista longa no total). Decidir
  na implementação olhando a tela; o critério 8 fixa só o conteúdo.
- **Pré-existente, fora do escopo** (DoR 2026-11-05, Codex): `totaisDeItens` soma etapa sem tipo
  que o serializador descarta (`etapaItem.ts:238`); `TreinoEditDialog` grava o total com uma
  casa e `TreinoAddDialog` com duas (`TreinoEditDialog.tsx:165`, `TreinoAddDialog.tsx:116`);
  soma zerada não limpa distância/duração do treino (`TreinoEditDialog.tsx:219`). Candidatos a
  uma change `fix` própria; não entram aqui.

## Status

- draft (2026-11-05).
- DoR (2026-11-05): spec-reviewer READY WITH GAPS (7) + Codex NOT READY (10). Convergência:
  métrica contradizia a decisão de não gravar o derivado. Absorvidos: exemplo do resumo (4,3 km),
  limpeza da distância derivada sem duração, derivação em minutos inteiros, texto da sugestão por
  eixo, denominador e arredondamento da distribuição, consequência para atleta/prompt, rollback,
  E2E afirmando o digitado no PATCH. Pré-existentes registrados acima.
