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

**Non-Goals:**
- Alterar `idade`, o cálculo dela ou o `AtletaInputDto`.
- Redesenhar o dialog (copy, defaults, separador decimal, mobile).
- Trocar o formato de data da API.
- Backfill de datas de nascimento de atletas legados.

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

**4. Tipo do front inalterado.** `Atleta.dataNascimento` já existe. O trabalho do front é teste, não
código de produção. Se a revisão do cliente curado em `src/api` mostrar divergência, corrigir à mão
(sem regerar por cima).

## Risks / Trade-offs

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
2. Mergear o front (testes) depois.
Rollback: reverter o PR do backend; o front volta ao comportamento atual (campo vazio), sem
quebra.

## Open Questions

- Quantos atletas legados estão sem data de nascimento? (task 1.1)
