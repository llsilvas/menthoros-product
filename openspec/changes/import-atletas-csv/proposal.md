# import-atletas-csv — Importação de Atletas via CSV

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-07-31

## Problema

Cadastrar dezenas de atletas manualmente inviabiliza a migração de assessorias que hoje trabalham em planilhas. O coach precisa revisar erros antes de persistir dados e receber um resultado confiável por linha.

## Escopo

1. Download de template CSV UTF-8 com cabeçalho fixo.
2. Upload com limites definidos, parsing seguro e preview de linhas válidas/inválidas.
3. Confirmação por `previewId` opaco, garantindo que a importação usa exatamente os dados validados, sem reenviar um arquivo diferente.
4. Criação independente por linha válida; falha inesperada em uma linha não reverte sucessos anteriores.
5. Resultado por linha e download de CSV de erros seguro para planilhas.

## Fora do escopo

- Mapeamento customizado de colunas, XLS/XLSX, atualização/merge de atletas existentes ou desfazer importação.
- Envio de convites, importação de histórico/treinos e associação a múltiplos técnicos.
- Processamento assíncrono de arquivos maiores que os limites do MVP.
- Armazenamento permanente do arquivo original.

## Dependências e ordem

Independe das outras quatro changes, mas reutiliza as mesmas validações/serviço de criação de atleta e o tenant do principal autenticado. Não depende do signup: assessorias existentes também podem importar.

## Critérios de aceite

- **Quando** um CSV válido dentro dos limites é enviado, **então** a API retorna preview com números de linha, dados normalizados, erros e um `previewId` com expiração.
- **Quando** cabeçalho/encoding/tamanho/tipo são inválidos, **então** a requisição é rejeitada sem persistir atletas.
- **Quando** há e-mails repetidos no arquivo ou já existentes no tenant, **então** as linhas são marcadas inválidas no preview; e-mail em outro tenant não causa vazamento nem conflito indevido.
- **Quando** o coach confirma um `previewId` válido, **então** somente as linhas marcadas válidas naquele preview são tentadas e cada resultado é informado.
- **Quando** a capacidade do plano não comporta todas as linhas válidas, **então** a confirmação é bloqueada antes de criar qualquer atleta e informa a capacidade disponível.
- **Quando** uma linha sofre corrida de duplicidade/falha inesperada durante importação, **então** as demais continuam e o relatório mostra a falha daquela linha.
- Preview de um usuário/tenant não pode ser consultado ou confirmado por outro e expira no prazo configurado.

## Métrica de sucesso

Um coach importa 100 atletas em até 5 minutos de interação, com resultado conciliável (`criadas + falhas = linhas confirmadas`) e zero criação cross-tenant.

## Open Questions & Assumptions

- **Bloqueante:** confirmar campos/enum/unidades do cadastro canônico de atleta; o CSV não deve inventar validações paralelas.
- **Premissa MVP:** máximo 500 linhas e 2 MiB por arquivo, preview com TTL de 30 minutos; ajustar por teste de carga.
- **Premissa:** vírgula é delimitador, UTF-8 (BOM permitido), datas ISO `yyyy-MM-dd`, peso em kg e altura em cm; decimais usam ponto.
