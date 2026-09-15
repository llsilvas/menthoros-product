# add-etapa-pace-validator — validador de pace por etapa, análogo ao EtapaFcValidator

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-09-14

## Why

`EtapaFcValidator` já corrige a FC alvo de uma etapa quando ela cai fora da zona fisiológica esperada
(ex.: AQUECIMENTO prescrito em 121-126 bpm, fora da Z1 esperada, corrigido para 110-118 bpm) — mas não
existe o equivalente para pace. O `TreinoNormalizador`/`NormalizacaoDeTreino` reconciliam apenas a
**distância total do treino** contra a soma das etapas (`reconciliarDistanciaComEtapas`); nada valida
se a distância e a duração de uma etapa individual, combinadas, implicam um pace consistente com o
`ritmoAlvo` que a própria etapa declara.

Encontramos o caso real em produção local investigando o plano gerado para o atleta Leandro Silva
(`d83c4c31-607b-4370-8bfe-de270ad33121`, treino FARTLEK de 14/09/2026): a etapa PRINCIPAL veio com
`ritmoAlvo="6:30-7:00/km"`, mas `distanciaKm=3.5` e `duracaoMin=20` implicam pace real de **5:43/km**
— mais rápido que o próprio limite declarado. Isso não é um erro de arredondamento: é a LLM escrevendo
um texto de zona que não bate com os números que ela mesma gerou para a etapa.

Cadastrar o `pace_limiar` do atleta (antes NULL) reduziu bastante o desvio numa nova geração — de
~50-77s/km de diferença para ~20s/km — mas não eliminou: a etapa "fartlek livre" (PRINCIPAL) ainda saiu
com pace real de 6:00/km contra uma zona declarada de 6:20-7:28/km. O `pace_limiar` ajuda a LLM a
ancorar melhor as zonas no prompt, mas não substitui uma validação determinística pós-geração — o
mesmo motivo pelo qual `EtapaFcValidator` existe apesar do prompt já pedir FC coerente.

Um treinador que confia no `ritmoAlvo` mostrado no plano para orientar o atleta em campo está sendo
mal informado: o atleta vai correr mais rápido do que o prescrito achando que está dentro da zona.

## What Changes

- **Novo `EtapaPaceValidator`** (`services/helper/`), no mesmo padrão do `EtapaFcValidator`:
  - Extrai o range de pace do `ritmoAlvo` da etapa (formato `"M:SS-M:SS/km"`).
  - Calcula o pace real implícito: `duracaoMin / distanciaKm` (quando ambos presentes e `distanciaKm > 0`).
  - Compara o pace real contra o range declarado com a mesma lógica de sobreposição (`overlapPct`)
    do validador de FC — mas aqui a checagem é *consistência interna* (pace real vs. zona que a
    própria etapa declara), não pace real vs. zona fisiológica esperada por tipo — ver "Open
    Questions" sobre estender para cruzar com `ZonaTreinoService.calcularZonasPace(paceLimiar)`.
  - Em divergência: loga `WARN` no mesmo formato do `EtapaFcValidator` e corrige o `ritmoAlvo` da
    etapa para refletir o pace real (nunca ajusta `distanciaKm`/`duracaoMin` — esses vêm de
    `reconciliarDistanciaComEtapas`, que já tem sua própria autoridade).
  - Nunca lança exceção — mesma garantia de manter o plano válido do `EtapaFcValidator`.
- **Integração na receita de `NormalizacaoDeTreino`**: hoje só `EtapaFcValidator` roda dentro de
  `caudaComum` (aplicado a todas as famílias). `EtapaPaceValidator` entra no mesmo ponto, para que
  FARTLEK, INTERVALADO_TIRO e TRES_ETAPAS sejam cobertos — não só FARTLEK, que foi onde o bug
  apareceu primeiro.
- **Sem migration, sem mudança de contrato de API** — é uma correção determinística interna ao
  pipeline de geração, como o validador de FC.

## Capabilities

### New Capabilities

- Nenhuma capability nova de produto — é um refinamento de qualidade da capability existente de
  geração de plano por IA.

### Modified Capabilities

- `plan-generation` (ou equivalente já registrada para `NormalizacaoDeTreino`): passa a garantir que
  toda etapa persistida tenha `ritmoAlvo` consistente com `distanciaKm`/`duracaoMin`.

## Impact

**Código:**
- Novo arquivo: `services/helper/EtapaPaceValidator.java`
- Modificado: `services/helper/NormalizacaoDeTreino.java` (adicionar passo na `caudaComum`)
- Novos testes: `EtapaPaceValidatorTest` seguindo os padrões de `EtapaFcValidatorTest` existente

**Banco/API:** nenhuma mudança de schema ou contrato — validação interna, mesma superfície de
`tb_etapa_treino.ritmo_alvo` já existente.

