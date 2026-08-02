# Design — fix-fc-alvo-base-inconsistente

**Refinado em 2026-08-02:** escopo reduzido ao **formato de alvo** (padrão Garmin). O modelo de zonas
permanece Friel %LTHR, intocado.

## O padrão Garmin, e por que ele fecha a decisão

Alvo de FC numa etapa de treino estruturado (FIT):

| Forma | Codificação | Quem resolve |
|---|---|---|
| Relativa | valor **1–100** ⇒ % da **FC máxima** | o relógio |
| Absoluta | valor **> 100** ⇒ **bpm + 100** | ninguém — é o número final |
| Zona | número da zona | o relógio, pela config dele |

O canal relativo é **%FCmax por definição do formato**. O domínio do Menthoros é **%LTHR**. Logo:

> Não existe percentual que o Menthoros possa enviar por esse canal e que chegue certo.

Isso não é preferência de design — é propriedade do formato. Resolver para bpm absoluto é o único
caminho compatível, e é robusto **independentemente** de como o intervals.icu interpreta `%hr` no meio
do caminho (que eu não verifiquei, e que deixa de importar).

Enviar zona tem o mesmo defeito: delega ao relógio, cuja config de zonas o Menthoros não escreve.

## Estado verificado (2026-08-02)

| Onde | O que faz |
|---|---|
| `ZonaTreinoService:43-49` | 5 zonas, **Friel %LTHR** — Z1 75-85%, Z2 85-89%, Z3 89-94%, Z4 94-100%, Z5 100-106%. LTHR na fronteira Z4/Z5 |
| `ZonaTreinoService:89-90` | explícito: `fcMaxima` **não é usado** |
| `PlanoTreinoPromptBuilder:503` | entrega as zonas ao LLM em **bpm absoluto** |
| `PlanoTreinoPromptBuilder:493` | "Use EXATAMENTE as zonas listadas. NÃO invente outros valores de BPM" |
| `plano-treino-prompt.txt:34-45` | exemplifica a saída como **`"90-95% FCmax"`** |
| `IntervalsIcuTargetParser:52` | extrai os números do percentual — agnóstico de base |
| `IntervalsIcuAdapter:272,277` | emite `%hr` (cru) e `hr_zone` (número da zona) |
| `IntervalsIcuAdapter:267` | **já emite `units: "bpm"`** no caminho BPM — formato não é novo |
| `IntervalsIcuClientImpl:44,67,83` | lê `/athlete/0`, escreve eventos — **nunca grava perfil de FC** |
| `IntervalsIcuAdapterTest:117,133` | afirma a **string da unidade**, nunca um bpm |

## O desenho

```
hoje:   plano (%LTHR) → rótulo "% FCmax" → payload "%hr"/"hr_zone" → o relógio resolve → bpm errado
                 ↑ base A        ↑ base B          ↑ base C (deles)

alvo:   plano (%LTHR) → resolvido para bpm onde o dado do atleta vive → payload "bpm" → relógio
                 ↑ base única
```

### Onde resolver

No **`IntervalsIcuWorkoutConverter`**, não no adapter. O adapter hoje não tem nenhuma referência a
`Atleta`, e o papel dele é traduzir modelo canônico → JSON. Levar o atleta até lá misturaria
responsabilidades; o converter já recebe o treino.

Consequência: `HrTarget` chega ao adapter **sempre** em `BPM`. `PERCENT` e `ZONE` passam a ser
representação intermediária do parser, consumida pela resolução — nunca atravessam a fronteira.

### A resolução de zona reusa o que já existe

`ZonaTreinoService.calcularZonas(atleta)` já devolve `ZonaFC(numero, nome, fcMin, fcMax)`. A zona N
resolve para `fcMin`–`fcMax` da zona N. **Não reimplementar a conta** — reimplementar é como o
BUG-CONF-001 nasceu.

Para percentual legado (`"90-95% FCmax"`), interpretar na base do domínio (%LTHR) e registrar. Não
reinterpretar em silêncio: o mesmo texto passa a significar outro bpm.

## Alternativas consideradas

| Opção | A favor | Contra | Veredito |
|---|---|---|---|
| **Resolver para bpm no converter** | única compatível com o padrão; independe do intervals.icu; dado já existe | precisa do atleta no converter | **escolhida** |
| Corrigir a base do percentual e seguir enviando `%hr` | menor diff | **impossível estar certo**: o canal relativo é %FCmax por definição | rejeitada pelo padrão |
| Continuar enviando `hr_zone` | legível no app deles | delega à config de zonas do relógio, que não escrevemos | rejeitada |
| Sincronizar o perfil de FC para o intervals.icu | mantém alvo relativo | duas fontes de verdade; editável do outro lado; não corrige o prompt | rejeitada |
| Adotar o modelo %FCmax do Garmin | alinharia o rótulo "% FCmax" já emitido | muda todas as faixas (Z2: ~138-144 → 114-133 bpm em FCmax 190) e a intensidade de toda prescrição | rejeitada — decisão de produto, não correção de bug |

## Atleta sem FC medida

`Atleta:209,235` têm fallback: FCmax = `220 - idade` (ou 180), LTHR = 0,85 × FCmax. Para **exibir**
estimativa, aceitável. Para **mandar ao relógio um número que o atleta vai perseguir**, não: a fórmula
etária erra dezenas de bpm entre indivíduos.

Recomendação: **omitir o alvo de FC**. Treino sem alvo é executável; treino com alvo errado induz o
atleta a treinar na intensidade errada acreditando estar certo. Coerente com o próprio prompt, que já
pede "teste de limiar urgente" nesse cenário (`:494`).

Decisão de produto — muda o que o atleta vê.

## Riscos

| Risco | Mitigação |
|---|---|
| Mudar o payload quebra o canal validado em 2026-07-14 | `units: "bpm"` já é emitido hoje (`:267`) — não é formato novo. Validar ponta a ponta com conta real antes de fechar |
| Reimplementar a conta de zona em vez de reusar `ZonaTreinoService` | CA2 exige que o bpm enviado **coincida** com a faixa do serviço, e fixa valores absolutos junto |
| Planos legados com `"% FCmax"` gravado | CA5: interpretar na base do domínio e registrar |
| Testes seguirem afirmando string de unidade | CA1/CA2/CA6 exigem valor absoluto e um teste que reproduza o bug |
| Atribuir ao código o que pode ser config do atleta | Task 0.1: os números do caso real dizem se a inflação bate com os ~18% previstos. Separar observado de inferido |
