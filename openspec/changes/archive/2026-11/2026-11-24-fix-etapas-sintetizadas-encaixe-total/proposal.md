**Tamanho:** S · **Trilha:** Fast

# Proposal — fix-etapas-sintetizadas-encaixe-total

Quando o reparo estrutural sintetiza aquecimento/desaquecimento e **eles sozinhos já passam do total
prescrito**, o treino vira um bloco contínuo único com o total — a mesma saída que
`fix-etapas-sintetizadas-sessao-curta` já dá quando a PRINCIPAL encaixada fica mais curta que o
aquecimento. Hoje esse caso cai fora da regra e o treino é gravado com card e editor divergentes.

## Status

- draft (2026-11-24): aberta a partir de relato do treinador na revisão de plano (atleta do piloto, semana
  23/11): card do regenerativo com 2 km / 25 min, editor com 5,1 km / 35 min.
- simulada (2026-11-24): fix aplicado atrás de flag num worktree descartável e rodado contra
  `NormalizacaoDeTreino#normalizar` de `develop` (`ca69ed3`), com zonas de pace como em produção — 15
  cenários de treinador e a grade de 3.024 da task 0.1. CA1–CA3 confirmados; os achados ajustaram o
  escopo (item 1 restrito por tipo, segunda invariante no item 4) e abriram A6–A9. Números em
  `tasks.md`, "Achados da matriz". A suíte existente não foi rodada com o fix (CA4 por verificar).

## Why

O card da revisão mostra o total do treino (`distanciaKm`, `duracaoMin`); o `TreinoEditDialog` mostra e
soma as etapas. No caso relatado:

1. A LLM prescreveu um REGENERATIVO de 2 km sem aquecimento. `PlanoEstruturaReparador` sintetizou
   aquecimento de 10 min e desaquecimento de 5 min (`PlanoEstruturaReparador.java:69-75`).
2. `corrigir-temporais` deu a eles 1,43 km e 0,74 km pelo pace da PRINCIPAL (6:30–7:00/km).
3. `reconciliarContinuo` (`NormalizacaoDeTreino.java:328`) mantém o total da LLM (decisão de produto de
   22/09: não inflar o volume) e chama `encaixarPrincipalNoTotal`. A sobra é `2,0 − 2,17 < 0`, então o
   encaixe devolve vazio (`TreinoNormalizador.java:356`) e a divergência é só **contada**
   (`plano_etapas_total_divergente{motivo=etapa-sintetizada}`).
4. Na cauda, `recalcular-duracao` mantém os 25 min da LLM porque estão mais perto de ritmo × distância
   (13,5 min) do que a soma das etapas (35 min) — "DURAÇÃO MANTIDA".

Resultado: o treinador revisa um treino de 2 km e, ao editar, encontra 5,1 km. Se salvar sem perceber,
aprova volume 2,5× maior que o prescrito num atleta com lesão ativa.

`fix-etapas-sintetizadas-sessao-curta` (arquivada em 2026-11-18) resolveu o vizinho — sobra positiva
mas PRINCIPAL menor que o aquecimento vira bloco único (CA3 dela) — e deixou de fora a sobra ≤ 0.

## What Changes

Só `apps/menthoros-backend`, em `TreinoNormalizador.encaixarPrincipalNoTotal`:

1. **Sobra ≤ 0 com pace derivável → bloco único.** O treino passa a ter só a PRINCIPAL, com
   `distanciaKm` = total prescrito e duração pelo pace — o mesmo ramo da sessão curta
   (`TreinoNormalizador.java:366-373`), agora também quando não sobra distância.
   **Só em REGENERATIVO, CONTINUO e LONGO**, onde a PRINCIPAL é ritmo leve. Em TEMPO_RUN a PRINCIPAL é
   ritmo de limiar: o bloco único seria limiar sem aquecimento, então o ramo novo não se aplica e o
   comportamento atual fica (encaixe vazio, divergência contada) — ver A6.
2. **Sem pace derivável** o comportamento atual fica (encaixe vazio, divergência contada): não há como
   dar duração ao bloco sem inventar ritmo.
3. **O bloco único grava também a duração do treino** (`duracaoMin` = duração do bloco). Não basta
   contar com `recalcular-duracao`: ele desempata pelo `ritmoAlvo` do **cabeçalho**
   (`NormalizacaoDeTreino.java:733`), e o bloco usa o ritmo da PRINCIPAL — com os dois divergentes, a
   duração da LLM venceria e card e editor seguiriam diferentes (DoR, Codex + spec-reviewer). Com o
   cabeçalho igual à soma, o desempate passa a escolher o mesmo valor. Vale para os dois ramos do bloco
   único (sessão curta e sobra ≤ 0).

