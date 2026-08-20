# Tasks — polish-workout-profile-legibilidade

> **Estado final (2026-08-20) — entregue no `menthoros-front` #81, merge `584397c`.**
> **15 de 15 tasks concluídas**, nenhuma adiada. Validação final: lint limpo, build sem erro de
> tipo, **1215 testes unitários em 134 arquivos** e **63 specs E2E**.
>
> A change cresceu além do escopo previsto, e por um bom motivo: a navegação de verificação da task
> 6.1 encontrou que **a descrição da etapa era apagada ao salvar** — perda de dado num caminho de
> escrita do plano do atleta, anterior a esta change e sem relação com gráfico. Corrigida aqui por
> decisão explícita, em vez de virar change própria.
>
> Também entraram, achados ao conferir o resultado renderizado: a rampa desenhada acima do próprio
> nominal (o aquecimento saía mais alto que o bloco principal) e o regenerativo de cabeça para baixo
> (duas escalas no mesmo eixo). Nenhum dos três apareceu em teste.

Repo: `apps/menthoros-front`. Gate em todo bloco: `npm run lint && npm run build && npm run test:run`.
Módulo: `src/features/workout/profile/`.

> **Meio de verificação.** O Vitest roda jsdom com `css: false` (`vite.config.ts:46-52`): medida de
> caixa e texto devolve zero. A **AC-4** (rótulo contido no bloco) exige navegador e vai para o
> Playwright. **AC-1, AC-2 e AC-3 são regra pura** e ficam em Vitest. **AC-5 é misto**: o
> agrupamento é regra do seletor, mas "só a primeira repetição rotulada" é comportamento de render
> (`rotuloDoBloco`, em `ProfilePlot.tsx`) — testável em Vitest de forma estrutural, e não como regra
> pura. Herdado da change anterior: **Vitest prova a regra, Playwright prova a geometria.**

Ordem sugerida: 1 e 2 primeiro — são os dois achados de honestidade, e os que justificam a change.

---

## 1 — Zona declarada na descrição (AC-1)

- [x] **1.1** `zonaDeclarada` passa a ler também `descricao` e `ritmoAlvo`, com precedência
      declarada: `fcAlvo` → `intensidade` → `descricao` → `ritmoAlvo`. A ordem não é arbitrária —
      campo de alvo é mais específico que prosa livre, e deve ganhar quando os dois existirem e
      discordarem.
      `verify:` teste com "Corrida contínua Z2" só em `descricao` → `zone: 'Z2'`, `confidence:
      'prescribed'`; e teste de precedência com `fcAlvo: 'Z4'` + `descricao: '...Z2'` → `Z4`.
- [x] **1.2** Conferir o efeito no modo degradado: um treino cujas zonas estavam todas em prosa
      deixa de ser degradado, perde o chip `⚠ intensidade estimada` e ganha a badge de zona-alvo.
      `verify:` teste de ponta a ponta do seletor com o treino "Corrida contínua Z2" — `degraded:
      false` e `targetZone` preenchida.

## 2 — A razão trabalho:recuperação para de mentir (AC-2)

- [x] **2.1** `razaoTrabalhoRecuperacao` retorna `null` quando nenhum bloco tem `repeat`. Remover o
      fallback global, que contava aquecimento e desaquecimento como recuperação e produziu `11:4`,
      `3:8` e `7:3` em treinos reais.
      `verify:` teste com treino sem série → `null`; teste com série 5×(3'+2') → `1.5`.
- [x] **2.2** O chip some do header quando a razão é `null`. Conferido no DoR: `formatWorkRatio`
      já devolve `null` e `textoDaMetrica` só renderiza texto não nulo — então esta task é
      confirmação por teste, não código novo.
      `verify:` teste de componente: treino sem série não exibe chip de razão.
- [x] **2.3** Atualizar o comentário de `workToRecoveryRatio` em `types.ts`, que hoje **promete o
      fallback global** ("global caso contrário"). Deixar o contrato afirmando o que o código deixou
      de fazer é como o `prescribed` da change anterior mentiu na própria doc.
      `verify:` o comentário descreve `null` sem série, com o motivo.

## 3 — Eixo X com unidade única (AC-3)

- [x] **3.1** Acima de 60min, **todos** os ticks em `h:mm`, incluindo o zero (`0:00`) e os abaixo de
      uma hora (`0:10`, `0:50`). Hoje a mesma régua mistura `50` e `1:00`.
      `verify:` `xAxisTicks(75*60)` devolve `0:00 0:10 … 1:15`; `xAxisTicks(50*60)` segue em minutos
      crus (`0 10 … 50`), porque abaixo de uma hora não há ambiguidade.
- [x] **3.2** Supressão do penúltimo tick passa de `< passo/2` para `<= passo/2` — em 75min a
      distância é exatamente meio passo (75 − 70 = 5 = passo/2), e `1:10` colide com `1:15`.
      `verify:` `xAxisTicks(75*60)` não contém `1:10`; nenhum par de ticks a menos de meio passo.
