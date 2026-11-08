# athlete-share-cards — cards de compartilhamento do treino (sem mapa)

**Tamanho:** L · **Trilha:** Full (fluxo novo no shell do atleta, geração de imagem, atribuição
obrigatória da Garmin, marca da assessoria exposta fora da plataforma)
**Status:** proposta
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-front` (backend só se Q2 pedir campo novo)

> Segunda de três changes (ver `add-activity-gps-trace`). Esta entrega a tela de compartilhar e os
> modelos que **não** dependem de GPS. O mapa fica em `athlete-share-cards-mapa`. Referência visual:
> canvas "Compartilhar treino — cards sociais", linha **v2 · Kinetic**, nas cores do design system
> Menthoros.

## Why

Strava e Garmin Connect deixam o atleta publicar o treino nas redes com um card bonito. O Menthoros
não. O atleta que quer mostrar o treino vai gerar a imagem lá, e a assessoria some da história.

O que só o Menthoros pode mostrar é o **plano versus o realizado**: "6 de 6 tiros no alvo", "5 de 5
treinos da semana", a frase do treinador. Cada card publicado carrega a assinatura da assessoria e
do treinador. É divulgação orgânica que o treinador não precisa produzir.

## Escopo

1. **Tela "Compartilhar treino"** (`features/athlete/pages/AthleteShareWorkoutPage.tsx`), acessível
   a partir do detalhe de um treino realizado e da semana no progresso:
   - prévia ao vivo do card;
   - seletor de **modelo**;
   - seletor de **formato**: Story 9:16 (1080×1920), Feed 4:5 (1080×1350), Quadrado 1:1
     (1080×1080);
   - chaves: **Mostrar FC**, **Mostrar assessoria**, **Mostrar treinador**;
   - destinos: **Stories**, **WhatsApp**, **Salvar**, **Mais** (Web Share API com `files`; fallback
     para download quando não houver suporte).
2. **Modelos desta change** (todos v2 Kinetic):
   - **Plano × realizado** (story): manchete de aderência, perfil das etapas com pace por tiro,
     tempo por zona;
   - **Parciais** (feed): uma barra por tiro contra a faixa-alvo;
   - **Semana** (quadrado, bento): km da semana, barras por dia na cor do tipo de treino, fitness,
     treinos cumpridos, tempo;
   - **Nota do treinador** (story): frase do treinador em destaque + resumo do treino. Só aparece
     se existir nota do treinador no treino **e** ela estiver marcada como publicável (Q2);
   - **Recorde** (feed): quando o treino gerou um melhor esforço (`GET /me/melhores-esforcos`),
     o tempo em destaque com a diferença para o anterior;
   - **Rumo à prova** (story): dias para a prova-alvo, semana do ciclo, curva de CTL
     (`AthleteProgressService.getPmcHistorico`) e projeção (`RaceProjectionService`).
3. **Assinatura** (`features/athlete/components/share/ShareSignature.tsx`): logo da assessoria
   (`Assessoria.logoUrl`, com sigla como fallback), nome da assessoria e "Treinado por {nome}".
   Modos: completa · só assessoria · nenhuma.
4. **Atribuição Garmin** obrigatória em todo card cujo dado venha de dispositivo Garmin: texto
   "GARMIN {deviceModel}" logo abaixo do título; "GARMIN" quando o modelo for nulo. Cards de dado
   derivado (Semana, Prova, Recorde) trazem também a frase "derivado em parte de dados de
   dispositivo Garmin". Base: Garmin API Brand Guidelines v6.30.2025, seções *Visual and Social
   Media* e *Combined or Derived Data*. Treino sem fonte Garmin (manual, Strava, intervals.icu) não
   leva a atribuição.
5. **Geração da imagem** no cliente a partir do DOM da prévia, em 1080 px de largura, com fontes
   embutidas. Lib a decidir (Q1).
6. **Design system:** cores só por token (`surface-900`, `glass-*`, `primary-500` como acento de
   marca, `semantic-success` para estado, `zone-*` nas zonas, `categorical-*` nos tipos de treino).
   Família display para números dos cards: Q3.

## Fora do escopo

- Modelos com mapa (Rota, Stickers sobre foto) — `athlete-share-cards-mapa`.
- Postagem direta via API das redes. O atleta publica pelo share sheet do sistema.
- Card gerado pelo coach ou em lote para a assessoria.
- Internacionalização; copy PT-BR hardcoded como o resto do app.

## Critérios de aceite

**CA1 — Acesso e prévia**
> **Dado** um treino realizado do atleta
> **Quando** ele toca em "Compartilhar"
> **Então** a tela abre com o modelo Plano × realizado selecionado, formato Story, e a prévia reflete
> os dados reais do treino (sem `MOCK_*`).

**CA2 — Modelos condicionais**
> **Dado** um treino sem nota publicável do treinador, sem melhor esforço e um atleta sem prova-alvo
> **Quando** a tela abre
> **Então** os modelos Nota do treinador, Recorde e Rumo à prova não aparecem no seletor.

**CA3 — Assinatura**
> **Dado** as chaves "Mostrar assessoria" e "Mostrar treinador"
> **Quando** o atleta as alterna
> **Então** a prévia e a imagem gerada refletem o modo (completa / só assessoria / nenhuma), com
> logo da assessoria quando `logoUrl` existir e sigla quando não.

**CA4 — Atribuição Garmin**
> **Dado** um treino com `fonteDados = GARMIN` e `deviceModel = "Forerunner 265"`
> **Quando** qualquer card é gerado
> **Então** a imagem contém "GARMIN FORERUNNER 265" abaixo do título; com `deviceModel` nulo,
> contém "GARMIN"; com fonte manual, não contém atribuição Garmin.

**CA5 — Imagem gerada**
> **Dado** formato Story
> **Quando** o atleta toca em Salvar
> **Então** um PNG 1080×1920 é baixado, com as fontes corretas e sem elementos cortados; em
> dispositivo com Web Share API, Stories/WhatsApp/Mais abrem o share sheet com o arquivo.

**CA6 — Acessibilidade da tela**
> **Dado** a tela de compartilhar
> **Quando** navegada por teclado ou leitor de tela
> **Então** seletores são `radiogroup`, chaves são `switch` com rótulo, alvos de toque ≥ 44 px, e a
> prévia tem `aria-label` descrevendo o card.

## Métrica de sucesso

- % de treinos realizados que geram ao menos um card nos 30 primeiros dias (meta inicial: 10%).
- % de cards gerados com assinatura da assessoria ativa (meta: ≥ 80%; é o valor para o treinador).
- Zero card com dado Garmin sem atribuição (verificável por teste de componente).

## Open Questions & Assumptions

- **Q1 — Lib de geração de imagem.** `html-to-image` (via `foreignObject`, preserva CSS moderno,
  precisa embutir fontes) vs. render no servidor (Playwright). Recomendação: `html-to-image` no
  cliente; sem `backdrop-filter` e sem o grão SVG no modo de exportação (fallback para vidro
  opaco), porque não rasterizam de forma confiável. Dependência nova: precisa de aprovação.
- **Q2 — Nota do treinador publicável.** O treinador precisa autorizar que a frase dele saia da
  plataforma. Opções: campo `publicavel` por nota (backend, S) ou preferência global do treinador
  "minhas notas podem aparecer nos cards". Recomendação: por nota, opt-in, default falso. Se
  escolhida, vira task de backend nesta change.
- **Q3 — Tipografia dos números.** O canvas usa Barlow Condensed itálico 800, fora do design
  system (Space Grotesk). Decidir: adotar Barlow Condensed como token `display-share` (carregar
  no `index.html`) ou usar Space Grotesk 700. Afeta só os cards.
- **Q4 — Onde fica o botão Compartilhar.** Detalhe do treino realizado e card da semana no
  progresso são os pontos óbvios; confirmar se o treino de hoje (após concluir) também mostra.
- **Premissa:** `Assessoria.logoUrl` já existe e é servido ao atleta; se não estiver no DTO do
  atleta, adicionar é uma task pequena de backend.
- **Premissa:** os nomes de assessoria e treinador vêm do vínculo atual do atleta, não de
  cadastro novo.

## Riscos e mitigações

- **Fontes não carregadas na exportação** → imagem com fallback feio. Mitigação: aguardar
  `document.fonts.ready` e embutir as fontes como data URI na exportação.
- **Dados Garmin sem atribuição** → risco de suspensão da API (Brand Guidelines). Mitigação: a
  atribuição é componente único (`GarminAttribution`) renderizado pelo container, não por cada
  modelo; teste de componente garante presença.
- **Marca da assessoria exposta sem controle do tenant.** Mitigação: Q2 para a nota; a assinatura
  usa só nome e logo já públicos no app do atleta.
- **Pendências do Full track:** `product-reviewer` e pre-mortem não rodaram; task 0.