4. **Matriz de cenários com a invariante "card = editor".** O mesmo sintoma já apareceu outras vezes
   (relato do treinador, 2026-11-24) e cada fix anterior cobriu um caso pontual
   (`fix-total-treino-soma-etapas`, `fix-etapas-sintetizadas-sessao-curta`). Um teste parametrizado
   pela interface `NormalizacaoDeTreino#normalizar` varre tipo × total × estrutura × ritmo × limiar ×
   duração da LLM e exige, em todo cenário aceito, soma das etapas igual ao total do treino dentro do
   arredondamento (distância: 2% ou 0,05 km; duração: 1 min — decisão de 2026-11-24). A matriz roda **antes** do fix, para catalogar todas as causas; só a causa
   "sobra ≤ 0" é corrigida aqui, as demais viram exceções nomeadas na matriz e follow-ups.
   **Segunda invariante, "total = prescrito":** `distanciaKm` final a até 10% do total que a LLM
   prescreveu. "Card = editor" sozinha não vê o volume inflado: REGENERATIVO de 2 km com as três
   etapas escritas pela LLM (10 + 15 + 5 min) sai com card **e** editor em 4,44 km — coerentes entre
   si e 2,2× o prescrito. Esta change não corrige essa causa; a matriz a nomeia e a congela.

Sem contrato de API, sem migration, sem front, sem dependência nova (JUnit `@ParameterizedTest`).

## Fora de escopo

- Planos já gerados com a divergência: o fix vale para gerações novas. Não há backfill.
- Sobra positiva com PRINCIPAL ≥ aquecimento (já encaixa hoje).
- PRINCIPAL sem ritmo (`principal-sem-ritmo`) e a decisão de 22/09 de não inflar o volume.
- Card ou editor exibirem outra fonte de total.
- Total reconciliado pela soma das etapas quando a estrutura veio completa da LLM (`adotarSomaDasEtapas`):
  infla ou encolhe o volume prescrito sem etapa sintetizada. Exceção nomeada na matriz + follow-up.
- Bloco único de TEMPO_RUN no ramo que já existe (sobra positiva, PRINCIPAL menor que o aquecimento):
  hoje já produz limiar sem aquecimento. Não muda aqui (CA4); follow-up.
- `tssPlanejado` quando a duração do treino muda na normalização (A7).
- `ritmoAlvo` do treino divergente do ritmo da etapa corrigido pela zona.

## Critérios de aceite

- **CA1** — GIVEN REGENERATIVO com total 2,0 km, PRINCIPAL a 6:30–7:00/km, aquecimento (10 min) e
  desaquecimento (5 min) sintetizados que somam mais de 2,0 km, WHEN a normalização roda, THEN o treino
  tem uma etapa só, PRINCIPAL, 2,0 km, duração pelo pace (≈ 14 min), e `distanciaKm` = 2,0.
- **CA2** — GIVEN o mesmo caso pela receita TRES_ETAPAS completa, THEN `duracaoMin` do treino é a soma
  das etapas (não os 25 min da LLM) e o contador `plano_etapas_total_divergente{motivo=etapa-sintetizada}`
  não é incrementado. Vale também com `ritmoAlvo` do cabeçalho divergente do ritmo da PRINCIPAL (ex.:
  cabeçalho 8:00/km e 16 min, PRINCIPAL 6:30–7:00).
- **CA3** — GIVEN sobra ≤ 0 e PRINCIPAL sem pace derivável (nem na etapa nem no `ritmoAlvo` do treino),
  THEN o encaixe continua vazio e a divergência continua contada (comportamento atual).
- **CA4** — GIVEN sobra positiva (casos de `fix-total-treino-soma-etapas` e da sessão curta), THEN nada
  muda: os testes existentes de encaixe passam sem alteração.
- **CA5** — GIVEN a suíte de caracterização (`NormalizacaoDeTreinoCaracterizacaoTest` e goldens), THEN
  todo esperado alterado aparece listado em `tasks.md` ("Esperados alterados") com o cenário e o motivo;
  nenhum esperado muda fora dessa lista.
- **CA6** — GIVEN a matriz de cenários (tasks 0.1), WHEN a normalização aceita o treino, THEN a soma
  das etapas fica a até max(2%, 0,05 km) de `distanciaKm` e a até 1 min de `duracaoMin`, e
  `distanciaKm` fica a até max(2%, 0,05 km) do total prescrito pela LLM; cada exceção está listada por nome, com motivo e follow-up, e a lista não cresce
  sem decisão.
