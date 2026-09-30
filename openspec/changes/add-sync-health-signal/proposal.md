**Tamanho:** M · **Trilha:** Full

> **Status: aguardando medição (2026-09-30).** Não implementar antes de `fix-sync-cursor-data-loss`
> (que corrige perda de dado nos pulls e passa a registrar o resultado de cada pull) e de 4 semanas de
> medição prospectiva com esse registro. O gate retroativo da task 0 é inviável: `ativo`/`lastSyncError`
> guardam só o estado atual. Decisão do founder após o pré-mortem.

# add-sync-health-signal

Dois repositórios, **migration** (coluna nova em `tb_integracao_externa`) e campo novo no perfil do coach.
Primeira de duas changes; a segunda, `add-attention-reason-sem-sincronizacao`, leva o mesmo sinal à fila
de atenção e depende desta. Origem: "Proposta nova" de `fix-coach-diagnosis-charts` (arquivada em
2026-09-29), cotada com ROI 0,67 e **confiança de 50%**.

## Por quê

Quando o atleta some, a aba Diagnóstico diz "Sem treinos registrados de dd/MM a dd/MM" — neutro, porque o
sistema não sabe a causa. Mas são duas situações com ações diferentes para o coach:

- **O atleta parou** → contato (engajamento, retenção).
- **O treino não chegou** (token revogado, integração com erro, sync parado) → pedir reconexão (problema
  técnico; o atleta pode estar treinando normalmente).

Hoje o coach não distingue as duas pela tela e liga para cobrar um atleta que está treinando — ou não
percebe que o atleta parou porque supõe que "é o sync".

O dado para distinguir não existe de forma confiável: no intervals.icu, `IntegracaoExterna.ultimaSincronizacao`
mistura o **push** de treino planejado (`now()`) com o **cursor** do pull de atividades (horário da última
atividade processada). Não há "último pull de atividades com sucesso". No Strava, falha desativa a conexão;
no intervals, a conexão segue ativa com `lastSyncError`.

## Gate — medir antes de construir (task 0)

A hipótese é que **parte relevante das inatividades é sync**. Antes de qualquer código: no homelab, para
cada atleta com lacuna de registro (≥ 10 dias sem TSS) ou `INATIVIDADE` na fila nos últimos 60 dias,
classificar a lacuna em: conexão com `lastSyncError`, conexão desativada, conexão ok, sem integração.

- **Segue** se ≥ 20% das lacunas de atletas com integração coincidem com conexão com erro ou desativada.
- **Para** (change arquivada como "hipótese não confirmada", resultado registrado) abaixo disso.

## O que muda (se o gate passar)

- **Backend:**
  - Coluna `ultimo_pull_sucesso_em` em `tb_integracao_externa` (V98 ou a próxima livre): gravada pelos
    schedulers de pull de atividades (intervals.icu e Strava) quando o pull termina sem erro, **separada
    do push**. `ultimaSincronizacao` segue como está (compatibilidade).
  - Saúde da sincronização por atleta, considerando as conexões **intervals.icu e Strava** ativas:
    `OK` (algum pull com sucesso recente), `COM_ERRO` (erro na conexão mais recente e nenhum pull ok
    depois), `SEM_INTEGRACAO` (nenhuma conexão). "Recente" = dentro da janela de lacuna (10 dias).
  - Perfil do coach: `syncHealth` (`status`, `lastSuccessfulPullAt`, `lastError` resumido, sem detalhe
    técnico sensível).
- **Front (Diagnóstico):** a lacuna aberta de atleta com `COM_ERRO` diz **"Sem sincronização desde dd/MM"**
  (com a plataforma) e sugere pedir reconexão; com `OK` ou `SEM_INTEGRACAO`, segue "Sem treinos
  registrados". Atleta só manual/.fit fica como hoje (decisão do founder).

## Fora do escopo

- Motivo `SEM_SINCRONIZACAO` na fila de atenção (change seguinte).
- Sugestão de IA para reconexão (decisão do founder: só fila, na change seguinte).
- Reconexão pelo coach em nome do atleta; notificação ao atleta.
- Garmin/Polar/Wahoo/TrainingPeaks (sem conexão com pull hoje).

