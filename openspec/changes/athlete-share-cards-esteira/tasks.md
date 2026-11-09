# Tasks — athlete-share-cards-esteira

## 0. Gates

- [x] 0.1 DoR (2026-11-09): Codex → NOT READY. Incorporado: CA1 passa a exigir a escolha de "Esteira"
  (o modelo inicial é `availableModels[0]`, `ShareWorkoutView.tsx:38`); gate com coorte, ação
  contável (Salvar/Compartilhar, não a prévia) e tratamento de não respondentes (task 2.4).
  Conferido contra o código: `tssCalculado`, `fcMedia`, `distanciaKm`, `deviceName` existem em
  `TreinoRealizadoDto`; "Mostrar FC" já existe e é ligado por modelo na `versao` da imagem.
- [ ] 0.2 `add-activity-treadmill-flag` mergeada e em produção

## 1. Dados e card

Sequência: 1.1 → 1.2 → 1.3 → 1.4. Arquivos em `src/features/athlete/`.

- [x] 1.1 Tipos e adapter: `esteira?: boolean` em `TreinoRealizadoDto` (`src/types/TreinoManual.ts`);
  `ShareModel` ganha `'esteira'`, `TreadmillView` e `esteira: TreadmillView | null` em
  `ShareCardData` (`types/ShareCard.ts`); `buildEsteira(input)` em `adapters/buildShareCardData.ts`
  (mesma base de `buildRota`: `tipoTreinoLabel`, `dataLabel`, `formatarDuracao`, `paceDe`,
  `garminAttributionFor`), disponível só com `realizado.esteira === true`; ordem
  `plano, parciais, rota, stickers, esteira, semana`
  verify: casos novos em `adapters/buildShareCardData.test.ts` — CA1 (`esteira: true` lista o
  modelo; `false`/ausente não) e CA2 (sem `distanciaKm` → `destaque` é o tempo e `paceMedio`
  ausente; sem `tssCalculado`/`fcMedia` → campos ausentes)
- [x] 1.2 `components/share/TreadmillCard.tsx` (v2 I): selo "ESTEIRA" com SVG inline, atribuição
  Garmin (`GarminAttribution`), título, km em `displayNumberSx` (ou tempo, CA2), pace, blocos
  `ShareStat` TEMPO / FC MÉD / TSS que somem quando ausentes; tokens de `shareCardStyle`, sem hex.
  `SHARE_MODEL_DEFAULT_FORMAT.esteira = 'story'`; `MODEL_LABEL.esteira = 'Esteira'`
  (`ShareControls.tsx`)
  verify: `treadmillCard.test.tsx` — CA1 (selo, "10,0", "5:03", "GARMIN FORERUNNER 265"), CA3
  (`mostrarFc=false` some FC MÉD), CA4 (fonte MANUAL sem atribuição), CA2 (sem distância)
- [x] 1.3 `ShareWorkoutView.tsx`: render de `model === 'esteira'`, `descricaoDoCard` ("Card Esteira:
  …"), `mostrarFc` entra na `versao` também para `esteira`
  verify: teste de componente — alternar "Mostrar FC" no modelo esteira chama `toBlob` de novo
- [x] 1.4 Foto na esteira (CA7): `PhotoStickersCard` aceita `RouteView | TreadmillView` e troca o
  adesivo do trajeto pelo `TreadmillBadge`; adapter lista `stickers` para esteira sem GPS;
  `ShareWorkoutView` só pede consentimento quando há trajeto
  verify: teste de componente — Foto na esteira sem chamar `TrajetoShareConsentService.obter`,
  adesivo "esteira" com o selo, sem adesivo "trajeto"
- [x] 1.5 Validação (2026-11-09): `npm run lint` limpo, `npm run build` ok, `npm run test:run` 2993 verdes

## 2. E2E e verificação

- [ ] 2.1 `tests/e2e/athlete/share-workout-esteira.spec.ts` (CA5)
  verify: `npm run test:e2e` com o spec visitando o modelo
- [ ] 2.2 Verificação visual do PNG contra o artboard (fontes, corte)
- [ ] 2.3 Registrar a data do deploy em produção para o gate de 4 semanas
- [ ] 2.4 Gate (4 semanas após 2.3): SQL da coorte (`esteira = true`, fonte GARMIN, por atleta),
  pergunta única do founder a cada atleta, tabela atleta → sim/não/sem resposta e % final aqui.
  **Depende do founder**
