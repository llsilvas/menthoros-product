**Tamanho:** M · **Trilha:** Full

> Full porque muda contrato de API (campos novos em `WaitlistInputDto`/`WaitlistOutputDto`, valor
> novo em `PerfilWaitlist`) e schema (migration aditiva em `tb_waitlist`) — e tem decisões de
> design não triviais (nome do novo papel, origem do `policyVersion`, onde a derivação do
> `segment` mora).

## Why

`add-waitlist-value-proposition`, `add-waitlist-lead-notifications` e `add-waitlist-funnel-endpoint`
já entregaram boa parte da spec de conversão do Instagram, mas todas evitaram deliberadamente tocar
o contrato de `POST /api/v1/waitlist` — por isso carregam a mesma aproximação em três lugares
diferentes (`perfil == TREINADOR` como proxy de "lead qualificado") e duas pendências registradas
no checklist de entrega (`instagram-conversao-specs-backend.md`):

- **BE-01 parcial**: falta o papel "dono de assessoria", `watchBrand`, origem da página (
  `landingPath`/`referrer`) e o campo `segment` na resposta.
- **BE-02 bloqueado**: a regra de qualificação (`QUALIFIED`/`OTHER_BRAND`/`ATLETA`) depende
  exatamente dos campos que faltam aqui.

Esta change fecha o contrato — só o backend; consumo no front (FE-02: opção "dono de assessoria" +
seletor de relógio no formulário) fica para uma change separada, mesmo padrão de
`add-founders-slots-endpoint` → `add-founders-slots-display`.

## What Changes

Somente `apps/menthoros-backend`. Migration V101, aditiva.

### 1. Papel "dono de assessoria" — `PROPRIETARIO`, não `OWNER`

A spec original (escrita sem acesso ao código) pedia `role: OWNER/COACH/ATHLETE`. O backend já tem
`UserRole.PROPRIETARIO` para exatamente este conceito (dono da assessoria, composite role no
Keycloak que inclui `TECNICO`). Usar `OWNER` em `PerfilWaitlist` criaria duas palavras para a mesma
ideia no mesmo domínio — `PerfilWaitlist` ganha o valor `PROPRIETARIO`, reaproveitando o vocabulário
já estabelecido, em vez de inventar um segundo.

`PerfilWaitlist` passa a ter três valores: `TREINADOR`, `PROPRIETARIO`, `ATLETA`. Os dois primeiros
são "lead parecido com treinador" para todo propósito que hoje olha só `TREINADOR` — ver item 3.

### 2. `watchBrand` — marca de relógio predominante

Novo enum `WatchBrand`: `GARMIN`, `COROS`, `POLAR`, `APPLE`, `OTHER`, `UNKNOWN`. Campo opcional em
`WaitlistInputDto`/coluna nullable em `Waitlist` — condicionalmente relevante para
`TREINADOR`/`PROPRIETARIO` (mesmo padrão de `qtdAtletas`, que já é "obrigatório só para treinador"
na validação do serviço, não via Bean Validation declarativo).

### 3. Correção de alcance: `TREINADOR` → "treinador ou proprietário" em 5 pontos

Adicionar `PROPRIETARIO` sem atualizar os pontos que hoje checam só `perfil == TREINADOR` deixaria
donos de assessoria como cidadãos de segunda classe assim que a opção existir — não notificados
(`WaitlistNotificationListener`), fora da contagem de qualificados (`WaitlistFunnelServiceImpl`),
sem o aviso da central de ajuda (`WaitlistDocsNotificationServiceImpl`), sem a faixa de atletas
salva (`WaitlistServiceImpl`), e **nem convidáveis para a turma fundadora**
(`FoundingInviteServiceImpl.invite` rejeita quem não é `TREINADOR`). `Waitlist` ganha
`isTreinadorOuProprietario()`; os 5 pontos passam a chamar o método em vez de repetir a comparação.

### 4. `landingPath`/`referrer` — de onde a inscrição veio

Dois campos novos, opcionais, só armazenamento (sem lógica própria ainda) — completam o rastro de
origem ao lado do UTM já capturado.

### 5. `policyVersion` — carimbado pelo servidor, nunca enviado pelo cliente

A spec original pedia `consent` + `privacyPolicyVersion` no payload de entrada. Já existe
`aceiteLgpd` (boolean) cumprindo o papel de `consent` — não duplicar. Para a versão da política,
**não** confiar no cliente (ele poderia mandar qualquer string): `WaitlistServiceImpl` já injeta
`LgpdProperties` (de `add-coach-lgpd-consent`) e carimba `Waitlist.policyVersion` com
`LgpdProperties.getPolicyVersion()` no momento do registro — mesma fonte de verdade que já define
qual versão da Política está em vigor para o fluxo autenticado do coach. Nome do campo
(`policyVersion`, não `privacyPolicyVersion`) segue o precedente de `UsuarioLgpdConsent.policyVersion`.

### 6. `segment` na resposta

