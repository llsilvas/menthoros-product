# Design — athlete-share-cards-mapa

Dependências em `develop` e em `main` desde 2026-11-09: `add-activity-gps-trace` (#227),
`athlete-share-cards` (#210) e `lgpd-trajeto-cards-compartilhamento` (#228/#212). O critério de
parada (≥ 10% de adoção) foi dispensado pelo founder em 2026-11-08.

## D1 — Projeção (Q1)

Equirretangular com correção `cos(latitude média)`:

- `x = lng × cos(lat̄)`, `y = −lat`;
- escala única, a menor de `largura / Δx` e `altura / Δy`, para não distorcer a proporção;
- centralizado no viewBox com margem de 8%.

Na escala de uma corrida (poucos km), o erro contra Mercator é desprezível. O primeiro e o último
ponto do desenho são os reais (CA5). A polyline do backend já vem simplificada (Douglas-Peucker, ≤ 400
pontos), então o front não simplifica de novo.

## D2 — Arrastar adesivos (Q2)

**Pointer events nativos, sem dependência nova.** O `@dnd-kit` do projeto serve para reordenar
listas no editor de etapas e não para posicionamento livre. Arrastar um adesivo dentro de um
retângulo é `pointerdown`, `setPointerCapture`, `pointermove` e `pointerup`. A posição fica em
percentual do card, presa entre 0 e 100 menos o tamanho do adesivo, para não sair da imagem.
Também dá para mover com o teclado: com o adesivo focado, as setas movem 2%.

## D3 — Zonas de FC por ponto (achado do DoR em 2026-11-08)

O atleta **não recebe os limites das próprias zonas de FC**. O `/atletas/me/metricas/zonas` traz só
a distribuição de tempo por zona; os limites existem apenas em `/coach/atletas/{id}/zonas`
(`TECNICO`/`ADMIN`), com Z1 a Z6.

- Endpoint novo no backend: **`GET /api/v1/atletas/me/zonas/fc`** (`ATLETA`). Devolve só as faixas de
  FC efetivas, `[{ zona: "Z1", fcMin, fcMax }]`, vindas do mesmo serviço usado pelo coach
  (`CoachAthleteZonesService.buscarZonas`, com o atleta resolvido pelo token). **Não expõe** âncoras,
  ajuste de fadiga nem modos, que são dados de trabalho do treinador.
- O tema só tem cores de Z1 a Z5. **Z6 é desenhada com a cor de Z5**, e a legenda mostra "Z5+".
- **Sem zonas cadastradas, ou eixo FC indisponível:** o traçado sai numa cor só (`primary`), sem
  legenda. O card continua válido, apenas não colore por zona. Ponto sem FC usa `text-secondary`,
  como diz o CA1.
- Classificação: um ponto pertence à primeira zona cuja faixa contém sua FC. Abaixo de Z1 conta
  como Z1 e acima da última conta como a última.

## D4 — Gate de consentimento (CA3)

- Os modelos `rota` e `stickers` são **modelos com mapa**. Para eles, o `useShareImage` não gera
  blob enquanto o consentimento não for concedido (`useTrajectoryShareConsent().granted`). A prévia
  aparece na tela, porque não sai do aparelho.
- Sem consentimento, os botões Compartilhar e Salvar ficam habilitados, mas o clique abre o
  `TrajectoryShareConsentDialog` (com "Usar modelo sem mapa", que troca para o primeiro modelo sem
  mapa) **em vez de** compartilhar.
- Ao confirmar, o blob é gerado e o atleta toca no destino de novo. Compartilhar no mesmo toque não
  funciona: o iOS exige ativação de usuário recente, e a geração leva um tempo. O botão mostra
  "Gerando imagem…" e depois volta a ficar disponível.
- Revogar no perfil desliga o mapa na hora, porque o estado é lido do servidor a cada vez que a tela
  abre.

## D5 — Stickers sobre foto

- `<input type="file" accept="image/*">`. A foto vira um object URL num `<img>` com
  `object-fit: cover` dentro do frame Story. **Nunca é enviada ao servidor.** O `html-to-image`
  rasteriza o `<img>` local, que tem a mesma origem.
- Adesivos: distância, trajeto num círculo de vidro escuro (`alpha(surface[900], 0.55)`, sem
  `backdrop-filter`, que não exporta) e assinatura. **A atribuição Garmin fica dentro do adesivo de
  distância**, para não poder ser separada dele (guideline Garmin). O adesivo de aderência não entra:
  depende do planejado, e o card Plano já cobre esse caso.
- Sem foto escolhida, o card mostra um estado vazio com "Escolher foto". Salvar e Compartilhar ficam
  desabilitados até haver foto.
- O object URL é revogado ao trocar de foto e ao desmontar a tela.

## D6 — Dados

- `temTrajeto` (já no `TreinoRealizadoDto`) decide se os modelos com mapa entram no seletor (CA2).
  O `getTrajeto(id)` só é chamado nesse caso.
- `useShareWorkout` passa a buscar o trajeto e as zonas de FC em paralelo quando `temTrajeto` for
  verdadeiro. Se algum dos dois falhar, os modelos com mapa somem e os demais continuam: o mapa é
  aditivo e não pode derrubar a tela.
- Adapter puro `buildRouteFromGpsTrace(trace, zonasFc)` → `{ pontos: [x, y][], segmentos: { zona,
  d }[], zonasPresentes, inicio, fim }` no viewBox. O componente só desenha.

## Fora do escopo (confirmado)

Tiles de mapa (ruas), corte de início e fim, trajeto de fontes que não são Garmin.

## Testes

- Adapter: proporção preservada (Δx/Δy do desenho = Δx/Δy projetado), primeiro e último ponto,
  classificação por zona, Z6 → Z5, sem zonas → cor única, ponto sem FC.
- Componentes: Rota com legenda; Stickers com estado vazio e arrastar por teclado; seletor sem
  `temTrajeto` (CA2); gate (CA3), em que o clique sem consentimento abre o aviso e não compartilha, e
  "sem mapa" troca o modelo (CA4 da change legal).
- Backend: `@WebMvcTest` e auth do `/me/zonas/fc` (ATLETA 200, TECNICO 403) e unit do mapeamento.
- E2E: treino com GPS → Rota → Salvar abre o aviso → confirmar → Salvar baixa o PNG 1080×1920;
  treino sem GPS não lista Rota nem Stickers.
