# athlete-share-cards — cards de compartilhamento do treino (núcleo, sem mapa)

**Tamanho:** M · **Trilha:** Full (fluxo novo no shell do atleta, geração de imagem, atribuição
obrigatória da Garmin, marca da assessoria exposta fora da plataforma)
**Status:** proposta — DoR 2026-11-08 (fatiada)
**Criado:** 2026-11-08 · **Revisado:** 2026-11-08 (recorte após DoR)
**Repos afetados:** `apps/menthoros-front`

> **Recorte (DoR 2026-11-08).** A versão L desta change prometia seis modelos. O `spec-reviewer`
> (READY COM AJUSTES) e o Codex (NOT READY) convergiram que três dependem de dado que o atleta não
> recebe — melhor esforço sem `treinoId` nem marca anterior (`src/types/AthleteProgress.ts:43-48`),
> nota do treinador por treino inexistente no contrato, PMC sem proveniência de fonte — e o logo da
> assessoria responde 403 ao atleta (`AssessoriaSettingsController.java:121`). Ficou assim:
>
> 1. **`athlete-share-cards`** (esta, M, só front): tela, Plano × realizado, Parciais, Semana,
>    assinatura com sigla, atribuição Garmin. Não depende de backend novo.
> 2. **`athlete-share-data`** (M, backend): logo para ATLETA, nome do treinador, nota publicável,
>    melhor esforço com treino e marca anterior, endpoint de evento de compartilhamento.
> 3. **`athlete-share-cards-extra`** (S, front, bloqueada por 2): Recorde, Nota do treinador, Rumo à
>    prova, logo real na assinatura e instrumentação.
> 4. **`athlete-share-cards-mapa`** (S, front): Rota e Stickers; bloqueada por
>    `lgpd-trajeto-cards-compartilhamento`.
>
> Referência visual: canvas "Compartilhar treino — cards sociais", linha **v2 · Kinetic**, cores do
> design system Menthoros.

## Why

