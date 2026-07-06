**Tamanho:** M · **Trilha:** Full

## Why

Hoje um treino planejado que o atleta não executou fica preso em `PENDENTE` para
sempre. A única forma de finalizá-lo é o treinador abrir cada treino e clicar em
`marcar-perdido` (`PATCH /api/v1/treinos/{id}/marcar-perdido`) — um por um. Isso gera
três problemas na rotina do treinador:

- **Semana nunca fecha.** O `PlanoSemanal` só chega a `CONCLUIDO` quando todos os
  treinos estão finalizados (`REALIZADO` ou `PERDIDO`). Enquanto sobrar um `PENDENTE`
  passado, o plano fica em `EM_ANDAMENTO` indefinidamente e a geração da próxima
  semana não tem um marco claro de "semana anterior encerrada".
- **Trabalho manual repetitivo.** Fechar a semana de um atleta com 3 treinos perdidos
  custa 3 aberturas + 3 cliques. Multiplicado por dezenas de atletas, é puro atrito
  operacional — o oposto da estrela-guia do produto (otimizar a rotina do treinador).
- **Sinais de atenção incompletos.** A fila de atenção do coach só destaca treinos
  já marcados como `PERDIDO`/`PARCIAL`. Treinos esquecidos em `PENDENTE` não sobem,
  então o treinador não enxerga aderência real sem varrer a semana manualmente.

O treinador precisa de **uma ação única "encerrar a semana"** que finalize os treinos
passados não realizados, feche o plano da semana e sinalize que a próxima já pode ser
gerada — mantendo o treinador no controle (coach-in-the-loop).

## What Changes

- **Nova capability `encerramento-semana`** com uma regra de domínio única de fechamento,
  reutilizada por dois gatilhos.
- **Ação on-demand do treinador, um atleta** (`POST /api/v1/coach/planos/{planoId}/encerrar-semana`):
  finaliza os treinos `PENDENTE` passados daquele plano (marca `PERDIDO`), leva o `PlanoSemanal`
  a `CONCLUIDO` e retorna um resumo. Como é uma ação explícita do treinador, **não aplica carência**
  — o coach é a autoridade da decisão. A elegibilidade inclui o **dia corrente apenas no fim da semana**
  (`hoje == semanaFim`): permite fechar no domingo com o longão de sábado/domingo já marcado como perdido;
  no meio da semana só os estritamente passados são marcados (o treino de hoje fica `PENDENTE`).
- **Encerramento em lote da assessoria** (`POST /api/v1/coach/semanas/encerrar-lote`):
  encerra a semana corrente de **todos os atletas do tenant** de uma vez — o "ritual de domingo"
  do treinador. Reusa a mesma regra de elegibilidade on-demand (sem carência) por atleta, escopado ao
  `TenantContext` do request, **uma transação por atleta** (falha isolada), e retorna um resumo
  consolidado (por atleta + totais + falhas tipadas). É a ação de maior alavancagem: fecha dezenas
  de semanas em 1 clique.
- **Preview / dry-run do lote** (`POST /api/v1/coach/semanas/encerrar-lote/preview`): calcula o
  impacto ("23 treinos como perdidos para 8 atletas") **sem persistir**, para o treinador confirmar
  antes de disparar. Salvaguarda de confiança essencial para a adoção do lote — a reversibilidade
  por atleta é rede de segurança, não "desfazer".
- **Fechamento automático com carência (fallback)**: um scheduler diário fecha os planos
  semanais que o treinador **não** fechou manualmente, apenas depois de N dias do fim
  da semana (`semanaFim`), evitando marcar como perdido um treino que o atleta ainda pode
  registrar retroativamente. Multi-tenant: itera por tenant/atleta, populando o
  `TenantContext` a cada iteração (padrão do `StravaActivitySyncScheduler`).
  **Carência parametrizável**: o valor default é **3 dias**, configurável via property
  `menthoros.encerramento-semana.carencia-dias` (global). Não hardcoded em query — evita
  migration + recompilação para ajustar um número operacional. Assessorias com cadências
  distintas (ultra-endurance = 5d, HIIT = 1d) podem ser atendidas via override futuro
  por tenant (coluna em `tb_assessoria`), sem refactor da query.
- **Reversibilidade preservada**: registrar um treino retroativo (`registrarTreinoManualAtleta`
  / `marcar-realizado`) sobre um planejado que ficou `PERDIDO` volta o status para `REALIZADO`
  e recalcula o status do plano. Esta change garante que essa transição `PERDIDO → REALIZADO`
  funcione (hoje só está coberta a partir de `PENDENTE`).