- [x] **3.3** **Quebra esperada:** `axis.test.ts` fixa `'15'` como primeiro passo de um treino de 2h;
      com unidade única acima de 60min isso vira `'0:15'`. Atualizar a asserção — a mudança é
      intencional, e o AC-4 da spec anterior (40min → `0, 5, …, 40`) **continua válido**, porque
      abaixo de uma hora nada muda.
      `verify:` `npm run test:run -- axis` verde, com a asserção de 2h em `h:mm`.

## 4 — Rótulo contido no bloco (AC-4)

- [x] **4.1** **[investigar antes de corrigir]** A hipótese do proposal (falta de
      `maxWidth`/`minWidth` no span) **não se sustenta sozinha** e o DoR derrubou: o bloco já tem
      `overflow: hidden` (`ProfilePlot.tsx`), que por semântica de CSS bastaria para conter o texto.
      Se o rótulo aparece fora, ou o clipping não está valendo, ou **o próprio bloco** está mais
      largo que o espaço alocado — e a correção mora em arquivos diferentes conforme o caso:
      `ProfilePlot.tsx` (span) contra `geometry.ts`/`usePlotWidth` (largura do bloco).
      **Primeiro passo é medir**, não editar: capturar no navegador a caixa do span, a do bloco e a
      do plot no treino que reproduz (35min, rótulo `DESAQUECIMENTO` em bloco estreito).
      Não resolver com reticências — proibidas pelo AC-7 da spec anterior.
      `verify:` **Playwright** — para todo rótulo visível, a caixa do texto está contida na do bloco,
      e a do bloco contida na do plot.
- [x] **4.2** Rever a cadeia de fallback com a largura real: hoje ela estima `texto.length * 6`, e o
      vazamento sugere que a estimativa é otimista para as fontes em uso.
      `verify:` o mesmo teste da 4.1, num treino com rótulos longos (DESAQUECIMENTO em bloco estreito).

## 5 — Série expandida sem `blocoId` (AC-5)

- [x] **5.1** **[extração]** Tirar a heurística de janela de dentro do `itensFromEtapas` para um util
      compartilhado. **Não é reuso direto** — conferido no DoR, e o proposal errava ao sugerir que
      fosse:
      - os helpers (`equivalentes`, `janelaEquivalente`, `contemIntervalado`) são **privados** e
        tipados em `EtapaTreinoDto` (`etapaItem.ts:99-119`); o perfil consome `ProfileEtapaInput`;
      - `equivalentes` compara **quatro** campos — `tipoEtapa`, `duracaoMin`, `distanciaKm`,
        `fcAlvoEtapa` — e não os três que o proposal descrevia;
      - `contemIntervalado` exige a string literal `'INTERVALADO'` (`:114-119`), enquanto o
        `papelDe` do seletor reconhece também `interval`, `tiro`, `esforco`, `esforço`
        (`selectWorkoutProfile.ts:87-96`). Importar o critério como está faria a série **sumir em
        silêncio** nos treinos que o resto do módulo já trata como trabalho.

      **Atenção de implementação:** `ProfileEtapaInput` **não carrega `distanciaKm`**
      (`input.ts:13-30`), e a assinatura do editor usa esse campo. Se a assinatura do perfil
      precisar dele para distinguir séries, o input tem de ser ampliado — decidir isso ao escrever
      a extração, não no meio dela.

      Forma da extração: um util genérico sobre uma **assinatura extraída** (função
      `(item) => string`) e um **predicado de "contém trabalho"** injetado. O editor passa a sua
      assinatura de 4 campos e o predicado `=== 'INTERVALADO'`; o perfil passa a sua e
      `papelDe(...) === 'work'`. Uma heurística, dois vocabulários declarados — em vez de duas
      heurísticas que divergem sem ninguém notar.
      `verify:` o editor continua verde sem mudança de comportamento (`TreinoEditDialog.test.tsx`);
      no perfil, 6 pares idênticos sem `blocoId` → um bracket `6×` e só a primeira repetição
      rotulada; e um teste que prova o vocabulário mais amplo: série com `tipoEtapa: 'TIRO'` é
      agrupada pelo perfil.
- [x] **5.2** Confirmar que a razão trabalho:recuperação volta a ser calculada nesses treinos, agora
      pelo caminho da série — é o ganho colateral da 5.1 sobre a task 2.1.
      `verify:` o intervalado 6×(2'+1') passa a exibir `trabalho 2:1`.

## 6 — Fechamento

- [x] **6.1** Navegação de verificação nos **mesmos quatro treinos** que originaram a change: nenhum
      chip de razão sem série, nenhum eixo com duas unidades, nenhum rótulo fora do container, e
      "Corrida contínua Z2" colorido em vez de hachurado. Capturar as telas.
- [x] **6.2** `/qa` — `frontend-reviewer` + `clean-code-reviewer`.
- [x] **6.3** Registrar o **bloco cinza dominante** (Q1 do proposal) como change própria, com as três
      saídas avaliadas antes do código.
