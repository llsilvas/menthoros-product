**Tamanho:** L · **Trilha:** Full

# fix-sync-cursor-data-loss

Um repositório (backend) com **migration** e comportamento de ingestão de dados reais de atleta. Full pelo
risco: um erro aqui perde ou duplica treinos, que alimentam PMC, aderência e o motor de plano. Origem:
pré-mortem Codex de `add-sync-health-signal` (2026-09-30); os defeitos foram conferidos no código. Subiu de M
para L depois do pré-mortem desta própria change, que achou mais três caminhos de perda.

## Por quê

Treino que o atleta fez pode **nunca chegar** ao Menthoros, sem erro visível. O pull de atividades usa
`IntegracaoExterna.ultimaSincronizacao` como cursor ("busque a partir daqui"), mas **cinco caminhos** gravam
nesse campo sem ter importado nada até ali:

1. **Push do intervals.icu** grava `now()` (`IntervalsIcuPushListener.java:112`,
   `IntervalsIcuRetrySchedulerImpl.java:146`). Com o pull atrasado, um plano aprovado pelo coach salta o
   cursor para hoje; o pull busca a partir de `cursor − 7 dias` e o que ficou para trás sai da janela.
2. **Webhook do Strava** grava `now()` a cada evento (`StravaActivityServiceImpl.java:171`).
3. **Sync manual do Strava** grava `now()` ao fim (`:204`), mesmo quando o rate limit interrompeu a varredura.
4. **Paginação do Strava** para quando a página *filtrada* (só corridas) vem vazia (`:296`, `:372`): 30
   atividades seguidas de outra modalidade encerram a varredura, e sem corrida processada o cursor vai para
   `now()` (`:331`).
5. **Backlog do intervals.icu com mais de 90 dias** é rejeitado pela validação do import manual, reusada
   pelo scheduler (`IntervalsIcuActivityIngestionServiceImpl.java:122`), tratado como erro permanente — e o
   cursor passa por cima.

Além disso, o cursor do Strava lê `start_date_local` como UTC (`:459`): no Brasil erra para trás (seguro),
mas em fusos positivos pula corridas.

Para o coach: um atleta aparece com lacuna, inativo na fila ou com aderência baixa por treinos que fez, e o
motor pode reduzir o plano dele. E não há registro de que o pull funcionou.

## O que muda

- **Cursor exclusivo do pull** (`pull_cursor`, coluna nova): só os schedulers de pull do intervals.icu e do
  Strava o avançam, e só até o último item **confirmado** (importado, ou descartado por motivo realmente
  permanente). Atualizado por `UPDATE` pontual (sem salvar a entidade inteira, que outros escritores
  concorrentes sobrescreveriam). `ultimaSincronizacao` **mantém o significado atual** (última atividade de
  sync, exibida ao coach e usada no cooldown do sync manual) — push, webhook e sync manual seguem gravando
  nela sem afetar o pull.
- **Strava:** paginação termina pela página **original**; cursor a partir de `start_date` (UTC), com o
  overlap existente para empates e uploads tardios; sem corrida processada, o cursor não avança. **Validar**
  a ordenação da API com `after` + `page` antes de implementar (task 0).
- **intervals.icu:** o limite de retroatividade do import manual (90 dias) não vale para o scheduler —
  backlog antigo não é "permanente".
- **Registro mínimo de cada pull** (`tb_sync_pull_log`: plataforma, atleta, tenant, instante, resultado
  `COMPLETO`/`PARCIAL`/`FALHA`, categoria do erro, inserções reais), gravado **fora** da transação do pull.
  É o instrumento da métrica abaixo e da medição prospectiva de `add-sync-health-signal`. Retenção de 90
  dias, expurgo diário em lotes por instante.
- Migration aditiva (V98 ou a próxima livre): `pull_cursor` com backfill a partir de `ultimaSincronizacao`,
  e a tabela.

## Fora do escopo

