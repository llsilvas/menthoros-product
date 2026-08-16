# Tasks — coach-first-login-wizard

> Revisado em 2026-08-15 após o DoR reprovar. A antiga task 1.1 ("confirmar contratos") sumiu: a
> discovery foi feita no gate e os achados estão na `proposal.md` e no `design.md`. O que sobrou de
> confirmação é pontual e está na 1.1 nova.

## 1. Backend — estado de onboarding

- [x] 1.1 Confirmar em `AtletaServiceImpl` **qual campo dispara o `409`** de `POST /api/v1/atletas` (e-mail? nome+nascimento?) — define a mensagem que o wizard mostra ao reencontrar o atleta depois de um refresh.
  `verify:` teste que cria o mesmo atleta duas vezes e afirma o campo em conflito.
- [x] 1.2 Migration: `onboarding_concluido BOOLEAN NOT NULL DEFAULT true` em `tb_usuario`.
  `verify:` migration sobe limpa; **todo usuário existente fica `true`** — quem já usa o produto não pode ser interrompido por um wizard de boas-vindas.
- [x] 1.3 Mapear o campo em `Usuario` e expô-lo em `GET /api/v1/users/me` (`UsuarioMeOutputDto`).
  `verify:` o `me` devolve o campo; teste com usuário legado (`true`) e recém-criado (`false`).
- [x] 1.4 `CoachSignupServiceImpl` grava `false` ao criar o `Usuario` do fundador — **único lugar que escreve `false`**.
  `verify:` teste do signup conferindo `false`; e teste de que `UsuarioSyncServiceImpl` **não** altera o campo (ele roda a cada requisição e reabriria o wizard de quem já concluiu).
- [x] 1.5 **Auditar os dois caminhos de criação de `Usuario`** (`CoachSignupServiceImpl` e `UsuarioSyncServiceImpl.createNewUsuario`) e provar o valor resultante em cada um.
  `verify:` `boolean` primitivo nasce `false` em Java — o oposto do que o negócio precisa. O teste tem de provar que o default do **banco** vence no caminho do sync.
- [x] 1.6 `POST /api/v1/users/me/onboarding/concluir`: idempotente, `204`, resolve o usuário pelo principal. Classe com **`@Tag(name = "coach-onboarding")`** — não `onboarding`, que já é do atleta (D3).
  `verify:` chamar duas vezes devolve `204` nas duas; o client TS gerado não colide com o `OnboardingService` existente.
- [x] 1.7 Testes: usuário legado, signup novo, conclusão repetida, isolamento entre usuários e tenants (concluir o meu não conclui o do outro).
- [x] 1.8 Executar `./mvnw clean verify`; registrar resultados.

## 2. Frontend

- [x] 2.1 `CoachLayout`: precedência sessão → consentimento → onboarding → conteúdo, sem gates duplicados. **As buscas de dashboard (`fetchQueue`, `fetchPendentes`) passam a esperar consentimento E onboarding** — hoje disparam no mesmo `useEffect` do `me`, e um wizard que só cobre a tela deixaria elas rodando por trás.
  `verify:` com onboarding pendente, nenhuma requisição de fila/revisão sai (conferir no teste, não no olho).
- [x] 2.2 `CoachWelcomeWizard` responsivo e acessível: stepper vertical no mobile, navegação por teclado, sem fechar por Escape/backdrop, confirmação para pular tudo.
  `verify:` teste de teclado e de viewport móvel.
- [x] 2.3 Etapa "assessoria" reutilizando `AssessoriaSettingsService` + `useAssessoriaSettings` — **nenhum client novo**. Nome e logo editáveis; **sem cores** (não existem naquele contrato). Ecoar a `version` do GET.
  `verify:` o PATCH sai com a versão correta; `409` mostra conflito sem perder o que foi digitado.
- [~] 2.4 ~~Etapa "primeiro atleta"~~ — **implementada e depois REMOVIDA do wizard** por decisão de UX no teste manual (ver "Mudança de escopo" abaixo). O cadastro vive na tela de Atletas.
- [~] 2.5 ~~Etapa "convite"~~ — **removida do wizard pelo mesmo motivo**. Em troca, o convite passou a existir onde faltava: **na tela de Atletas**, que até então não o expunha em lugar nenhum. A trava de reenvio (D4) foi preservada, agora como confirmação explícita antes de disparar.
  `verify:` teste de componente do roster clicando "Enviar convite" + confirmação, afirmando **uma** chamada; e o `422` (atleta sem e-mail) traduzido em instrução.
