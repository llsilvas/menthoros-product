# Tasks — import-atletas-csv

## 1. Discovery e backend

- [ ] 1.1 Mapear DTO/serviço/constraints de criação de atleta, enum/unidades, quota do plano e infraestrutura compartilhada de cache/storage; fechar campos obrigatórios.
- [ ] 1.2 Adicionar biblioteca CSV já aprovada ou justificar uma nova; configurar limites de multipart/request e testes de segurança.
- [ ] 1.3 Implementar parser/normalizador UTF-8 com cabeçalho estrito, BOM, aspas, limites e erros com número de linha.
- [ ] 1.4 Implementar validação reutilizando regras do atleta: campos, faixas, datas, enum e duplicidade intra-arquivo/tenant.
- [ ] 1.5 Implementar armazenamento temporário tenant/user-scoped do preview, TTL, status/idempotência e limpeza; nunca persistir senha ou arquivo original desnecessariamente.
- [ ] 1.6 Implementar endpoints de modelo, preview e confirmação com contratos `400/404/409`, autorização e limite de capacidade.
- [ ] 1.7 Implementar criação por linha em transações independentes via bean transacional, revalidações contra corrida e resultado conciliável.
- [ ] 1.8 Implementar export de erros neutralizando CSV injection.
- [ ] 1.9 Testar BOM/acentos/CRLF/aspas/vírgulas, arquivo vazio/grande, headers, duplicidades nos dois escopos, quota, expiração, repetição, concorrência, falha parcial e usuário A/B.
- [ ] 1.10 Executar `./mvnw clean test`, testes de integração/migração se houver e teste de carga com 500 linhas; registrar resultados.

## 2. Frontend

- [ ] 2.1 Criar rota e entrada de navegação `/coach/atletas/importar`, seletor de arquivo acessível e instruções de formato/limites.
- [ ] 2.2 Criar download do modelo pelo endpoint e client tipado para preview/confirmação.
- [ ] 2.3 Implementar tabela de preview paginada com status textual, erros por linha, totais, capacidade e expiração.
- [ ] 2.4 Implementar confirmação protegida contra duplo clique, progresso, estados de expiração/quota e relatório final conciliável.
- [ ] 2.5 Implementar download do relatório de erros fornecido/gerado com conteúdo sanitizado.
- [ ] 2.6 Testar arquivo inválido, preview misto, zero válidos, expiração, quota, erro parcial, retry idempotente e acessibilidade.
- [ ] 2.7 Executar `npm run lint && npm run build` e testes configurados; registrar resultados.

## 3. Entrega

- [ ] 3.1 E2E com 50 válidos, erros mistos, duplicidades e dois tenants.
- [ ] 3.2 Validar limpeza após TTL e comportamento em múltiplas instâncias.
- [ ] 3.3 Confirmar métricas, limites operacionais e documentação do template.

## Estimativa

M (aprox. 10–15 dias). Preview seguro, idempotência, storage temporário, quota e transações parciais tornam a estimativa S original insuficiente.
