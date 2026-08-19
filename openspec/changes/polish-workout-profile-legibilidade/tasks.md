# Tasks — polish-workout-profile-legibilidade

Repo: `apps/menthoros-front`. Gate em todo bloco: `npm run lint && npm run build && npm run test:run`.
Módulo: `src/features/workout/profile/`.

> **Meio de verificação.** O Vitest roda jsdom com `css: false` (`vite.config.ts:46-52`): medida de
> caixa e texto devolve zero. A **AC-4** (rótulo contido no bloco) é a única que exige navegador e
> vai para o Playwright; as outras quatro são regra pura e ficam em Vitest. Regra herdada da change
> anterior: **Vitest prova a regra, Playwright prova a geometria.**

Ordem sugerida: 1 e 2 primeiro — são os dois achados de honestidade, e os que justificam a change.

---

## 1 — Zona declarada na descrição (AC-1)

- [ ] **1.1** `zonaDeclarada` passa a ler também `descricao` e `ritmoAlvo`, com precedência
      declarada: `fcAlvo` → `intensidade` → `descricao` → `ritmoAlvo`. A ordem não é arbitrária —
      campo de alvo é mais específico que prosa livre, e deve ganhar quando os dois existirem e
      discordarem.
      `verify:` teste com "Corrida contínua Z2" só em `descricao` → `zone: 'Z2'`, `confidence:
      'prescribed'`; e teste de precedência com `fcAlvo: 'Z4'` + `descricao: '...Z2'` → `Z4`.
- [ ] **1.2** Conferir o efeito no modo degradado: um treino cujas zonas estavam todas em prosa
      deixa de ser degradado, perde o chip `⚠ intensidade estimada` e ganha a badge de zona-alvo.
      `verify:` teste de ponta a ponta do seletor com o treino "Corrida contínua Z2" — `degraded:
      false` e `targetZone` preenchida.

## 2 — A razão trabalho:recuperação para de mentir (AC-2)

- [ ] **2.1** `razaoTrabalhoRecuperacao` retorna `null` quando nenhum bloco tem `repeat`. Remover o
      fallback global, que contava aquecimento e desaquecimento como recuperação e produziu `11:4`,
      `3:8` e `7:3` em treinos reais.
      `verify:` teste com treino sem série → `null`; teste com série 5×(3'+2') → `1.5`.
- [ ] **2.2** O chip some do header quando a razão é `null` (o `textoDaMetrica` já omite métrica
      nula — confirmar que não há caminho que renderize "trabalho —").
      `verify:` teste de componente: treino sem série não exibe chip de razão.

## 3 — Eixo X com unidade única (AC-3)

- [ ] **3.1** Acima de 60min, **todos** os ticks em `h:mm`, incluindo o zero (`0:00`) e os abaixo de
      uma hora (`0:10`, `0:50`). Hoje a mesma régua mistura `50` e `1:00`.
      `verify:` `xAxisTicks(75*60)` devolve `0:00 0:10 … 1:15`; `xAxisTicks(50*60)` segue em minutos
      crus (`0 10 … 50`), porque abaixo de uma hora não há ambiguidade.
- [ ] **3.2** Supressão do penúltimo tick passa de `< passo/2` para `<= passo/2` — em 75min a
      distância é exatamente meio passo, e `1:10` colide com `1:15`.
      `verify:` `xAxisTicks(75*60)` não contém `1:10`; nenhum par de ticks a menos de meio passo.

## 4 — Rótulo contido no bloco (AC-4)

- [ ] **4.1** O rótulo não pode ultrapassar a caixa do bloco. Investigar a causa antes de escolher a
      correção: o bloco tem `overflow: hidden`, então o vazamento vem de o texto ser centralizado e
      mais largo que o container — provavelmente falta `maxWidth: 100%` e `minWidth: 0` no span.
      Não resolver com reticências: são proibidas pelo AC-7 da spec.
      `verify:` **Playwright** — para todo rótulo visível, a caixa do texto está contida na do bloco.
- [ ] **4.2** Rever a cadeia de fallback com a largura real: hoje ela estima `texto.length * 6`, e o
      vazamento sugere que a estimativa é otimista para as fontes em uso.
      `verify:` o mesmo teste da 4.1, num treino com rótulos longos (DESAQUECIMENTO em bloco estreito).

## 5 — Série expandida sem `blocoId` (AC-5)

- [ ] **5.1** Detectar a janela repetida por assinatura (tipo + duração + alvo, alternando) quando
      não há `blocoId`, e emitir `repeat`. **Reusar o critério de janela do `itensFromEtapas`**
      (`features/coach/components/etapas/etapaItem.ts`) em vez de escrever a segunda heurística —
      duas divergem, e o editor e o gráfico passariam a discordar sobre o que é uma série.
      `verify:` 6 pares idênticos sem `blocoId` → um bracket `6×`, e só a primeira repetição
      rotulada; treino sem repetição real → nenhum `repeat`.
- [ ] **5.2** Confirmar que a razão trabalho:recuperação volta a ser calculada nesses treinos, agora
      pelo caminho da série — é o ganho colateral da 5.1 sobre a task 2.1.
      `verify:` o intervalado 6×(2'+1') passa a exibir `trabalho 2:1`.

## 6 — Fechamento

- [ ] **6.1** Navegação de verificação nos **mesmos quatro treinos** que originaram a change: nenhum
      chip de razão sem série, nenhum eixo com duas unidades, nenhum rótulo fora do container, e
      "Corrida contínua Z2" colorido em vez de hachurado. Capturar as telas.
- [ ] **6.2** `/qa` — `frontend-reviewer` + `clean-code-reviewer`.
- [ ] **6.3** Registrar o **bloco cinza dominante** (Q1 do proposal) como change própria, com as três
      saídas avaliadas antes do código.