- [~] 2.6 Ao concluir (ou pular tudo), chamar o endpoint, refazer `me` e só então liberar o dashboard. Instrumentar eventos agregados **sem PII** (nada de nome/e-mail do atleta).
  `verify:` ✅ **conclusão**: chama o endpoint, revalida o `me` e só então libera; falha não libera e mostra retry (testes de componente + E2E). ⏸ **instrumentação de eventos: NÃO feita** — ver 3.3.
- [x] 2.7 Testes: fluxo completo, pular parcial e total, voltar, mobile/teclado, erros, refresh após criar atleta (convite indisponível) e ausência de atleta no convite.
- [x] 2.8 Executar `npm run lint && npm run build && npm run test:run`; registrar resultados.

## 3. Entrega

- [x] 3.1 E2E: signup novo → consentimento → wizard → dashboard → **segundo login sem wizard**.
  `verify:` o segundo login não monta o wizard — é o que prova que a conclusão persistiu.
- [x] 3.2 E2E: coach legado entra e **não** é interrompido.
  `verify:` nenhum wizard, nenhuma chamada de conclusão.
- [ ] 3.3 Validar eventos e métricas (conclusão, criação de primeiro atleta) sem PII.
  **PENDENTE, com motivo.** O front **não tem canal de analytics** — nenhum provider, nenhum `track()`. A change anterior (`assessoria-settings-ui`) esbarrou no mesmo limite e saiu com `console.info`, o que é auferível em piloto mas não é telemetria. Emitir eventos aqui repetiria esse paliativo e daria a impressão de que a métrica de sucesso ("70% concluem ou pulam conscientemente em menos de 5 minutos") é mensurável quando não é.
  **Recomendação:** abrir change própria de telemetria de produto, que resolveria isto e o item equivalente da change anterior de uma vez. Sem ela, a métrica de sucesso desta change permanece **não falsificável** — do mesmo jeito que travou o arquivamento de `migrate-login-to-authorization-code-pkce`.

### Mudança de escopo durante a implementação (2026-08-15)

**O wizard deixou de cadastrar atleta.** A proposal previa três etapas — assessoria, primeiro atleta,
convite — e as três foram implementadas, testadas e mergeadas nesse formato. O teste manual derrubou
as duas últimas: pedir nome, e-mail, objetivo, nível e dias de **outra pessoa** no primeiro minuto de
uso é atrito no pior momento possível. O coach ainda está aprendendo a interface, pode não ter os
dados à mão, e o cadastro errado feito nesse estado vira um registro difícil de remover — foi
exatamente o que aconteceu no teste (atleta duplicado que o dono não conseguia excluir).

O wizard ficou com **duas etapas**: confirmar a assessoria e "Tudo pronto", que conclui no servidor e
leva para a tela de Atletas. A ordem importa e está travada por teste: o gate do `CoachLayout` só
abre quando o `me` volta concluído, então navegar antes traria o wizard de volta por cima do destino.

**Efeito colateral valioso:** a etapa de convite dentro do wizard escondia que **o convite não existia
na interface**. O endpoint `POST /atletas/{id}/convite` estava no ar desde `assessoria-settings-ui`,
mas nenhuma tela o expunha, e o formulário de atleta não tinha campo de e-mail — que o convite exige.
Era impossível dar acesso a um atleta pela UI. Corrigido nesta change.

A métrica de sucesso da proposal ("50% criam o primeiro atleta durante a sessão") **não se aplica mais**
como escrita: o wizard convida a cadastrar em vez de exigir. A métrica de conclusão do onboarding
permanece — e continua não mensurável, pelo motivo da task 3.3.

### Correções de produção descobertas pelo caminho (2026-08-15)

