# athlete-share-cards-mapa — modelos de card com trajeto GPS

**Tamanho:** M · **Trilha:** Full (dado sensível de localização saindo da plataforma; depende de
change legal)
**Status:** desbloqueada em 2026-11-09 (três dependências em `develop` e `main`); DoR em andamento
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-front` (só front: cor única na v1, decisão do founder 2026-11-09)

> **Depende de:** `add-activity-gps-trace` (dado, mergeada 2026-11-08), `athlete-share-cards`
> (tela, frame, assinatura, atribuição, exportação) e `lgpd-trajeto-cards-compartilhamento`
> (Política + aviso). **Não lançar antes das três estarem em `develop`.** Critério de parada: só
> entra se `athlete-share-cards-extra` medir ≥ 10% de atletas ativos com card em 8 semanas.

## Why

O trajeto é o elemento mais reconhecível dos cards do Strava e do Garmin. Sem ele, o card do
Menthoros parece incompleto para quem já usa esses apps. Com `gpsTrace` disponível e a base legal
resolvida, faltam só os dois modelos.

## Escopo

1. **Rota** (story): trajeto em tela cheia em cor única com brilho, início e fim marcados, km em
   destaque, três métricas em vidro, assinatura e atribuição Garmin. Zonas de FC ficam para depois.
2. **Stickers sobre foto** (story): foto do atleta (câmera ou galeria) com adesivos arrastáveis:
   distância, selo de aderência, trajeto em círculo de vidro e assinatura. A atribuição Garmin fica
   **dentro** do adesivo de dados, para não poder ser separada dele.
3. **Trajeto completo**, incluindo início e fim. Decisão de produto registrada em
   `lgpd-trajeto-cards-compartilhamento`.
4. **Aviso LGPD** antes do primeiro card com mapa, implementado na change legal; esta change só
   garante que a tela chama o gate antes de gerar a imagem.
5. **Sem GPS:** quando `gpsTrace` é nulo, os dois modelos não aparecem no seletor.

## Fora do escopo

- Mapa de fundo com ruas (tiles). Só a linha.
- Ocultar/cortar início e fim.
- Trajeto de fontes não-Garmin (vem pelo mesmo campo quando a ingestão delas gravar).

## Critérios de aceite

**CA1 — Rota**
> **Dado** um treino com `gpsTrace`
> **Quando** o modelo Rota é gerado
> **Então** o trajeto aparece em cor única (`primary`), com início e fim marcados, km em destaque, três
> métricas, assinatura e atribuição Garmin quando a fonte é Garmin. As zonas de FC ficam fora da v1,
> por decisão do founder em 2026-11-09.

**CA2 — Sem GPS**
> **Dado** um treino com `gpsTrace` nulo
> **Quando** a tela de compartilhar abre
> **Então** Rota e Stickers não aparecem no seletor.

**CA3 — Gate LGPD**
> **Dado** um atleta que nunca confirmou o aviso de trajeto
> **Quando** ele escolhe Rota ou Stickers e toca em um destino
> **Então** o aviso da change legal aparece antes da geração; só após confirmar a imagem é gerada.

**CA4 — Stickers**
> **Dado** uma foto escolhida pelo atleta
> **Quando** ele arrasta os adesivos e toca em Salvar
> **Então** o PNG contém a foto com os adesivos na posição final; o adesivo de dados contém a
> atribuição Garmin quando a fonte é Garmin.

**CA6 — Sem consentimento não há imagem com mapa**
> **Dado** um atleta sem consentimento concedido, com Rota ou Stickers selecionado
> **Quando** ele toca em Compartilhar ou Salvar
> **Então** o aviso abre, nenhum PNG é capturado, e "Usar modelo sem mapa" troca para um modelo sem
> trajeto. Trocar de modelo durante uma geração em andamento também não captura o mapa.

**CA7 — Foto normalizada**
> **Dado** uma foto de celular com orientação EXIF e 12 MP
> **Quando** o atleta a escolhe para o Stickers
> **Então** a prévia e o PNG saem na orientação correta, e a foto é reduzida a no máximo 2160 px no
> lado maior antes de entrar no card.

**CA5 — Fidelidade do trajeto**
> **Dado** um `gpsTrace` com ~400 pontos
> **Quando** a Rota é desenhada
> **Então** o traçado cabe no card com margem, mantém a proporção (tolerância de 1%) e começa e
> termina nos pontos reais do trajeto. Pontos coincidentes ou trajeto reto não geram `NaN`.

## Métrica de sucesso

- Rota e Stickers somados ≥ 40% dos cards gerados. **Sem fonte de dado hoje**: o evento de
  compartilhamento está em `athlete-share-data`. Até lá, o sinal possível é a contagem de eventos
  `CONCEDIDO` em `tb_usuario_trajeto_share_consent`. Revisão: 2026-12-15.
- Zero reclamação de titular sobre localização nos 90 dias após o lançamento (mesma métrica da
  change legal).

## Open Questions & Assumptions

- **Q1 — Projeção.** Equirretangular simples com correção `cos(lat média)` basta na escala de um
  card; confirmar visualmente com um trajeto real perto do equador e outro no sul.
- **Q2 — Arrastar adesivos no mobile.** Pointer events nativos ou `@dnd-kit` (já usado no editor
  de etapas do coach?). Verificar antes de adicionar dependência.
- **Premissa:** a foto nunca sai do dispositivo; a composição é feita no cliente e só o PNG final é
  compartilhado.

## Riscos e mitigações

- **Lançar sem a change legal** → exposição de localização sem cobertura na Política. Mitigação:
  status "bloqueada" e gate em CA3; `/pr` desta change deve checar que as três dependências estão
  em `develop`.
- **Contraste da rota sobre foto** (Stickers). Mitigação: o trajeto fica dentro do círculo de vidro
  escuro (`rgba(10,22,40,0.45)` + blur), nunca direto sobre a foto.
- **Pendências do Full track:** `product-reviewer` e pre-mortem não rodaram; task 0.
