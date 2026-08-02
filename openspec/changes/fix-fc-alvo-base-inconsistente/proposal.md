# fix-fc-alvo-base-inconsistente — FC do treino enviado ao relógio sai acima do prescrito

**Tamanho:** S · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-02 · **Refinada:** 2026-08-02 (escopo reduzido ao formato de alvo — padrão Garmin)

> Origem: bug relatado em 2026-08-02 — ao enviar o treino para o relógio, a frequência cardíaca
> apareceu **bem acima** da especificada no treino planejado.

## Why

O número de FC que o atleta vê no relógio não é o que o treinador prescreveu. Não é cosmético: é a
variável que governa a intensidade. Um atleta perseguindo FC alta demais executa em zona errada — o
fácil vira moderado, o moderado vira limiar — e a carga real diverge do plano de forma invisível para
o treinador.

### O padrão Garmin decide a questão

No formato de treino estruturado do Garmin (FIT), o alvo de FC de uma etapa tem duas formas:

| Forma | Como é codificada | Quem resolve o bpm |
|---|---|---|
| **Relativa** | valor 1–100 ⇒ **% da FC máxima** | o relógio |
| **Absoluta** | valor > 100 ⇒ **bpm + 100** | ninguém — já é o número final |
| Zona | número da zona (1–5) | o relógio, pela config **dele** |

O canal relativo do padrão é **%FCmax por definição**. E o modelo de zonas do Menthoros é
**%LTHR (Friel)** — `ZonaTreinoService:43-49`, com o LTHR na fronteira Z4/Z5.

**Consequência:** não existe forma correta de enviar um percentual do Menthoros por esse canal.
Qualquer percentual base-LTHR que trafegue como relativo será lido como base-FCmax do outro lado.
Como LTHR ≈ 0,85 × FCmax, a leitura infla o número em torno de **18%** — a direção exata do sintoma
relatado.

```
intenção:  0,90 × LTHR   = 0,90 × 0,85 × FCmax = 0,765 × FCmax
leitura:   0,90 × FCmax  = 0,900 × FCmax
inflação:  ≈ 1,18  →  ~18% acima
```

Para FCmax 190: intenção ≈ 145 bpm, exibido ≈ 171. Base aeróbica vira esforço de limiar.

Enviar **zona** tem o mesmo defeito por outro caminho: delega a conversão à configuração de zonas do
relógio, que o Menthoros não escreve nem controla.

### O que o código faz hoje

`IntervalsIcuAdapter.montarHr:264` envia sempre alvo **relativo**:

- percentual → `units: "%hr"` com os números crus
- zona → `units: "hr_zone"` com o número da zona

E `IntervalsIcuClientImpl` só **lê** `/api/v1/athlete/0` (`:44`) e escreve *eventos* (`:67`, `:83`) —
**nunca grava** FC máxima, limiar ou zonas. O Menthoros conhece `fcLimiar` (`Atleta:235`) e não o
envia.

### O prompt agrava, e é barato de corrigir

`PlanoTreinoPromptBuilder:503` entrega ao LLM as zonas em **bpm absoluto** e instrui (`:493`):
*"Use EXATAMENTE as zonas de FC listadas abaixo. NÃO invente outros valores de BPM."* Mas o exemplo de
saída no mesmo prompt (`plano-treino-prompt.txt:34-45`) demonstra `"fcAlvo": "90-95% FCmax"`.

Entrega bpm, proíbe inventar, exemplifica percentual — e modelo segue exemplo. É a origem do rótulo
ambíguo que depois trafega errado.

### Por que os testes não pegaram

`IntervalsIcuAdapterTest:117,133` afirmam apenas que a **string da unidade** trafega (`"bpm"`,
`"hr_zone"`). Nenhum teste afirma um **bpm absoluto**. A suíte valida formato de payload, não que o
número significa o que o plano quis dizer — estruturalmente incapaz de detectar erro de base.

> Mesma classe do BUG-CONF-001 (`fix-tss-planejado-divergente`): duas expressões da mesma grandeza
> com bases diferentes, cada uma correta isoladamente.

## What Changes

1. **O push resolve para bpm absoluto antes de enviar.** A conversão acontece no
   `IntervalsIcuWorkoutConverter`, que já recebe o treino, usando `fcLimiar` do atleta. O adapter
   passa a receber `HrTarget` sempre em `BPM` e emite `units: "bpm"`.
2. **Zona também vira bpm.** `hr_zone` deixa de ser emitido: delegar ao relógio é a mesma falha por
   outro caminho.
3. **Prompt coerente:** entrega bpm e exige bpm na saída, sem o exemplo em `"% FCmax"`.
4. **Testes que afirmam valor absoluto**, não string de unidade — incluindo um que reproduz o bug.

