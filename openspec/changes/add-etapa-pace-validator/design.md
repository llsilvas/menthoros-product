# Design — add-etapa-pace-validator

## O problema de desenho, em uma frase

Três campos da mesma etapa (`distanciaKm`, `duracaoMin`, `ritmoAlvo`) são escritos pela LLM sem
nenhuma checagem cruzada, e dois validadores já existem para campos vizinhos (`EtapaFcValidator` para
FC, `reconciliarDistanciaComEtapas` para a soma de distância do treino) sem que nenhum dos dois cubra
o pace da etapa individual.

Estado atual verificado (treino real, atleta `d83c4c31-...`, 14/09/2026):

```
etapa PRINCIPAL: duracaoMin=20, distanciaKm=3.5, ritmoAlvo="6:30-7:00/km"
pace real = 20/3.5 = 5:43/km  →  mais rápido que o próprio limite declarado
```

## Decisão 1 — em divergência, corrige o `ritmoAlvo`, nunca `distanciaKm`/`duracaoMin`

Três caminhos considerados:

| Caminho | Por que não / por que sim |
|---|---|
| Ajustar `distanciaKm` ou `duracaoMin` para bater com o `ritmoAlvo` prescrito | Esses dois campos já passaram por `reconciliarDistanciaComEtapas` **antes** deste validador na receita (`corrigirTemporais → expandir → reconciliarDistancia → [novo] validarPace`). Mexer neles de novo reabre um cálculo que acabou de fechar (a soma do treino já bate com a soma das etapas) — o preço de acertar o pace seria quebrar a reconciliação de distância. |
| Rejeitar a etapa / lançar exceção | Contradiz a garantia dos dois validadores vizinhos ("nunca lança exceção — manter o plano válido é prioridade"). Um plano com pace levemente errado e corrigível é estritamente melhor que nenhum plano. |
| **Corrigir o `ritmoAlvo` para refletir o pace real** ✅ | Espelha exatamente o que `EtapaFcValidator` faz com `fcAlvoEtapa`: a etapa já tem um número "de fato" (aqui, o pace implícito de distância/duração); o campo textual de zona é o que estava errado, então é ele que se ajusta. `distanciaKm`/`duracaoMin` continuam sendo a fonte de verdade do volume do treino — papel que já é deles em todo o resto do pipeline. |

Forma proposta — mesma assinatura de entrada/saída de `EtapaFcValidator.validarFcEtapa`:

```java
// services/helper/EtapaPaceValidator.java
public EtapaTreinoLlmDto validarPaceEtapa(EtapaTreinoLlmDto etapa) {
    if (etapa.ritmoAlvo() == null || etapa.distanciaKm() == null || etapa.duracaoMin() == null
            || etapa.distanciaKm() <= 0) {
        return etapa;
    }
    int[] prescritoSeg = parsePaceRange(etapa.ritmoAlvo()); // "6:30-7:00/km" -> [390, 420] seg/km
    if (prescritoSeg == null) return etapa; // formato não reconhecido, mantém original + log

    int paceRealSeg = (int) Math.round((etapa.duracaoMin() * 60.0) / etapa.distanciaKm());

    // overlap: pace real é um ponto, não um range — "overlap" vira "está dentro do range com folga"
    int folgaSeg = 5; // mesma ideia do overlapPct≥50%, adaptada a um ponto contra um range
    boolean dentroDaZona = paceRealSeg >= (prescritoSeg[0] - folgaSeg)
                        && paceRealSeg <= (prescritoSeg[1] + folgaSeg);

    if (!dentroDaZona) {
        String ritmoCorrigido = formatarPace(paceRealSeg) + "/km";
        log.warn("Pace fora da zona declarada: tipo='{}', prescrito='{}', pace real='{}/km', corrigindo para '{}'",
                etapa.tipoEtapa(), etapa.ritmoAlvo(), formatarPace(paceRealSeg), ritmoCorrigido);
        return new EtapaTreinoLlmDto(etapa.ordem(), etapa.tipoEtapa(), etapa.descricaoEtapa(),
                etapa.duracaoMin(), etapa.distanciaKm(), etapa.fcAlvoEtapa(), etapa.repeticoes(), ritmoCorrigido);
    }
    return etapa;
}
```

