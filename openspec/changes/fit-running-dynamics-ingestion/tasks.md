# Tasks: fit-running-dynamics-ingestion

> Trilha Full — TDD por task; validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-running-dynamics-ingestion`.
> Pré-requisito de sequência: mergear após `fit-lap-metrics-parser` (mesmos arquivos no parser).

## 1. Migration e entidades

- [ ] 1.1 Migration `V53__Add_running_dynamics_etapa_treino.sql` conforme design D1 — conferir a
      última versão livre em `db/migration/` no momento do merge e renumerar se preciso.
- [ ] 1.2 Campos novos em `EtapaRealizada` e `TreinoRealizado` (tipos do design D3).
- [ ] 1.3 Subir contexto com Testcontainers (`./mvnw test -Dtest=*RepositoryTest` ou suíte de
      integração) para validar migration em banco limpo (CA1). Validar: `./mvnw clean test`.

## 2. Parser

- [ ] 2.1 Ampliar `FitLapData`/`FitSessionData` com os campos do design D2/D3.
- [ ] 2.2 `FitParseServiceImpl`: ler os getters de `LapMesg`/`SessionMesg` com conversão de unidade
      (mm→m, mm→cm, s→Duration) — null-safe.
- [ ] 2.3 Testes de parser cobrindo presença, ausência e valores-limite das conversões (CA3, CA4).
      Validar: `./mvnw clean test`.

## 3. Persistência e sanidade

- [ ] 3.1 `FitTreinoPersister`: mapear lap→`EtapaRealizada` e sessão→`TreinoRealizado`, com faixas
      de sanidade do design D2 (fora da faixa → null + `log.warn`).
- [ ] 3.2 Testes: dynamics completas persistidas; dispositivo sem sensor → tudo null sem falha;
      valor fora da faixa descartado (CA2, CA4). Validar: `./mvnw clean test`.

## 4. Contrato de API

- [ ] 4.1 `EtapaRealizadaOutputDto` + DTO do treino: campos aditivos com `@Schema` (CA5).
- [ ] 4.2 Atualizar mapper(s) com null-check padrão; testes de mapper.
- [ ] 4.3 Conferir Swagger gerado (campos aparecem documentados). Validar: `./mvnw clean test`.

## 5. Validação com arquivo real

- [ ] 5.1 Importar .fit real com running dynamics e comparar campo a campo com o CSV do Garmin
      Connect (GCT, equilíbrio, passada, oscilação, proporção, temperatura, tempo em movimento,
      calorias) — registrar divergências aqui e resolver a assumption do equilíbrio (pé esquerdo).
- [ ] 5.2 Suíte completa verde: `./mvnw clean test`.
