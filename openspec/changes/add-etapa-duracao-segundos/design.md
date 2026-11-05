# Design — add-etapa-duracao-segundos

## Context

`EtapaTreino.duracaoMin` é `Integer` em minutos e é lido em 17 arquivos do backend
(`IntervalsIcuWorkoutConverter`, `TssCalculatorService`, `TreinoNormalizador`,
`NormalizacaoDeTreino`, `EtapaFcValidator`, `EtapaAlvoResolver`, `RedistribuicaoTreinoHelper`,
`PlanoTreinoPromptBuilder`, `WorkoutAnalysisPromptDataBuilder`, skills de análise, serviços de
progresso e de treino do dia). O LLM prescreve `duracaoMin` inteiro pelo schema de
`LlmJsonSchemaBuilder`. No front, `etapaItem.ts` serializa `parseInt(duracaoMin)`, e o perfil do
treino (`workout/profile/input.ts`) mede o bloco em minutos.

`coach-etapa-calculos-auxiliares` já deriva a distância de pace × duração com o marcador
`distanciaAuto`; esta change fecha o triângulo com a duração.

## Goals / Non-Goals

**Goals:**
- Guardar e transportar a duração da etapa em segundos sem quebrar nenhum leitor de minutos.
- Enviar ao intervals.icu a duração exata.
- Editor em `m:ss`, com duração derivada de distância × pace e a regra "último editado manda".

**Non-Goals:**
- Migrar ou remover `duracao_min`.
- Mudar o schema do LLM ou o treino planejado/realizado.
- Usar segundos na análise pós-treino (melhoria separada).

## Decisions

### D1 — Coluna nova `duracao_seg`, `duracao_min` derivado

Alternativas: (a) migrar `duracao_min` para segundos — toca 17 leitores e todo fixture de teste;
(b) `duracao_min` decimal — quebra `Integer` em DTO, LLM e front; (c) coluna nova nula, com
`duracao_min` derivado. **Escolhida (c)**: aditiva, sem backfill, leitores intactos.

- Migration: `ALTER TABLE tb_etapa_treino ADD COLUMN IF NOT EXISTS duracao_seg INTEGER NULL;`
  rollback por `DROP COLUMN IF EXISTS`.
- Derivação **no construtor compartilhado** `buildEtapaSimples`, não em `aplicarEtapasPatch`:
  o PATCH não é o único escritor — `construirEtapasParaAdicao` (`TreinoPlanejadoServiceImpl:315`)
  e a expansão de bloco passam pelo mesmo construtor, e `comRepeticoes` (`:424`) reconstrói o DTO
  campo a campo, então precisa transportar `duracaoSeg` (pre-mortem Codex, 2026-11-05).
  `duracaoMin = round(seg / 60)` quando `duracaoSeg` vem; sem ele, `duracaoMin` do DTO, como
  hoje. Segundo incoerente com o minuto enviado: vale o segundo (CA2).
- **Sem piso de 1 minuto.** `round` pode dar 0 para etapa abaixo de 30 s; os leitores legados já
  tratam `duracaoMin <= 0` como ausente (ex.: `duracaoEmSegundos`, `:445`) e caem na distância.
  Piso de 1 faria 20 tiros de 10 s valerem 20 min para TSS e prompt contra 3:20 reais — erro
  maior que tratar como ausente.
- `@Positive` em `duracaoSeg`; limite superior igual ao implícito de hoje (sem novo).

### D2 — Conversor do intervals.icu prefere o segundo

`duracaoEmSegundos(Integer minutos)` ganha a variante que recebe a etapa: `duracaoSeg` quando
presente, senão `duracaoMin × 60`. A assinatura usada para o step único do treino (linha 183)
não muda. A comparação de etapas iguais para inferir bloco (linha 361, `Objects.equals` em
`duracaoMin`) passa a comparar também `duracaoSeg`: dois tiros de 4:10 e 4:20 não são a mesma
etapa, mesmo com `duracaoMin` 4 nos dois; dois de 4:10 continuam iguais. O mesmo vale para a
assinatura do editor (`etapaItem.ts`, `VOCABULARIO_EDITOR.assinatura`), que hoje só olha
`duracaoMin` e agruparia 4:10 e 4:20 numa série ao reabrir o treino.

**Distância vence a duração no conversor** (`stepComMeta`, `:384`): `durationSeconds` é nulo
sempre que há distância. Por isso **medida derivada não é serializada**: o editor envia só o que
o treinador digitou (ver D5 e a decisão correspondente em `coach-etapa-calculos-auxiliares`). Sem
isso, derivar a distância de um tiro de 4 min o transformaria num tiro de 0,83 km no relógio.

### D3 — LLM continua em minutos