- **Sinalização, não automação**: encerrar a semana emite um `SemanaEncerradaEvent` (com `origem`
  `ON_DEMAND`/`AUTOMATICO`) e deixa o plano `CONCLUIDO` — a **geração do próximo plano continua disparada
  pelo treinador**, nunca automaticamente. A IA propõe, o treinador aprova. O `origem` deixa o coach
  distinguir "eu fechei" de "o sistema fechou na madrugada".
- **Persistência da origem de encerramento**: coluna `origem_encerramento` (`VARCHAR(15)`, nullable,
  default null) adicionada ao `PlanoSemanal` (migration). Populada com `ON_DEMAND` ou `AUTOMATICO`
  no momento do encerramento. Habilita a **métrica-farol de adoção** (proporção on-demand ≥ 60%):
  sem essa coluna a métrica é inviável de calcular exceto por logs efêmeros. Consultável via query
  simples (`SELECT origem_encerramento, COUNT(*) ... GROUP BY 1`), dispensando infraestrutura de
  analytics no MVP.

### Não faz parte do escopo (Non-Goals)

- **Não** gera automaticamente o plano da próxima semana (segue coach-in-the-loop; só destrava).
- **Não** recalcula TSB/CTL/ATL — um treino `PERDIDO` não tem TSS; a série fisiológica usa apenas
  `TreinoRealizado` e permanece correta.
- **Não** altera `PARCIAL`/`LIVRE`/`REALIZADO` — só finaliza `PENDENTE` passado.
- **Preview é exclusivo do lote.** Não há preview do encerramento **individual** — o coach vê o resultado
  imediatamente na resposta da ação e ela é reversível (registro retroativo). O preview existe para a
  salvaguarda de confiança do **lote** (mutar dezenas de atletas de uma vez).
- **Frontend**: esta change é **backend-only** por decisão de decomposição. Os botões (individual + lote),
  a **tela de confirmação do preview** e a exibição do resumo vivem na change separada
  **`coach-encerrar-semana-ui`** (fast-follow bloqueante do valor). Esta change entrega os endpoints
  (incl. `/preview`) prontos para consumo; a fila de atenção já renderiza `PERDIDO`.

## Capabilities

### New Capabilities

- `encerramento-semana`

## Critérios de aceite

Formato Given/When/Then — cada critério verificável por um teste (unitário de serviço,
salvo indicação de camada).

1. **Fechar no domingo marca o longão do dia sem carência**
   **GIVEN** um plano cujo `semanaFim` é hoje (domingo) com o longão de sábado e o de domingo em `PENDENTE`
   **WHEN** o treinador chama `encerrarSemana(planoId)` no domingo
   **THEN** ambos os longões (sábado e domingo/hoje) são marcados `PERDIDO`, ignorando a carência de 3 dias.

2. **No meio da semana o treino de hoje é preservado**
   **GIVEN** um plano com `semanaFim` no futuro (fechamento na terça), com `PENDENTE` de segunda, um `PENDENTE` de hoje (terça) e treinos futuros
   **WHEN** o treinador chama `encerrarSemana(planoId)`
   **THEN** só o de segunda (`dataTreino < hoje`) vira `PERDIDO`; o de hoje e os futuros permanecem `PENDENTE` (o dia corrente só entra quando `hoje == semanaFim`).

3. **Plano fecha quando todos os treinos estão finalizados**
   **GIVEN** um plano onde, após o encerramento, todos os treinos estão `REALIZADO` ou `PERDIDO`
   **WHEN** `encerrarSemana(planoId)` conclui
   **THEN** o `PlanoSemanal.status` passa a `CONCLUIDO` e `prontoParaProximaSemana = true` no resumo.

4. **Encerramento não toca REALIZADO/PARCIAL/futuro**
   **GIVEN** um plano com treinos `REALIZADO`, `PARCIAL`, `LIVRE` e `PENDENTE` futuro
   **WHEN** `encerrarSemana(planoId)` roda
   **THEN** nenhum desses tem o status alterado (apenas `PENDENTE` passado é afetado).

5. **Idempotência**
   **GIVEN** um plano já `CONCLUIDO` sem `PENDENTE` passado
   **WHEN** `encerrarSemana(planoId)` é chamado de novo
   **THEN** nenhum treino muda, o status permanece `CONCLUIDO`, e o resumo retorna `treinosFinalizados = 0` sem lançar exceção.

