## 1. Backend (`apps/menthoros-backend`, branch `fix/fix-atleta-edit-data-nascimento`)

- [ ] 1.1 Contar atletas sem `data_nascimento` no banco de teste e registrar o número no `design.md` (o DTO compartilhado entre POST, PUT, lista e GET por id já está decidido)
- [ ] 1.2 Teste primeiro: `AtletaMapperTest` com atleta de `dataNascimento` conhecida exige o campo no DTO; e sem data, campo nulo
- [ ] 1.3 Adicionar `LocalDate dataNascimento` ao fim de `AtletaOutputDto` e ajustar `withBilling`
- [ ] 1.4 Teste de controller/serialização: `GET /api/v1/atletas/{id}` devolve `dataNascimento` em `yyyy-MM-dd` e mantém `idade`; atleta legado omite o campo
- [ ] 1.5 Testes de acesso: atleta de outro tenant retorna 404, e o papel atleta não lê a data de outro atleta; `AthleteDtoAmountExposureTest` e `AthleteBillingExposureTest` seguem verdes
- [ ] 1.6 Validação: `./mvnw clean verify`; PR para `develop`, mergeado antes do front

## 2. Frontend (`apps/menthoros-front`, branch `fix/fix-atleta-edit-data-nascimento`)

- [ ] 2.1 Conferir `src/api` e `src/types/Atleta.ts`: `dataNascimento` já declarado; corrigir à mão se o cliente curado divergir
- [ ] 2.2 Teste de componente em `AtletaDialog.test.tsx`: abrir com `atleta` que tem `dataNascimento` e esperar o campo preenchido
- [ ] 2.3 Teste de componente: editar só o objetivo e salvar chama `onSave` com a data original; verificar também em `salvarAtleta` (`CoachAthletesPage`) que o merge `{...atletaParaEditar, ...dados}` leva a data no `PUT`, sem presumir
- [ ] 2.4 Teste de componente: atleta sem data abre vazio e bloqueia o salvamento
- [ ] 2.5 Validação: `npm run lint && npm run build && npm run test:run`

## 3. E2E (fluxo crítico: entrada de dados que alimenta o motor)

- [ ] 3.1 Spec em `tests/e2e/atletas/` (ao lado de `lista.spec.ts`): abrir edição, conferir a data, alterar objetivo, salvar sem redigitar a data
- [ ] 3.2 Validação: `npm run test:e2e`; se não der para escrever (backend com o campo ainda não publicado em `develop`), registrar aqui como item adiado, com o motivo

## 4. Fechamento

- [ ] 4.1 Atualizar este `tasks.md` com o que foi entregue e o que foi adiado
- [ ] 4.2 Após merge nos dois repos, arquivar com `/done fix-atleta-edit-data-nascimento`