`EtapaTreinoLlmDto` **não ganha o campo**. O schema é gerado por reflexão do DTO
(`LlmJsonSchemaBuilder:214`, `BeanOutputConverter`) e `enforceAllRequired` (`:338`) torna toda
propriedade obrigatória — adicionar `duracaoSeg` ao DTO mudaria o schema e obrigaria a IA a
preenchê-lo. A IA prescreve em minutos inteiros, e etapa gerada nasce sem segundo. Task 1.4
verifica se existe caminho entidade → `EtapaTreinoLlmDto` → entidade (reescrita de treino
editado); se existir, a exclusão explícita no schema entra no escopo, senão o campo fica fora.

### D4 — Editor em `m:ss`

`StepRow.duracaoMin: string` vira `duracao: string` em `m:ss`. Serialização:
`duracaoSeg = parse(m:ss)`, `duracaoMin = max(1, round(seg/60))` (o front também envia o minuto,
para cliente e servidor concordarem e o PATCH continuar válido em backend antigo).
Hidratação: `duracaoSeg ?? duracaoMin × 60`. `normalizarDuracao` no blur (`4` → `4:00`,
`4:7` → `4:07`; `1:30:00` aceito como `h:mm:ss`); **inválido bloqueia o salvar** com erro no
campo — omitir do payload apagaria a duração gravada, porque `aplicarEtapasPatch` substitui
todas as etapas (`:454`). `totaisDeItens` e o perfil passam a somar segundos; a exibição
formata com `formatDuration` que já existe no perfil. Consumidores a ajustar junto:
`workout/profile/input.ts` (`fromEtapaTreino`, `fromEtapaTreinoDto`, `minutosDe`) e
`selectWorkoutProfile.ts:249` (`durationSec: Math.round(minutos * 60)`).

Campo derivado tem **indicação visual** (texto de apoio "calculado de pace × duração" e estilo
discreto), nos dois sentidos: o treinador precisa ver qual número o sistema tocou
(review de produto, 2026-11-05).

### D5 — Regra dos três campos

Marcadores `distanciaAuto` (já existe) e `duracaoAuto`. Nunca os dois ao mesmo tempo.

| Editado | Recalcula |
|---|---|
| duração | `duracaoAuto = false`; distância recalculada só se `distanciaAuto` ou vazia (digitada fica) |
| distância | `distanciaAuto = false`; duração recalculada só se `duracaoAuto` ou vazia (digitada fica) |
| pace / zona | o campo marcado como derivado; se nenhum e um dos dois está vazio, deriva o vazio; se nenhum e os dois preenchidos, nada |

Função pura `recalcularMedidas(antes, depois, campoEditado)` em `etapaItem.ts`, substituindo
`recalcularDistancia`. Pace incompleto mantém valores e marcadores (mesma regra atual).

**Serialização:** campo com marcador `*Auto` **não vai ao payload**. O backend recebe só o que o
treinador digitou, e o conversor do relógio (D2) continua escolhendo distância sobre duração sem
ser enganado por valor calculado. Na hidratação, o editor recalcula o campo vazio para exibição
e o marca derivado. Totais do dialog e perfil usam os itens (com derivado), não o payload.

## Risks / Trade-offs

- **`duracaoMin` arredondado muda TSS e prompt em até 30 s por etapa**, e etapa abaixo de 30 s
  some desses leitores (`duracaoMin = 0` é tratado como ausente). Aceito: hoje o erro é de até
  1 min por etapa, porque o treinador arredonda à mão; usar segundos nesses leitores é melhoria
  separada.
- **Cliente que reenvia só minutos apaga os segundos.** `aplicarEtapasPatch` substitui as etapas;
  um PATCH antigo com `duracaoMin: 4` sobre uma etapa de 4:10 grava 4:00. Aceito: o único cliente
  é o front, que sempre envia `duracaoSeg`; registrado para o caso de um segundo cliente.
- **Sinal IA × coach.** Editar só o segundo de uma etapa gerada vira diferença no diff que
  alimenta a acceptance rate. Decisão registrada em Open Questions do proposal.
- **Backend novo com front antigo**: o front antigo manda só `duracaoMin`; comportamento igual ao
  atual (CA2). **Front novo com backend antigo**: o PATCH leva `duracaoSeg` e `duracaoMin`; o
  backend antigo ignora o desconhecido? — **verificar**: se `@JsonIgnoreProperties` não estiver
  ativo no DTO, o PATCH falha com 400. Deploy do backend primeiro, e a task 1.x confirma o
  comportamento do Jackson.
- **Fixtures**: testes do front que montam `StepRow.duracaoMin` precisam do campo novo; estimar
  pelo grep antes de começar (task 3.1).
- **Perfil do treino**: `droppedBlocks` descarta etapa sem duração utilizável; com segundos, uma
  etapa de 30 s deixa de ser descartada por arredondar a 0 min — comportamento desejado, mas
  muda o gráfico de treinos existentes só se eles tiverem `duracaoSeg`.
