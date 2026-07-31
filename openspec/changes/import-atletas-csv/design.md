# Design — import-atletas-csv

## Formato

Cabeçalho exato, sem distinção de caixa após trim:

```csv
nome,email,data_nascimento,peso_kg,altura_cm,objetivo,nivel_experiencia
João Silva,joao@example.com,1990-05-15,75.5,178,Completar meia-maratona,INTERMEDIARIO
```

Definir obrigatoriedade a partir do cadastro canônico. Inicialmente `nome` e `email` são obrigatórios; vazios opcionais viram `null`. Rejeitar colunas ausentes, duplicadas ou desconhecidas para evitar importações deslocadas. Suportar campos entre aspas, vírgulas internas, CRLF/LF e BOM UTF-8 por biblioteca CSV madura.

Limites padrão: 2 MiB, 500 linhas de dados, tamanho máximo por campo e timeout. Não confiar apenas em extensão/MIME. Não processar fórmulas; ao gerar relatório, prefixar células iniciadas por `=`, `+`, `-` ou `@` para evitar CSV injection.

## APIs

`GET /api/v1/atletas/importacoes/modelo` retorna template UTF-8.

`POST /api/v1/atletas/importacoes/preview` recebe `multipart/form-data` no parâmetro `arquivo` e retorna:

```json
{
  "previewId": "opaque-id",
  "expiresAt": "2026-07-31T12:30:00Z",
  "total": 2,
  "validas": 1,
  "invalidas": 1,
  "capacidadeDisponivel": 10,
  "linhas": [{ "numero": 2, "status": "VALIDA", "dados": {}, "erros": [] }]
}
```

`POST /api/v1/atletas/importacoes/{previewId}/confirmar` não recebe novamente o arquivo. Respostas: `200` com resultado por linha; `404` para ID inexistente (sem revelar owner); `409` expirado/já confirmado/capacidade insuficiente.

O preview armazena temporariamente apenas linhas normalizadas, hash do arquivo, user ID, tenant ID, expiração e status. Pode usar storage compartilhado/cache persistente compatível com múltiplas instâncias; memória local só é aceitável em deployment de instância única comprovado. ID aleatório não substitui checagem de owner/tenant. Após confirmar/expirar, remover conteúdo conforme job de limpeza.

## Validação e importação

Reutilizar um serviço/domínio de criação de atleta para regras e limites. Validar sintaxe, enum, datas plausíveis, números/faixas, duplicidade normalizada dentro do arquivo e no tenant. Consultas de e-mail devem ser tenant-scoped.

Antes de importar, recalcular capacidade e duplicidades para cobrir mudanças desde o preview. Capacidade insuficiente bloqueia o lote inteiro. Para as linhas restantes, usar uma transação independente por atleta por meio de bean separado/proxy transacional; `saveAll` em uma única transação contradiz a tolerância a erro e não deve ser usado. Constraint única é a defesa final contra corrida.

O resultado contém `numero`, `status` (`CRIADA`/`IGNORADA`/`ERRO`), `atletaId` quando criado e códigos/mensagens funcionais. Contadores devem ser derivados das linhas. Confirmar novamente o mesmo preview retorna o resultado armazenado (idempotência) durante o TTL, sem duplicar atletas.

## Frontend

Fluxo em `/coach/atletas/importar`: baixar modelo → escolher arquivo → preview paginado → confirmar → relatório/download. Mostrar unidades e formato esperado antes do upload. Não usar apenas cor/emoji para status. Em expiração, pedir novo preview; em capacidade insuficiente, linkar para gestão do plano sem oferecer upgrade nesta change.

## Segurança e operação

- Autenticação/role de coach e tenant sempre derivados do JWT/contexto.
- Nome original do arquivo não vira path; conteúdo original não vai para logs.
- Métricas agregadas de linhas/latência/erros; sem e-mail/nome.
- Teste de carga nos limites e job de limpeza de previews expirados.
