**Tamanho:** S · **Trilha:** Fast

# Proposal — deepen-pace-validator-teto-invariante

O `PaceValidator` passa a ser o único lugar que corrige **e** verifica o ritmo de um treino planejado
gerado contra o teto de pace, e a receita de normalização ganha um invariante testado: **depois de
normalizar, a regra `PACE_TETO` não acusa nada**. Hoje o corretor e o verificador vivem em classes
diferentes e discordam em pelo menos dois casos.

## Status

- draft (2026-11-25): aberta a partir da revisão de arquitetura do backend (candidato 1, "prescrição de
  ritmo"), reduzida no grilling à menor mudança que fecha a classe de bug. Decisões Q1–Q5 fechadas com o
  founder; nenhuma simulação rodada ainda — os dois desacordos abaixo foram lidos no código, não
  reproduzidos (A1).

## Why

A regra do teto de pace foi corrigida aos pedaços em pelo menos sete commits recentes, cada um num
ponto diferente da mesma regra: `91c9978` (5 arquivos), `35758af`, `929a414`, `f2854cf`, `39182f2`,
`bf3b82c`, `556e48e`. O padrão se repete: um lado da regra é ajustado e o outro lado passa a discordar.

O motivo é estrutural:

- **Corrigir** vive em `NormalizacaoDeTreino` (`corrigirPaceTetoPiso` `:701`, `corrigirPaceZona` `:666`)
  e em `PaceValidator` (`validar`, `validarZonaEtapa`).
- **Verificar** vive em `PlanQualityChecker.verificarPaceTeto` (`:86-113`), com parser próprio
  (`parsePaceMaisRapido` `:170`).
- **Nenhum teste** roda a normalização seguida do verificador com um teto real. A grade existente
  (`NormalizacaoDeTreinoInvarianteTotalTest`) cobre distância e duração, não ritmo.

Dois desacordos visíveis na leitura do código:

1. **Atleta sem zonas de pace.** `validarZonaEtapa` sai cedo com `zonas == null`
   (`PaceValidator.java:147`), então as etapas não são corrigidas contra o teto; o verificador acusa
   etapa mais rápida que o teto mesmo assim.
2. **Treino PROVA.** O corretor não mexe nas etapas de PROVA (`PaceValidator.java:147`); o verificador
   não tem essa isenção.

Para o treinador, cada desacordo é um plano que chega à revisão marcado com violação de qualidade que a
normalização podia ter resolvido, ou um plano de prova acusado por prescrever o ritmo que é o objetivo.

Há também duas cópias menores da mesma regra: o arredondamento "segundo de cima" duas vezes em
`PaceValidator` (`:66` e `:168`) e `EvalDeterministicGrader.tetoDasRegras` (`:113-127`), que decodifica
à mão o que `Constraint.tetoPorTipo()` (`Constraint.java:89`) já devolve.

## What Changes

Só `apps/menthoros-backend`. Sem classe nova, sem migration, sem mudança de contrato de API, de prompt
ou de schema da LLM.

1. **Invariante testado (primeiro).** Teste de grade novo, no molde de
   `NormalizacaoDeTreinoInvarianteTotalTest`: colaboradores reais, teto derivado de histórico por
   `PaceHistoricoFormatter.calcularTetoPorTipo`. Para todo cenário que a normalização aceita,
   `PlanQualityChecker` não devolve violação `PACE_TETO`.
2. **Teto vale para atleta sem zonas de pace.** Sem zonas, a etapa mais rápida que o teto do tipo do
   treino é deslocada para o teto (mesma amplitude); nada mais muda nela.
3. **PROVA isenta do teto nos dois lados.** O corretor não desloca ritmo de treino PROVA (cabeçalho nem
   etapas) e o verificador não acusa PROVA.
4. **Corrigir e verificar na mesma classe.** O corpo de `corrigirPaceTetoPiso` e de `corrigirPaceZona`
   (incluído o desfazer da correção que acelerou aquecimento/desaquecimento além da PRINCIPAL) muda para
   `PaceValidator`. `NormalizacaoDeTreino` mantém os dois passos **nas mesmas posições da receita**
   (`corrigir-pace-zona` na cabeça, `:231-232`; `corrigir-pace-teto-piso` na cauda, `:152`) e só delega.
   A verificação de teto muda para `PaceValidator`; `PlanQualityChecker.verificarPaceTeto` delega e
   continua dono da `ViolacaoQualidade`.
5. **Limpezas.** `EvalDeterministicGrader.tetoDasRegras` sai, substituído por `Constraint.tetoPorTipo()`.
   O arredondamento "segundo de cima" vira um helper privado em `PaceValidator`.

## Non-goals

- Módulo novo "Prescrição de ritmo" ou operação que gere texto para o prompt — o teto já tem uma
  implementação só (`calcularTetoPorTipo`), chamada pelo prompt e pela normalização com o mesmo histórico.
- Fatores fixos `FATOR_PACE_Z2`/`FATOR_PACE_Z1` de `TreinoNormalizador.java:40-41` contra a tabela Friel:
  trocar muda a distância derivada de aquecimento/desaquecimento. Change própria.
- Verificação de ritmo na edição do treinador (`TreinoPlanejadoServiceImpl`). O treinador é a
  autoridade sobre o treino; ninguém pediu.
- Mudar o cálculo do teto, o piso, a tabela de zona por etapa ou a ordem dos passos da receita.

## Critérios de aceite

- **CA1 — invariante.** Given a grade (tipo de treino × atleta com e sem zonas de pace × ritmo do
  cabeçalho e das etapas mais rápido, igual e mais lento que o teto), When `NormalizacaoDeTreino.normalizar`
  aceita o treino, Then `PlanQualityChecker.check` com a regra `PACE_TETO` do mesmo teto devolve zero
  violações `PACE_TETO`.
- **CA2 — sem zonas.** Given atleta sem pace de limiar nem zonas manuais e treino CONTINUO com etapa
  PRINCIPAL mais rápida que o teto do histórico, When normaliza, Then a borda rápida da etapa é igual ao
  teto (ao segundo) e a amplitude da faixa é preservada.
- **CA3 — PROVA no corretor.** Given treino PROVA com cabeçalho e etapas mais rápidos que o teto de
  PROVA, When normaliza, Then nenhum ritmo é alterado.
- **CA4 — PROVA no verificador.** Given o mesmo treino, When `PlanQualityChecker.check` roda com
  `PACE_TETO`, Then não há violação `PACE_TETO` para ele.
- **CA5 — comportamento preservado.** Given a suíte existente (`PaceValidatorTest`,
  `NormalizacaoDeTreinoTest`, `NormalizacaoDeTreinoInvarianteTotalTest`, `PlanQualityCheckerTest`,
  `EvalDeterministicGraderTest`, caracterização e golden do prompt), When roda depois da mudança, Then
  passa sem alteração de expectativa, exceto os casos que afirmavam o comportamento antigo de CA2–CA4
  (listados no PR, um a um).
- **CA6 — ordem da receita.** Given as quatro famílias de treino, When a receita é montada, Then a
  sequência de nomes de passo é idêntica à de `develop`.

## Métrica de sucesso

- Contagem de violações `PACE_TETO` em planos **já normalizados** (o contador de qualidade que a geração
  já emite): alvo zero nas duas semanas seguintes ao deploy em produção. Hoje é maior que zero pelos
  desacordos 1 e 2 (valor de partida a medir na task 0.2).
- Para o treinador: nenhum plano de semana de prova chega à revisão marcado por ritmo de prova.
- Indicador de engenharia: nenhum `fix(plano)` sobre teto de pace nas quatro semanas seguintes.

## Riscos e mitigações

- **Mover código muda a ordem sem querer.** Mitigação: CA6 afirma a sequência de passos; a grade "card =
  editor" (5.042 cenários) roda inalterada.
- **Isenção de PROVA esconde prescrição absurda.** `sanear` continua descartando ritmo fora de
  2:30–12:00/km para todo tipo, PROVA incluída; a isenção é só do teto do histórico.
- **A grade revela mais desacordos que os dois lidos.** É o objetivo da task 0. Cada um é corrigido
  dentro da change se for regra de teto; se for outra regra, vira exceção catalogada com follow-up, como
  na grade de total.

## Open Questions & Assumptions

- **A1.** Os desacordos 1 e 2 foram lidos no código, não reproduzidos. A task 0 confirma ou derruba.
- **A2.** Prompt e normalização recebem o mesmo `treinosUltimas4Semanas`; por isso o teto não precisa
  de dono novo. A verificar na task 0.2 (mesma origem no `TreinoHistoricoProvider`).
- **A3.** A regra `PACE_TETO` renderizada no prompt pode listar um teto para PROVA quando o atleta correu
  uma prova nas últimas 4 semanas. Com a isenção, o prompt anunciaria um limite que ninguém cobra. Em
  aberto: remover PROVA do mapa na origem (`calcularTetoPorTipo`) muda o prompt e sai do escopo declarado
  — decidir na task 0.2, com o dado de quantos atletas caem no caso.
- **A4.** O piso de pace segue como está: só no cabeçalho do treino, sem verificador. Não entra no
  invariante.
- **A5.** O eval continua sem zonas de FC e sem piso (não tem banco); só a origem do teto muda de forma,
  não de valor.