6. **Scheduler automático respeita a carência de 3 dias**
   **GIVEN** um plano não `CONCLUIDO` cujo `semanaFim` foi há 2 dias, com `PENDENTE` passados
   **WHEN** o job diário de encerramento roda
   **THEN** o plano **não** é encerrado (carência de 3 dias ainda não decorreu).

7. **Scheduler automático fecha após a carência**
   **GIVEN** um plano não `CONCLUIDO` cujo `semanaFim` foi há 3+ dias, com `PENDENTE` passados
   **WHEN** o job diário roda
   **THEN** o plano é encerrado como no fluxo on-demand (pendentes → `PERDIDO`, plano → `CONCLUIDO`).

8. **Isolamento multi-tenant no scheduler**
   **GIVEN** planos elegíveis de dois tenants distintos
   **WHEN** o job varre e encerra
   **THEN** cada encerramento roda com o `TenantContext` do seu próprio tenant e nenhuma query cruza tenants.

9. **Reversibilidade PERDIDO → REALIZADO**
   **GIVEN** um treino planejado marcado `PERDIDO` pelo encerramento
   **WHEN** o atleta registra o treino retroativamente (`registrarTreinoManualAtleta`)
   **THEN** o planejado volta a `REALIZADO`, vincula ao `TreinoRealizado` e o status do plano é recalculado.

10. **Autorização**
    **GIVEN** um usuário sem papel de treinador/admin
    **WHEN** chama `POST /api/v1/coach/planos/{planoId}/encerrar-semana`
    **THEN** recebe 403 (endpoint exige `@PreAuthorize` de coach/admin e `@RequireTenant`).

11. **Encerramento em lote da assessoria**
    **GIVEN** um tenant com N atletas, cada um com uma semana corrente contendo `PENDENTE` passados
    **WHEN** o treinador chama `POST /api/v1/coach/semanas/encerrar-lote`
    **THEN** a semana corrente de cada atleta é encerrada (mesma regra de elegibilidade on-demand, sem carência), e a resposta traz um resumo por atleta + totais (nº de atletas processados, planos concluídos, treinos perdidos).

12. **Lote é escopado ao tenant do treinador**
    **GIVEN** atletas em dois tenants distintos
    **WHEN** um treinador do tenant A chama o encerramento em lote
    **THEN** apenas os atletas do tenant A são processados; nenhum atleta do tenant B é tocado.

13. **Lote resiliente a falha individual (com commit real)**
    **GIVEN** um lote de N atletas onde o encerramento do atleta *k* lança exceção
    **WHEN** o lote roda
    **THEN** os outros N-1 atletas ficam **persistidos** (`CONCLUIDO` commitado, verificado no banco/repo — não só "não lançou"), e o atleta *k* é reportado em `falhas` (`FalhaAtleta`).

14. **Preview do lote não persiste**
    **GIVEN** um tenant com atletas com `PENDENTE` passados
    **WHEN** o treinador chama `POST /api/v1/coach/semanas/encerrar-lote/preview`
    **THEN** a resposta traz o impacto projetado (treinos que seriam perdidos por atleta, planos que fechariam) e **nenhum** treino/plano é alterado no banco.

15. **On-demand no meio da semana avisa e não fecha**
    **GIVEN** um plano com `semanaFim` no futuro (fechamento na terça), com `PENDENTE` de segunda/terça e treinos futuros
    **WHEN** o treinador chama `encerrarSemana(planoId)`
    **THEN** só os `PENDENTE` com `dataTreino < hoje` viram `PERDIDO` (o treino de hoje é preservado, pois `hoje != semanaFim`), o plano **não** vai a `CONCLUIDO`, e o resumo traz um `aviso` de que a semana ainda não terminou.

16. **Elegibilidade usa a data no fuso America/Sao_Paulo**
    **GIVEN** o encerramento acionado no domingo às 22h BRT (segunda 01h UTC) e um treino planejado para a segunda seguinte
    **WHEN** o encerramento roda
    **THEN** o treino de segunda **não** é marcado `PERDIDO` (a data corrente é resolvida no fuso America/Sao_Paulo / via `CURRENT_DATE`, não no fuso do JVM).

17. **Plano sem treinos elegíveis fecha em vez de reprocessar**
    **GIVEN** um plano já passado (`semanaFim < hoje`) sem nenhum `PENDENTE` a finalizar (ou vazio) selecionado pelo fallback
    **WHEN** o fechamento automático roda
    **THEN** o plano vai a `CONCLUIDO` (ou sai da seleção) e **não** é reprocessado nas execuções seguintes.

