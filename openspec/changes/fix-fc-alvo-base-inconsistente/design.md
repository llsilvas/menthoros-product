# Design — fix-fc-alvo-base-inconsistente

## Estado verificado (2026-08-02)

| Onde | O que faz | Base |
|---|---|---|
| `ZonaTreinoService:89-90` | calcula as 5 zonas de FC | **%LTHR** (`fcMaxima` explicitamente não usado) |
| `PlanoTreinoPromptBuilder:503` | entrega as zonas ao LLM | **bpm absoluto**, derivado do LTHR |
| `PlanoTreinoPromptBuilder:493` | instrui o LLM | "Use EXATAMENTE as zonas listadas. NÃO invente outros valores de BPM" |
| `plano-treino-prompt.txt:34-45` | exemplifica a saída | **`"90-95% FCmax"`** — percentual, base FCmax |
| `IntervalsIcuTargetParser:52` | interpreta o percentual | agnóstico de base — só extrai os números |
| `IntervalsIcuAdapter:272` | monta o payload | `units: "%hr"`, números crus |
| `IntervalsIcuAdapter:277` | monta o payload de zona | `units: "hr_zone"`, número da zona |
| `IntervalsIcuClientImpl:44,67,83` | fala com a API | **lê** `/athlete/0`, **escreve** eventos — nunca grava perfil de FC |
| `IntervalsIcuAdapterTest:117,133` | testa o payload | afirma a **string da unidade**, nunca um bpm |

## A aritmética do sintoma

LTHR ≈ 0,85 × FCmax (é o próprio fallback do domínio, `Atleta:235`).

Um alvo que o modelo de zonas produziu como *90% do LTHR*, se lido como *90% da FCmax*:

```
intenção:  0,90 × LTHR        = 0,90 × 0,85 × FCmax = 0,765 × FCmax
leitura:   0,90 × FCmax       = 0,900 × FCmax
inflação:  0,900 / 0,765      ≈ 1,18  →  ~18% acima
```

Para um atleta com FCmax 190: intenção ≈ 145 bpm, exibido ≈ 171 bpm. Um treino de base aeróbica vira
esforço de limiar. **Bate com o sintoma relatado** ("bem acima do especificado"), e o erro é
silencioso: nenhuma das duas pontas está obviamente errada olhando isolada.

## A correção: resolver no Menthoros, não na borda

O princípio é o mesmo do BUG-CONF-001: **uma grandeza, uma expressão**. Enquanto o alvo trafegar
relativo, alguém do outro lado escolhe a base — e essa escolha não é observável daqui.

```
hoje:   plano (%LTHR) → rótulo "% FCmax" → payload "%hr" → intervals.icu resolve → bpm no relógio
                 ↑ base A        ↑ base B        ↑ base C (deles)

alvo:   plano (%LTHR) → resolvido para bpm no Menthoros → payload "bpm" → relógio
                 ↑ base única, resolvida onde o dado do atleta vive
```

Resolver para bpm absoluto é robusto **independentemente** de qual base o intervals.icu usa para
`%hr` — que é justamente a incógnita bloqueante. Por isso é a escolha certa mesmo antes de
respondê-la.

### Onde a resolução acontece

O `IntervalsIcuAdapter` hoje **não tem acesso ao `Atleta`** (nenhuma referência no arquivo). O dado
de FC precisa chegar até ele, ou a resolução precisa acontecer antes, no
`IntervalsIcuWorkoutConverter`, que já recebe o treino. A segunda opção mantém o adapter como
tradutor puro de modelo canônico → JSON, que é o papel dele hoje — preferível.

Isso significa que `HrTarget` chega ao adapter **sempre** em `BPM`, e as unidades `PERCENT` e `ZONE`
deixam de existir na fronteira. Se elas continuarem no `record`, é porque o parser ainda as produz
como representação intermediária — a resolução as consome.

## Alternativas consideradas

| Opção | A favor | Contra | Veredito |
|---|---|---|---|
| **Resolver para bpm no Menthoros** | uma base só; independe da semântica do intervals.icu; o dado já existe em `Atleta` | precisa levar o atleta até a conversão | **escolhida** |
| Sincronizar o perfil de FC para o intervals.icu | mantém alvo relativo, que é mais legível no app deles | duas fontes de verdade; editável do outro lado; não corrige as camadas 1 e 2 | rejeitada |
| Só corrigir o rótulo do prompt (`FCmax` → `LTHR`) | mínimo | deixa a camada 3 de pé: a base do `%hr` continua sendo deles | rejeitada — corrige um terço |
| Só corrigir o push | fecha o sintoma no relógio | obriga a escolher uma base para ler `"% FCmax"` — que é a decisão que a camada 2 deveria tomar | rejeitada — fixa a ambiguidade e chama de correção |

## Atleta sem dados de FC

`Atleta:209` e `:235` têm fallbacks: FCmax cai para `220 - idade` (ou 180 sem idade) e LTHR para
`0,85 × FCmax`. Para **exibir** uma estimativa isso é aceitável. Para **mandar ao relógio um número
que o atleta vai perseguir**, é diferente: uma estimativa por idade pode errar dezenas de bpm.

Recomendação: **omitir o alvo de FC** quando não há dado medido, em vez de enviar um número derivado
de fallback. Um treino sem alvo de FC é executável; um treino com alvo errado induz o atleta a
treinar na intensidade errada acreditando estar certo. O prompt já pede "teste de limiar urgente"
nesse caso (`PlanoTreinoPromptBuilder:494`) — coerente com não fingir precisão.

Decisão a confirmar com o produto, porque muda o que o atleta vê.

## Riscos

| Risco | Mitigação |
|---|---|
| **Mudar o payload quebra o canal** que foi validado em 2026-07-14 | `units: "bpm"` já é suportado e já é emitido no caminho BPM (`IntervalsIcuAdapter:267`) — não é formato novo. Validar ponta a ponta com conta real antes de fechar |
| **Planos legados** com `"% FCmax"` gravado em `fcAlvoEtapa` | CA5: interpretar na base decidida e registrar. Não reinterpretar em silêncio |
| Corrigir três camadas sem saber qual disparou | Os números do caso real (Open Question) dizem qual. Corrigir as três é defensável porque as três estão erradas independentemente — mas o registro deve dizer o que foi observado e o que foi inferido |
| A base do `%hr` do intervals.icu ser diferente do que suponho | A correção escolhida não depende disso. A **descrição** do defeito depende — verificar antes de afirmar na doc |
| Testes continuarem afirmando string de unidade | CA2 e CA6 exigem afirmação de valor absoluto e um teste que reproduza o bug |
