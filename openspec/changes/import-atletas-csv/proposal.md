# import-atletas-csv — Importação de Atletas via CSV

**Status:** proposta
**Criado:** 2026-07-31
**Sizing:** S (~10 tasks, backend + frontend)

## Problema

Uma assessoria típica tem 30-200 atletas. Hoje, cada atleta é cadastrado um a um via UI — inviável para assessorias migrando de planilhas ou outros sistemas.

## Escopo

1. **Upload de arquivo CSV** com colunas: nome, email, data_nascimento, peso, altura, objetivo, nivel_experiencia
2. **Preview + validação** — mostra tabela com linhas válidas e inválidas antes de confirmar
3. **Importação em lote** — cria atletas em uma transação; erros por linha não interrompem o restante
4. **Relatório pós-import** — "X atletas criados, Y linhas ignoradas (motivo)"

## Fora do escopo

- Mapeamento de colunas customizado (segue template fixo)
- Import de dados de treino (só cadastro)
- Import de múltiplos técnicos