18. **Corrida com registro retroativo não derruba o encerramento**
    **GIVEN** um treino que passa de `PENDENTE` a `REALIZADO` (registro do atleta) entre a seleção e a marcação
    **WHEN** o encerramento tenta finalizá-lo
    **THEN** esse treino é **ignorado** (não marcado, sem lançar) e os demais treinos do atleta são finalizados normalmente.

19. **On-demand persiste `origem_encerramento = ON_DEMAND`** *(task 2b)*
    **GIVEN** um plano encerrado pela ação do treinador (individual ou lote)
    **WHEN** o encerramento conclui
    **THEN** a coluna `origem_encerramento` do `PlanoSemanal` fica `ON_DEMAND`.

20. **Automático persiste `origem_encerramento = AUTOMATICO`** *(task 2b)*
    **GIVEN** um plano encerrado pelo scheduler
    **WHEN** o fechamento automático conclui
    **THEN** a coluna `origem_encerramento` fica `AUTOMATICO`.

21. **Planos pré-existentes têm origem nula** *(task 2b — migration nullable)*
    **GIVEN** planos já `CONCLUIDO` antes desta change (migration aplicada)
    **WHEN** a coluna é adicionada
    **THEN** `origem_encerramento` é `null` (sem backfill), e as consultas de métrica tratam `null` como categoria distinta.

22. **Carência do fallback é parametrizável** *(task 2c)*
    **GIVEN** `menthoros.encerramento-semana.carencia-dias = 5` e um plano cujo `semanaFim` foi há 4 dias com `PENDENTE` passados
    **WHEN** o job diário roda
    **THEN** o plano **não** é encerrado (4 < 5); com `semanaFim` há 5+ dias, é encerrado. O default da property é `3`.

23. **A métrica-farol de adoção é calculável** *(task 2b)*
    **GIVEN** planos encerrados com origens `ON_DEMAND` e `AUTOMATICO` (e pré-existentes `null`)
    **WHEN** a query `SELECT origem_encerramento, COUNT(*) FROM tb_plano_semanal GROUP BY origem_encerramento` roda
    **THEN** retorna as contagens segmentadas sem erro, permitindo calcular a proporção on-demand (≥ 60%).

24. **Atleta sem semana corrente é ignorado, não é falha** *(task 4.x — lote)*
    **GIVEN** um lote onde um atleta do tenant não tem plano na semana corrente
    **WHEN** o lote roda
    **THEN** esse atleta é contabilizado como "sem plano" (`atletasSemPlano`), **não** como falha, e não afeta a contagem de processados.

25. **Encerrar não gera o próximo plano (coach-in-the-loop)** *(task 2.2)*
    **GIVEN** um plano encerrado (on-demand ou automático)
    **WHEN** o encerramento conclui e publica `SemanaEncerradaEvent`
    **THEN** nenhum plano da próxima semana é gerado como efeito — a geração segue disparada pelo treinador.

26. **Evento só é entregue após o commit da transação** *(task 2.2 — AFTER_COMMIT)*
    **GIVEN** um encerramento de atleta que sofre rollback (falha/optimistic lock) após publicar o evento
    **WHEN** a transação é revertida
    **THEN** os consumidores do `SemanaEncerradaEvent` **não** são acionados (entrega em `@TransactionalEventListener(AFTER_COMMIT)`).

27. **Plano de outro tenant não é encontrado (endpoint on-demand)** *(task 3.x)*
    **GIVEN** um treinador do tenant A chamando o endpoint individual com um `planoId` do tenant B
    **WHEN** a requisição é processada
    **THEN** a resposta é 404 (via `@RequireTenant`), sem encerrar nada.

28. **`SemanaEncerradaEvent` é publicado com os campos obrigatórios** *(task 2.2)*
    **GIVEN** um plano encerrado (on-demand ou automático)
    **WHEN** o encerramento conclui
    **THEN** um `SemanaEncerradaEvent` é publicado contendo `planoId`, `atletaId`, `tenantId`, número de treinos marcados `PERDIDO` e `origem` (`ON_DEMAND` ou `AUTOMATICO`).

29. **Carência default é 3 dias quando a property não está definida** *(task 2c)*
    **GIVEN** `menthoros.encerramento-semana.carencia-dias` não configurada (default 3) e um plano não `CONCLUIDO` cujo `semanaFim` foi há 3 dias
    **WHEN** o job diário roda
    **THEN** o plano é encerrado.

