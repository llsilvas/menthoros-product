# Arquitetura do Menthoros

> Resumo: visão geral de como backend, frontend e IA se conectam, os limites entre
> camadas, e as restrições estruturais que qualquer PRD ou change precisa respeitar
> antes de propor uma nova capability.

## O que é

Menthoros é composto por três repositórios independentes, cada um com seu próprio
ciclo de release:

- `apps/menthoros-backend` — API REST, Java/Spring Boot, dona do domínio e da
  persistência.
- `apps/menthoros-front` — SPA React, consome a API via cliente OpenAPI curado.
- `menthoros-product` — especificações (OpenSpec), PRDs, ADRs e esta base de
  conhecimento. Não tem runtime; é fonte de verdade de escopo e contexto.

Modelo de deploy: Railway (backend e frontend como serviços separados), domínio
público `menthoros.com`.

## Por que importa para o Menthoros

Toda proposta de feature (PRD, discovery) precisa respeitar as fronteiras abaixo
antes de assumir que "é só adicionar um campo" ou "é só uma tela nova":

- **Camadas do backend são estritas**: `controller` (transporte) → `service`
  (regra de negócio) → `repository` (persistência). Controllers nunca injetam
  repository nem service impl concreta — só a interface do service.
- **Multi-tenancy é transversal e obrigatória**: todo dado sensível é filtrado por
  `tenant_id`, resolvido via `TenantContext.getRequiredTenantId()`. Nenhuma feature
  pode contornar esse filtro — é o principal guardrail de segurança do produto.
- **Skills de domínio (`br.com.menthoros.backend.skills.*`) são puras**: não recebem
  entidades JPA, só records. Isso existe porque entidades JPA têm coleções lazy que
  quebram fora de transação — uma skill chamada de forma assíncrona ou em batch
  quebraria se dependesse de entity.
- **O front consome um cliente OpenAPI curado**, não o gerado cru. Mudanças de
  contrato no backend não se propagam automaticamente para o front — precisam ser
  portadas à mão. Isso significa que uma mudança de payload no backend é sempre um
  trabalho de dois repositórios, não um.

## Detalhes / modelo

### Fluxo de uma requisição típica (backend)

```text
Controller (HTTP, DTO validado)
  → Service (orquestração, regra de negócio, TenantContext)
    → Skill (lógica de domínio pura, quando aplicável)
    → Repository (persistência, tenant-scoped)
  → Mapper (entity ↔ DTO)
```

### Decomposição de serviços grandes

Serviços que misturam orquestração, IO e persistência em uma classe só viram
intestáveis. Há débito técnico conhecido e rastreado (não crescer sem uma change
dedicada):

- `IaServiceImpl` (~1500 linhas) — geração de plano + validação FC/intervalo/carga.
  Decomposição rastreada na change `refactor-iaservice-decomposition`.
- `PlanoServiceImpl` (~740 linhas), `StravaActivityServiceImpl` (~650),
  `TsbServiceImpl` (~640).

### Padrão de falha parcial em endpoints de agregação

Endpoints que montam resposta a partir de múltiplas sub-consultas independentes
(ex. perfil do atleta com PMC + aderência + plano + sinais) usam o padrão de
**falha parcial**: cada sub-consulta roda isolada, erros de infraestrutura são
capturados e registrados em uma lista `avisos`, e a resposta segue com dados
parciais em vez de derrubar o endpoint inteiro. Erros de domínio (entidade não
encontrada, estado inválido) sempre propagam.

### Resiliência de chamadas externas

Toda chamada que sai do processo (LLM via OpenAI/Anthropic, Keycloak, Strava)
precisa de timeout de conexão e resposta — isso é regra, não recomendação. Estado
atual: Keycloak tem timeout configurado; LLM e Strava ainda não têm circuit
breaker (gap rastreado na change `add-external-call-resilience`).

## Fontes

- `apps/menthoros-backend/CLAUDE.md` (seções "Coding Rules", "Skills Architecture
  Standards", "External Call Resilience").
- Código-fonte: `br.com.menthoros.backend.services`, `br.com.menthoros.backend.skills`.

## Status: fato estabelecido
