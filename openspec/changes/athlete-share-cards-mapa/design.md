# Design — athlete-share-cards-mapa

Dependências em `develop` e em `main` desde 2026-11-09: `add-activity-gps-trace` (#227),
`athlete-share-cards` (#210) e `lgpd-trajeto-cards-compartilhamento` (#228/#212). O critério de
parada (≥ 10% de adoção) foi dispensado pelo founder em 2026-11-08.

## Decisões do founder (2026-11-09)

- **Rota e Stickers** entram nesta change.
- **Traçado em cor única na v1** (`primary`). As zonas de FC ficam para uma change futura, que vai
  precisar do endpoint de zonas do atleta. Sem isso, **esta change é só front** e não tem backend.

## D1 — Projeção (Q1)

Equirretangular com correção `cos(latitude média)`:

- `x = lng × cos(lat̄)`, `y = −lat`;
- escala única, a menor de `largura / Δx` e `altura / Δy`, para não distorcer a proporção;
- centralizado no viewBox com margem de 8%.

- **Extensão zero** (pontos coincidentes, ou trajeto em linha reta só vertical ou só horizontal):
  quando `Δx` ou `Δy` é 0, a escala vem do outro eixo. Quando os dois são 0, o desenho é um ponto no
  centro. Nunca há divisão por zero nem coordenada `NaN`. Achado do Codex.
- Menos de 2 pontos decodificados: os modelos com mapa não entram no seletor.

Na escala de uma corrida, o erro contra Mercator é desprezível. O primeiro e o último ponto do
desenho são os reais (CA5). A polyline já vem simplificada do backend.

## D2 — Arrastar adesivos (Q2)

**Pointer events nativos, sem dependência nova.** O `@dnd-kit` do projeto serve para reordenar listas.

- O adesivo usa `touch-action: none`, para o navegador não assumir rolagem no meio do gesto.
- `pointerdown` chama `setPointerCapture`, `pointermove` move e `pointerup` encerra. **`pointercancel` e
  `lostpointercapture` também encerram o arraste**, para o adesivo não ficar preso em estado de
  arraste. Achado do Codex.
- Posição em percentual do card, presa dentro dos limites da imagem.
- Teclado: com o adesivo focado (`tabIndex=0`, `aria-label` com a posição), as setas movem 2%.

## D3 — Cor do traçado

Cor única `primary[500]`, com uma linha de brilho mais larga e translúcida por baixo. Não há legenda
de zonas. Início e fim são marcados por pontos discretos: círculo vazado no início, cheio no fim.

## D4 — Gate de consentimento (CA3)

- `rota` e `stickers` são **modelos com mapa**.
- **Invariante: nenhum PNG com mapa é capturado sem consentimento concedido.** O `useShareImage`
  recebe um `podeCapturar()` lido de uma ref atualizada a cada render (modelo atual com mapa e
  `granted` falso → falso). Ele é **consultado imediatamente antes do `toBlob`**, depois do
  `document.fonts.ready`. A geração também confere se ainda é a vigente **antes** da captura, e não só
  depois. Achado do Codex: uma geração antiga, iniciada num modelo sem mapa e ainda esperando as
  fontes, não pode capturar o DOM que já trocou para Rota.
- Sem consentimento, Compartilhar e Salvar ficam habilitados para o modelo com mapa, mas o clique
  abre o `TrajectoryShareConsentDialog`. "Usar modelo sem mapa" troca para o primeiro modelo sem mapa.
  "Entendi, compartilhar" concede; o blob é gerado e o atleta toca no destino de novo, porque o iOS
  exige ativação recente.
- A prévia aparece mesmo sem consentimento, porque não sai do aparelho.

## D5 — Stickers sobre foto

- `<input type="file" accept="image/*">`. A foto **nunca é enviada ao servidor**.
- **Normalização antes de usar** (achados do Codex): a foto é decodificada com
  `createImageBitmap(file, { imageOrientation: 'from-image' })`, que aplica a orientação EXIF, e
  redesenhada num canvas com o lado maior limitado a 2160 px. O resultado vira um **data URL JPEG**.
  - Corrige a orientação de fotos de celular.
  - Limita a memória no iOS (uma foto de 12 MP rasterizada em `pixelRatio 3` estoura).
  - Elimina o problema do `cacheBust` do `html-to-image`, que acrescenta query também a `blob:` URLs
    e quebra o fetch. Data URL não passa por fetch.
  - Falha na decodificação mostra "Não deu para usar esta foto — tente outra".
- O `useShareImage` passa a usar **`cacheBust: false`**. A única imagem remota possível é a fonte do
  Google, que não precisa disso.
- Adesivos:
  - distância, com a **atribuição Garmin dentro dele** (guideline Garmin: não pode ser separada);
  - trajeto num círculo escuro (`alpha(surface[900], 0.55)`, sem `backdrop-filter`);
  - assinatura da assessoria, quando ligada;
  - sem adesivo de aderência.
- Sem foto: estado vazio com "Escolher foto", e os destinos ficam desabilitados.

## D6 — Dados

- `temTrajeto` decide se os modelos com mapa entram no seletor (CA2). O `getTrajeto(id)` só é
  chamado nesse caso e roda em paralelo com o resto do `useShareWorkout`.
- Se o trajeto falhar, os modelos com mapa somem e os demais continuam: o mapa é aditivo e não pode
  derrubar a tela.
- Adapter puro `buildRouteFromGpsTrace(trace, viewBox)` → `{ d, inicio, fim, pontos }` ou `null`
  quando houver menos de 2 pontos.

## Rollback

Só front, sem migration nem endpoint. Reverter o PR remove os dois modelos; o consentimento e a
Política da change legal ficam como estão.

## Fora do escopo

Zonas de FC no traçado (change futura, com endpoint de zonas do atleta), tiles de mapa, corte de
início e fim, adesivo de aderência, trajeto de fontes que não são Garmin.

## Testes

- Adapter: proporção preservada (Δx/Δy do desenho = Δx/Δy projetado, tolerância 1%); primeiro e
  último ponto; extensão zero vertical, horizontal e ponto único sem `NaN`; menos de 2 pontos → `null`.
- `useShareImage`: troca de modelo durante `fonts.ready` não captura (gate e geração vigente);
  `podeCapturar` falso → sem blob.
- Componentes: Rota; Stickers com estado vazio, foto inválida e arrastar por teclado; seletor sem
  `temTrajeto` (CA2); clique sem consentimento abre o aviso e não compartilha; "sem mapa" troca o
  modelo.
- E2E (consentimento é fluxo crítico): treino com GPS → Rota → Salvar abre o aviso → confirmar → Salvar
  baixa PNG 1080×1920; treino sem GPS não lista Rota nem Stickers; Stickers com foto de fixture →
  Salvar baixa PNG.
