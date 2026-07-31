# Design — import-atletas-csv

## Modelo CSV esperado

```csv
nome,email,data_nascimento,peso,altura,objetivo,nivel_experiencia
João Silva,joao@email.com,1990-05-15,75.5,178,Completar meia-maratona,INTERMEDIARIO
Maria Santos,maria@email.com,1985-10-20,62.0,165,Melhorar tempo 10k,AVANCADO
```

## Fluxo

```
Coach acessa /coach/atletas/importar
        ↓
Faz upload do CSV
        ↓
POST /api/v1/atletas/importar/preview → retorna preview (válidas + inválidas)
        ↓
Coach revisa tabela → clica "Importar X atletas"
        ↓
POST /api/v1/atletas/importar → processa lote
        ↓
Relatório: "45 atletas criados, 5 linhas ignoradas"
        ↓
Coach pode baixar relatório de erros (CSV com coluna 'erro')
```

## Decisões de design

- **Uma transação por atleta** (não lote inteiro) — erro em uma linha não reverte as demais
- **Preview obrigatório** — coach confirma antes de persistir
- **Tenant-scoped** — atletas criados no tenant da requisição (JWT), sem risco de cross-tenant
