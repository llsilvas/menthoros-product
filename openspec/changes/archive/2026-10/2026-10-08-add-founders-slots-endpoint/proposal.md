**Tamanho:** S · **Trilha:** Fast

## Why

O número de vagas da turma fundadora diverge entre bio do Instagram (4), post fixado (10), site
(10) e post de 02/10 ("todas convidadas") — é texto digitado à mão em cada lugar. O frontend
(`add-waitlist-value-proposition`, PR #152) já centralizou as ~6 ocorrências soltas de "10 vagas"
numa única constante em `content.ts`, mas só trocou a *forma* da duplicação: continua sendo um
número fixo, não um dado vivo. Falta a fonte de verdade no backend para o front ler de verdade.

Origem: BE-04 da análise de conversão do Instagram
(`menthoros-product/artifacts/instagram-conversao-specs-backend.md`).

## What Changes

Somente `apps/menthoros-backend`. Sem migration: reaproveita a tabela `tb_founding_invite`, que já
existe (`FoundingInvite`, convite de assessoria fundadora emitido pelo ADMIN a partir de um
inscrito da waitlist).

- `GET /api/v1/founders/slots`, público, sem autenticação (mesmo padrão de
  `PublicEndpointRateLimitFilter` — endpoint público pré-signup, sem `@RequireTenant`):
  ```json
  { "total": 10, "taken": 6, "remaining": 4, "open": true }
  ```
- `total`: configurável via `app.founding-invite.total-slots` (default `10`) — não hardcoded no
  endpoint, para um ajuste não exigir deploy de código (só variável de ambiente/restart).
- `taken`: contagem de `FoundingInvite` com `invalidatedAt IS NULL` — convite "aberto" (enviado,
  ainda não convertido) ou já convertido em assessoria conta como vaga ocupada; um convite
  invalidado (reenvio gerou outro) não conta duas vezes. Novo método no
  `FoundingInviteRepository` (`countByInvalidatedAtIsNull`).
- `remaining = max(total - taken, 0)`; `open = remaining > 0`.
- Cache curto em processo (Caffeine, TTL ~30s, mesmo padrão de `PublicEndpointRateLimitFilter`) —
  **não** usa o `CacheManager` compartilhado de `CacheConfig`: todos os caches nomeados ali
  herdam o `defaultTtl` único de 30 minutos (TTL por cache "não implementado", conforme comentário
  no próprio arquivo), o que violaria o critério de refletir um convite novo em segundos.
- Sem mudança no fluxo de emissão de convite (`FoundingInviteServiceImpl`): nenhum teto é
  **aplicado** aqui — o endpoint só reporta a contagem. Bloquear emissão quando `remaining == 0` é
  decisão de produto separada, fora de escopo.

## Non-Goals

- Não implementa o consumo no frontend (`FE-04`) — troca da constante estática por uma chamada a
  este endpoint em `/waitlist` e na home. Fica para uma change de frontend separada, deliberadamente
  dissociada desta: há uma sessão em paralelo iterando ativamente no repo do frontend agora.
- Não bloqueia a emissão de convite quando as vagas acabam — o endpoint é só leitura/relato.
- Não adiciona ajuste manual via painel admin — o ajuste é a variável de configuração `total-slots`.
- Não toca o fluxo "agente de marketing consome o mesmo endpoint antes de postar sobre vagas" citado
  na spec original — é uso do endpoint por outro sistema, não implementação.

## Critérios de aceite

1. **Contagem correta** — Given 3 `FoundingInvite` não invalidados e 10 vagas configuradas, When
   `GET /api/v1/founders/slots`, Then a resposta é `{total:10, taken:3, remaining:7, open:true}`.
2. **Convite invalidado não conta** — Given um convite invalidado por reenvio (gerou um novo
   convite aberto para o mesmo inscrito), Then a contagem de `taken` reflete só o convite vigente,
   não os dois.
3. **Vagas esgotadas** — Given `taken >= total`, Then `remaining: 0` e `open: false` (nunca
   negativo).
4. **Sem deploy para ajustar** — Given a variável `app.founding-invite.total-slots` mudada no
   ambiente, When a aplicação reinicia, Then `total` reflete o novo valor sem alteração de código.
5. **Cache curto** — Given um convite novo emitido, When `GET /api/v1/founders/slots` é chamado
   dentro da janela de cache, Then pode retornar o valor anterior (até a expiração do TTL ~30s);
   depois da expiração, reflete o valor atual.

## Métrica de sucesso

Proxy mecânico: os 5 critérios de aceite acima, cobertos por teste de integração
(`FoundersSlotsControllerIT` ou equivalente). A métrica de produto real (home e `/waitlist` lendo o
mesmo número, sem deploy) só se materializa quando o frontend consumir este endpoint — fora desta
change.

## Open Questions & Assumptions

- **Premissa:** `taken` conta convites não invalidados (abertos + convertidos), não leads da
  waitlist com algum status — a tabela `tb_waitlist` não tem campo de status/segmento hoje (isso é
  `BE-02`, não implementado). `FoundingInvite` já modela exatamente "alguém da turma fundadora foi
  convidado", que é o evento que ocupa uma vaga.
- **Premissa:** o endpoint é público e não vaza PII — retorna só números agregados, nunca
  nome/e-mail dos convidados.
- **Aberto:** classifiquei como Fast apesar de criar um endpoint público novo, porque não muda
  contrato existente, não mexe em schema (migration) e não tem risco de multi-tenancy (dado
  global, pré-signup). Se o founder preferir tratar toda API pública nova como Full por padrão,
  reclassificar antes do QA.
- **Aberto:** o cache em processo (Caffeine local ao serviço) não é compartilhado entre réplicas —
  com mais de uma réplica, `taken` pode divergir até 30s entre instâncias. Aceitável para o volume
  atual (10 vagas, baixíssima frequência de emissão de convite); documentar se o backend ganhar
  réplicas antes disso ser revisitado.
