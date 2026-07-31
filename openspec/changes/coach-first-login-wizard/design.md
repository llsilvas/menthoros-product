# Design — coach-first-login-wizard

## Estado e migração

Adicionar `onboarding_concluido BOOLEAN NOT NULL`. Para não interromper coaches existentes:

1. adicionar a coluna com default temporário `true` e preencher registros existentes;
2. manter default de banco `false` apenas para novos usuários, ou definir explicitamente `false` no signup e `true` nos demais fluxos administrativos conforme política;
3. mapear o campo e expô-lo em `GET /api/v1/me`.

A implementação deve testar o comportamento de cada caminho de criação de `Usuario`; depender apenas de default Java/JPA é arriscado.

`POST /api/v1/me/onboarding/concluir` não recebe usuário/tenant, usa o principal autenticado e retorna `204` mesmo se já concluído. O serviço registra `onboardingConcluidoEm` somente se analytics/auditoria exigir; caso adicionado, deve entrar na mesma migração e DTO.

## Precedência no layout

```text
sessão carregando/erro
  → consentimento pendente: CoachConsentDialog
  → onboarding pendente: CoachWelcomeWizard
  → conteúdo protegido
```

O `CoachLayout` é dono dessa máquina de estados; não espalhar redirects entre páginas. Após conclusão, invalidar/refazer `me` em vez de apenas mudar estado local.

## Etapas e contratos reutilizados

1. **Sua assessoria:** buscar assessoria atual e mostrar nome/identidade. Campos suportados chamam o client de `assessoria-settings-ui`. Sem infraestrutura de upload confirmada, logo é apenas preview/read-only.
2. **Primeiro atleta:** reutilizar schema, validação e client do cadastro normal, com o conjunto mínimo de campos obrigatórios confirmado na discovery. Não importar diretamente um `Dialog` acoplado; extrair um formulário compartilhável se necessário.
3. **Convite:** aparece habilitado somente para o `atletaId` criado nesta execução. Chama o endpoint canônico de convite, trata convite já enviado de forma idempotente e permite concluir sem convidar.

Salvar assessoria e atleta acontece ao avançar cada etapa. Voltar não reenvia automaticamente; o estado contém os IDs/resultados. Refresh reinicia na primeira etapa, mas dados já persistidos são carregados e não duplicados. Antes de criar atleta, pesquisar pelo e-mail/ID retornado não é suficiente para idempotência: o client deve enviar chave de idempotência se o endpoint suportar; caso contrário, bloquear reenvio e tratar `409` mostrando o atleta existente.

“Pular onboarding” exige confirmação e chama diretamente a conclusão. Fechar por Escape/backdrop não é permitido.

## Erros e acessibilidade

- Erro de uma etapa preserva os dados digitados e mantém foco/mensagem acessível.
- Falha ao concluir não libera o dashboard; oferece retry.
- Stepper deve funcionar em viewport móvel (orientação vertical abaixo do breakpoint) e por teclado.
- Eventos agregados: aberto, etapa salva/pulada, convite enviado, concluído; não incluir nome/e-mail do atleta.

## Testes de integração

Cobrir consentimento antes do wizard, usuário legado, signup novo, refresh após atleta criado, `409` de duplicidade, convite indisponível e conclusão repetida.
