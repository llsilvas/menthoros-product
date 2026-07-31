# Design — assessoria-settings-ui

## Contratos

Usar o plural consistente `assessorias`:

`GET /api/v1/assessorias/me`

```json
{
  "id": "...",
  "nome": "Corridas Serra",
  "logoUrl": "https://assets.example/...",
  "corPrimaria": "#FF6B35",
  "corSecundaria": "#2D3748",
  "plano": "BASIC",
  "uso": { "atletas": 7, "maxAtletas": 10, "tecnicos": 1, "maxTecnicos": 1 },
  "version": 3
}
```

`PATCH /api/v1/assessorias/me`

```json
{
  "nome": "Corridas Serra Pro",
  "corPrimaria": "#FF6B35",
  "corSecundaria": "#2D3748",
  "version": 3
}
```

Campos omitidos permanecem; `null` não apaga neste MVP. Pelo menos um campo editável deve estar presente. Respostas: `200`, `400`, `403`, `409` por versão obsoleta. `tenantId`, plano, limites, slug e `logoUrl` não são aceitos no patch.

`POST /api/v1/assessorias/me/logo` recebe multipart `arquivo` + `version`; retorna o output atualizado. Limites iniciais: PNG/JPEG/WebP, conteúdo real validado, até 2 MiB e dimensões máximas definidas após teste (sugestão 2048×2048). SVG fica fora por risco de conteúdo ativo. O backend decodifica a imagem para validar, gera chave/filename, remove metadata se a biblioteca permitir e nunca usa nome/path do cliente.

## Serviço, autorização e consistência

Controller obtém usuário/tenant do principal e delega ao serviço existente. A permissão é explícita (`ASSESSORIA_OWNER`/equivalente confirmado); não assumir que todo `TECNICO` pode editar. Repository/query também é tenant-scoped como defesa em profundidade.

Adicionar `@Version`/coluna se não existir. Contagens são calculadas no GET; limites e plano são sempre read-only. Validar nome normalizado e cores `#[0-9A-Fa-f]{6}`, persistindo uppercase.

Upload segue: validar → gravar objeto temporário/novo → atualizar banco com nova URL/chave em transação → após commit apagar logo antiga. Em falha de banco, apagar o novo objeto; falhas de cleanup entram em retry/job. Guardar a chave interna, não apenas uma URL que possa expirar. A estratégia final depende do storage existente.

## Frontend

A página vive sob o grupo “Configurações”, ao lado de `/coach/settings/perfil`. Carrega o GET, mantém um único draft, mostra dirty state e pede confirmação ao sair. Salvar texto/cores usa PATCH; upload ocorre em ação separada com progresso e só troca o preview definitivo após resposta.

O preview aplica tokens em um componente isolado. Antes de salvar, calcular contraste WCAG para combinações usadas e sugerir ajuste. Mesmo com cor persistida, o shell deve escolher texto/foco com contraste seguro. Após resposta, atualizar/invalidate o cache compartilhado da assessoria para header/sidebar refletirem a mudança.

## Falhas e operação

- `409`: preservar draft e oferecer comparar/recarregar.
- Falha de imagem: manter logo anterior e permitir retry.
- Imagem quebrada no shell: fallback com iniciais/nome.
- Métricas de update/upload/falha/cleanup sem nome do arquivo ou tenant como label de alta cardinalidade.

## Rollout

Provisionar storage/CORS/lifecycle primeiro, publicar APIs e migração compatíveis, depois frontend. Feature flag pode ocultar upload independentemente dos campos de texto/cores.
