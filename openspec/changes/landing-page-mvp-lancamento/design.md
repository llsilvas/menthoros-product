# Design — landing-page-mvp-lancamento

Fonte visual: canvas <https://claude.ai/code/artifact/c862932f-7228-437c-bc61-74d478aa4dd6>, Opção A,
página inteira ("Landing · Opção A"). Este documento traduz decisões do mockup estático para o
comportamento que o React precisa ter — a prancheta fixa pixels para uma viewport; o código não pode.

## D1 · Hero: altura fluida, não px fixo

O canvas centraliza o bloco de texto+card do hero fixando `width: 1237px; height: 617px` — isso é o
editor congelando o resultado visual para a viewport em que foi ajustado (1366×768). Em código, o
equivalente correto é:

```tsx
<Box sx={{
  minHeight: { md: 'calc(100vh - var(--nav-height, 90px))' },
  display: 'flex',
  alignItems: 'center',
}}>
  {/* grid de duas colunas: texto+CTA | card Fila de Atenção */}
</Box>
```

`--nav-height` é a altura real da `Nav` (hoje `py: stuck ? 1.5 : 2.75` variável — usar a altura
"stuck", que é o estado estável após o primeiro scroll, ou medir via `ResizeObserver` se precisar
exatidão). Isso preserva a centralização vertical em 768px, 900px e 1080px de altura de viewport, ao
contrário de um valor fixo que só serve para uma.

Abaixo de `md`, o hero não centraliza (mobile já é scroll natural) — replica o `heroMob` da
prancheta, que usa `padding-bottom` em vez de altura fixa.

**Mismatch no primeiro paint (achado do pré-mortem):** a nav carrega no estado "não-stuck" (mais
alta) e só encolhe após o primeiro scroll — se `--nav-height` usar o valor "stuck" desde o início, o
`calc()` do hero fica levemente errado no load inicial (antes do usuário rolar). Duas saídas: (a)
fixar `--nav-height` no valor "stuck" mesmo antes do scroll (a nav já reserva esse espaço, só não
pinta o fundo/blur até rolar — resolve sem JS extra), ou (b) medir a nav real via `ResizeObserver` e
aceitar um reflow de poucos px no primeiro frame. Preferir (a): é mais simples e o erro do `calc()` é
pequeno o suficiente para não mover o CTA para fora da viewport.

**Viewport curto (achado do pré-mortem):** `minHeight: calc(100vh - nav)` com `alignItems: center`
garante centralização, mas não garante que o conteúdo caiba — numa janela baixa (1366×600) ou com
zoom de browser alto, o bloco de texto+card pode ficar mais alto que o espaço disponível. Estratégia:
o `Box` do hero não deve ter `overflow: hidden` (deixa o conteúdo esticar a seção para baixo se
precisar, empurrando `Pain` mais abaixo, em vez de cortar o título ou o CTA); testar explicitamente em
1366×600, zoom 150–200% simulado (reduzir a altura da viewport de teste proporcionalmente), e
390×844 landscape (844×390) — não só os três tamanhos "retrato" da prancheta.

## D2 · Vídeo como fundo do hero

Estrutura (mock em `Main.dc.html`):

```
<hero position:relative>
  <video/poster position:absolute inset:0 object-fit:cover />
  <div overlay gradiente horizontal (mais escuro à esquerda, onde fica o texto) />
  <div overlay gradiente vertical (funde topo e base no navy) />
  <nav position:relative z-index:2 />
  <conteúdo position:relative z-index:2 />
</hero>
```

O degradê horizontal é mais forte que o vertical que a `VideoShowcase` atual usa (que só funde a
base) — necessário porque agora o texto fica *sobre* o vídeo, não abaixo dele. Object-position do
vídeo: `70% 20%` no desktop (mantém o rosto do atleta visível à direita, fora da área de texto),
ajustar no mobile onde o texto ocupa a largura toda (`heroMob` da prancheta usa overlay mais opaco em
vez de reposicionar).

**Poster:** gerar um frame real do vídeo (não uma imagem genérica) — o helper de seed usado na
prancheta capturou o frame em `t=2.6s` via canvas; reproduzir isso (ou similar) como parte do
reencode, não como asset desenhado à mão.

