# fix-etapas-continuos-pace — etapas dos treinos contínuos com distância incoerente com o pace

**Tamanho:** S · **Trilha:** Fast
**Status:** em implementação
**Criado:** 2026-09-22
**Depende de:** `fix-fartlek-etapas-estruturadas` (branch empilhada — mesmos arquivos de receita)

> Origem: plano do Leandro (`d83c4c31`) gerado em 2026-09-22 07:24, na validação real de
> `fix-fartlek-etapas-estruturadas`. O total de cada treino contínuo está coerente, mas as etapas
> não: o relógio do atleta receberia paces impossíveis.

## Why

| Treino | Total (coerente) | Etapa PRINCIPAL | Ritmo prescrito |
|---|---|---|---|
| REGENERATIVO 05/10 | 6,0 km / 45 min | 5,5 km em 30 min → 5:27/km | 7:28-7:55 |
| REGENERATIVO 06/10 | 7,0 km / 48 min | 6,5 km em 35 min → 5:23/km | 6:45-7:06 |
| LONGO 10/10 | 9,0 km / 60 min | 8,5 km em 45 min → 5:18/km | 6:45-7:06 |

Em todos, o AQUECIMENTO de 10 min tem 0 km e há DESAQUECIMENTO de 0,5 km em 5 min (10:00/km).
A LLM concentra quase toda a distância na PRINCIPAL e o resto é arredondamento.

A receita da família TRES_ETAPAS (`NormalizacaoDeTreino.montarReceitas`) é `reparar-3-etapas →
validar-por-tipo` + cauda comum. Nenhum passo toca a distância das etapas:
- não há `corrigir-temporais` (as famílias FARTLEK e INTERVALADO_TIRO têm), então aquecimento e
  desaquecimento ficam com o que a LLM mandou — ou `null` quando sintetizados pelo reparo;
- a distância da PRINCIPAL nunca é conferida contra o `ritmoAlvo` dela;
- `garantir-distancia-continuo` só age quando o **treino** não tem distância.

O treinador revisa pelo total e não vê o problema; quem vê é o atleta, na tela do treino ou no
relógio, com uma PRINCIPAL de pace de prova num regenerativo.

## What Changes

Backend, receita TRES_ETAPAS, sem contrato de API nem schema. Mesmo princípio de
`fix-fartlek-etapas-estruturadas`: **a distância da etapa vem do pace**.

- **`corrigir-temporais`** entra na receita, depois de `validar-por-tipo`: AQUECIMENTO e
  DESAQUECIMENTO recebem `duração ÷ pace Z2` (limiar × 1,20).
- **Novo passo `distancia-principal-por-pace`** (`TreinoNormalizador`): cada etapa PRINCIPAL com
  `duracaoMin > 0` e `ritmoAlvo` interpretável recebe `distanciaKm = round2(duração ÷ pace médio)`.
  Sem `ritmoAlvo` (na etapa), a distância da LLM fica como está.
- **`reconciliar-distancia`** entra depois, com **tolerância zero** (decisão de 2026-09-22, após a
  geração real das 08:00): quando toda etapa é confiável — distância pelo pace, nada sintetizado —
  o total do treino é a soma arredondada das etapas. Com os 10% da regra geral, o LONGO saiu com
  9,0 km no total e 8,24 km nas etapas (o treinador vê 9, o relógio recebe 8,24; pace médio do
  total 6:40, fora do ritmo 6:55-7:28). Custo aceito: o volume semanal encolhe (22,0 → ~20,7 km
  naquele plano) porque a LLM superestima o total — o que o atleta corre não muda.
- **Telemetria da divergência mantida**: quando o total da LLM fica (etapa sintetizada ou PRINCIPAL
  sem ritmo) e as etapas divergem mais de 10%, WARN + `plano_etapas_total_divergente{tipo,motivo}`
  (achado do code-reviewer).

Simulação com os três treinos acima (limiar 6:20/km → Z2 7:36/km):

| Treino | PRINCIPAL nova | Soma etapas | Total final |
|---|---|---|---|
| REGENERATIVO 05/10 | 3,90 km (7:41/km) | 5,88 km | 6,0 km (desvio 2%) |
| REGENERATIVO 06/10 | 5,05 km (6:55/km) | 6,77 km | 7,0 km (desvio 3%) |
| LONGO 10/10 | 6,50 km (6:55/km) | 8,48 km | 9,0 km (desvio 6%) |

## Fora de escopo

- Distância da PRINCIPAL sem `ritmoAlvo` na etapa (herdar o do treino): o ritmo do treino às vezes
  descreve o treino inteiro, às vezes só a parte principal — não há como saber.
- Famílias FARTLEK/INTERVALADO_TIRO (já cobertas pela change anterior) e PADRAO (FACIL etc.).
- **Teto/piso no ritmo da etapa** (achado do Codex na DoR): `corrigir-pace-teto-piso`
  (`NormalizacaoDeTreino.java:611`) corrige só o `ritmoAlvo` do **treino**; o da etapa fica como a
  LLM mandou. Anterior a esta change. A distância nova fica coerente com o ritmo que a própria etapa
  exibe ao atleta — a inconsistência etapa×teto é uma limitação conhecida, para change própria.

