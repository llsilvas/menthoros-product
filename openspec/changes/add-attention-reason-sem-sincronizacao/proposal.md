**Tamanho:** M · **Trilha:** Full

> **Status: aguardando `add-sync-health-signal`**, que aguarda medição (2026-09-30).

# add-attention-reason-sem-sincronizacao

Dois repositórios; muda o contrato da fila de atenção (valor novo em `MotivoAtencao`). **Depende de
`add-sync-health-signal`** — do gate de medição dela (se a hipótese não se confirmar, esta change é
arquivada junto) e da saúde da sincronização por atleta.

## Por quê

A fila de atenção sinaliza `INATIVIDADE` quando o último treino realizado, de qualquer fonte, tem 14 dias
ou mais. Ela não olha a integração: um atleta com o token do intervals.icu revogado entra como "Sem
atividade registrada há 16 dias" e o coach é levado a cobrar quem pode estar treinando. A ação certa é
outra — pedir reconexão —, e a fila é o lugar em que o coach decide o que fazer primeiro.

## O que muda

- **Backend:**
  - `MotivoAtencao.SEM_SINCRONIZACAO` — mesma severidade de `INATIVIDADE` (≥ 14 dias → ALTA), peso logo
    acima dela: quando os dois se aplicam, o motivo é a sincronização.
  - `CoachAttentionSignalEvaluator`: atleta com inatividade ≥ 14 dias **e** saúde `COM_ERRO` recebe
    `SEM_SINCRONIZACAO` ("Sem sincronização com o <plataforma> desde dd/MM"), não `INATIVIDADE`. `OK` e
    `SEM_INTEGRACAO` seguem como `INATIVIDADE` (decisão do founder: atleta só manual fica como hoje).
  - Saúde resolvida **em lote** por tenant (query nova), sem N+1 por atleta da fila.
  - `SugestaoCoachGeneratorJob`: `SEM_SINCRONIZACAO` entra em `MOTIVOS_IGNORADOS` — não gera sugestão de
    IA; a ação é do coach (decisão do founder).
- **Front:** rótulo e texto do motivo (`REASON_LABEL`, `MOTIVO_TEXTO`), ação primária "Pedir reconexão"
  (via mensagem ao atleta, como o "Contatar atleta" de engajamento), recência como na `INATIVIDADE`.

## Fora do escopo

- Reconexão feita pelo coach; notificação automática ao atleta.
- Sugestão de IA para o motivo.
- Rever a severidade MEDIA (7–13 dias) da inatividade, que hoje não chega à fila.

## Critérios de aceite

- **CA1 — Sync quebrado vira motivo próprio.** Given 16 dias sem treino e saúde `COM_ERRO` no intervals.icu,
  When a fila é montada, Then o motivo é `SEM_SINCRONIZACAO` com "Sem sincronização com o intervals.icu
  desde dd/MM", e não há `INATIVIDADE` para o mesmo atleta.
- **CA2 — Atleta parado continua inativo.** Given 16 dias sem treino e saúde `OK`, Then o motivo é
  `INATIVIDADE`.
- **CA3 — Sem integração.** Given 16 dias sem treino e `SEM_INTEGRACAO`, Then `INATIVIDADE`.
- **CA4 — Sem N+1.** Given uma fila com N atletas, Then a saúde é resolvida com um número constante de
  consultas (teste de contagem).
- **CA5 — Sem sugestão de IA.** Given o motivo `SEM_SINCRONIZACAO`, Then o job de sugestões não gera
  `SugestaoCoach`.
- **CA6 — Front exaustivo.** O novo valor tem rótulo, texto e ação; `tsc` falha se faltar algum mapa.
- **CA7 — Tenant.** A consulta em lote é do tenant da fila.

## Métrica de sucesso

**Cobranças de atleta "inativo" que era sync caem a zero.** Nas 4 semanas após o deploy: % de itens
`SEM_SINCRONIZACAO` resolvidos com reconexão (último pull com sucesso volta) em até 3 dias, e contagem de
itens `INATIVIDADE` de atletas com conexão com erro (meta: 0). Sinal qualitativo com os coaches do piloto.

## Open Questions & Assumptions

- **Peso acima de `INATIVIDADE`, abaixo de `ADERENCIA`:** assumido. Um atleta com sync quebrado e sem
  treino há 14 dias precisa de ação técnica antes de conversa sobre aderência? Confirmar na DoR.
- **"Pedir reconexão" reusa o fluxo de mensagem ao atleta** — sem fluxo novo.
- **Decisões do founder (2026-09-30):** motivo só na fila, sem sugestão de IA; atleta sem integração segue
  `INATIVIDADE`; intervals.icu e Strava contam.


## Revisões antes da implementação (2026-09-30)

- **product-reviewer: Refine (prematura; Go só se a primeira passar).** Não-objetivo explícito: sem
  auto-mensagem ao atleta. Confirmar o peso com um coach do piloto. Métrica: reconexão em ≤ 3 dias com
  baseline.
- **Pré-mortem Codex: NO-GO.** Peso 25 perde para `ADERENCIA` (30) e a reconexão some como ação principal;
  o job continua gerando sugestões para o motivo concorrente — definir precedência conjunta e testar
  motivos concorrentes. No front, aprovação de plano vence reconexão como ação primária; a recência da
  atividade não mede a interrupção do sync (precisa de data própria); `Record` exaustivo não protege
  cliente antigo — fallback para motivo desconhecido e emitir o motivo só depois do front compatível.
