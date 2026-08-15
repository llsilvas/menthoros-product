# coach-first-login-wizard — Wizard de Boas-Vindas do Coach

**Tamanho:** M · **Trilha:** Full
**Status:** proposta — revisada em 2026-08-15 após o DoR reprovar (ver "Decisões")
**Criado:** 2026-07-31

## Problema

Um coach recém-cadastrado chega a uma assessoria vazia sem orientação. A jornada precisa levá-lo a uma primeira ação útil sem duplicar regras de cadastro já existentes.

## Escopo

1. Wizard bloqueante de três etapas após o consentimento, **apenas para o dono da assessoria**: personalizar assessoria, cadastrar primeiro atleta e opcionalmente enviar convite.
2. Reutilização dos contratos de assessoria, criação de atleta e convite; o wizard apenas orquestra e apresenta versões compactas dos formulários.
3. Estado persistente `onboardingConcluido` e endpoint idempotente de conclusão.
4. Pular qualquer etapa e concluir o wizard; atleta criado permanece criado mesmo se o usuário sair depois.

## Decisões (2026-08-15, após o DoR)

O gate reprovou a primeira versão — `spec-reviewer` e Codex, ambos NOT READY. As correções:

- **D1 — O wizard é só do dono (`PROPRIETARIO`).** A etapa "personalizar assessoria" usa `PATCH /api/v1/assessorias/me`, que exige `PROPRIETARIO` desde `assessoria-settings-ui`. Oferecer o wizard a um técnico convidado o prenderia numa etapa que ele **não consegue salvar** (403). Decisão do founder: `onboarding_concluido = false` só para quem nasce do auto-cadastro; técnico convidado nasce `true` e vai direto ao dashboard. Consequência aceita: técnico novo não recebe orientação nenhuma — se isso virar problema, é uma change própria, não um `if` aqui.
- **D2 — `onboardingConcluido` não existe e é criação desta change.** A linha de dependência afirmava que `keycloak-user-onboarding-auth` criaria o usuário com o campo em `false`. **Aquela change nunca mencionou esse campo** em nenhum artefato, e ele não existe em `Usuario`, em migration ou em endpoint. Não é atraso: era premissa falsa. Esta change cria a coluna, o mapeamento e o ponto de escrita — e precisa tocar o caminho de criação de `Usuario` que pertence àquela change, o que é acoplamento explícito, não implícito.
- **D3 — Endpoint sob `/api/v1/users/me`, com namespace desambiguado.** O design usava `/api/v1/me`, que não existe (o real é `/api/v1/users/me`, `UsuarioController`). Pior: já existe `OnboardingController` com `POST /api/v1/atletas/{id}/onboarding/concluir` — o onboarding **do atleta**, outro conceito. O gerador de client do front deriva o nome do service da tag Swagger, então reaproveitar "onboarding" produziria dois `OnboardingService` conflitantes. O endpoint desta change nasce `POST /api/v1/users/me/onboarding/concluir` com **tag `coach-onboarding`**.
- **D4 — O convite NÃO é idempotente.** `AtletaServiceImpl` documenta `Idempotent: NO — cada chamada (re)envia o convite (efeito externo observável)`. O design pedia "tratar de forma idempotente", o que o contrato não oferece: duplo clique manda dois e-mails ao atleta. O wizard passa a **desabilitar o botão após o primeiro sucesso** e não faz retry automático.

## Fora do escopo

- Novos endpoints de upload, assessoria, atleta ou convite. Lacunas encontradas nesses contratos devem ser resolvidas em suas changes donas.
- Importação CSV, tour completo do produto, retomada no mesmo step entre dispositivos ou analytics comportamental detalhado.
- Rollback de atleta/convite ao abandonar o wizard.
- Exibir o wizard retroativamente para coaches existentes.

## Dependências e ordem

- `add-coach-lgpd-consent`: define o gate que sempre vem antes do wizard.
- `keycloak-user-onboarding-auth` ✅ (arquivada): entrega o signup público. **Não** entrega `onboardingConcluido` — ver D2; esta change cria o campo e escreve `false` no caminho de signup daquela.
- `assessoria-settings-ui` ✅ (entregue 2026-08-15): `GET/PATCH /api/v1/assessorias/me` (PATCH edita **só `nome`**, exige `version`, devolve `409` em versão obsoleta e `400` em campo desconhecido) e `POST/GET/DELETE /api/v1/assessorias/me/logo` (PNG/JPEG, 2 MiB). O upload **existe**, então o wizard pode oferecê-lo. **Cores não são editáveis** — a etapa 1 não as apresenta.
- APIs de atleta já existentes: `POST /api/v1/atletas` (**sem** chave de idempotência — ver D4 e critérios) e `POST /api/v1/atletas/{id}/convite`.

## Critérios de aceite

- **Dado** um coach novo **dono da assessoria**, com consentimento vigente e onboarding pendente, **quando** entra, **então** vê o wizard antes do dashboard.
- **Dado** um técnico convidado (sem `PROPRIETARIO`), **quando** entra pela primeira vez, **então** vai direto ao dashboard — nasce com `onboarding_concluido = true` e nunca vê o wizard.
- **Dado** consentimento pendente, **então** o wizard não é montado até o aceite ser confirmado no `me` recarregado.
- **Quando** o coach salva uma etapa, **então** o wizard chama o mesmo serviço/API da tela completa e mostra erros sem avançar silenciosamente.
- **Quando** o coach pula uma etapa, **então** avança sem criar/alterar dados; no convite, a ação fica indisponível se nenhum atleta foi criado.
- **Quando** o convite é enviado com sucesso, **então** o botão fica desabilitado até o fim do wizard — o endpoint **reenvia** a cada chamada, e um segundo clique manda outro e-mail ao atleta.
- **Quando** o wizard está montado, **então** as chamadas de dashboard do `CoachLayout` (`fetchQueue`, `fetchPendentes`) **não** disparam — o gate precisa preceder as buscas, não apenas cobrir a tela.
- **Quando** conclui ou confirma “pular onboarding”, **então** o endpoint idempotente marca conclusão, `me` é recarregado e o dashboard aparece.
- Coaches existentes na data da migração não recebem o wizard; novo signup recebe.

## Métrica de sucesso

Ao menos 70% dos novos coaches concluem ou pulam conscientemente o wizard em menos de 5 minutos, e ao menos 50% criam o primeiro atleta durante a sessão.

## Open Questions & Assumptions

- ~~**Bloqueante:** confirmar contratos reais~~ → **resolvido no DoR de 2026-08-15.** Contratos verificados no código e registrados em "Dependências". Nenhum path desta spec é mais conceitual.
- **Aberto (baixo risco):** qual campo dispara o `409` de `POST /api/v1/atletas` (e-mail? nome+nascimento?). Determina a mensagem que o wizard mostra ao reencontrar um atleta já criado depois de um refresh. Confirmar em `AtletaServiceImpl` na primeira task.
- **Premissa:** o onboarding é por usuário, não por assessoria; futuros técnicos adicionais não devem alterar o estado do proprietário.
- **Premissa:** somente coaches criados após o rollout entram pendentes. Se Produto quiser onboarding retroativo, é uma campanha separada.
