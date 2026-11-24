## 0. Antes de implementar

- [ ] 0.1 Grilling: objetivos do primeiro corte, faixa e default de duração, regra de fim do ciclo, marco de teste
- [ ] 0.2 Varrer o código do épico por uso de `PlanoTreino.prova` como não nulo e listar os pontos
- [ ] 0.3 Conferir se a integração semanal (tickets 8 e 9) depende da prova ou só de `SemanaPlanejada`

## 1. Modelo e migration

- [ ] 1.1 Migration: `tipo_temporada` (default `PROVA`), `objetivo_ciclo`, `data_fim`, `prova_id` anulável, CHECK por tipo
- [ ] 1.2 Mapear `tipoTemporada`, `objetivoCiclo` e `dataFim` em `PlanoTreino`; `prova` opcional
- [ ] 1.3 Parâmetros de ciclo por objetivo no `TemplateMetodologia` e no default global
- [ ] 1.4 Testes de integridade: `PROVA` sem prova e `DESENVOLVIMENTO` com prova são recusados
- [ ] 1.5 Validar: `./mvnw clean test`

## 2. Geração, validação e ciclo de vida

- [ ] 2.1 Geração determinística do ciclo (objetivo, duração, template, baseline), só BASE e BUILD
- [ ] 2.2 Validação do rascunho rejeita PEAK, TAPER e RACE_WEEK no tipo `DESENVOLVIMENTO`
- [ ] 2.3 Bloqueio por calibração igual ao da temporada de prova (422 com motivo)
- [ ] 2.4 Aprovar temporada de prova arquiva o ciclo ativo, com motivo
- [ ] 2.5 Fim do ciclo conforme a decisão de 0.1
- [ ] 2.6 Endpoint de geração do ciclo, restrito a `TECNICO`/`ADMIN`, com isolamento por tenant
- [ ] 2.7 Flag `macrociclo.desenvolvimento.enabled`
- [ ] 2.8 Testes: reprodutibilidade, exclusividade de `ATIVO`, regressão da temporada de prova, 403 e tenant
- [ ] 2.9 Validar: `./mvnw clean test`

## 3. Frontend

- [ ] 3.1 Ação "Criar ciclo de desenvolvimento" no estado sem prova-alvo, com objetivo e duração
- [ ] 3.2 Cabeçalho e KPIs da aba sem prova: objetivo, semana N de M, data de fim
- [ ] 3.3 Tela de ajuste sem as fases de pico, polimento e semana da prova
- [ ] 3.4 "Minha temporada" do atleta para ciclo ativo
- [ ] 3.5 Resumo do ciclo encerrado e ações seguintes
- [ ] 3.6 Validar: `bun lint && bun run build && bun test:run`

## 4. Fechamento

- [ ] 4.1 Atualizar o PRD `prd/prd-plano-temporada.md` (§6 e fluxo) e o manual do treinador
- [ ] 4.2 Ligar a flag no piloto e registrar a linha de base da métrica
