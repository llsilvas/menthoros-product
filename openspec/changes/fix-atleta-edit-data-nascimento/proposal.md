**Tamanho:** M · **Trilha:** Full (dois repos, contrato de API alterado e redesenho do formulário)

> **Status 2026-11-01:** escopo ampliado. Nasceu como S (só a data de nascimento); passa a M ao
> absorver o redesenho de usabilidade do `AtletaDialog`, levantado na mesma revisão. O backend
> (seção 1 do `tasks.md`) já estava feito e não muda; a ampliação é toda no front. Canvas antes e
> depois: https://claude.ai/artifact/KqSdJiuCUNoK3Jyf38NCqw (cores aproximadas; a implementação usa
> os tokens do tema).

## Why

Ao editar um atleta, o campo "Data de Nascimento" abre vazio. `GET /api/v1/atletas/{id}` devolve
`AtletaOutputDto` com `idade` (inteiro), mas não `dataNascimento`; o `AtletaDialog` lê
`atleta.dataNascimento`, não encontra e cai em `""`. O treinador precisa redigitar a data só para
conseguir salvar, porque o campo é obrigatório. O tipo `Atleta` do front já declara
`dataNascimento: string`, então o contrato escrito promete um campo que o backend nunca envia.

A revisão de usabilidade que achou esse defeito achou outros no mesmo dialog, todos no caminho do
treinador ao cadastrar: subtítulo e rodapé com texto interno ("mantendo a mesma linguagem visual
dos outros dialogs", "Tamanho e estilo padronizados"); sexo, nível e dia do longão já vêm
escolhidos (`MASCULINO`, `INICIANTE`, `DOMINGO`), então um cadastro feito às pressas grava escolha
que ninguém fez; peso e altura começam em `0` e não aceitam vírgula; o select do longão mostra
"Terca" e "Sabado" sem acento; onze campos numa lista plana, dialog `lg` largo demais e grade fixa
em duas colunas que não cabe no celular.

## What Changes

- **Backend:** `AtletaOutputDto` passa a expor `LocalDate dataNascimento`, mantendo `idade`. Mudança
  aditiva: nenhum consumidor existente quebra.
- **Frontend, data:** `AtletaDialog` passa a abrir a edição com a data carregada. O tipo `Atleta` já
  declara o campo; o ganho é o teste que trava a regressão e o E2E do fluxo de edição.
- **Frontend, redesenho do formulário** (mesmo componente, sem mudar `onSave` nem o payload):
  - Copy voltada ao treinador no subtítulo; rodapé sem o texto interno.
  - Sexo, nível de experiência e dia do longão começam vazios e obrigatórios no cadastro; na
    edição vêm preenchidos do cadastro.
  - Peso e altura começam vazios, com unidade ao lado do campo e aceitando vírgula ou ponto.
  - Rótulos dos dias com acento ("Terça", "Sábado") a partir de uma lista única.
  - Três grupos: Identificação; Perfil físico e objetivo; Disponibilidade e saúde.
  - Dias disponíveis como chips selecionáveis; o dia do longão só oferece os dias marcados.
  - Dialog `md`; grade de uma coluna abaixo de `sm`.
- **Testes:** componente (edição com data pré-carregada, defaults vazios, vírgula, longão filtrado)
  e E2E (abrir edição, conferir data, salvar sem redigitar; cadastro novo completo).
- Fora de escopo: mudar o contrato de entrada (`AtletaInputDto`), validação de e-mail, e qualquer
  campo novo.

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
- Dado o dialog de cadastro novo, então sexo, nível de experiência, dia do longão, peso e altura
  estão vazios; salvar sem preenchê-los mostra erro em cada um e não chama `onSave`.
- Dado o dialog de edição, então sexo, nível e dia do longão vêm com os valores do cadastro.
- Dado o campo de peso, quando o treinador digita `72,5`, então `onSave` recebe `pesoKg: 72.5`.
- Dado nenhum dia disponível marcado, então o dia do longão fica desabilitado; ao marcar Terça e
  Sábado, só "Terça" e "Sábado" aparecem como opção, com acento.
- Dado o dialog em viewport abaixo de `sm`, então os campos ficam em uma coluna.

## Métrica de sucesso

Edição simples de atleta (corrigir objetivo ou dias disponíveis) sem tocar na data de nascimento:
nenhum `PUT` de edição bloqueado por "Data de nascimento é obrigatória" para atleta que tem a data
cadastrada. Para o redesenho: nenhum atleta novo gravado com `sexo`, `nivelExperiencia` ou
`diaPreferidoLongo` que o treinador não escolheu; o sinal observável no piloto é a distribuição
desses campos deixar de concentrar em `MASCULINO`/`INICIANTE`/`DOMINGO`.

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
- **Decidido:** campos de escolha sem default. Alternativa descartada: manter o default e destacar
  o campo, porque o dado errado continuaria sendo gravado quando o treinador não repara.
- **Decidido:** `CreateAtleta` passa a permitir `sexo`, `nivelExperiencia` e `diaPreferidoLongo`
  vazios no estado do formulário (`''`), com a validação exigindo valor antes do `onSave`. O
  payload enviado não muda.
- **Aberto:** atleta legado com `diaPreferidoLongo` fora de `diasDisponiveis` na edição. Decisão:
  mostrar o valor salvo como opção extra até o treinador trocar; não apagar dado silenciosamente.

## Impact

- `apps/menthoros-backend`: `AtletaOutputDto`, `AtletaMapper`, testes de DTO/mapper/controller.
- `apps/menthoros-front`: `AtletaDialog.tsx`, `AtletaDialog.test.tsx`, `src/types/Atleta.ts`
  (estado do formulário), novo spec em `tests/e2e/atletas/`.
- Contrato: campo novo opcional na resposta; compatível com o front atual. Ordem de entrega: backend
  primeiro, front depois.
