# sync-fc-atleta-intervals-icu-sport-settings — sincroniza FC máx/limiar do atleta pro intervals.icu na conexão

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-09-18

> Origem: investigação de bug relatado em 2026-09-17 — um treino chegou no relógio do atleta com FC
> alvo bem acima do prescrito (`210`/`228`/`210` bpm vs. `107-121`/`121-126`/`107-121` enviados).
> Investigação completa (fórum + matemática) em `proposal.md`/discussão da sessão: os alvos que o
> Menthoros manda como bpm absoluto (`units: "bpm"`) batem quase exatamente com uma interpretação em
> que o intervals.icu trata o número como **percentual bruto de FC máx**, expandido contra a
> **FC máx configurada na conta do atleta no intervals.icu** — não a do Menthoros. No caso
> investigado: Menthoros tem `fcLimiar=142`/`fcMaxima=172`; o intervals.icu tinha `lthr=168`/
> `max_hr=185` — divergência de +18% a +26 bpm. Postar no fórum deles não deu certo (sem resposta).

## Why

Duas causas possíveis coexistem e não são mutuamente exclusivas: (1) o intervals.icu pode não estar
honrando `units:"bpm"` como alvo absoluto — hipótese não confirmada por documentação pública nem por
resposta do suporte deles; (2) **mesmo que honrasse**, os dados fisiológicos do atleta estão
**divergentes entre os dois sistemas**, porque o Menthoros nunca escreveu essa informação lá — o
atleta cadastrou (ou o intervals.icu estimou) valores próprios, sem qualquer sincronização.

A causa (2) é a única que o Menthoros controla e pode corrigir sem depender de resposta externa. A
API do intervals.icu tem `PUT /api/v1/athlete/{athleteId}/sport-settings/{id}`, aceitando os campos
`lthr` (FC de limiar) e `max_hr` (FC máx) — confirmado no OpenAPI spec deles
(`GET https://intervals.icu/api/v1/docs`).

## What Changes

- Novo método no client HTTP da integração: `IntervalsIcuClient.atualizarSportSettings(token,
  externalAthleteId, sportSettingsId, payload)` — `PUT /api/v1/athlete/{id}/sport-settings/{id}`,
  mesmo estilo de `atualizarEvento` (erro HTTP vira `IntervalsIcuApiException`, sem log do token).
- Logo após a conexão OAuth ser persistida com sucesso em
  `IntervalsIcuOAuthServiceImpl.exchangeCodeForToken` (mesmo ponto do hook existente
  `pausarStravaAutomaticamente`), sincronizar `atleta.fcLimiar`/`atleta.fcMaxima` pro
  intervals.icu como `{"lthr": ..., "max_hr": ...}` no sport-settings `"Run"`, com
  `recalcHrZones=true` (pra zona deles recalcular a partir do novo limiar).
- **Best-effort, não bloqueia a conexão:** se o atleta não tiver `fcLimiar` nem `fcMaxima`
  cadastrados no Menthoros, não manda nada (não sobrescreve com null). Se a chamada falhar
  (rede, 4xx/5xx), loga e segue — a conexão (`Resultado.SUCESSO`) não é afetada, mesmo padrão de
  `revogarBestEffort`.

### Non-goals

- Não sincronizar na edição do perfil do atleta — **não existe hoje** nenhum fluxo de coach editando
  `fcLimiar`/`fcMaxima` (`AtletaInputDto` não tem esses campos; só há inferência automática separada
  em `PlanoMetaDados.fcLimiarEstimado`, entidade diferente). Fica fora de escopo — abrir change
  própria se/quando esse fluxo de edição existir.
- Não muda `IntervalsIcuAdapter.montarHr`/`units:"bpm"` — essa é a correção estrutural (b) cogitada
  na investigação, condicionada à confirmação de que `units:"bpm"` não é honrado pelo intervals.icu.
  Sem resposta do fórum, fica em aberto; esta change só ataca a causa (2), que é certa e controlável.
- Não sincroniza `threshold_pace` nem `hr_zones` além do recálculo automático via
  `recalcHrZones=true` — fora do escopo do bug relatado.
- Sem migration, sem mudança de contrato de API pública do Menthoros, sem alteração no frontend.

## Critérios de aceite

**CA1 — conexão bem-sucedida sincroniza FC quando o atleta tem os dados**
Given um atleta com `fcLimiar=142` e `fcMaxima=172` no Menthoros
When ele conecta a conta do intervals.icu com sucesso
Then o Menthoros chama `PUT /api/v1/athlete/{externalId}/sport-settings/Run?recalcHrZones=true`
com corpo `{"lthr": 142, "max_hr": 172}`.

**CA2 — atleta sem FC cadastrada não sobrescreve nada**
Given um atleta com `fcLimiar=null` e `fcMaxima=null`
When ele conecta a conta do intervals.icu
Then nenhuma chamada de sport-settings é feita.

**CA3 — falha no sync não derruba a conexão**
Given a chamada de sport-settings falha (timeout, 4xx, 5xx)
When a conexão OAuth já foi persistida com sucesso
Then `exchangeCodeForToken` ainda retorna `Resultado.SUCESSO`, e o erro é logado sem o token.

**CA4 — apenas um dos dois campos presente ainda sincroniza**
Given um atleta com `fcLimiar=142` e `fcMaxima=null`
When ele conecta
Then o corpo enviado é `{"lthr": 142}` (sem `max_hr`, sem sobrescrever com `null`).

## Métrica de sucesso

Divergência entre `fcLimiar`/`fcMaxima` do Menthoros e `lthr`/`max_hr` do intervals.icu cai a zero
para todo atleta que conecta a integração a partir desta change (não corrige o histórico de quem já
conectou antes — fora do escopo, ver Open Questions).

## Impact

- **Repositórios:** só `apps/menthoros-backend`.
- **Classes tocadas:** `IntervalsIcuClient`/`IntervalsIcuClientImpl` (novo método),
  `IntervalsIcuOAuthServiceImpl.exchangeCodeForToken` (novo hook best-effort).
- **API:** nenhuma mudança de contrato público do Menthoros.
- **Banco:** nenhuma.

## Open Questions & Assumptions

**Premissas assumidas:**
- `sportSettingsId = "Run"` (literal) é o identificador certo pro esporte corrida na API deles —
  baseado na descrição do endpoint GET equivalente ("by id or activity type e.g. Run, Ride etc.").
  Se estiver errado, a chamada falha com 404 e cai no caminho best-effort (CA3) — não quebra nada,
  só não sincroniza.
- Atletas que já conectaram antes desta change **não são resincronizados retroativamente** — só
  quem conectar (ou reconectar) a partir de agora. Resync em massa do histórico é decisão de produto
  separada, fora do escopo.

**Em aberto:**
- Não temos confirmação do intervals.icu se `units:"bpm"` é honrado como absoluto. Esta change reduz
  o impacto do problema (menos divergência entre os dois FCmax) mas não prova nem descarta a causa
  (1). Se o padrão `210/228/210` persistir mesmo com FC sincronizada, a causa (1) fica confirmada e
  abre a discussão de mudar `montarHr` pra `%lthr` nativo.
