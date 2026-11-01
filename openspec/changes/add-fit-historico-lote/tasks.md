# Tasks — add-fit-historico-lote

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (fluxo do treinador que alimenta o motor com dados).

## 0. Gates (antes do front)

- [ ] 0.1 Decidir a base legal de LGPD para o treinador carregar dado de saúde do atleta
  (consentimento do atleta ou cláusula do contrato) e ajustar o texto necessário. **Gate de início
  do front (seção 2) e de release**; o backend (seção 1) pode andar antes.
- [ ] 0.2 Confirmar no pilot (1–2 assessorias) que o atleta consegue entregar os `.fit` e se o passo
  de extrair o `.zip` atrapalha; sem a dor confirmada, usar o endpoint por API para os primeiros
  atletas e adiar o front.

## 1. Backend — endpoint do treinador

- [ ] 1.1 `POST /api/v1/coach/atletas/{atletaId}/treinos/importar-fit` (D3): `@PreAuthorize`
  TECNICO/ADMIN, `@RequireTenant(resourceParamIndex = 0)`, `@Operation`/`@ApiResponses`
  (201/200/403/404/422), chama `FitUploadService.importar`; reaproveita `TreinoRealizadoOutputDto`.
  `@WebMvcTest` isolado dos códigos e dos papéis (CA3, CA5), rodado sozinho (ver memória sobre
  verify local x CI).
- [ ] 1.2 Log de auditoria (atletaId, tenantId, novo/existente), sem nome de arquivo nem conteúdo;
  teste do log ou da chamada ao serviço com o `atletaId` do path (não do JWT).
- [ ] 1.3 IT (Testcontainers) com `.fit` de fixture: importa 1 arquivo (CA1), reenvia (CA2), atleta de
  outro tenant (CA4), confirma que nenhum chamada de LLM é feita (CA7: `WorkoutAnalysisListener` não
  cria análise) e mede o tempo de 50 arquivos em sequência; registra o resultado em "Notas" abaixo.
- [ ] 1.4 Teste de dedup (CA8): treino importado por `.fit` e `registrar` com o mesmo `externalId`
  de outra fonte `GARMIN` não duplica.
- Validação: `./mvnw clean verify`.

## 2. Frontend — seção no perfil do atleta

- [ ] 2.1 Portar à mão o método novo para `src/api` (cliente curado; `generate:api` só como
  referência), preservando nomes e tipos estreitados.
- [ ] 2.2 Adapter `buildFitImportSummary` (função pura em `features/coach/adapters/`): lista de
  desfechos por arquivo → contagens, erros e **período coberto** (data mais antiga, mais recente e
  semanas, CA6b); teste puro.
- [ ] 2.3 `useImportarHistoricoFit` (D2/D4): fila sequencial, progresso `n de N`, erro por arquivo sem
  interromper, teto de 200 arquivos, cancelar a fila; expõe `loading`, `error`, `resultado`; teste do
  hook (ordem sequencial, falha no meio, cancelamento).
- [ ] 2.4 Seção "Importar histórico" em `CoachAthleteProfilePage` (D6): seleção de vários `.fit`,
  progresso, aviso de autorização do atleta e orientação de como obter os arquivos, resumo final com
  importados/existentes/erros, período coberto e nota de que não há desfazer (CA6b); estados vazio,
  carregando e erro; teste de componente.
- [ ] 2.5 E2E (Playwright): treinador abre o perfil do atleta, seleciona 2 `.fit` de fixture e vê o
  resumo; reenvia a seleção e vê "já existentes". Se o ambiente não permitir, registrar aqui o motivo
  como item adiado (CLAUDE.md do front).
- Validação: `npm run lint && npm run build && npm run test:run`; `npm run test:e2e` na 2.5.

## 3. Fechamento

- [ ] 3.1 Teste manual em produção com os `.fit` de um atleta Garmin real; registrar o tempo ponta a
  ponta (pedido ao atleta → histórico no motor) para a métrica de sucesso.

## Notas

- (preencher com o tempo medido na 1.3)
