## Context

`AtletaOutputDto` é um `record` com `@JsonInclude(NON_NULL)`. Ele tem `idade` (`int`), mas não
`dataNascimento`, embora a entidade `Atleta` tenha o campo `LocalDate dataNascimento`
(`Atleta.java:40`). O `JacksonConfig` desativa `WRITE_DATES_AS_TIMESTAMPS`, então um `LocalDate`
serializa como `yyyy-MM-dd`, exatamente o formato de um `<input type="date">`.

No front, `abrirEdicaoAtleta` (`CoachAthletesPage.tsx`) chama `AtletasService.buscarAtletaPorId` e
passa o resultado ao `AtletaDialog`, que lê `atleta.dataNascimento` em `getInitialFormData`. O tipo
`Atleta` já declara `dataNascimento: string`. O defeito está, portanto, só no backend.

## Goals / Non-Goals

**Goals:**
- Expor `dataNascimento` na resposta de atleta, de forma aditiva.
- Travar com teste (componente e E2E) que a edição abre com a data carregada.
- Redesenhar o `AtletaDialog` conforme o canvas
  (https://claude.ai/artifact/KqSdJiuCUNoK3Jyf38NCqw) sem mudar o payload de `onSave`.

**Non-Goals:**
- Alterar `idade`, o cálculo dela ou o `AtletaInputDto`.
- Trocar o formato de data da API.
- Backfill de datas de nascimento de atletas legados.
- Campo novo no cadastro, validação de e-mail, componente de formulário genérico.

## Decisions

**1. Adicionar `LocalDate dataNascimento` ao `AtletaOutputDto`, mantendo `idade`.**
Aditivo, sem versionar a API. Alternativa descartada: calcular a data no front a partir de `idade`,
impossível (perde dia e mês).

**2. Posição do campo no final do record, após `sexo`.** `withBilling` reconstrói o record por
construtor posicional; acrescentar no fim minimiza o diff e o risco de trocar argumentos do mesmo
tipo. Alternativa descartada: agrupar perto de `idade`, que mexeria em todos os pontos de
construção.

**2b. DTO único mantido.** O mesmo `AtletaOutputDto` serve `POST`, `PUT`, `GET` lista e `GET /{id}`;
a data sai nos quatro. Alternativa descartada: DTO de detalhe separado, que dobraria o mapeamento
(`AtletaMapper.toOutputDto`, `withBilling`) sem ganho de segurança, já que lesão e peso saem pelo
mesmo caminho.

**3. Sem mudança em `AtletaInputDto` nem no merge `{...atletaParaEditar, ...dados}`.** Com a data
agora presente no objeto carregado, o merge já a devolve no `PUT`. Alternativa descartada: enviar só
campos alterados (PATCH), fora de escopo.

**4. Tipo `Atleta` inalterado para a data.** `Atleta.dataNascimento` já existe. Se a revisão do
cliente curado em `src/api` mostrar divergência, corrigir à mão (sem regerar por cima).

**5. Redesenho dentro do mesmo `AtletaDialog.tsx`, sobre o que já existe.** Casca continua
`CoachDialog` (`maxWidth="md"` em vez de `"lg"`, `disableClose={loading}`); botões continuam
`PRIMARY_BTN_SX`/`GHOST_BTN_SX`; cores só por `surface`, `content`, `primary` de `theme/tokens.ts`.
Alternativa descartada: componente novo em `features/coach/components/`, porque `CoachAthletesPage`
já consome este e a mudança é de forma, não de dados.

**6. Estado do formulário separado do payload.** Hoje `formData` é `CreateAtleta | UpdateAtleta` e
por isso sexo, nível e longão precisam de default. Passa a existir um tipo local `AtletaFormState`
no próprio arquivo, com `sexo: Sexo | ''`, `nivelExperiencia: NivelExperiencia | ''`,
`diaPreferidoLongo: diaSemana | ''`, `pesoKg: string`, `alturaCm: string`. `getInitialFormData`
devolve `''` no cadastro e o valor do atleta na edição; `validateForm` exige valor; só depois de
válido o estado é convertido para `CreateAtleta`/`UpdateAtleta` e passado a `onSave`. O contrato de
`onSave` e o merge em `salvarAtleta` não mudam. Alternativa descartada: `undefined` nos campos do
tipo da API, que espalharia opcionalidade para quem consome `CreateAtleta`.

**7. Peso e altura como texto com `inputMode="decimal"`.** Aceita `72,5` e `72.5`: antes de validar,
`replace(',', '.')` e `Number(...)`; vazio ou `NaN` ou `<= 0` é erro. Unidade via
`slotProps.input.endAdornment` ("kg", "cm"). Alternativa descartada: `type="number"`, que rejeita a
vírgula no teclado PT-BR e aceita `0` como válido até a validação.

**8. Dias como `Chip` clicável, longão derivado.** `Stack direction="row" flexWrap` de `Chip`
(`variant` `filled`/`outlined` conforme marcado, `onClick` alterna, `aria-pressed`). Uma única
lista `DIAS_SEMANA = [{ value: 'TERCA', label: 'Terça' }, ...]` alimenta chips e o select do longão,
o que mata "Terca"/"Sabado" (`option.slice(1).toLowerCase()` sai). O select do longão fica
`disabled` sem dia marcado e lista só `diasDisponiveis`; se o valor salvo não estiver entre eles
(legado), entra como opção extra até o treinador trocar; desmarcar o dia escolhido limpa o longão.
Alternativa descartada: manter `Checkbox` em `FormGroup row`, que ocupa duas linhas e sem acento de
grupo.

**9. Três grupos em `Typography variant="overline"` + `Grid`.** Identificação (nome, e-mail, data,
sexo); Perfil físico e objetivo (peso, altura, objetivo em 12 colunas, nível); Disponibilidade e
saúde (chips, longão, lesão e descrição). `Grid size={{ xs: 12, sm: 6 }}` em todo campo de meia
largura. `Card`/`CardHeader` internos saem: o `CoachDialog` já dá a casca, e o card dentro do dialog
era o que forçava o `lg`.

**10. Copy.** Subtítulo: "Informe os dados para montar o plano de treino. Campos com * são
obrigatórios." `actionsHint` removido. Botão primário: "Adicionar atleta" no cadastro, "Salvar
alterações" na edição; "Salvando..." enquanto `loading`. Rótulos em caixa de frase ("Data de
nascimento", "Nível de experiência", "Dia do treino longo", "Dias disponíveis para treinar",
"Possui lesão ou restrição").

