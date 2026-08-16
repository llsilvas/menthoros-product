# Design — coach-first-login-wizard

> Revisado em 2026-08-15 após o DoR reprovar (ver "Decisões" na `proposal.md`). Os paths desta
> versão foram conferidos contra o código; a versão anterior apontava para endpoints inexistentes.

## Estado e migração

`onboarding_concluido BOOLEAN NOT NULL` **é criação desta change** — o campo não existe em
`Usuario`, em migration nem em endpoint, apesar de a `proposal` antiga afirmar que
`keycloak-user-onboarding-auth` o entregaria (D2).

O default precisa ser **`true`**, e isso é contraintuitivo: quem já usa o produto não pode ser
interrompido por um wizard de boas-vindas. Só o caminho de auto-cadastro grava `false`
explicitamente.

1. `ALTER TABLE tb_usuario ADD COLUMN onboarding_concluido BOOLEAN NOT NULL DEFAULT true` — toda
   linha existente nasce concluída, e o default protege qualquer caminho de criação que ninguém
   lembrou de auditar.
2. `CoachSignupServiceImpl` grava `false` ao criar o `Usuario` do fundador. **É o único lugar.**
3. `UsuarioSyncServiceImpl` **não** toca o campo: ele roda a cada requisição, e escrever ali
   reabriria o wizard para quem já concluiu.

**Auditar todo caminho de criação de `Usuario`** — hoje são dois (`CoachSignupServiceImpl` e
`UsuarioSyncServiceImpl.createNewUsuario`) — e testar cada um. Depender do default do Java/JPA em
vez do default do banco é o erro clássico aqui: `boolean` primitivo nasce `false` em Java, o
oposto do que o negócio precisa.

`POST /api/v1/users/me/onboarding/concluir` não recebe usuário/tenant, usa o principal autenticado
e retorna `204` mesmo se já concluído.

**O path e a tag Swagger são deliberados (D3).** O endpoint vive sob `/api/v1/users/me` porque é lá
que o recurso do usuário autenticado mora (`UsuarioController`, `@RequestMapping("/api/v1/users")`)
— `/api/v1/me` não existe. E a classe usa **`@Tag(name = "coach-onboarding")`**, não `onboarding`:
já existe `OnboardingController` com `POST /api/v1/atletas/{id}/onboarding/concluir`, que é o
onboarding **do atleta**. O gerador de client do front deriva o nome do service da tag, então
reaproveitar o nome produziria dois `OnboardingService` conflitantes no TypeScript.

## Precedência no layout

```text
sessão carregando/erro
  → consentimento pendente: CoachConsentDialog
  → onboarding pendente: CoachWelcomeWizard      ← só quando o usuário é o dono
  → conteúdo protegido
```

O `CoachLayout` é dono dessa máquina de estados; não espalhar redirects entre páginas. Após
conclusão, invalidar/refazer `me` em vez de apenas mudar estado local.

**O gate precisa preceder as buscas, não só a renderização.** Hoje o `CoachLayout` dispara
`fetchQueue()` e `fetchPendentes()` no mesmo `useEffect` do `fetchCurrentUser()` — um wizard que
apenas cobre a tela deixaria as chamadas de dashboard rodando por trás, gerando ruído e respostas
que ninguém consome. As buscas de dashboard passam a esperar `consent.granted === true` **e**
`onboardingConcluido === true`.

## Etapas e contratos reutilizados

1. **Sua assessoria:** buscar assessoria atual e editar **nome e logo**, chamando o
   `AssessoriaSettingsService` e o hook `useAssessoriaSettings` de `assessoria-settings-ui` — sem
   client novo. O upload **existe** (PNG/JPEG, 2 MiB), então a etapa o oferece. **Cores não são
   editáveis** naquela change e não aparecem aqui. O PATCH exige `version`: o wizard ecoa a versão
   lida no GET, e o hook já guarda a versão devolvida por cada escrita.
   Esta etapa **só é alcançável pelo dono** (D1) — quem chega aqui tem `PROPRIETARIO`, então o
   `403` de autorização não é um estado a desenhar.
2. **Primeiro atleta:** reutilizar schema, validação e client do cadastro normal, com o conjunto mínimo de campos obrigatórios confirmado na discovery. Não importar diretamente um `Dialog` acoplado; extrair um formulário compartilhável se necessário.
3. **Convite:** aparece habilitado somente para o `atletaId` criado nesta execução. Chama
   `POST /api/v1/atletas/{id}/convite` e permite concluir sem convidar.
   **O endpoint NÃO é idempotente** (D4): `AtletaServiceImpl` documenta
   `Idempotent: NO — cada chamada (re)envia o convite (efeito externo observável)`. O design
   anterior pedia "tratar de forma idempotente", garantia que o contrato não oferece. Na prática:
   **desabilitar o botão após o primeiro sucesso**, sem retry automático — um segundo clique manda
   outro e-mail para o atleta, e o atleta não tem como saber que foi engano.

Salvar assessoria e atleta acontece ao avançar cada etapa. Voltar não reenvia automaticamente; o
estado contém os IDs/resultados.

**Refresh perde o `atletaId` da execução, e isso tem consequência.** `POST /api/v1/atletas` **não
aceita chave de idempotência** (confirmado no controller), então a alternativa "enviar a chave se o
endpoint suportar" não existe. O comportamento fica: o wizard reinicia na primeira etapa; se o coach
recriar o mesmo atleta, o backend responde `409` e a UI mostra que ele já existe, sem duplicar. Como
o `atletaId` se perdeu, a **etapa de convite fica indisponível após refresh** — convidar é possível
depois, pela tela de atletas. Prometer o contrário exigiria persistir estado do wizard, que está
fora do escopo.

“Pular onboarding” exige confirmação e chama diretamente a conclusão. Fechar por Escape/backdrop não é permitido.

## Rollback

- **Desligar o wizard sem migration:** um `UPDATE tb_usuario SET onboarding_concluido = true` libera
  todo mundo imediatamente; o wizard some para todos sem deploy.
- **A coluna fica.** Reverter o schema não é necessário nem desejável — coluna com default `true` é
  inerte. Flyway não desfaz migration, e forçar um `DROP` custaria mais que o benefício.
- **Endpoint de conclusão:** permanece publicado e idempotente. Se precisar ser desativado, ele
  responde `204` de qualquer forma; nada depende do efeito colateral.
- **Se o `false` for gravado no caminho errado** (ex.: um técnico convidado receber o wizard), o
  conserto é o mesmo `UPDATE` restrito àquele usuário, e o teste da task de auditoria é o que
  impede isso de chegar em produção.

## Erros e acessibilidade

- Erro de uma etapa preserva os dados digitados e mantém foco/mensagem acessível.
- Falha ao concluir não libera o dashboard; oferece retry.
- Stepper deve funcionar em viewport móvel (orientação vertical abaixo do breakpoint) e por teclado.
- Eventos agregados: aberto, etapa salva/pulada, convite enviado, concluído; não incluir nome/e-mail do atleta.

## Testes de integração

Cobrir: consentimento antes do wizard; usuário legado (nasce `true`, nunca vê o wizard); signup
novo (nasce `false`); **técnico convidado nasce `true`** (D1); refresh após atleta criado; `409` de
duplicidade; convite indisponível após refresh; **segundo clique no convite não reenvia**; e
conclusão repetida devolvendo `204`.
