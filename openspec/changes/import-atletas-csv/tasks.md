# Tasks — import-atletas-csv

## Backend (5 tasks)

- [ ] 1.1 **DTO `CsvImportRequestDto`:** record com `MultipartFile arquivo`.
- [ ] 1.2 **Serviço `AtletaCsvImportService`:**
  - `preview(MultipartFile)` — parse CSV, valida cada linha, retorna `CsvPreviewDto` (linhas válidas + inválidas com erro).
  - `importar(MultipartFile)` — persiste linhas válidas em lote (`saveAll`), retorna `CsvImportResultadoDto` (criados, ignorados).
- [ ] 1.3 **Parser CSV:** Apache Commons CSV ou OpenCSV. Colunas esperadas: `nome,email,data_nascimento,peso,altura,objetivo,nivel_experiencia`. Pula cabeçalho. Linhas em branco ignoradas.
- [ ] 1.4 **Validação por linha:** e-mail obrigatório + formato, nome obrigatório, peso/altura numéricos, nivel_experiencia enum válido. Erros coletados por linha (não interrompe).
- [ ] 1.5 **Testes:** `AtletaCsvImportServiceTest` — CSV válido (5 linhas), CSV com erros (linhas 2 e 4 inválidas), CSV vazio, encoding UTF-8 com acentos.

## Frontend (5 tasks)

- [ ] 2.1 **Página `CoachImportAtletasPage`** (`/coach/atletas/importar`): upload area (drag-and-drop ou file picker), botão "Fazer upload".
- [ ] 2.2 **Preview:** após upload, tabela MUI DataGrid mostrando linhas do CSV com indicador visual (✅ válida / ⚠️ inválida + tooltip com erro).
- [ ] 2.3 **Confirmação:** botão "Importar X atletas" (desabilitado se 0 válidos), progresso durante import, relatório final.
- [ ] 2.4 **Template CSV para download:** link "Baixar modelo CSV" com cabeçalho e uma linha de exemplo.
- [ ] 2.5 **Testes:** `CoachImportAtletasPage.test.tsx` — upload arquivo, preview com erros, confirma import, resultado.

## Verificação (3 tasks)

- [ ] 3.1 CSV com 50 linhas válidas → 50 atletas criados no tenant correto.
- [ ] 3.2 CSV com e-mails duplicados → linha ignorada, não quebra import.
- [ ] 3.3 CSV com encoding UTF-8 (acentos, ç) → nomes preservados corretamente.

## Sizing: S (~10 tasks)