- **CA7** — GIVEN TEMPO_RUN com sobra ≤ 0 e pace derivável, THEN o encaixe continua vazio e a
  divergência continua contada: o treino não vira bloco único em ritmo de limiar.

## Métrica de sucesso

- `plano_etapas_total_divergente{motivo=etapa-sintetizada}` cai nas gerações após o deploy (linha de
  base: contagem dos 7 dias anteriores em produção).
- Revisão: o treinador não encontra mais total do card diferente do total do editor em treino com etapa
  sintetizada.

## Dependências

- Base: `fix-total-treino-soma-etapas` e `fix-etapas-sintetizadas-sessao-curta` (arquivadas).
- Sem conflito com changes ativas conhecidas em `TreinoNormalizador`; conferir no `/implement init`.

## Open Questions & Assumptions

- **A1** — O bloco único é aceitável para o coach também quando a sobra é ≤ 0: é a mesma decisão da
  sessão curta ("juntar tudo num bloco contínuo leve"), aplicada a um total ainda menor.
  **Decidido (2026-11-24, dono do produto): a distância é a verdade** — no caso relatado, 25 min viram
  14. Coerente com a decisão de 22/09 de não inflar o volume e o lado seguro para atleta com lesão.
  Custo aceito: uma sessão de caminhada + trote prescrita por tempo encurta.
- **A2** — O treino relatado passou por esse caminho (reparo + sobra negativa). Inferido dos números
  (25 + 10 = 35 min; 1,43 + 0,74 > 2,0 km) e da marca "(gerado pelo sistema)" no aquecimento; não
  conferido no banco. A simulação com ritmo 6:30–7:00 reproduz o mecanismo com 5,18 km / 35 min
  (aquecimento de 1,48 km); 1,43 km indica ritmo médio de 7:00 no treino real.
- **A4 — escopo.** Tamanho segue S porque o fix é só a sobra ≤ 0; se a matriz achar causas que
  exijam mudar a decisão de 22/09 ou mexer em mais de um passo da receita, elas saem desta change. Se
  a lista de exceções passar de ~5 causas distintas, reclassificar antes de seguir.
- **A5 — tolerância. Decidido (2026-11-24): apertada** — distância max(2%, 0,05 km), duração 1 min,
  o que o treinador percebe como "igual". Os 10% do contador são limiar de telemetria, não de
  igualdade (10% aceita 2,1 km num treino de 21 km). A matriz listará mais exceções; é o esperado. Dado da simulação: os 8 casos de duração que sobram (TEMPO_RUN curto,
  estrutura completa) diferem em 2 min (18 no card, 20 nas etapas) — 1 min absoluto não os cobre.
- **A6 — TEMPO_RUN.** Assumido que limiar sem aquecimento é pior que card e editor divergentes, por
  isso o ramo novo exclui TEMPO_RUN. A alternativa — rejeitar com `LLMException` e deixar o turno de
  reparo pedir a estrutura completa — resolve os dois, mas mexe no ramo existente e sai desta change.
- **A7 — TSS.** `tssPlanejado` fica o da LLM (25 no caso relatado) com a sessão caindo de 25 para
  14 min. Assumido tolerável num regenerativo curto; recalcular é outro passo da receita (follow-up).
- **A8 — aquecimento da própria LLM.** Com aquecimento prescrito pela LLM (10 min, 1,5 km) e só o
  desaquecimento sintetizado, o bloco único apaga os dois. É o que o ramo da sessão curta já faz;
  assumido aceitável, já que o total prescrito não comporta nem o aquecimento.
- **A9 — sem pace.** As causas "sem pace derivável" somam 492 cenários na grade, mais que a causa
  corrigida (486). Frequência em produção desconhecida — depende de o schema exigir `ritmoAlvo`.
  Medir antes de priorizar, somando os dois motivos: sem pace **com** etapa sintetizada é contado como
  `etapa-sintetizada` (`NormalizacaoDeTreino.java:330` testa a sintetizada antes do pace), só a estrutura
  completa sem ritmo cai em `principal-sem-ritmo`. O contador sozinho não separa; o log
  "ETAPAS × TOTAL" traz o motivo e a soma.
- **A3** — Os prints mostravam QUA 25/11 no card e SÁB 28/11 no editor; assumido que são dois treinos
  iguais (o de sábado "repete" o de quarta), não o lápis abrindo outro treino — o vínculo por id foi
  conferido em `PlanoDetalhePanel.tsx:619`.