## Risks / Trade-offs

- **Redesenho e fix na mesma change** → o fix da data (backend) já tem PR; se o redesenho atrasar,
  o front da data não entra sozinho. Aceito: a mudança do front é num único arquivo e a data
  pré-carregada é parte do mesmo formulário. Se precisar, a seção 2 do `tasks.md` separa os itens
  da data (2.1 a 2.4) dos do redesenho (2.6 em diante), e dá para cortar.
- **`AtletaFormState` duplica os campos de `CreateAtleta`** → aceito; é local ao arquivo e é o que
  permite `''` sem contaminar o tipo da API.
- **Legado com longão fora dos dias** → opção extra no select, nunca apagar sem ação do treinador.

- **Exposição de dado pessoal (LGPD)** → o dado já é obrigatório e fica sob tenant e papel. Verificar
  que o atleta só lê o próprio registro e que `AthleteDtoAmountExposureTest` e testes de exposição
  não regridem.
- **DTO compartilhado** → a data sai também na listagem e nas respostas de `POST`/`PUT`. Aceito
  (decisão 2b); o payload da listagem cresce um campo curto por atleta.
- **Construção posicional do record** → erro de ordem em `withBilling` passa pelo compilador se os
  tipos coincidirem. Mitigado pelo campo ficar no fim e por teste de mapper com data conhecida.
- **Legado sem data** → `NON_NULL` omite o campo; o dialog abre vazio e a validação existente
  exige o preenchimento. Comportamento desejado.

## Migration Plan

1. Mergear o backend em `develop` (campo aditivo, sem impacto no front atual).
2. Mergear o front (redesenho e testes) depois.
Rollback: reverter o PR do backend; o front volta ao comportamento atual (campo vazio), sem
quebra.

## Open Questions

- Quantos atletas legados estão sem data de nascimento? (task 1.1)