`WaitlistOutputDto` ganha `segment` (`QUALIFIED`/`OTHER_BRAND`/`ATLETA`), derivado — nunca
persistido, mesma filosofia de `UsuarioLgpdConsent` ("não existe flag; é derivado"):
- `ATLETA` → `ATLETA`
- `TREINADOR`/`PROPRIETARIO` com `watchBrand == GARMIN` → `QUALIFIED`
- `TREINADOR`/`PROPRIETARIO` com qualquer outra coisa (incluindo `null`) → `OTHER_BRAND`

### 7. Idempotência por e-mail passa a atualizar (upsert), não só detectar

Hoje reenviar o mesmo e-mail só retorna `JA_INSCRITO` sem tocar a linha. A spec pede atualização.
Campos mutáveis (`nome`, `telefone`, `perfil`, `qtdAtletas`, `watchBrand`, `aceiteLgpd`,
`policyVersion`) são sobrescritos pelo reenvio — a pessoa pode ter corrigido o telefone ou trocado
de relógio. **UTM não é sobrescrito**: já capturado na primeira inscrição, atribuição é
first-touch por convenção de marketing — um reenvio sem UTM (ex.: alguém voltando direto ao site)
não pode apagar a origem real da campanha.

## Non-Goals

- Consumo no frontend (FE-02: opção "dono de assessoria" + seletor de `watchBrand` no formulário) —
  change separada, segue o padrão BE-04→FE-04.
- Terceiro segmento de e-mail/tela de sucesso para `OTHER_BRAND` (FE-05/BE-05 pendentes) — agora
  desbloqueado por este contrato, mas a implementação em si é outra change.
- `BE-02` completo (status lifecycle `NEW/QUALIFIED/INVITED/ACTIVE/DISCARDED`, endpoint de exclusão
  LGPD) — este contrato deixa o terreno pronto, mas o lifecycle de status é escopo próprio.
- Não renomeia `perfil`/`PerfilWaitlist` nem `aceiteLgpd` para inglês — são campos legados
  (pré-ADR-0007) que esta change toca, mas renomeá-los exigiria coordenação com o front em todos
  os pontos que já leem esse contrato (`AccessRequestForm.tsx`, `WaitlistPage.tsx`, os 3 templates
  de e-mail) sem ganho funcional nesta change — normalização de nome fica para quando (se) o front
  também for tocado por outro motivo.

## Critérios de aceite

1. **`PROPRIETARIO` tratado como treinador em tudo** — Given um lead `PROPRIETARIO` criado, Then
   recebe e-mail de confirmação de treinador, gera notificação ao founder, conta como `qualified`
   no funil, e pode ser convidado para a turma fundadora.
2. **`watchBrand` opcional, condicional** — Given `perfil=ATLETA`, When `watchBrand` é enviado,
   Then é ignorado na gravação (mesmo tratamento de `qtdAtletas` hoje).
3. **`segment` correto nos três casos** — Given `perfil=ATLETA` → `segment=ATLETA`; Given
   `perfil=TREINADOR, watchBrand=GARMIN` → `segment=QUALIFIED`; Given `perfil=PROPRIETARIO,
   watchBrand=COROS` (ou ausente) → `segment=OTHER_BRAND`.
4. **`policyVersion` nunca vem do cliente** — Given um corpo tentando enviar `policyVersion` (campo
   que não existe no DTO de entrada), Then o valor gravado é sempre
   `LgpdProperties.getPolicyVersion()` no momento do registro, nunca o do corpo.
5. **Upsert no reenvio** — Given um e-mail já inscrito como `ATLETA` reenvia como `TREINADOR` com
   telefone novo, When `POST /api/v1/waitlist`, Then a linha existente é atualizada (`perfil`,
   `telefone` novos) e `utmSource` original é preservado se o reenvio não trouxer UTM.
6. **Regressão** — `./mvnw clean verify` sem falhas nos testes existentes de `WaitlistServiceImpl`,
   `WaitlistNotificationListener`, `WaitlistFunnelServiceImpl`, `FoundingInviteServiceImpl`,
   `WaitlistDocsNotificationServiceImpl` (os 5 pontos que mudam de `== TREINADOR` para
   `isTreinadorOuProprietario()`).

## Métrica de sucesso

Proxy mecânico: os 6 critérios acima, cobertos por teste. Métrica de produto: quando `FE-02`
existir, o funil (`BE-06`) passa a distinguir `QUALIFIED` de `OTHER_BRAND` de verdade, em vez da
aproximação atual (`perfil == TREINADOR`).

## Open Questions & Assumptions

- **Decisão registrada:** `PROPRIETARIO` em vez de `OWNER` — reaproveita `UserRole.PROPRIETARIO`
  existente, evita duas palavras para o mesmo conceito no domínio.
- **Decisão registrada:** `policyVersion` carimbado pelo servidor (de `LgpdProperties`), não
  recebido do cliente — mais robusto que a spec original, que assumia o cliente mandando a versão.
- **Premissa:** UTM não é sobrescrito em upsert (first-touch attribution). Se o founder preferir
  last-touch, é uma troca de uma condição, não redesenho.
- **Aberto:** se `FoundingInviteServiceImpl.invite` deveria distinguir `TREINADOR` de
  `PROPRIETARIO` de alguma forma no e-mail de convite (hoje o texto não menciona o papel) — fora de
  escopo aqui, mas vale revisitar quando `FE-02` trouxer dados reais de donos de assessoria.
