# Design — athlete-share-cards (núcleo)

**Data:** 2026-11-08 · **Base:** DoR (spec-reviewer + Codex) e decisões do founder no mesmo dia.

## D1 — Rota própria com `treinoId`

`ATHLETE_SHARE_WORKOUT = '/athlete/share/:treinoId'` no shell do atleta (`createHashRouter`). A
página resolve o treino pela lista recente (`ManualTrainingService.listarRecentes(30)`), sem
endpoint novo de detalhe: treino fora da janela de 30 dias → "Treino não encontrado" (CA8). Os
pontos de entrada só existem para treinos recentes, então o caso é raro.

## D2 — Modelos e disponibilidade

| Modelo | Formato default | Disponível quando |
|---|---|---|
| Plano × realizado | Story | treino com planejado vinculado e ≥ 1 etapa realizada |
| Parciais | Feed | ≥ 2 etapas de esforço realizadas |
| Semana | Quadrado | sempre (a semana do treino) |

Adapter puro `buildShareCardData` monta um view model por modelo e `availableModels`; os
componentes de card só renderizam o view model.

## D3 — Assinatura sem logo

`Usuario.assessoria.nome` (`useCurrentUser`) dá o nome; a sigla é derivada (iniciais das duas
primeiras palavras). O logo fica para `athlete-share-cards-extra`: `GET /assessorias/me/logo` não
aceita ATLETA hoje, e mesmo com acesso o PNG precisa do blob (não da URL autenticada).

## D4 — Atribuição Garmin

`fonteDados` chega como `{value, label}`; normalizar por `value`. Regra única em
`garminAttributionFor(treinos)`:
- um treino Garmin → `{ label: 'GARMIN ' + deviceName?.toUpperCase() ?? 'GARMIN', derived: false }`;
- agregado (Semana) com algum Garmin → `{ label: 'GARMIN', derived: true }` e a frase
  "Inclui dados de dispositivo Garmin";
- nenhum → `null`.
Renderizada pelo `ShareCardFrame`, logo abaixo do título de cada modelo.

## D5 — Exportação

`html-to-image` `toBlob` sobre um nó oculto renderizado em 1080 px (não a prévia escalada), com
`data-export="true"` que desliga `backdrop-filter` e o grão. Regera o blob ao mudar modelo, formato
ou chave; os botões ficam desabilitados enquanto gera. Destinos:
- **Compartilhar**: `navigator.share({ files: [file] })` só se `navigator.canShare({ files })`;
  `AbortError` = cancelamento silencioso; outro erro = mensagem do CA7.
- **Salvar**: `URL.createObjectURL` + `<a download>`.

## D6 — Tipografia

Barlow Condensed (ital 700/800) no `<link>` de Google Fonts do `index.html` e token
`fontFamily.displayShare` em `theme.premium.ts`. Só os cards usam.

## D7 — Tipos

`TreinoRealizadoDto` (`src/types/TreinoManual.ts`) passa a declarar `etapasRealizadas` tipado
(reuso de `EtapaRealizadaDetalhe` de `src/types/TreinoRealizado.ts`) e `tempoEmZonas`, que o backend
já devolve na listagem.
