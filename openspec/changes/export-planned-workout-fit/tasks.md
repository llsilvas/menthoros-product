# Tasks: export-planned-workout-fit

> Trilha Full — TDD por task; validação backend `./mvnw clean test`, frontend
> `npm run lint && npm run build` ao final de cada bloco.
> Repos afetados: `apps/menthoros-backend` (blocos 0-4) e `apps/menthoros-front` (bloco 5).
> Branches: `feature/export-planned-workout-fit` em cada repo. Zero migration.
>
> **Refinado em 2026-07-14 pelo pre-mortem adversarial contra o código real:**
> - Blocos são persistidos **expandidos** (`expandirBlocoParaAdicao` grava N cópias físicas) —
>   o encoder des-expande com verificação, senão emite expandido sem repeat (design D2).
> - Canal de entrega (import de workout no Garmin Connect) é o gate 0.1, **antes** do encoder.
> - Autorização segue o padrão `/me` (`resolverAtletaIdAtual`), **não** o `PlanoTreinoController`
>   (IDOR intra-tenant pré-existente, registrado como débito no proposal).
> - Unidades: setters tipados do SDK (s / m / m/s), offset +100 de FC manual (design D1).
> - CORS: `exposedHeaders("Content-Disposition")` entra no escopo backend.

## 0. Gates de viabilidade (design D0/D6 — na ordem, cada um bloqueia o seguinte)

- [ ] 0.1 **Canal de entrega:** com um .fit de workout de amostra (à mão, sem encoder de
      produção), validar como ele chega ao relógio — Garmin Connect web/app aceita import de
      workout? Só USB `GARMIN/NEWFILES`? Registrar aqui o resultado e aplicar a matriz de
      decisão do D0 (seguir / re-escopar com o founder / matar). **Gate absoluto.**
- [ ] 0.2 **Inventário de alvos:** conferir no banco de dev os valores reais de `fcAlvoEtapa`,
      `ritmoAlvo` (etapas) e `zonaAlvo` (treino), incluindo treinos com
      `editadoPeloCoach`/`adicionadoPeloCoach` (texto fora do schema do planner). Ajustar a
      tabela D3 se aparecer formato novo. Registrar os padrões encontrados aqui.
- [ ] 0.3 **Walking skeleton do encoder:** 1 treino real com bloco expandido → .fit
      (`FileIdMesg` com `product` e `serialNumber ≠ 0` + `WorkoutMesg` + steps, design D1/D2,
      setters tipados). verify: round-trip decode com o SDK reproduz steps, durações e repeat
      des-expandido (4× é 4×, não 16×).
- [ ] 0.4 **Import real (founder):** importar o .fit da 0.3 pelo canal validado na 0.1;
      conferir steps/alvos/repetições no Garmin Connect e no relógio. Registrar o resultado.
      Gate: só seguir para os blocos 1+ com estrutura correta no device.
- [ ] 0.5 **Pipeline de métrica:** confirmar que os logs de prod permitem agregar downloads por
      atleta/semana por 4 semanas (métrica de sucesso do proposal). Se não, registrar a
      alternativa acordada (ex.: contador simples) antes do bloco 3.

## 1. Encoder de produção

- [ ] 1.1 `FitWorkoutEncoderService` (interface + impl): `TreinoPlanejado` → `byte[]` .fit.
      Des-expansão de blocos com verificação de janelas idênticas + fallback expandido sem
      repeat (design D2); `repeticoes > 1` avulsa defensiva; `tipoEtapa` String fora dos 5
      valores → ACTIVE. Temp file com delete no `finally`. TDD com round-trip decode cobrindo:
      bloco des-expandido, bloco inconsistente (fallback), treino sem bloco.
- [ ] 1.2 CA4: treino sem `EtapaTreino` → workout de step único — atenção à conversão própria
      (`TreinoBase.duracaoMin` é `Duration`; `EtapaTreino.duracaoMin` é `Integer` minutos);
      `zonaAlvo` do treino como alvo se parseável; `descricao` nas notes. TDD.