## Critérios de aceite

- **CA1** — Given o REGENERATIVO real de 05/10 (6,0 km / 45:00 / 7:28-7:55; AQUEC 10 min 0 km;
  PRINCIPAL 30 min 5,5 km 7:28-7:55; DESAQ 5 min 0,5 km) com limiar 6:20, when a receita roda, then
  a PRINCIPAL tem 3,90 km, aquec 1,32 km, desaq 0,66 km, e o treino mantém 6,0 km e 45:00.
- **CA2** — Given qualquer contínuo cuja PRINCIPAL tem `ritmoAlvo`, then o pace implícito da
  PRINCIPAL (duração ÷ distância) fica dentro do `ritmoAlvo` (tolerância de arredondamento de 2 casas).
- **CA3** — Given PRINCIPAL sem `ritmoAlvo`, then a distância dela é a da LLM (sem alteração).
- **CA4** — Given AQUECIMENTO sintetizado pelo reparo (distância `null`), then recebe
  `duração ÷ pace Z2`.
- **CA5** — Given toda etapa pelo pace e nada sintetizado, then o total é a soma arredondada das
  etapas para qualquer desvio (0,1%, 9%, 11%, 100%). Em ambos os casos o teste afirma também a duração final do treino e que ela
  é a soma das durações das etapas quando essa soma é a mais próxima do triângulo (precedência de
  `recalcular-duracao`, achado do Codex).
- **CA6** — LONGO com duas PRINCIPAL (`validarOrdem=false`): cada uma recebe a própria distância.
- **CA8** — Given treino sem distância e PRINCIPAL sem `ritmoAlvo`, then o fallback vigente de
  `garantir-distancia-continuo` (duração ÷ pace Z2) continua valendo — o CA3 (preservar a distância
  da LLM) só se aplica quando a LLM mandou distância.
- **CA9** — Given PRINCIPAL sem `ritmoAlvo` e treino com distância, then o total NÃO é reconciliado
  (a PRINCIPAL carrega o total que a LLM concentrou nela; somada a aquec/desaq pelo Z2 inflaria 6,0
  para 7,48 km). Achado ao escrever os testes de borda.
- **CA10** — Given etapa sintetizada pelo reparo (aquec ou desaq), then o total prescrito fica e as
  etapas ganham distância pelo pace. Decisão de produto de 2026-09-22: o que o sistema inventa não
  infla o volume que o treinador aprova (regenerativo de 30 min / 4 km não vira 45 min / 6,94 km) —
  mesmo princípio do CA4b de `fix-normalizador-etapas-incompletas`.
- **CA11** — Given total da LLM mantido (etapa sintetizada ou PRINCIPAL sem ritmo) e etapas
  divergindo > 10%, then WARN e contador `plano_etapas_total_divergente` com o motivo; ≤ 10% ou
  total reconciliado, nada é contado.
- **CA7** — O golden de ordem da receita TRES_ETAPAS reflete os três passos novos; as outras
  receitas não mudam.

## Métrica de sucesso

Percentual de etapas PRINCIPAL de treinos contínuos persistidas com pace implícito dentro do
`ritmoAlvo`: hoje 0 de 3 no plano de 22/09 07:24; alvo 100% das que têm `ritmoAlvo` (consulta em
`tb_etapa_treino`). Para o treinador: o treino que ele aprova é o que o atleta vê no relógio.

## Riscos e mitigações

- **Total do treino encolhendo.** O aquecimento/desaquecimento a Z2 e a PRINCIPAL pelo pace podem
  somar menos que o total da LLM; a tolerância de 10% da reconciliação absorve os casos observados
  (2-6%). Acima disso o total passa a refletir o que o atleta de fato corre na duração prescrita.
- **Baselines de caracterização** dos contínuos mudam nas distâncias de etapa — atualizar só onde a
  diferença é a intencional.

## Open Questions & Assumptions

- **Follow-up (validação real 22/09 08:35):** em 2 de 3 contínuos a LLM omitiu aquec ou desaq e o
  reparo sintetizou por cima da prescrição — o treinador aprova 45 min / 6 km e o relógio recebe
  55 min / 7,2 km (a telemetria nova contou 20%). Candidato a change própria: o reparo **encaixar**
  a etapa sintetizada na duração prescrita (encurtando a PRINCIPAL) em vez de somar.

- **Assumido:** o `ritmoAlvo` da etapa PRINCIPAL é a fonte de verdade para ela; a duração da etapa
  (não a distância) é o que a LLM acerta — é o que o treino mostra no total coerente.
- **Assumido:** pace Z2 = limiar × 1,20 para aquecimento/desaquecimento, como já faz
  `corrigir-temporais` nas outras famílias.
