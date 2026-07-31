# Design — assessoria-settings-ui

## Endpoint

```
PUT /api/v1/assessoria/me
Authorization: Bearer <JWT>
X-Tenant-ID: <tenant_id>

Body (todos opcionais):
{
  "nome": "Corridas Serra Pro",
  "logoUrl": "https://...",
  "corPrimaria": "#FF6B35",
  "corSecundaria": "#2D3748"
}

Response 200: AssessoriaOutputDto completo
```

## Página

- Rota: `/coach/settings/assessoria`
- Acessível via sidebar: "Configurações > Assessoria"
- Preview ao vivo: header simulado com logo + nome + cores da assessoria

## Segurança

- Tenant resolvido via JWT — coach só edita a própria assessoria
- Sem `@PreAuthorize("hasRole('ADMIN')")` — qualquer TECNICO pode editar
- Campos imutáveis (domínio, plano, maxAtletas) não expostos no DTO de update