**O modelo de zonas não é tocado.** `ZonaTreinoService` continua Friel %LTHR, com as mesmas faixas.
Esta change alinha o **transporte** ao padrão Garmin; refinar o modelo é outra discussão.

## Capabilities

Nenhuma nova. Corrige comportamento de uma existente (envio de treino estruturado ao relógio).

## Impact

- **Backend apenas:** `IntervalsIcuWorkoutConverter`, `IntervalsIcuAdapter`, o prompt e os testes.
- **O payload muda de forma** (relativo → absoluto). É contrato externo — validar contra a API real.
  `units: "bpm"` **já é suportado e já é emitido** no caminho BPM (`IntervalsIcuAdapter:267`), então
  não é formato novo.
- **Sem mudança de schema** e **sem mudança no modelo de zonas**. Nenhuma prescrição existente muda
  de intensidade pretendida — muda o número que chega ao relógio, que passa a ser o pretendido.

## Critérios de aceite

- **CA1** — Dado um treino com alvo de FC e um atleta com `fcLimiar` conhecido, quando é enviado,
  então o payload leva **bpm absoluto** e nenhum alvo relativo (`%hr`, `hr_zone`) trafega.
- **CA2** — Dado um alvo de zona N, quando é enviado, então o bpm coincide com a faixa que o
  `ZonaTreinoService` calcula para a zona N do mesmo atleta. Hoje nada afirma essa igualdade, e é a
  costura que quebrou. Fixar **também valores absolutos** — só a igualdade não basta, senão as duas
  pontas quebram juntas e o teste segue verde (lição do BUG-CONF-001).
- **CA3** — Dado um atleta **sem** FC medida, quando o treino é enviado, então o comportamento é
  explícito e seguro — nunca um bpm derivado de fallback por idade apresentado como alvo. Ver Open
  Questions.
- **CA4** — Dado o prompt, quando o LLM responde, então o formato de `fcAlvo` é um só e coerente com
  o que o prompt entrega. Exemplo e instrução não podem discordar.
- **CA5** — Dado um `fcAlvoEtapa` legado no formato `"90-95% FCmax"`, quando o treino é enviado, então
  é interpretado na base do domínio (%LTHR) e a interpretação é registrada — não reinterpretado em
  silêncio.
- **CA6** — Existe teste que **reproduz o bug**: alvo prescrito X, valor enviado bem acima. Deve
  falhar antes da correção.

## Métrica de sucesso

O bpm que aparece no relógio é o mesmo que o treinador vê na tela do plano, para o mesmo treino e
atleta. Verificável ponta a ponta com conta real — o canal já foi validado em 2026-07-14.

## Open Questions & Assumptions

**Resolvida no refino (2026-08-02):** *qual base usar?* O padrão Garmin define o canal relativo como
%FCmax, e o domínio é %LTHR. Não há percentual correto a enviar — resolver para absoluto é o único
caminho compatível, e vale independentemente de como o intervals.icu interpreta `%hr`.

**Em aberto:**

- **Os números do caso real.** O relato não veio com valores. Confirmar alvo prescrito, bpm exibido e
  FCmax do atleta permite dizer se a inflação observada bate com os ~18% previstos — separando o que
  foi **observado** do que foi **inferido**.
- **Atleta sem FC medida** (CA3). `Atleta:209,235` têm fallback (`220 - idade`; LTHR = 0,85 × FCmax).
  Para *exibir* estimativa é aceitável; para mandar ao relógio um número que o atleta vai perseguir, é
  diferente — pode errar dezenas de bpm. Recomendação: **omitir o alvo de FC**. Treino sem alvo é
  executável; treino com alvo errado induz a treinar na intensidade errada acreditando estar certo. O
  próprio prompt já pede "teste de limiar urgente" nesse caso (`:494`). Decisão de produto, porque
  muda o que o atleta vê.

**Premissas:**

- O canal de push está funcional; o defeito é de conteúdo, não de transporte (gate de 2026-07-14).
- `fcLimiar` é a base do domínio e permanece — decidido no refino.

## Fora de escopo

- **Mudar o modelo de zonas** para o default %FCmax do Garmin (50-60 / 60-70 / 70-80 / 80-90 /
  90-100). Avaliado no refino e **rejeitado para esta change**: mudaria todas as faixas — a Z2 sairia
  de ~138-144 para 114-133 bpm num atleta de FCmax 190 — alterando a intensidade de toda prescrição
  existente. É decisão de produto, não correção de bug.
- **Sincronizar o perfil de FC do atleta para o intervals.icu.** Resolvido o push para absoluto, o
  perfil remoto deixa de importar neste fluxo. Sincronizar manteria duas fontes de verdade.
- **Revisar as faixas do modelo** (75-85%, 85-89%, …). Alinhar bases ≠ redefinir zonas.
- **Pace.** Já trafega em `secs/km`, absoluto — não sofre do mesmo problema.