- Recuperar atividades já perdidas (reimportação) — follow-up, se a linha de base mostrar perda real.
- Saúde da sincronização no perfil e na fila (`add-sync-health-signal`, em espera).
- Mudar o que push, webhook e sync manual gravam em `ultimaSincronizacao`.

## Critérios de aceite

- **CA1 — Push não move o pull.** Given `pull_cursor` em D−20, When um push conclui, Then `pull_cursor`
  continua em D−20 e o próximo pull busca a partir de D−20 menos o overlap.
- **CA2 — Webhook e sync manual não movem o pull.** Given `pull_cursor` em D−20, When chega um webhook ou o
  sync manual termina com rate limit, Then `pull_cursor` continua em D−20.
- **CA3 — Página só de outras modalidades.** Given a página 1 do Strava com 30 atividades de bike e a
  página 2 com 3 corridas, Then as 3 corridas são importadas.
- **CA4 — Sem progresso, cursor parado.** Given rate limit na primeira página de uma conexão nova, Then
  `pull_cursor` continua nulo e o pull é `FALHA`/`RATE_LIMIT`.
- **CA5 — Backlog antigo no intervals.icu.** Given `pull_cursor` em D−120, When o scheduler roda, Then as
  atividades de D−120 a D−90 são importadas, não descartadas.
- **CA6 — Fuso.** Given uma corrida com `start_date` 06:00Z e `start_date_local` 09:00 (UTC+3), Then o
  cursor usa 06:00Z.
- **CA7 — Relistar não duplica nem apaga enriquecimento.** Given uma atividade já importada com RPE do
  atleta, When ela é relistada, Then não há duplicata, o RPE fica e ela não conta como inserção.
- **CA8 — Registro fora da transação.** Given um pull cujo lote faz rollback, Then o registro `FALHA`
  existe.
- **CA9 — Tenant.** Registro e `pull_cursor` sempre com o tenant da integração.

## Métrica de sucesso

**Treinos que não chegam = 0**, com linha de base. **Antes do deploy** (task 0): nos atletas do piloto com
integração, comparar por amostra as atividades de corrida dos últimos 60 dias na API (intervals.icu,
Strava) com as importadas — atividades faltantes por atleta. **4 semanas depois:** a mesma comparação
(meta: 0 faltantes em janelas de pull `COMPLETO`) e, do lado do coach, atletas do piloto com lacuna ou
`INATIVIDADE` que tinham treino na API (meta: 0). Mecânica secundária: pulls `PARCIAL`/`FALHA` seguidos de
recuperação no ciclo seguinte.

## Open Questions & Assumptions

- **Ordenação do Strava com `after` + `page`:** a documentação legada diz ascendente; a atual não diz.
  Avançar o cursor por prefixo exige ordem cronológica — validar numa chamada real (task 0). Se não for
  ascendente, o cursor só avança ao fim da varredura completa.
- **Backfill de `pull_cursor`** a partir de `ultimaSincronizacao`: herda um valor que pode já ter sido
  adiantado; perda antiga não é recuperada (fora do escopo).
- **Relistar atleta de outra modalidade** a cada ciclo custa requisições de listagem (sem detalhe).
- **Decisão do founder (2026-09-30):** esta correção vem antes das changes de sinal de sincronização.

## Revisões antes da implementação (2026-09-30)

- **product-reviewer: Refine.** As correções são o núcleo; o registro de pull deve ser mínimo e justificado
  como instrumento da métrica; métrica do lado do coach com linha de base. Incorporado.
- **Pré-mortem Codex: NO-GO → incorporado.** Conferidos no código e procedentes: webhook e sync manual
  também gravam `now()` no cursor; `start_date_local` lido como UTC; o scheduler do intervals.icu herda o
  limite de 90 dias do import manual e descarta backlog como permanente; o registro de pull ficaria dentro
  da transação; relistar pode sobrescrever enriquecimento e contar update como inserção; salvar a entidade
  inteira permite sobrescrita concorrente; `ultimaSincronizacao` nula quebraria consumidores do status
  (resolvido mantendo o campo). Desenho trocado para cursor exclusivo do pull.
