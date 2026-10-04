# extract-adherence-calculator — consolidar os 4 cálculos de aderência em um AdherenceCalculator

**Tamanho:** M · **Trilha:** Fast
**Status:** Proposta
**Criado:** 2026-10-04

> Origem: candidato C1 da review de arquitetura do backend (`architecture-review-menthoros-backend`,
> 2026-10-02) — o único dos cinco candidatos onde o "deletion test" falha nas três implementações
> simultaneamente: deletar qualquer uma redireciona o leitor para uma versão ligeiramente diferente
> e menos correta. Escopo fechado via grilling em 2026-10-03/04.

## Why

Hoje existem **quatro métodos** de cálculo de aderência, em duas classes, sem nenhum tipo
compartilhado entre eles:

- `AtletaProgressServiceImpl.getAderencia4Semanas(UUID atletaId)` — janela de 4 semanas ISO
  (segunda atual − 3 semanas até o fim da semana atual), sem lógica de pendência/teto.
- `AtletaProgressServiceImpl.getAderenciaSemanal(UUID atletaId, int semanas)` — mesma lógica,
  agrupada por semana, com `semanas` configurável pelo chamador.
- `ProgressaoTreinoServiceImpl.calcularAderenciaJanelaFechada(...)` (privado) — 3 semanas ISO
  **fechadas** antes da semana atual, exclui `DESCANSO`, trata treinos Strava cancelados e aplica
  um teto de pendência de 25% (`TETO_PENDENCIA`).
- `ProgressaoTreinoServiceImpl.calcularAderenciaRegraAntiga(...)` (privado) — janela corrida de
  21 dias até hoje (relógio do servidor), sem nenhum dos filtros acima.

