# Proposal: alinhar-icones-marca-front

**Tamanho:** S · **Trilha:** Fast (um repositório, só assets e um teste; sem contrato de API, sem schema,
sem código de aplicação além do teste)

## Why

Em 2026-11-01 o founder decidiu usar o **logo oficial** (`logo.png`, 680×456, rinoceronte em gradiente
lima `#D8E52F`→`#97C21E`, nome em prata `#DBDDDD`) em todo material. Instagram e vault já foram
alinhados (`menthoros-brain`, `60-Growth/assets/logo-menthoros.png`). No front, a **landing já usa o
logo oficial** (`src/assets/landing/logo.png` tem o mesmo hash do arquivo oficial). O resto do app usa
**ícones quadrados derivados, só com o rinoceronte**, cuja origem não foi confirmada: eles parecem o
mesmo desenho, mas com lima mais chapado e linhas brancas, e o rinoceronte tem proporção diferente.

Sete arquivos estão em uso:

| Arquivo | Dimensão | Onde aparece |
|---|---|---|
| `src/assets/icons/menthoros_mark.png` | 222×174 | `LoginPage`, `CoachSidebar` |
| `src/assets/icons/menthoros_navbar.png` | 130×130 | `DashboardLayout` |
| `src/assets/icons/menthoros_favicon.png` | 222×222 | `index.html` (aba do navegador) |
| `public/icons/apple-touch-icon-180.png` | 180×180 | `index.html` (iOS) |
| `public/icons/icon-192.png` | 192×192 | manifest PWA |
| `public/icons/icon-512.png` | 512×512 | manifest PWA |
| `public/icons/icon-512-maskable.png` | 512×512 | manifest PWA (maskable) |

Um ícone quadrado pequeno **sem** o nome é a escolha certa nesses tamanhos: a linha "AI COACHING" fica
ilegível abaixo de ~88px de altura. O que se quer é que o rinoceronte desses ícones seja o do logo
oficial, não uma variante antiga.

## What Changes

1. **Gate de decisão (task 0.1) antes de gerar qualquer coisa:** confirmar com quem criou os ícones se
   eles já saíram do logo oficial. Se sim, a change **fecha sem mudar arquivo** (só registra a
   conferência). Se não, segue.
2. Regerar os 7 arquivos a partir do rinoceronte do logo oficial (região x 87–590, y 0–245 do PNG,
   504×246 px), **mantendo caminho, nome e dimensão** de cada um, de modo que `index.html`, o manifest
   do `vite.config.ts` e os imports não mudem.
3. Teste de Vitest que lê o cabeçalho PNG dos 7 arquivos e falha se a dimensão divergir do declarado
   (barra regressão silenciosa de asset).

## Non-goals

- Trocar o logo da landing (já é o oficial).
- Mexer no logo da **assessoria** (white-label, `useLogoAssessoria`, `/api/v1/assessorias/me/logo`):
  é outro conceito, enviado pelo treinador.
- Remover os arquivos órfãos (`logo_menthoros.svg` 683 KB, `logo_menthoros_128x128.png`,
  `logo_transparent.png`, `menthoros_icon.png`; nenhum é importado em `src`, só `menthoros_icon.png`
  aparece em `src/index.md`). Limpeza é outra change, se desejada.
- Mudar o lima dos tokens (`#BDDE5A` em `activeTheme.ts`): fica como lima chapado de texto e CTA.
- Criar uma versão vetorial ou monocromática do logo (depende de designer).

## Impact

- Frontend: 7 PNGs substituídos e 1 arquivo de teste novo. Nenhuma linha de código de aplicação.
- O `vite-plugin-pwa` faz precache de `png`; ícone novo entra no próximo build. Quem já instalou o PWA
  só vê o ícone novo quando o navegador revalidar o manifest; sem ação necessária.
- Sem mudança para o treinador no fluxo; mudança visual de marca.

## Critérios de aceite