Strava e Garmin Connect deixam o atleta publicar o treino com um card bonito; o Menthoros não. O
que só o Menthoros mostra é o **plano versus o realizado** ("6 de 6 tiros no alvo", "5 de 5 treinos
da semana"), assinado com o nome da assessoria e do treinador. É a hipótese de aquisição da trilha
(ver `add-activity-gps-trace`, Open Questions): divulgação orgânica que o treinador não precisa
produzir.

## Escopo

1. **Tela "Compartilhar treino"** (`features/athlete/pages/AthleteShareWorkoutPage.tsx`, rota
   `ATHLETE_SHARE_WORKOUT` com `:treinoId`):
   - prévia ao vivo; seletor de **modelo**; seletor de **formato** (Story 1080×1920, Feed 1080×1350,
     Quadrado 1080×1080); chaves **Mostrar FC** e **Mostrar assessoria** ("Mostrar treinador" chega
     em `athlete-share-cards-extra`: o nome do treinador não está no contrato do atleta, task 0.2);
   - destinos **Compartilhar** (Web Share API com `files`) e **Salvar** (download); o arquivo é
     gerado **antes** do toque no destino, para o share não perder a ativação do gesto.
2. **Pontos de entrada:** botão "Compartilhar" no `WorkoutDetailDrawer` (treino do plano já
   realizado) e no `TodayCompletedCard` (realizado de hoje, **inclusive avulso sem planejado** —
   a agenda nasce dos planejados, `buildWeekAgenda.ts:111`).
3. **Modelos:**
   - **Plano × realizado** (story) — só para treino vinculado a planejado com etapas;
   - **Parciais** (feed) — só com ≥ 2 etapas de esforço realizadas;
   - **Semana** (quadrado) — sempre disponível; km da semana, barras por dia na cor do tipo,
     treinos cumpridos e tempo.
   Modelo sem dado não aparece no seletor; o default é o primeiro disponível.
4. **Assinatura** (`ShareSignature`): sigla e nome da assessoria (`Usuario.assessoria.nome`), sem
   logo e sem "Treinado por" nesta change (ambos dependem de `athlete-share-data`).
5. **Atribuição Garmin** (`GarminAttribution`), conforme API Brand Guidelines v6.30.2025:
   - card de um treino com `fonteDados.value === 'GARMIN'`: "GARMIN {deviceName}" abaixo do título,
     ou "GARMIN" com `deviceName` nulo;
   - card **Semana** (dado agregado): atribuição quando **qualquer** treino da semana tem fonte
     Garmin, com a frase "Inclui dados de dispositivo Garmin"; nenhum treino Garmin → nada.
6. **Geração da imagem** com `html-to-image` (dependência nova, aprovada no DoR): DOM da prévia
   renderizado em 1080 px, `document.fonts.ready` antes, fontes embutidas, modo de exportação sem
   `backdrop-filter` nem grão (vidro opaco).
7. **Tipografia:** Barlow Condensed (itálico 700/800) como token `display-share`, carregada no
   `index.html`, usada só nos cards. Demais cores e tokens do design system.

## Fora do escopo

- Recorde, Nota do treinador, Rumo à prova, logo da assessoria na assinatura, instrumentação →
  `athlete-share-cards-extra` (depois de `athlete-share-data`).
- Rota e Stickers sobre foto → `athlete-share-cards-mapa`.
- Postagem direta via API das redes; card gerado pelo coach.
- Feature flag: o rollback é remover os dois botões de entrada (só front, sem migration).

## Critérios de aceite

**CA1 — Entrada e prévia**
> **Dado** um treino realizado do atleta, vindo do plano ou avulso
> **Quando** ele toca em "Compartilhar" no detalhe ou no card de hoje
> **Então** a tela abre com o primeiro modelo disponível, formato Story, e a prévia mostra dados
> reais do treino.

**CA2 — Modelos condicionais**
> **Dado** um treino avulso, sem planejado e sem etapas
> **Quando** a tela abre
> **Então** só o modelo Semana aparece no seletor.

**CA3 — Assinatura**
> **Dado** "Mostrar assessoria" ligado
> **Quando** a prévia é exibida
> **Então** aparecem a sigla e o nome da assessoria; com a chave desligada, nenhuma assinatura.

**CA4 — Atribuição Garmin por treino**
> **Dado** um treino com fonte Garmin e `deviceName = "Forerunner 265"`
> **Quando** o card Plano × realizado ou Parciais é gerado
> **Então** a imagem contém "GARMIN FORERUNNER 265" abaixo do título; com `deviceName` nulo,
> "GARMIN"; com fonte manual, nenhuma atribuição Garmin.

**CA5 — Atribuição Garmin agregada**
> **Dado** uma semana com um treino Garmin e dois manuais
> **Quando** o card Semana é gerado
> **Então** a imagem contém a atribuição Garmin; numa semana só com treinos manuais, não contém.

**CA6 — Salvar**
> **Dado** o formato Story
> **Quando** o atleta toca em Salvar
> **Então** um PNG 1080×1920 é baixado, com Barlow Condensed nos números e nada cortado.

**CA7 — Compartilhar e falhas**
> **Dado** um navegador com `navigator.canShare({ files })`
> **Quando** o atleta toca em Compartilhar
> **Então** o share sheet abre com o PNG; se o atleta cancelar, nada acontece e nenhuma mensagem de
> erro aparece; se o share falhar, aparece "Não deu para compartilhar — use Salvar"; sem suporte a
> share de arquivo, o botão Compartilhar não aparece.

**CA8 — Estados**
> **Dado** a tela de compartilhar
> **Quando** os dados estão carregando, falham ou o treino não existe
> **Então** aparece skeleton, mensagem de erro com "Tentar de novo", ou "Treino não encontrado"
> com volta ao início, respectivamente.

**CA9 — Acessibilidade**
> **Dado** a tela de compartilhar
> **Quando** navegada por teclado ou leitor de tela
> **Então** seletores são `radiogroup`, chaves são `switch` com rótulo, alvos ≥ 44 px e a prévia
> tem `aria-label` descrevendo o card.

## Métrica de sucesso

Sem telemetria no front hoje (DoR, G6); a medição real chega em `athlete-share-cards-extra`, com o
endpoint de evento de `athlete-share-data`. Nesta change: **zero card com dado Garmin sem
atribuição** (garantido por teste de componente) e o fluxo validado em iOS Safari, Android Chrome e
desktop (task 5.3).

## Open Questions & Assumptions

- **Q1 — Lib de imagem.** Resolvida: `html-to-image` (dependência aprovada no DoR).
- **Q2 — Nota do treinador.** Movida para `athlete-share-data` / `athlete-share-cards-extra`.
- **Q3 — Tipografia.** Resolvida: Barlow Condensed como `display-share`.
- **Q4 — Entrada.** Resolvida: `WorkoutDetailDrawer` + `TodayCompletedCard`.
- **Premissa a confirmar na task 0.2:** o nome do treinador do atleta chega pelo contrato atual
  (`AthleteCoachPage` mostra o treinador). Se não chegar, "Treinado por" fica para `extra`.
- **Premissa:** `GET /me/treinos` já devolve `etapasRealizadas` e `tempoEmZonas` (o
  `TreinoRealizadoOutputDto` do backend tem os dois); o tipo do front (`TreinoManual.ts`) só precisa
  passar a declará-los.

## Riscos e mitigações

- **Fontes não embutidas na exportação.** `document.fonts.ready` + embed via `html-to-image`;
  teste de componente verifica o `fontEmbedCSS`.
- **Share sem ativação de gesto em iOS.** Arquivo pré-gerado ao trocar modelo/formato.
- **Dado Garmin sem atribuição** → suspensão da API. Atribuição é componente único renderizado pelo
  frame, não por cada modelo; teste cobre CA4 e CA5.
- **DoR:** spec-reviewer READY COM AJUSTES, Codex NOT READY na versão L; recorte e ajustes
  incorporados nesta revisão.
