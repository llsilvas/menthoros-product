**Tamanho:** S · **Trilha:** Full (dois repos e contrato de API alterado)

## Why

Ao editar um atleta, o campo "Data de Nascimento" abre vazio. `GET /api/v1/atletas/{id}` devolve
`AtletaOutputDto` com `idade` (inteiro), mas não `dataNascimento`; o `AtletaDialog` lê
`atleta.dataNascimento`, não encontra e cai em `""`. O treinador precisa redigitar a data só para
conseguir salvar, porque o campo é obrigatório. O tipo `Atleta` do front já declara
`dataNascimento: string`, então o contrato escrito promete um campo que o backend nunca envia.

## What Changes

- **Backend:** `AtletaOutputDto` passa a expor `LocalDate dataNascimento`, mantendo `idade`. Mudança
  aditiva: nenhum consumidor existente quebra.
- **Frontend:** `AtletaDialog` passa a abrir a edição com a data carregada. O tipo `Atleta` já
  declara o campo, então a mudança de código tende a ser nula; o ganho é o teste que trava a
  regressão e o E2E do fluxo de edição.
- **Testes:** componente (edição com data pré-carregada) e E2E (abrir edição, conferir data,
  salvar sem redigitar).
- Fora de escopo: copy do dialog, defaults silenciosos, separador decimal de peso/altura e layout
  mobile, achados da mesma revisão de usabilidade.

## Capabilities

### New Capabilities
- `atleta-cadastro`: cadastro e edição de atleta pelo treinador, começando pelo requisito de que a
  edição abre com os dados já cadastrados.

### Modified Capabilities
<!-- Nenhuma: não existe spec canônica de cadastro de atleta. -->

## Critérios de aceite

- Dado um atleta com data de nascimento cadastrada, quando o treinador abre a edição, então o campo
  "Data de Nascimento" vem preenchido com essa data.
- Dado esse dialog aberto, quando o treinador altera só o objetivo e salva, então a requisição `PUT`
  leva a data original sem que ela tenha sido digitada.
- Dado `GET /api/v1/atletas/{id}`, então o corpo contém `dataNascimento` no formato `yyyy-MM-dd` e
  continua contendo `idade`.
- Dado um atleta sem data de nascimento (legado), então `dataNascimento` é omitido (`NON_NULL`) e o
  dialog abre com o campo vazio e exige o preenchimento.

## Métrica de sucesso

Edição simples de atleta (corrigir objetivo ou dias disponíveis) sem tocar na data de nascimento:
nenhum `PUT` de edição bloqueado por "Data de nascimento é obrigatória" para atleta que tem a data
cadastrada. É um fix de confiabilidade do cadastro, sem métrica de produto própria; o sinal
observável é a ausência de reclamação de redigitação no piloto.

## Open Questions & Assumptions

- **Premissa:** a coluna `dataNascimento` já está preenchida para a maioria dos atletas, pois é
  obrigatória no cadastro. Contagem de legados sem data: task 1.1 (consulta ao banco).
- **Decidido:** `AtletaOutputDto` é compartilhado por `POST`, `PUT`, `GET` (lista) e `GET /{id}`
  (confirmado em `AtletaController`). A data passa a sair nos quatro. Aceito, em vez de criar um DTO
  de detalhe, porque a mudança é aditiva e esses endpoints já devolvem dados mais sensíveis (lesão,
  peso, objetivo) sob o mesmo controle de acesso.
- **Decisão consciente de exposição:** a data completa de nascimento é dado pessoal novo na
  resposta (hoje só sai `idade`). A mitigação é o controle atual: tenant e papel, com o atleta lendo
  só o próprio registro. Isso vira teste explícito (task 1.5), não só conferência.
- **Aberto:** atleta legado sem data fica bloqueado na edição pelo campo obrigatório. Sem backfill
  neste escopo; a mensagem de validação existente é a saída.

## Impact

- `apps/menthoros-backend`: `AtletaOutputDto`, `AtletaMapper`, testes de DTO/mapper/controller.
- `apps/menthoros-front`: `AtletaDialog.test.tsx`, novo spec em `tests/e2e/atletas/`.
- Contrato: campo novo opcional na resposta; compatível com o front atual. Ordem de entrega: backend
  primeiro, front depois.