Não estavam no escopo. Apareceram porque **o wizard torna comum um caminho que antes era raro**: um
atleta recém-criado, sem histórico nenhum. Todas foram na branch desta change (backend PR #69).

- **O dono não conseguia excluir atleta.** `DELETE /atletas/{id}` exigia `ADMIN` (administrador de
  plataforma), então o dono da assessoria não removia nem o atleta que ele mesmo cadastrou por engano.
  Agora `hasAnyRole('PROPRIETARIO','ADMIN')` — soft delete tenant-scoped, reversível.
- **Atleta inativado continuava aparecendo** no dashboard, na fila de atenção e nas métricas de
  adesão: as três consultas liam todos os atletas do tenant sem filtrar `ativo`. A exclusão parecia
  quebrada mesmo quando funcionava.
- **A geração do primeiro plano falhava e nunca se resolvia sozinha.** `buscarOuCriarMetadados` era
  `@Cacheable` e criava/salvava dentro da transação do chamador. O Spring popula o cache antes do
  commit; quando a transação de `gerarPlanoTreino` revertia — provável num fluxo que chama LLM e leva
  ~50s — o `INSERT` sumia do banco e o objeto ficava no cache com um ID que nunca existiu. Toda
  tentativa seguinte lia o ID fantasma e revertia de novo. Coberto por `PlanoMetadadosCacheIT`, que
  deliberadamente **não** é `@Transactional`.
- **Risco registrado, não corrigido:** `atualizarMetaDados` e `recalcularSemanasProgressao` em
  `TsbServiceImpl` têm o mesmo `orElseThrow`, mas exigem tratamento diferente — pular ali perderia
  valores calculados.

### Achados da implementação (2026-08-15)

- **`@Builder.Default` era obrigatório e o teste provou.** A coluna nasce `DEFAULT true` no banco e o campo tem `= true` na entidade — mesmo assim o teste falhou com `Expecting true but was false`. O Lombok ignora inicializadores sem `@Builder.Default`, o builder produzia `false` e o `INSERT` explícito impedia o default do banco de valer. Como o `UsuarioSyncServiceImpl` cria usuário a cada primeiro acesso, **todo coach existente teria visto o wizard**.
- **O `409` de atleta é global, não por tenant.** Vem de `uk_atleta_email` (`UNIQUE (email)`, sem tenant) e o handler devolve mensagem genérica. O wizard usa mensagem **neutra**: afirmar "já está na sua assessoria" seria falso e mandaria o coach procurar numa lista onde o atleta não está. Limitação de produto adjacente: **o mesmo atleta não pode existir em duas assessorias**. Fora do escopo, registrado.
- **O servidor exige 4 campos de atleta, o tipo TS exigia 10.** `AtletaInputDto` valida `nome`, `objetivo`, `nivelExperiencia` e `diasDisponiveis`; `CreateAtleta` marcava dez como obrigatórios. O wizard usa `CriarAtletaMinimo` com o mínimo real — pedir dez numa tela de boas-vindas afugentaria quem acabou de chegar. `CreateAtleta` **não** foi relaxado: as telas que o usam decidiram pedir mais, e isso é escopo delas.
- **Divergência de tenant é barrada antes do controller.** O `LgpdConsentInterceptor` roda primeiro e devolve `503` ("não consegui verificar" ≠ "não consentiu"). O `*IT` afirma o **efeito** (nenhuma escrita) em vez do código, para não amarrar este contrato a uma decisão de outra camada.
- **Nenhum router do projeto navega programaticamente sob jsdom.** Verificado com um caso mínimo —
  botão + `useNavigate`, sem nada do componente — que fica parado em `/` tanto com `createHashRouter`
  quanto com `createMemoryRouter`. Por isso os testes de componente mockam `useNavigate` (padrão já
  usado em `ManualTrainingFormPage.test.tsx`). O custo é que eles só afirmam o argumento; que a rota
  existe de verdade fica provado no E2E, que asserta a URL final.
- **Bug no E2E, não no produto:** no Playwright a rota registrada por último vence, e `**/api/v1/users/me**` também casa com `.../me/onboarding/concluir`. Com a ordem errada, o `POST` de conclusão recebia o JSON do `me` e dois testes falhavam com aparência de defeito real.

## Entrega

- **PRs:** `menthoros-backend#69` e `menthoros-front#60`, ambos mergeados em `develop` em 2026-08-16.
- **Validação:** backend `./mvnw clean verify` — 2538 unitários + 99 de integração, 0 falhas.
  Front — lint limpo, 885/885, build ok, E2E 33/33.

## Fora desta change

- **Técnico convidado não recebe wizard nenhum** (D1). Se orientar o técnico virar necessidade, é change própria — não um `if` aqui.
- **Persistir o estado do wizard entre sessões.** Sem isso, refresh perde o `atletaId` e a etapa de convite fica indisponível até a tela de atletas; prometer o contrário exigiria persistência que está fora do escopo.
- Retomada no mesmo step entre dispositivos, importação CSV, tour do produto.
- **`uk_atleta_email` é UNIQUE global, e o soft delete mantém a linha.** Excluir um atleta não libera
  o e-mail dele para novo cadastro em lugar nenhum do sistema. Questão de produto em aberto,
  levantada nesta change e não resolvida aqui.

## Estimativa

M (aprox. 8–13 dias). Os três contratos reutilizados **existem e foram verificados** — a incerteza
que justificaria reestimar (criar upload, convite ou cadastro de atleta) não se aplica mais.