- [ ] 1.3 Nomes: `wktName` curto normalizado; `wktStepName` truncado; descrição integral nas
      notes. Testes de borda (descrição longa, acentos, sem descrição).
      Validar: `./mvnw clean test`.

## 2. Parser de alvos

- [ ] 2.1 `FitTargetParser` (classe pura): formatos canônicos do planner (`"5:30-5:45/km"`,
      `"140-150 bpm"`) + tolerantes da tabela D3 ajustada pela 0.2. Espelhar a lógica de
      `parseFcRange`/validação de pace existentes — não criar dialeto divergente. TDD por
      formato, incluindo os traiçoeiros: inversão pace→speed (5:45 → speed low), offset +100 só
      em bpm absoluto (nunca em %), m/s via setters tipados.
- [ ] 2.2 Fallback: formato desconhecido → vazio (step open), sem exceção, sem log por
      ocorrência; string original preservada nas notes (CA3). TDD com fuzz leve (null, vazio,
      lixo, unidades trocadas). Validar: `./mvnw clean test`.

## 3. Endpoints e autorização

- [ ] 3.1 `FitExportController`: `GET /api/v1/planos/treinos/{treinoPlanejadoId}/fit` (binário +
      `Content-Disposition`) e `GET /api/v1/planos/semanas/{planoSemanalId}/fit` (ZIP; rota
      `/semanas/` para não colidir com a semântica atletaId de `GET /planos/{id}` — design D4;
      422 curado se nenhum treino exportável; sufixo numérico de desambiguação nos nomes das
      entries). ZIP em memória.
- [ ] 3.2 Autorização (CA6, design D4): ATLETA resolve o próprio `atletaId` pelo token (padrão
      `resolverAtletaIdAtual` dos endpoints `/me`) e só acessa o que é seu — **não** herdar o
      padrão do `PlanoTreinoController`. Testes dos 3 eixos: ATLETA × treino de outro atleta do
      MESMO tenant (404), TECNICO × atleta de outra assessoria (404), plano não aprovado (403
      com mensagem acionável) para ambos os papéis.
- [ ] 3.3 `CorsConfig`: `exposedHeaders("Content-Disposition")` (design D4) — sem isso o front
      nunca lê o filename. Teste de configuração se o padrão do repo cobrir.
- [ ] 3.4 Log estruturado de download no service (endpoint, atletaId, treinoId) — insumo da
      métrica, conforme acordado na 0.5. Swagger dos endpoints novos gerando sem erro.
      Validar: `./mvnw clean test`.

## 4. Validação backend com dado real

- [ ] 4.1 Exportar via endpoint um plano aprovado real do banco de dev; levar ao relógio pelo
      canal validado na 0.1 — .fit individual **e** semana via ZIP. Registrar divergências
      entre o prescrito no Menthoros e o exibido no relógio (CA1b, CA2, CA5).
- [ ] 4.2 Suíte completa verde: `./mvnw clean test`.

## 5. Frontend (atleta + coach)

- [ ] 5.1 Helper `downloadFile` em `src/shared/` (blob + object URL + filename do
      `Content-Disposition` com fallback local — design D5). Teste unitário do parse do header.
- [ ] 5.2 Atleta: botão de download por treino na `WeeklyPlanList` + "Baixar semana (.fit)" na
      `AthletePlanPage`; visíveis apenas com plano aprovado; botão de semana exige
      `PlanoSemanal.id` presente (tipo opcional no front — design D5). Lógica no hook/adapter.
- [ ] 5.3 Coach: mesma ação no `PlanTabPanel`/`CurrentWeekPlan`, mesma regra de visibilidade.
- [ ] 5.4 Erros 403/422 exibem a mensagem curada do backend (snackbar/toast padrão — não
      engolir, CA7). Validar: `npm run lint && npm run build` + testes do repo front.

## 6. Fechamento

- [ ] 6.1 Conferir CA1-CA8 contra o implementado; atualizar este arquivo com resultados e
      divergências; registrar no proposal o desfecho das Open Questions (canal, formatos,
      precedência ritmo>FC, timing no roadmap).
