# coach-meta-intensidade-editor — meta de intensidade no editor, no modelo do Garmin

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-02

> **Depende de `fix-fc-alvo-base-inconsistente`**, que estabelece a meta de intensidade como escolha
> declarada no modelo canônico e resolve o alvo para bpm absoluto no push. Esta change expõe essa
> escolha ao treinador. Sem a primeira, o editor ofereceria uma escolha que o backend ainda resolve
> por precedência.

## Why

Hoje o treinador prescreve intensidade digitando texto livre num campo cujo rótulo não corresponde ao
dado.

Em `TreinoEditDialog.tsx:106`, o campo rotulado **"Zona alvo"** está ligado a **`fcAlvoEtapa`**, e ao
salvar (`:416`, `:425`, `:431`, `:438`, `:446`) grava de volta em `fcAlvoEtapa`. O rótulo diz zona; o
dado é alvo de frequência cardíaca; e o input é `TextField` sem restrição.

**A consequência é que o treinador não tem como saber o que vai acontecer.** O que ele digita cai em
três caminhos diferentes no `IntervalsIcuTargetParser`, sem nada na tela indicando qual:

**Verificado em 2026-08-02** executando os três regexes do parser (`FC_BPM`, `FC_PERCENT`, `ZONA`)
contra entradas plausíveis:

| O que o treinador digita | O que acontece |
|---|---|
| `140-150 bpm` · `140-150bpm` | alvo de **bpm** |
| `60-70% FCmax` · `60-70%` | alvo **percentual** — resolvido na base do destino |
| `Z2` · `z2-z3` · `Z2-3` | alvo de **zona** — resolvido pela config do relógio |
| **`140 - 150 bpm`** (espaços no hífen) | **nenhuma meta** |
| **`150 bpm`** (valor único, não faixa) | **nenhuma meta** |
| **`140-150`** (sem unidade) | **nenhuma meta** |
| **`Z2 (140-150 bpm)`** | **nenhuma meta** |
| **`Zona 2`** · `Z2 a Z3` · `moderado` | **nenhuma meta** |

A metade de baixo é o problema. Não são entradas absurdas — `"150 bpm"` e `"Z2 (140-150 bpm)"` são
formas naturais e informativas de prescrever, e **um espaço a mais em volta do hífen basta** para a
prescrição desaparecer. O treinador escreve, o parser não reconhece, a etapa vai sem meta, e **nada
avisa**. Ele acredita ter prescrito uma intensidade que o relógio nunca vai cobrar.

Nenhum formato aceito está documentado na tela. O treinador teria de acertar por adivinhação três
regexes que ele não pode ver.

**O Garmin já resolveu isso** — validado na UI do Garmin Connect em 2026-08-02. A etapa tem dois
eixos, e a meta é um **seletor de escolha única**:

- **Duração → Tipo:** Distância · Tempo · Pressionar botão Lap…
- **Meta de intensidade → Tipo:** `Sem objetivo` (default) · `Ritmo` · `Cadência` ·
  `Zona de frequência cardíaca` · `Frequência cardíaca personalizada` · `Zona de potência` ·
  `Potência personalizada`

Adotar essa estrutura no editor elimina a ambiguidade **na origem**, em vez de tentar adivinhá-la
depois no parser.

## What Changes

1. **Seletor de meta de intensidade por etapa**, com as opções que fazem sentido para corrida:
   `Sem objetivo`, `Ritmo`, `Zona de frequência cardíaca`, `Frequência cardíaca personalizada`.
2. **Campos dependentes do tipo escolhido** — faixa de bpm para personalizada, seletor de zona para
   zona, faixa de ritmo para ritmo. Nada de texto livre onde o dado é estruturado.
3. **`Sem objetivo` selecionável e default**, coerente com o Garmin — e com o fato de que o treinador
   pode deliberadamente não prescrever intensidade.
4. **O contrato de API carrega o tipo da meta**, em vez de o backend inferir de qual campo veio
   preenchido.
5. **Corrigir o rótulo enganoso:** "Zona alvo" deixa de nomear um campo que guarda alvo de FC.

## Capabilities

Altera a capability de **prescrição de treino pelo treinador** — o que ele pode expressar e como.

## Impact

- **Dois repos:** `menthoros-backend` (contrato + persistência do tipo) e `menthoros-front` (editor).
  PR coordenado, backend primeiro.
- **Mudança de contrato de API** na etapa de treino planejado.
- **Dados legados:** `fcAlvoEtapa` existente é texto livre heterogêneo. Precisa de estratégia de
  leitura — ver Open Questions.
- **Sem mudança no modelo de zonas.** `ZonaTreinoService` segue Friel %LTHR, intocado.

## Critérios de aceite

- **CA1** — Dado o editor, quando o treinador edita uma etapa, então escolhe **um** tipo de meta de
  intensidade num seletor, e os campos apresentados correspondem ao tipo escolhido.
- **CA2** — Dado que o treinador escolhe `Sem objetivo`, quando salva, então a etapa fica sem meta e
  isso é registrado como **escolha**, distinguível de ausência de dado (ver a change A, CA10).
- **CA3** — Dado o editor, então **não existe campo de texto livre** para intensidade. O que hoje é
  digitado vira seleção ou entrada numérica estruturada.
- **CA4** — Dado que o treinador escolhe `Frequência cardíaca personalizada`, quando informa a faixa,
  então os valores trafegam como bpm até o relógio, sem reinterpretação.
- **CA5** — Dado que o treinador escolhe `Zona de frequência cardíaca`, quando salva, então a zona é
  resolvida para bpm **no Menthoros** (change A), não delegada ao relógio.
- **CA6** — Dado um plano legado com `fcAlvoEtapa` em texto livre, quando é aberto no editor, então o
  valor é apresentado de forma compreensível e o treinador vê o que será enviado — nunca um campo
  vazio silencioso que descarta o que ele havia escrito.
- **CA7** — O rótulo de cada campo corresponde ao dado que ele grava.

## Métrica de sucesso

O treinador consegue dizer, olhando a tela, exatamente qual intensidade o relógio vai cobrar do
atleta — sem depender de acertar um formato de texto não documentado.

## Open Questions & Assumptions

**Bloqueante:**

- **O que fazer com o `fcAlvoEtapa` legado** (CA6). É texto livre acumulado: alguns valores casam com
  os padrões do parser, outros não. Migrar, interpretar na leitura, ou pedir revisão ao treinador? A
  opção que **não** serve é abrir o editor e descartar em silêncio o que não casa.

**Premissas:**

- Cadência e potência ficam fora: o produto é corrida e não há dado de potência no domínio hoje.
  Incluí-las seria generalidade especulativa.
- A change A já terá estabelecido a meta declarada no modelo canônico e a resolução para bpm; esta
  não reimplementa nenhuma das duas.

## Fora de escopo

- **Resolver alvo para bpm no push** — é a change A.
- **Mudar o modelo de zonas.**
- **Cadência e potência** como metas.
- **Editar a duração no modelo Garmin** (`Pressionar botão Lap` etc.). O editor hoje trabalha com
  distância e duração, que cobrem a prescrição de corrida. Ampliar o eixo de duração é outra
  discussão.