## D3 · Reencode do vídeo

`showcase.mp4` atual: 3,2 MB, `ftyp`/`moov` depois do `mdat` (confirmado via inspeção de atoms) — sem
faststart, o browser precisa baixar o arquivo inteiro antes de decodificar o primeiro frame.

```bash
ffmpeg -i showcase-original.mp4 -movflags +faststart -vf scale=-2:720 -c:v libx264 -crf 23 \
  -c:a aac -b:a 96k showcase.mp4
```

Meta: ~1 MB, 720p. Validar visualmente antes de substituir o asset em `src/assets/landing/`.

## D4 · Seções abaixo da dobra — vocabulário reaproveitado, não novo

Todos os componentes novos (marca de seção, pílulas de passo, cards de plano) reaproveitam o padrão
"rótulo mono + valor" que já existe no card `AttentionQueue` (`ProductUI.tsx:39-76`) e no
`InterpretationCard` (`ProductUI.tsx:79-113`) — mesma família tipográfica, mesmo `radius.inner`/
`radius.outer`, mesma borda `divider`. Não introduzir um sistema visual paralelo.

`SectionMark` (`primitives.tsx:805-828`) muda de duas linhas empilhadas (`§ NN — rótulo` em cima,
numeral vazado embaixo) para numeral + rótulo na mesma linha (`display: flex; align-items: baseline`)
— elimina a duplicação do número.

## D5 · Seção "Planos e preços" — grid responsivo

5 cards em `repeat(5, minmax(0, 1fr))` no desktop, 1 coluna empilhada no mobile — mesmo padrão de
`grid-template-columns` usado em `Pain`/`HowItWorks` (`sections.tsx`), só com 5 colunas em vez de 3.
O card `Basic` ganha `border: 1px solid primary.main` (mesmo tratamento que a caixa "TREINADOR
DECIDIU" em `Delta`, `sections.tsx:426`) e um badge posicionado com `position: absolute; top: -11px`
— cuidado com `overflow: hidden` em containers pais, que cortaria o badge.

## D6 · Formulário — validação de consentimento no submit

Hoje (`AccessForm.tsx:1040`): `disabled={submitting || !aceiteLgpd}` — o botão nasce desabilitado.

Mudar para: botão habilitado sempre (exceto `submitting`). `aceiteLgpd: boolean` entra como parâmetro
de `validate(nome, email, qtdAtletasRaw, aceiteLgpd)` em `accessFormValidation.ts`, e `AccessFormErrors`
ganha o campo `aceiteLgpd?: string`. **Decisão do pré-mortem:** isso não pode ser uma checagem local no
componente (`if (!aceiteLgpd) ...` solto no `handleSubmit`) — o `disabled={!aceiteLgpd}` atual garantia,
de graça, que nenhum caminho de submit (clique no botão, Enter em qualquer campo do form) passasse sem
consentimento; mover a garantia para "erro no submit" só preserva essa invariante se a validação for a
mesma função pura já testada para os outros campos, chamada no único `handleSubmit` do form (que já
cobre Enter, já que é o handler de `onSubmit` do `<form>` — não há necessidade de listener extra por
campo). Erro exibido abaixo do checkbox, mesmo estilo do `helperText` dos `TextField`. Não chamar
`inscrever(...)` enquanto `errors` tiver qualquer chave, incluindo `aceiteLgpd`.

## D7 · Link fora do label — mesmo padrão já documentado

`CLAUDE.md` do front já registra esse bug e a correção (seção "Component Standards", referência
`CoachConsentDialog.tsx`). Aplicar o mesmo padrão em `AccessForm.tsx:1022-1031`: `FormControlLabel`
só com o texto do consentimento; o link vira um `Link` irmão, fora do `label`, com seu próprio
`onClick`/`href` de navegação.

## D8 · Fora de escopo por falta de dado

O bloco de 3 fatos (prova social) na seção Confiança, esboçado na prancheta com `[N]`, **não entra
no código** nesta change — ver Non-Goals no `proposal.md`. Se o founder trouxer números reais antes da
implementação, é um adendo pequeno a este design, não uma nova change.