Os dois últimos são selecionados por uma feature flag
(`menthoros.progressao.aderencia-devidos.enabled`) e retornam um `record` privado
(`AderenciaJanela`) que não é compartilhado com nada fora da classe. O par
`CoachDashboardServiceImpl` ↔ `AtletaProgressServiceImpl` já tinha essa duplicação — foi corrigido
em 2026-10-01 (PR #157/#158, `fix-adherence-count-until-today`) fazendo o dashboard delegar para
`AtletaProgressService`. Esta change aplica o mesmo princípio um nível acima: entre
`AtletaProgressServiceImpl` e `ProgressaoTreinoServiceImpl`.

**Achado adicional da investigação (2026-10-04):** o default do `@Value` da flag no código é
`false`, mas `application.yml` define `true` — uma divergência pré-existente, não introduzida por
esta change. A revisão adversarial do Codex (ver histórico desta change) mostrou que essa
divergência **não** é um detalhe de configuração: trocar o default muda qual algoritmo de
aderência decide a progressão quando a propriedade está ausente, afetando o que o atleta recebe
como prescrição (`REDUZIR` vs. `MANTER` em alguns cenários). Corrigir isso é uma decisão de
produto, não uma extração mecânica — fica fora do escopo desta change (ver Non-goals e Open
Questions).

## What Changes

Backend, `apps/menthoros-backend`, refactor puro — **nenhuma regra de negócio muda**:

1. Criar `AdherenceCalculator` (novo `@Component`, pacote `services.impl`, sem subpacote —
   segue o padrão da camada de reconciliação, que também não isola suas classes em subpacote
   próprio) com os **quatro métodos atuais, extraídos 1:1**, sem parametrização por tipo de janela:
   - `getAderencia4Semanas(UUID atletaId)`
   - `getAderenciaSemanal(UUID atletaId, int semanas)`
   - `calcularAderenciaJanelaFechada(...)`
   - `calcularAderenciaRegraAntiga(...)`
2. `AdherenceCalculator.AderenciaJanela` — record público **aninhado** na calculadora
   (`cumpridos`, `faltas`, `pendentes`, `aderencia`), substituindo o record privado hoje em
   `ProgressaoTreinoServiceImpl`. Não é um DTO de contrato externo (não atravessa controller/JSON);
   fica junto da calculadora, não em `dto.output`.
3. `AtletaProgressServiceImpl` mantém `getAderencia4Semanas`/`getAderenciaSemanal` como fachada
   fina — a interface pública (`AtletaProgressService`) e todos os chamadores atuais continuam
   inalterados.
4. `ProgressaoTreinoServiceImpl` **deleta** os dois métodos privados; `calcularHistorico` passa a
   chamar `AdherenceCalculator.calcularAderenciaJanelaFechada`/`calcularAderenciaRegraAntiga`
   diretamente, seguindo a mesma flag `aderenciaDevidosEnabled` de hoje — **default do `@Value`
   inalterado (`false`)**. A divergência com `application.yml` é um achado registrado, não uma
   correção desta change (ver Non-goals).
5. Migrar para um novo `AdherenceCalculatorTest` **apenas as asserções de cálculo puro** dos blocos
   existentes:
   - de `AtletaProgressServiceImplTest`: `getAderencia4Semanas` (~linhas 796-874) e
     `getAderenciaSemanal` (~linhas 669-787).
   - de `ProgressaoTreinoServiceImplTest`: as asserções de `calcularAderenciaJanelaFechada`/
     `calcularAderenciaRegraAntiga` em isolamento (inputs já montados), incluindo o bloco D1/D2/D6/D7
     (~linha 288).
   `AtletaProgressServiceImplTest` continua testando a delegação (mock do `AdherenceCalculator`).
   `ProgressaoTreinoServiceImplTest` **mantém** testes de caracterização de `calcularHistorico`
   ponta a ponta com o `AdherenceCalculator` real (não mockado) — achado do Codex: `calcularHistorico`
   faz orquestração que não pode virar mock sem perder cobertura (data do atleta vs. data do
   servidor entre as duas regras; contagem já filtrada por `contaNaCarga()` antes de chegar na regra
   antiga). Cobrir explicitamente: os dois ramos da flag, treino Strava cancelado, e um caso de
   virada de data atleta↔servidor (domingo/segunda, fusos diferentes).

### Non-goals

- **Não unificar as regras.** As três implementações de janela (4-semanas, ISO-fechada, 21-dias
  corridos) continuam com lógicas distintas — decidir qual vira canônica é uma change futura
  separada (fora deste escopo), informada pelo que esta extração deixar visível lado a lado.
- **Não retirar a feature flag** `aderencia-devidos.enabled` — ela continua selecionando entre as
  duas regras do lado `ProgressaoTreinoServiceImpl`, só que agora dentro do `AdherenceCalculator`.
- **Não mudar nenhum contrato de API** — nenhum controller, DTO de saída ou schema de banco é
  tocado.
- **Não tocar `CoachDashboardServiceImpl`** — já delega corretamente desde 01/10; fora de escopo.
- **Não corrigir o default divergente da flag** (`@Value` em `false` vs. `application.yml` em
  `true`) — a revisão adversarial do Codex mostrou que essa troca muda qual regra decide a
  progressão quando a propriedade está ausente (não é config, é comportamento). Decidir o default
  correto é produto, não extração; fica registrado em Open Questions para a change futura.

## Critérios de aceite

**CA1 — comportamento idêntico nos quatro métodos**
Given qualquer input que hoje produz um resultado em `getAderencia4Semanas`, `getAderenciaSemanal`,
`calcularAderenciaJanelaFechada` ou `calcularAderenciaRegraAntiga`
When o mesmo input é executado após a extração (via `AdherenceCalculator`)
Then o resultado é byte-a-byte idêntico — garantido pelos testes migrados sem alteração de asserts.

**CA2 — flag e seu default permanecem exatamente como hoje**
Given a propriedade `menthoros.progressao.aderencia-devidos.enabled` ausente do ambiente
When `ProgressaoTreinoServiceImpl.calcularHistorico` roda após a extração
Then usa `calcularAderenciaRegraAntiga` (default `false`, igual ao comportamento atual) —
o `@Value` não é tocado nesta change; a divergência com `application.yml` continua existindo e
registrada em Open Questions.

**CA2b — orquestração de `calcularHistorico` preservada**
Given os testes de caracterização de `calcularHistorico` (data do atleta vs. servidor, contagem
filtrada por `contaNaCarga()`, treino Strava cancelado, os dois ramos da flag)
When executados contra o `AdherenceCalculator` real (não mockado)
Then produzem o mesmo resultado de antes da extração — nenhum desses testes foi substituído por
mock do calculator.

**CA3 — interface pública de `AtletaProgressService` inalterada**
Given os chamadores atuais (`CoachDashboardServiceImpl`, `CoachAthleteProfileServiceImpl`,
`AtletaProgressController`)
When compilam e executam contra a nova implementação
Then nenhuma assinatura muda e nenhum teste desses chamadores precisa de alteração.

**CA4 — métodos privados removidos de `ProgressaoTreinoServiceImpl`**
Given o novo `AdherenceCalculator`
When `ProgressaoTreinoServiceImpl` é revisado
Then não existe mais `calcularAderenciaJanelaFechada`/`calcularAderenciaRegraAntiga`/
`AderenciaJanela` declarados ali — só a chamada ao `AdherenceCalculator`.

**CA5 — cobertura de teste preservada**
Given a suíte `AdherenceCalculatorTest` migrada
When `./mvnw test -Dtest=AdherenceCalculatorTest` roda
Then cobre os mesmos casos de borda que existiam nos dois arquivos originais (pendência/teto 25%,
exclusão de `DESCANSO`, treino Strava cancelado, `semanas` configurável).

## Métrica de sucesso

Zero divergência de resultado nos testes de caracterização migrados (CA1, CA2b). Para o coach: a
lógica de aderência que alimenta progressão (`ProgressaoTreinoServiceImpl`) e a que alimenta o
dashboard (`AtletaProgressServiceImpl`, já corrigida em 01/10 no incidente PR #157/#158) passam a
viver num único lugar — reduzindo a chance de um terceiro bug como aquele, agora visível e testável
num só ponto em vez de duplicado silenciosamente em duas classes.

## Rollback e riscos

**Rollback:** `git revert` do commit de squash do PR (`*/extract-adherence-calculator` → `develop`)
— refactor em repositório único, sem migração de banco nem mudança de contrato, revert é seguro e
imediato.

**Riscos:**
- **Perda de cobertura na migração de testes** — mitigado pelo CA2b (testes de caracterização de
  `calcularHistorico` preservados com o calculator real) e pela task de validação que compara o
  número de métodos de teste antes/depois da migração, não só "a suíte passa".
- **Confundir a divergência do default da flag com algo resolvido por esta change** — mitigado por
  manter o `@Value` intocado (CA2) e deixar a decisão explícita em Open Questions, não implícita.

## Impact

- **Repositórios:** só `apps/menthoros-backend`.
- **Classes criadas:** `services/impl/AdherenceCalculator`.
- **Classes tocadas:** `services/impl/AtletaProgressServiceImpl`,
  `services/impl/ProgressaoTreinoServiceImpl`.
- **Testes:** novo `AdherenceCalculatorTest` (asserções de cálculo puro); `AtletaProgressServiceImplTest`
  ajustado para testar delegação via mock; `ProgressaoTreinoServiceImplTest` mantém caracterização
  de `calcularHistorico` com o `AdherenceCalculator` real.
- **API / banco:** nenhuma mudança.

## Open Questions & Assumptions

**Premissas assumidas:**
- O comportamento atual de cada um dos quatro métodos — e da flag, incluindo seu default atual
  (`false`) — é o comportamento desejado para esta change. Nenhuma correção de regra ou de default
  acontece aqui (ver Non-goals).

**Em aberto:**
- Qual das três regras de janela (4-semanas, ISO-fechada, 21-dias corridos) deve virar canônica,
  e se a flag deve ser aposentada — fica para a change futura de correção, informada pela
  visibilidade lado a lado que esta extração proporciona.
- **Default divergente da flag** (`@Value` em `false` vs. `application.yml` em `true`) — achado
  pela revisão adversarial do Codex em 2026-10-04: trocar o default muda a decisão de progressão
  (`REDUZIR` vs. `MANTER`) quando a propriedade está ausente, não é um ajuste de configuração
  neutro. Decidir qual default é o correto — e se vale a pena manter a flag — é uma decisão de
  produto para a change futura, não desta extração.