**Nota sobre "overlap" vs "ponto dentro de range":** `EtapaFcValidator` compara duas faixas
(`prescrito` vs `esperado`) via `overlapPct`. Aqui só há uma faixa (`ritmoAlvo` declarado) contra um
**ponto** (o pace real, que é um número derivado, não uma faixa) — não existe uma segunda faixa
"esperada" nesta primeira versão (ver Decisão 2). Por isso a checagem no exemplo acima é
"ponto dentro do range com folga", não "overlap ≥ 50%" — mais simples porque o dado de entrada é mais
simples, não porque o padrão do `EtapaFcValidator` mudou de filosofia. A folga de 5s/km absorve
arredondamento de segundos (mesmo racional do `DELTA` em testes numéricos: sem ela, treinos onde o
pace bate "quase exato" disparariam correção por 1s/km de diferença de arredondamento).

## Decisão 2 — validação de consistência interna, não cruzamento com zona fisiológica (nesta change)

O `EtapaFcValidator` cruza o valor prescrito contra uma **zona fisiológica esperada** por
tipo-de-etapa + tipo-de-treino (`zonaEsperadaFC`, que usa `zonasFC` do atleta). Para pace, essa mesma
tabela existe — `ZonaTreinoService.calcularZonasPace(paceLimiar)` já calcula `List<ZonaPace>` a
partir do `pace_limiar` do atleta, e `PaceZoneCalculator` já ajusta essas zonas por TSB.

Cogitamos fazer o mesmo cruzamento aqui (etapa PRINCIPAL de um FARTLEK deveria cair em Z2-Z4 de pace,
por exemplo) mas descartamos **para esta change**:

- **Cobertura de dados**: `pace_limiar` era `NULL` para o atleta até nós o calcularmos manualmente
  nesta investigação (ver proposal.md) — não há garantia de que a base tenha o campo preenchido para
  a maioria dos atletas ativos. Uma validação que depende de um campo frequentemente ausente é uma
  validação que não roda na prática; o bug que motivou esta change (`ritmoAlvo` inconsistente com
  `distanciaKm`/`duracaoMin` da mesma etapa) não depende de `pace_limiar` estar preenchido.
- **Escopo mínimo**: o problema observado é uma etapa contradizendo a si mesma (dois campos da mesma
  linha discordam), não uma etapa prescrita fora da zona certa para o tipo de treino. São dois bugs
  diferentes; resolver o segundo antes de confirmar que o primeiro precisa de mais que isso é
  antecipar escopo (ver Open Question 2 do proposal — fica registrado como possível v2 se a métrica
  de sucesso mostrar resíduo depois desta change).

## Decisão 3 — roda na `caudaComum`, depois de `reconciliarDistancia`

`EtapaPaceValidator` entra na lista `caudaComum` de `NormalizacaoDeTreino` (mesmo lugar de
`EtapaFcValidator`), e portanto roda para as três famílias (`FARTLEK`, `INTERVALADO_TIRO`,
`TRES_ETAPAS`). A ordem importa: precisa vir **depois** de `reconciliarDistancia`, porque é
`distanciaKm`/`duracaoMin` pós-reconciliação que define o pace real "definitivo" da etapa — validar
antes veria números que ainda vão mudar.

```
corrigirTemporais → expandir → reconciliarDistancia → [EtapaFcValidator, EtapaPaceValidator] (caudaComum)
```

Como `caudaComum` já roda para as três famílias e já contém `EtapaFcValidator`, a integração é
adicionar uma linha na lista — não uma mudança estrutural na receita.

## Testes

Mesma estrutura de `EtapaFcValidatorTest` (se existir) ou o padrão `@Nested` por método do
`CLAUDE.md`: casos de parse de `ritmoAlvo` (formato válido, inválido, null), casos de pace dentro da
zona (sem correção), fora da zona (correção + log), e limites (BVA na folga de 5s/km — pace exatamente
no limite da faixa, um segundo dentro, um segundo fora).