## Critérios de aceite

- **CA0 — Gate.** O resultado da medição está registrado no `tasks.md` antes de qualquer código; abaixo de
  20%, a change para.
- **CA1 — Pull separado do push.** Given um push de treino planejado no intervals.icu, When ele grava,
  Then `ultimo_pull_sucesso_em` não muda; Given um pull de atividades sem erro, Then ela é atualizada.
- **CA2 — Falha não avança o pull.** Given um pull com 401 (token revogado), Then `ultimo_pull_sucesso_em`
  não muda e `lastSyncError` é gravado.
- **CA3 — Status por atleta.** Given intervals com erro e Strava sem conexão, Then `COM_ERRO`; Given
  intervals com erro e Strava com pull ok há 2 dias, Then `OK`; Given nenhuma conexão, Then
  `SEM_INTEGRACAO`.
- **CA4 — Diagnóstico.** Given lacuna aberta desde 16/09 e `COM_ERRO` no intervals.icu com último pull ok
  em 15/09, When o coach abre o Diagnóstico, Then a legenda diz "Sem sincronização com o intervals.icu desde
  15/09"; Given `OK`, Then "Sem treinos registrados desde 16/09".
- **CA5 — Sem vazamento.** `lastError` no perfil é um resumo ("token revogado", "falha de conexão"), nunca a
  mensagem crua da API externa.
- **CA6 — Tenant.** A saúde é resolvida só com conexões do tenant do atleta.

## Métrica de sucesso

**Ligações de cobrança a atleta que estava treinando = 0** para os casos cobertos. Medida: das lacunas
abertas com `COM_ERRO` nas 4 semanas após o deploy, % em que o coach pediu reconexão (e não cobrou o
atleta) — pergunta aos coaches do piloto e, quando a change da fila existir, o motivo acionado.
Secundária: tempo entre a falha de sync e a reconexão, antes vs. depois (via `ultimo_pull_sucesso_em`).

## Open Questions & Assumptions

- **Limiar do gate (20%)** e **"recente" = 10 dias** (mesmo limiar da lacuna): valores iniciais.
- **Pull "sem erro" com zero atividades conta como sucesso** (o atleta pode não ter treinado) — é o que
  separa "sync ok, atleta parado" de "sync quebrado".
- **Backfill:** `ultimo_pull_sucesso_em` nasce nula; até o primeiro pull depois do deploy, o status usa
  `ativo`/`lastSyncError` (conexão ativa sem erro = `OK`). Assumido suficiente — um pull ocorre a cada 2h.
- **Decisões do founder (2026-09-30):** duas changes com gate de medição; intervals.icu e Strava contam;
  atleta sem integração fica como `INATIVIDADE`; sem sugestão de IA.


## Revisões antes da implementação (2026-09-30)

- **product-reviewer: Refine (Go condicionado ao gate).** O gate mede correlação, não a decisão do coach;
  20% sem justificativa; falta denominador (atletas com integração no piloto) e n mínimo; estado atual ≠
  estado durante a lacuna. Alternativa barata não avaliada: mostrar `ativo`/`lastSyncError` já existentes
  no Diagnóstico, sem coluna — pode dar a maior parte do valor. O valor de rotina está mais na fila (change
  seguinte) do que na legenda do Diagnóstico. Métricas: instrumentar o clique em "Pedir reconexão".
- **Pré-mortem Codex: NO-GO.** Conferidos no código e **procedentes**: (1) push do intervals.icu avança o
  cursor do pull (perda de atividades) e (2) paginação/cursor do Strava perdem corridas — viraram
  `fix-sync-cursor-data-loss`. Também: retorno normal do scheduler não prova sucesso (falhas absorvidas);
  webhook do Strava não é pull e não pode renovar o marcador; Strava desativa sem registrar erro e a
  desconexão voluntária preserva erro antigo; `autoSyncPausado`, conexão nova e coluna nula viram `OK`
  indefinidamente (precisa de estado pausado/desconhecido); `lastSyncError` sem instante nem origem. Tudo
  a reescrever com o registro de resultado de pull da change de correção.
