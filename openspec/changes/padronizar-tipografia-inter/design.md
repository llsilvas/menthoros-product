# Design: padronizar-tipografia-inter

## Contexto

Três temas MUI empilhados: `appTheme` (global, `App.tsx`) e dois temas **aninhados** que herdam dele
via `createTheme(appTheme, {...})`: `coachTheme` (`CoachLayout`) e `athleteTheme` (`AthleteLayout`).
Os aninhados foram a forma de tirar Syne do texto sem mexer no legado, quando o Non-goal das changes
anteriores proibia tocar o shell vizinho. Esta change é a primeira com mandato para os três.

## Decisões

### D1 — Corrigir na raiz (`appTheme`) e manter os temas aninhados

`appTheme.typography` passa a Inter em `fontFamily` e h1–h6. Os temas aninhados **continuam
existindo**: eles carregam a escala de tamanhos de cada shell, que esta change não mexe. Só a família
dos títulos neles muda para Inter.

Alternativa descartada: apagar `coachTheme`/`athleteTheme` e fundir tudo no global. Uniformizaria a
escala entre shells, o que é redesenho e está fora do escopo.

### D2 — `font.display` passa a Inter, sem renomear

O token `font.display` (`theme.premium.ts`) é consumido pelo `athleteTheme`. Trocar o valor do token
muda o atleta sem tocar os consumidores. O nome fica: "display" continua significando "família dos
títulos", que agora é Inter. A landing não usa `font.display` para família (usa `'Space Grotesk'`
literal e `landingTheme`), então não é afetada. **Verificar na task 1.1** com grep antes de trocar.

### D3 — Hierarquia por tamanho e peso

Sem a troca de família, título e corpo se separam por tamanho (escala atual) e peso: títulos h1–h3
em 700–800, h4–h6 em 600–700, corpo 400, label 500–600. É o que o protótipo faz (títulos 15–20px
600/700, corpo 12–13px 400/500).

### D4 — `tabular-nums` local, não global

Aplicar `fontVariantNumeric: 'tabular-nums'` no tema inteiro afetaria texto corrido sem ganho.
Aplica-se nas células numéricas (card e diálogo de zonas, tabelas de métricas que hoje usam Inter).
Onde já existe (23 pontos), nada muda.

### D5 — Carga de fontes no `index.html`

Remover `family=Syne` do link do Google Fonts **só depois** do grep da task 3.1 provar zero
consumidor fora de comentário. Inter passa a `wght@300;400;500;600;700;800`. Space Grotesk e JetBrains
Mono ficam (landing, waitlist, mono). O 300 fica porque `PlanoDetalhePanel` o usa.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Títulos em Inter perdem contraste com o corpo e a tela fica "plana" | D3: peso 700–800 nos títulos; revisão visual das telas principais na task 5.3 |
| Componente com `fontFamily` próprio via `t.typography.h6.fontFamily` ou constante local ainda resolve para Syne | Grep por `Syne` e por `typography.h[1-6].fontFamily` na task 3.1; smoke E2E de CA1 pega o que o grep perder |
| Remover Syne do `index.html` quebra alguma tela não coberta | Fallback da pilha cai em Inter; D5 só remove após grep zerado |
| Mudança de largura do texto estoura layout (Syne é mais larga que Inter, então o risco é o contrário: sobra espaço) | Smoke do atleta já verifica scroll horizontal em 390px; o smoke novo do coach também verifica |
| Teste que afirmava Syne é "consertado" para passar sem refletir decisão | Os testes mudam porque a spec muda; a mudança cita esta change no `it` |

## Pre-mortem

Revisão adversarial (Codex, 2026-11-04): **NOT READY** na primeira versão. Cinco achados, todos
conferidos no código e incorporados:

1. `PlanoDetalhePanel.tsx:528` usa `fontWeight: 300`; tirar o 300 do `index.html` faria a revisão de
   plano cair em peso sintetizado. → D5 mantém o 300.
2. "Sem Syne" não prova "Inter", e o smoke de referência roda com dados vazios. → CA1 exige Inter
   computada e carregada, com dados preenchidos na revisão e nas zonas.
3. A spec dizia "Inter em todo texto" e a proposta mantinha mono. → exceção mono explícita na spec e
   lista de consumidores no proposal (item 7), incluindo `Sparkline`.
4. O gate de 11px conflitava com tokens de gráfico de 9–10px (`theme.premium.ts:222-224`). → gate
   restrito às variantes de texto dos temas; tokens de gráfico em Non-goals.
5. `coachTheme.test.ts:57` afirma Syne literal no `appTheme.ts`. → task 1.2 inclui esse teste.

DoR (2026-11-04): spec-reviewer **NOT READY** (3 Important) e revisão cross-model via DeepSeek
(Codex sem cota) **NOT READY**. Os dois apontaram a mesma lacuna: a exceção mono não era
verificável por máquina. Incorporado:

- CA1 verifica a **primeira família computada** contra {Inter, JetBrains Mono}; a exceção mono se
  prova pela família, sem allowlist de componente. Qualquer outra (inclusive fallback de sistema
  vindo de portal ou widget de terceiro) falha, de propósito: é exatamente o defeito procurado.
- Carga de fonte checada nos pesos 400 e 800, não só "Inter carregada".
- Task 5.1 diz como semear dados (`page.route`, no molde de `zonas-cadastro.spec.ts`).
- Seção Rollback no proposal.
- Task 1.4 tira `Syne` da pilha de `font.display`; consumidores conhecidos: `athleteTheme` (h1–h6) e
  o token `headerTitle` (`theme.premium.ts:219`), ambos só pela família.
- Métrica de rotina deixa de ser gate; gate é manual do founder.
- CA3 testa peso ≥ 700 nos títulos; CA5 limitado ao card e ao diálogo de zonas.

Descartado: "reverter `aea904a` re-acopla o coach ao tema global". Os temas aninhados continuam (D1);
só o valor da família dos títulos muda.

Revisão de produto: **Refine (leve)**. Incorporado: natureza de polimento com teto de esforço,
métrica declarada neutra, Q1/Q2 como pendentes, aprovação visual pelo founder e E2E dos fluxos de
decisão do coach no gate final.
