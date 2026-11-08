# athlete-share-cards-mapa — modelos de card com trajeto GPS

**Tamanho:** S · **Trilha:** Full (dado sensível de localização saindo da plataforma; depende de
change legal)
**Status:** proposta — bloqueada
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-front`

> **Depende de:** `add-activity-gps-trace` (dado, mergeada 2026-11-08), `athlete-share-cards`
> (tela, frame, assinatura, atribuição, exportação) e `lgpd-trajeto-cards-compartilhamento`
> (Política + aviso). **Não lançar antes das três estarem em `develop`.** Critério de parada: só
> entra se `athlete-share-cards-extra` medir ≥ 10% de atletas ativos com card em 8 semanas.

## Why

O trajeto é o elemento mais reconhecível dos cards do Strava e do Garmin. Sem ele, o card do
Menthoros parece incompleto para quem já usa esses apps. Com `gpsTrace` disponível e a base legal
resolvida, faltam só os dois modelos.

## Escopo

1. **Rota** (story): trajeto em tela cheia, cada trecho na cor da zona de FC do ponto (`zone-*`),
   brilho na linha, número de km em destaque, três métricas em vidro, legenda de zonas **com
   rótulo textual** (Z2–Z5), assinatura e atribuição Garmin.
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

**CA1 — Rota por zona**
> **Dado** um treino com `gpsTrace` e FC por ponto, e zonas cadastradas para o atleta
> **Quando** o modelo Rota é gerado
> **Então** cada segmento do trajeto tem a cor da zona da FC daquele ponto; pontos sem FC usam
> `text-secondary`; a legenda lista as zonas presentes com rótulo Z1–Z5.

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

**CA5 — Fidelidade do trajeto**
> **Dado** um `gpsTrace` com ~400 pontos
> **Quando** a Rota é desenhada
> **Então** o traçado cabe no card com margem, mantém a proporção (sem distorção lat/lng) e começa e
> termina nos pontos reais do trajeto.

## Métrica de sucesso

- Rota e Stickers somados ≥ 40% dos cards gerados (é o que os apps do nicho mostram que o atleta
  mais usa).
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