**Risco:** baixo — mesma categoria de mudança que `EtapaFcValidator` (correção silenciosa,
determinística, sem side effects, sem acesso a dados externos). O risco real é de design: decidir
"quem tem razão" quando pace/distância/duração/ritmoAlvo divergem (ver Open Questions).

## Open Questions & Assumptions

1. **[ABERTA] Fonte da verdade em caso de divergência**: quando `distanciaKm`/`duracaoMin` implicam
   um pace fora do `ritmoAlvo` declarado, a correção deve reescrever o `ritmoAlvo` (assumido nesta
   proposta, espelhando o `EtapaFcValidator`, que corrige o campo alvo e preserva duração/distância)
   ou ajustar `duracaoMin`/`distanciaKm` para bater com o `ritmoAlvo` prescrito? Etapas do tipo
   PRINCIPAL/FARTLEK livre têm duração/distância vindas da reconciliação já rodada antes deste
   validador na receita — mexer nelas de novo poderia reabrir o desvio que `reconciliarDistancia`
   acabou de fechar.
2. **[ABERTA] Cruzar com zona fisiológica (`ZonaTreinoService.calcularZonasPace`) ou só validar
   consistência interna?** `EtapaFcValidator` valida contra uma zona esperada por tipo de
   etapa+treino (fisiológica). Esta proposta assume validação de *consistência interna* apenas
   (pace real vs. o que a própria etapa declara) como escopo mínimo — cruzar também com a zona
   fisiológica do atleta (via `pace_limiar`) é um endurecimento natural, mas amplia a superfície de
   decisão (ex.: e se o `ritmoAlvo` declarado bate com os números da etapa mas a zona inteira está
   errada para o tipo de treino?). Fica para uma change de acompanhamento se a métrica de sucesso
   mostrar que consistência interna não é suficiente.
3. **[ASSUMIDO] Etapas sem `ritmoAlvo` declarado (null) não são validadas** — sem texto para
   comparar, não há divergência a detectar. Mesma postura do `EtapaFcValidator` quando `fcAlvoEtapa`
   é null.
4. **[ASSUMIDO] Etapas sem `distanciaKm` ou `duracaoMin`** (ex.: etapas por tempo puro sem distância
   prevista) não são validadas — pace não é computável.
5. **[ASSUMIDO] Tolerância de overlap = 50%**, igual ao `EtapaFcValidator`, para manter o mesmo
   comportamento perceptível ao treinador nos dois validadores (evita FC "meio calibrado" e pace
   "totalmente calibrado" ou vice-versa).

## Métrica de sucesso

**Antes:** 0% dos planos gerados têm garantia determinística de que `ritmoAlvo` da etapa bate com
`distanciaKm`/`duracaoMin` (dependia só do prompt).
**Depois:** 100% das etapas persistidas com `ritmoAlvo` + `distanciaKm` + `duracaoMin` preenchidos
passam pela checagem de consistência; **0 correções por overlap < 50%** deve ser o estado estável em
produção depois de ~2 semanas (medido via contagem de `WARN` de `EtapaPaceValidator` nos logs) — o
validador existe para pegar o resíduo, não para corrigir a maioria das gerações.

## Critérios de aceite

- **CA1 (Given/When/Then):** Dado um `ritmoAlvo="6:20-7:28/km"` e `distanciaKm=4.0`/`duracaoMin=24`
  (pace real 6:00/km, overlap < 50%), quando `EtapaPaceValidator.validarPaceEtapa` roda, então o
  `ritmoAlvo` retornado reflete o pace real e um `WARN` é logado no formato
  `"Pace fora da zona declarada: tipo='{}', prescrito='{}', pace real='{}/km', corrigindo para '{}'"`.
- **CA2:** Dado um `ritmoAlvo` cujo overlap com o pace real é ≥ 50%, quando o validador roda, então a
  etapa retorna inalterada (sem log de correção).
- **CA3:** Dado `ritmoAlvo=null` ou `distanciaKm=null` ou `duracaoMin=null`, quando o validador roda,
  então a etapa retorna inalterada, sem lançar exceção.
- **CA4:** Dado um `ritmoAlvo` em formato não reconhecido (ex.: "moderado", sem `M:SS-M:SS/km`),
  quando o validador roda, então a etapa retorna inalterada e um log de nível apropriado indica o
  formato não reconhecido (mesmo padrão do `parseFcRange` no `EtapaFcValidator`).
- **CA5:** `EtapaPaceValidator` está registrado na `caudaComum` de `NormalizacaoDeTreino` e roda para
  as três famílias (`FARTLEK`, `INTERVALADO_TIRO`, `TRES_ETAPAS`) — teste de integração confirma que
  um treino de cada família com pace inconsistente é corrigido.
