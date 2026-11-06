## 1. Backend (`apps/menthoros-backend`, branch `fix/fix-atleta-edit-data-nascimento`)

- [x] 1.1 (2026-11-05: 0 de 3 atletas sem `data_nascimento` no banco de testes do Railway `develop`) Contar atletas sem `data_nascimento` no banco de teste e registrar o número no `design.md` (o DTO compartilhado entre POST, PUT, lista e GET por id já está decidido)
- [x] 1.2 Teste primeiro: `AtletaMapperTest` com atleta de `dataNascimento` conhecida exige o campo no DTO; e sem data, campo nulo
- [x] 1.3 Adicionar `LocalDate dataNascimento` ao fim de `AtletaOutputDto` e ajustar `withBilling`
- [x] 1.4 Teste de controller/serialização: `GET /api/v1/atletas/{id}` devolve `dataNascimento` em `yyyy-MM-dd` e mantém `idade`; atleta legado omite o campo
- [x] 1.5 Testes de acesso (`AtletaPorIdContratoTest`): atleta de outro tenant retorna 404, e o papel atleta recebe 403 em `GET /atletas/{id}`; `AthleteDtoAmountExposureTest` e `AthleteBillingExposureTest` seguem verdes
- [x] 1.6 Validação: `./mvnw clean verify` (4942 unitários + 253 integração, 0 falhas); PR #203 para `develop` aberto. **Falta mergear antes do front.**

## 2. Frontend (`apps/menthoros-front`, branch `fix/fix-atleta-edit-data-nascimento`)

- [x] 2.1 Conferir `src/api` e `src/types/Atleta.ts`: `dataNascimento` já declarado; corrigir à mão se o cliente curado divergir
- [x] 2.2 Teste de componente em `AtletaDialog.test.tsx`: abrir com `atleta` que tem `dataNascimento` e esperar o campo preenchido
- [x] 2.3 Teste de componente: editar só o objetivo e salvar chama `onSave` com a data original; verificar também em `salvarAtleta` (`CoachAthletesPage`) que o merge `{...atletaParaEditar, ...dados}` leva a data no `PUT`, sem presumir
- [x] 2.4 Teste de componente: atleta sem data abre vazio e bloqueia o salvamento
- [x] 2.5 Validação parcial: `npm run lint && npm run build && npm run test:run` (18 testes do dialog; já cobertos pelo commit 7820d09)

Redesenho (design.md, decisões 5 a 10; canvas https://claude.ai/artifact/KqSdJiuCUNoK3Jyf38NCqw):

- [x] 2.6 Teste primeiro: cadastro novo abre com sexo, nível, longão, peso e altura vazios; salvar assim mostra erro nos cinco e não chama `onSave`; edição abre com os valores do atleta
- [x] 2.7 `AtletaFormState` local com `''` nos campos de escolha e `string` em peso/altura; `getInitialFormData`, `validateForm` e conversão para `CreateAtleta`/`UpdateAtleta` antes do `onSave`
- [x] 2.8 Teste primeiro: `72,5` em peso chega como `pesoKg: 72.5`; vazio e `0` bloqueiam. Depois: `inputMode="decimal"`, `endAdornment` com unidade, parse com `replace(',', '.')`
- [x] 2.9 Teste primeiro: marcar Terça e Sábado deixa só "Terça" e "Sábado" no longão; sem dia marcado o select fica desabilitado; desmarcar o dia do longão limpa a escolha; legado com longão fora dos dias aparece como opção extra. Depois: lista única `DIAS_SEMANA`, chips com `aria-pressed`, select derivado
- [x] 2.10 Três grupos com `Typography variant="overline"`, `Grid size={{ xs: 12, sm: 6 }}`, `maxWidth="md"`, remoção de `Card`/`CardHeader` internos; teste de que o subtítulo e o rodapé não contêm "linguagem visual" nem "padronizados"
- [x] 2.11 Copy: subtítulo, rótulos em caixa de frase, botão "Adicionar atleta"/"Salvar alterações"; conferir que `CoachAthletesPage` não depende do texto antigo do botão ("Salvar")
- [x] 2.12 Validação: lint, build e test:run verdes; `frontend-reviewer` apontou a falta de validação de dia disponível (corrigido com teste); `qa-gate` do hook falhou por unhandled rejection preexistente em `CoachAthleteProfilePage.test.tsx` (`useAthleteTrainingZones`), fora da change

## 3. E2E (fluxo crítico: entrada de dados que alimenta o motor)

- [x] 3.1 Spec em `tests/e2e/atletas/` (ao lado de `lista.spec.ts`): abrir edição, conferir a data, alterar objetivo, salvar sem redigitar a data
- [x] 3.1b Mesmo spec ou irmão: cadastro novo completo pelos chips e selects, peso com vírgula, confirmar o atleta na lista
- [x] 3.2 Validação: `npm run test:e2e` (128 passed, 34s; o erro de proxy do Vite para o Keycloak no fim do log é ruído de um teste sem IdP e não falhou nada). Original: se não der para escrever (backend com o campo ainda não publicado em `develop`), registrar aqui como item adiado, com o motivo

## 4. Fechamento

- [x] 4.1 (2026-11-05: tudo entregue; front saiu no PR #196 numa branch limpa a partir de `develop`, sem os commits de logo da branch local antiga) Atualizar este `tasks.md` com o que foi entregue e o que foi adiado
- [x] 4.2 (2026-11-05: backend #203 e front #196 mergeados) Após merge nos dois repos, arquivar com `/done fix-atleta-edit-data-nascimento`
