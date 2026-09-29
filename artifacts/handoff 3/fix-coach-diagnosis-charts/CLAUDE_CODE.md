# Como o Claude Code usa este pacote

## 1. Colocar no workspace

Descompacte o zip na raiz do workspace (onde ficam `apps/menthoros-front` e `menthoros-product`):

```
fix-coach-diagnosis-charts/
  openspec/changes/fix-coach-diagnosis-charts/   → mover para menthoros-product/openspec/changes/
  menthoros-front/src/**                          → arquivos novos/substitutos (não copiar às cegas; ver abaixo)
  PATCHES.md                                      → edições por trecho
  design/                                         → referência visual (abrir o .dc.html no navegador)
```

Mover a change para `menthoros-product/openspec/changes/` é a promoção do Gate-3 — só com o OK do founder.

## 2. Prompt para colar no Claude Code

```
Implemente a change OpenSpec fix-coach-diagnosis-charts no apps/menthoros-front.

Material em ./fix-coach-diagnosis-charts/:
- openspec/changes/fix-coach-diagnosis-charts/{proposal,design,tasks}.md e specs/ — escopo e regras
- menthoros-front/src/** — implementação proposta, escrita contra develop em 28/09; compare com
  o arquivo atual antes de substituir (se o arquivo mudou desde então, faça merge, não sobrescreva)
- PATCHES.md — edições por trecho em coachInboxAdapters.ts e CoachInboxPage.tsx
- design/Revisao Graficos Atleta.dc.html e design/proposta.png — referência visual (seção
  "Topo e linha de KPIs" e "Proposta"); é HTML de referência, não código para copiar

Siga o CLAUDE.md do front (tokens, adapters puros, sem hex literal, PT-BR na UI).
Trabalhe pelo tasks.md na ordem, marcando cada item. Ao final rode
npm run lint && npm run build && npm run test:run e corrija o que quebrar.
Reporte no formato do Delivery Checklist do CLAUDE.md, incluindo os pontos de "Não validado"
do README do pacote.
```

## 3. O que ele deve conferir (não validado aqui)

- `recharts@3.8`: `ReferenceArea` em eixo categórico e `ticks` explícitos
- Expectativas de `adherence` em `coachInboxAdapters.test.ts`
- Seletores de tiles em `CoachInboxPage.test.tsx` → `kpi-*` / `inbox-proxima-prova`
- Unidade de `totalPlanejado` (assumido: treinos)

## 4. Rodada v2 (sobre a versão já implementada)

Se a primeira rodada já foi aplicada, use só o `PATCH-v2.md`:

```
Aplique ./fix-coach-diagnosis-charts/PATCH-v2.md sobre o estado atual do apps/menthoros-front.
Os trechos "Substituir/Por" foram escritos contra a working copy de 29/09; se o texto não bater,
localize o equivalente e faça a mesma mudança. Copie DiagnosisChartCard.tsx e PmcChartControls.tsx
do pacote. Para o PMCChart, faça merge das mudanças descritas (não sobrescreva).
Adicione os testes da seção 1e, ajuste fixtures de DataGap (kind) e os testes de adherenceTone.
Rode lint, build e test:run; confira no navegador o atleta com lacuna de 15/07 a 14/09.
```