- **CA1 — Dimensões preservadas.** Given os 7 arquivos regenerados, When o teste lê o cabeçalho de
  cada PNG, Then a largura e a altura são exatamente as da tabela acima.
- **CA2 — Rinoceronte do logo oficial.** Given cada ícone regenerado, When comparado com o recorte do
  logo oficial, Then o desenho é o mesmo (verificação visual lado a lado registrada na task 2.2; não
  automatizável de forma barata).
- **CA3 — Legível no menor tamanho.** Given o favicon em 32×32 e o navbar em 40px, When vistos sobre o
  fundo escuro do app, Then o contorno do rinoceronte é reconhecível. Se não for, a change para e
  pede um ícone compacto ao designer (task 1.2), em vez de entregar um ícone ruim.
- **CA4 — Maskable na zona segura.** Given `icon-512-maskable.png`, When o conteúdo é medido, Then todo
  pixel não transparente cabe no círculo central de diâmetro 410 px (80%).
- **CA5 — Sem regressão.** Given o app construído, When roda `npm run lint && npm run build &&
  npm run test:run`, Then tudo passa; e o spec E2E do PWA (`tests/e2e/pwa`) continua passando.

## Métrica de sucesso

7 de 7 ícones derivados do logo oficial e verificados (CA1–CA4). É uma change de marca: **não otimiza a
rotina do treinador** e não tem métrica de tempo; declarado de propósito, porque a regra do produto
pede métrica ligada ao treinador e esta não se liga.

## Rollback

Reverter o commit (os PNGs antigos voltam) e redeployar o front. Sem estado, sem migration.

## Open Questions & Assumptions

- **A1 (não verificada):** os 7 ícones atuais podem já ter saído do logo oficial. Por isso a task 0.1 é
  um gate: se já saíram, não há o que fazer.
- **A2 (risco de design):** o rinoceronte do logo tem proporção 2:1 (504×246). Num quadrado, ele ocupa
  cerca de 80% da largura e 40% da altura; no favicon de 32 px sobram ~26×13 px. O ícone atual pode ser
  uma versão **compacta e proposital** (222×174, proporção 1,28), e trocar por um recorte do logo
  pioraria a leitura. Se o CA3 falhar, o caminho é pedir ao designer um mark compacto, não recortar.
- **A3 (ferramenta):** gerar os PNGs preservando o canal alfa. O `sips` do macOS pode não preservar
  transparência ao preencher; o ambiente não tem biblioteca de imagem (sem PIL, sem `sharp`). **Não
  adicionar dependência ao projeto** para isso (regra do repo); usar ferramenta local fora do
  `package.json` ou pedir o export ao designer.
- **A4:** `public/icons/icon-512-maskable.png` e `apple-touch-icon-180.png` hoje podem ter fundo
  sólido (o iOS não aceita alfa no touch icon, aplica preto). Conferir o fundo atual e manter o mesmo
  tratamento.
- **Aberta:** o founder aprova a troca visual depois de ver os ícones novos ao lado dos atuais (task 2.2).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Ícone recortado fica ilegível em 32 px (A2) | CA3 como gate; sem aprovação visual não segue; pedir mark compacto |
| Perder transparência ou ganhar fundo preto (A3/A4) | Conferir o canal alfa de cada arquivo antes e depois; manter o fundo atual do touch icon e do maskable |
| Trocar um ícone compacto proposital por um pior (A1/A2) | Task 0.1 antes de gerar; comparação lado a lado na 2.2 |
| Cache do navegador mostra o favicon antigo | Esperado; o hash de build do Vite não cobre `public/`; avisar no teste manual (hard refresh) |

## Referências

- `menthoros-brain/60-Growth/assets/logo-menthoros.png` (logo oficial) e a seção "Logo" de
  `60-Growth/Prompt de Identidade Visual.md`.
- `apps/menthoros-front/vite.config.ts` (manifest PWA) e `index.html` (favicon e touch icon).
