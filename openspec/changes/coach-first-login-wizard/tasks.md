# Tasks — coach-first-login-wizard

> Revisado em 2026-08-15 após o DoR reprovar. A antiga task 1.1 ("confirmar contratos") sumiu: a
> discovery foi feita no gate e os achados estão na `proposal.md` e no `design.md`. O que sobrou de
> confirmação é pontual e está na 1.1 nova.

## 1. Backend — estado de onboarding

- [ ] 1.1 Confirmar em `AtletaServiceImpl` **qual campo dispara o `409`** de `POST /api/v1/atletas` (e-mail? nome+nascimento?) — define a mensagem que o wizard mostra ao reencontrar o atleta depois de um refresh.
  `verify:` teste que cria o mesmo atleta duas vezes e afirma o campo em conflito.
- [ ] 1.2 Migration: `onboarding_concluido BOOLEAN NOT NULL DEFAULT true` em `tb_usuario`.
  `verify:` migration sobe limpa; **todo usuário existente fica `true`** — quem já usa o produto não pode ser interrompido por um wizard de boas-vindas.
- [ ] 1.3 Mapear o campo em `Usuario` e expô-lo em `GET /api/v1/users/me` (`UsuarioMeOutputDto`).
  `verify:` o `me` devolve o campo; teste com usuário legado (`true`) e recém-criado (`false`).
- [ ] 1.4 `CoachSignupServiceImpl` grava `false` ao criar o `Usuario` do fundador — **único lugar que escreve `false`**.
  `verify:` teste do signup conferindo `false`; e teste de que `UsuarioSyncServiceImpl` **não** altera o campo (ele roda a cada requisição e reabriria o wizard de quem já concluiu).
- [ ] 1.5 **Auditar os dois caminhos de criação de `Usuario`** (`CoachSignupServiceImpl` e `UsuarioSyncServiceImpl.createNewUsuario`) e provar o valor resultante em cada um.
  `verify:` `boolean` primitivo nasce `false` em Java — o oposto do que o negócio precisa. O teste tem de provar que o default do **banco** vence no caminho do sync.
- [ ] 1.6 `POST /api/v1/users/me/onboarding/concluir`: idempotente, `204`, resolve o usuário pelo principal. Classe com **`@Tag(name = "coach-onboarding")`** — não `onboarding`, que já é do atleta (D3).
  `verify:` chamar duas vezes devolve `204` nas duas; o client TS gerado não colide com o `OnboardingService` existente.
- [ ] 1.7 Testes: usuário legado, signup novo, conclusão repetida, isolamento entre usuários e tenants (concluir o meu não conclui o do outro).
- [ ] 1.8 Executar `./mvnw clean verify`; registrar resultados.

## 2. Frontend

- [ ] 2.1 `CoachLayout`: precedência sessão → consentimento → onboarding → conteúdo, sem gates duplicados. **As buscas de dashboard (`fetchQueue`, `fetchPendentes`) passam a esperar consentimento E onboarding** — hoje disparam no mesmo `useEffect` do `me`, e um wizard que só cobre a tela deixaria elas rodando por trás.
  `verify:` com onboarding pendente, nenhuma requisição de fila/revisão sai (conferir no teste, não no olho).
- [ ] 2.2 `CoachWelcomeWizard` responsivo e acessível: stepper vertical no mobile, navegação por teclado, sem fechar por Escape/backdrop, confirmação para pular tudo.
  `verify:` teste de teclado e de viewport móvel.
- [ ] 2.3 Etapa "assessoria" reutilizando `AssessoriaSettingsService` + `useAssessoriaSettings` — **nenhum client novo**. Nome e logo editáveis; **sem cores** (não existem naquele contrato). Ecoar a `version` do GET.
  `verify:` o PATCH sai com a versão correta; `409` mostra conflito sem perder o que foi digitado.
- [ ] 2.4 Etapa "primeiro atleta": extrair/reutilizar o formulário e o client canônico; prevenir duplo submit; tratar `409` mostrando que o atleta já existe.
  `verify:` duplo clique não cria dois atletas; `409` não vira erro genérico.
- [ ] 2.5 Etapa "convite" apenas para o atleta criado nesta execução. **Desabilitar o botão após o primeiro sucesso, sem retry automático** — o endpoint reenvia a cada chamada (D4) e um segundo clique manda outro e-mail ao atleta.
  `verify:` teste que clica duas vezes e afirma **uma** chamada; e que a etapa fica indisponível quando não há atleta criado.
- [ ] 2.6 Ao concluir (ou pular tudo), chamar o endpoint, refazer `me` e só então liberar o dashboard. Instrumentar eventos agregados **sem PII** (nada de nome/e-mail do atleta).
  `verify:` falha na conclusão **não** libera o dashboard e oferece retry.
- [ ] 2.7 Testes: fluxo completo, pular parcial e total, voltar, mobile/teclado, erros, refresh após criar atleta (convite indisponível) e ausência de atleta no convite.
- [ ] 2.8 Executar `npm run lint && npm run build && npm run test:run`; registrar resultados.

## 3. Entrega

- [ ] 3.1 E2E: signup novo → consentimento → wizard → dashboard → **segundo login sem wizard**.
  `verify:` o segundo login não monta o wizard — é o que prova que a conclusão persistiu.
- [ ] 3.2 E2E: coach legado entra e **não** é interrompido.
  `verify:` nenhum wizard, nenhuma chamada de conclusão.
- [ ] 3.3 Validar eventos e métricas (conclusão, criação de primeiro atleta) sem PII.

## Fora desta change

- **Técnico convidado não recebe wizard nenhum** (D1). Se orientar o técnico virar necessidade, é change própria — não um `if` aqui.
- **Persistir o estado do wizard entre sessões.** Sem isso, refresh perde o `atletaId` e a etapa de convite fica indisponível até a tela de atletas; prometer o contrário exigiria persistência que está fora do escopo.
- Retomada no mesmo step entre dispositivos, importação CSV, tour do produto.

## Estimativa

M (aprox. 8–13 dias). Os três contratos reutilizados **existem e foram verificados** — a incerteza
que justificaria reestimar (criar upload, convite ou cadastro de atleta) não se aplica mais.