## Métrica de sucesso

Ligada à rotina do treinador:

- **Cliques para fechar a assessoria inteira**: de *N atletas × M treinos perdidos* (um clique por
  treino) para **1 clique** (encerramento em lote) — meta primária, maior alavancagem para "atender
  mais atletas".
- **Cliques para fechar uma semana de um atleta**: de *M* para **1** (ação on-demand individual).
- **Adoção (on-demand vs automático)**: proporção de encerramentos disparados **pelo coach** (on-demand
  individual + lote) vs pelo scheduler. Meta: o on-demand **domina** após a adoção (≥ 60% dos
  encerramentos). *Automático alto sinaliza que o botão não entrou no ritual — não sucesso.* Esta é a
  métrica-farol de produto (corrige a leitura ingênua de "% que fecha sozinho").
- **Cobertura**: **% de planos semanais que chegam a `CONCLUIDO`** (por qualquer via) sobe para **≥ 95%**
  em 4 semanas — o fallback garante que nada fique preso em `EM_ANDAMENTO`, mas não é o farol de adoção.
- **Tempo até o plano da semana anterior estar encerrado** (marco para gerar a próxima): mediana
  ≤ `semanaFim + 3 dias` (garantido pelo fallback automático).

## Open Questions & Assumptions

**Premissas assumidas** (validar com o treinador / product-reviewer):
- A ação on-demand do treinador **não** aplica carência (coach = autoridade). O fallback automático aplica 3 dias. *(assumido a partir das respostas do usuário)*
- Encerrar a semana **não** dispara a geração da próxima — só emite evento e deixa `CONCLUIDO`. *(alinha com a estrela-guia; a validar no product-review)*
- Carência de 3 dias medida a partir de `semanaFim` do plano (não por treino individual) no fallback automático.

**Decisões tomadas** (antes eram Open Questions):
- **Back/front divididos**: esta change é backend-only; a UI (botões + confirmação do preview) é a change
  separada `coach-encerrar-semana-ui`, fast-follow **bloqueante** do valor (a métrica de adoção só começa a
  medir quando a UI subir). Justificativa: o backend entrega valor sozinho (o fallback fecha as semanas), então
  cada split é independentemente mergeável.
- **On-demand no meio da semana** (product-review P3): regra refinada — o dia corrente só é finalizado quando
  `hoje == semanaFim`; no meio da semana só os estritamente passados viram `PERDIDO` e o resultado traz `aviso`.
- **Visibilidade do fallback** (product-review P2): resolvida em dois níveis — o `SemanaEncerradaEvent` carrega
  `origem` (ON_DEMAND/AUTOMATICO) **nesta change** (o coach vê pela dashboard/fila); o digest/notificação ativa
  é responsabilidade de `add-weekly-athlete-review`.

**Em aberto:**
- **Lote assíncrono**: síncrono no MVP (uma transação por atleta, request incremental). Para assessorias muito
  grandes, avaliar job assíncrono + polling/notificação.
- **Notificação ao atleta**: **decidido** (2026-07-05) — **não** notifica nesta change; aceitável para o beta. O treinador comunica manualmente e a comunicação proativa fica com `add-weekly-athlete-review`.
- **Granularidade do fallback**: o scheduler encerra por atleta ou também consolida um "resumo semanal" para o coach? (assumido só o encerramento; consolidação é de `add-weekly-athlete-review`).

## Impact

**Produto:**
- Remove atrito operacional recorrente do treinador (fechar semana = 1 clique).
- Dá um marco claro de "semana encerrada" para a geração da próxima (integra com `coach-batch-plan-generation`).
- Melhora a fidelidade da fila de atenção e da aderência (pendentes esquecidos passam a contar como perdidos).

**Backend:**
- Nova capability/serviço de encerramento + endpoint coach + scheduler diário.
- Nova query em `TreinoPlanejadoRepository` (pendentes passados de um plano) e em `PlanoSemanalRepository` (planos elegíveis ao fallback).
- Sem mudança de schema (reusa `TreinoExecucaoStatus`/`PlanoStatus` existentes).

**Dependências:**
- Produz o estado `CONCLUIDO` consumido por `coach-batch-plan-generation` (não bloqueante).
- `PERDIDO` alimenta `add-continuous-daily-load-management` / fila de atenção (sem recálculo de TSB aqui).
