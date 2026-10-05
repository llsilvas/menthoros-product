**Tamanho:** S · **Trilha:** Full

## Why

No painel "Plano Vigente" da ficha do atleta (view do coach), os cards de treino planejado não mostram o TSS estimado — fica implicitamente "zerado"/ausente para o coach, mesmo quando o campo `tssPlanejado` já existe e está populado em `TreinoPlanejado`.

Causa raiz: `AtletaPerfilCoachOutputDto.TreinoPlanejadoResumoDto` (backend) nunca carrega `tssPlanejado`, e `CoachAthleteProfileServiceImpl.resolverPlanoVigente` nunca passa `tp.getTssPlanejado()` ao construir o DTO. No frontend, o tipo `TreinoPlanejadoResumoDto` (`src/types/AtletaPerfilCoach.ts`) não tem o campo e `CurrentWeekPlan.tsx` (`TreinoCard`) nunca renderiza TSS. É ausência ponta a ponta, não condição de exibição — mesma classe de bug do PR #164 (`fix/coach-recent-trainings-tss`), que resolveu o espelho do lado realizado (`RealizadoRecenteDto.tssCalculado`). Esta change aplica o mesmo padrão ao lado planejado.

Fora de escopo: a investigação também encontrou um gap separado e mais profundo — para tenants no schema v1 do LLM (default, sem allowlist), `tssPlanejado` é aceito verbatim do JSON do modelo sem recálculo/validação, podendo legitimamente persistir como `0`. Esse é um problema de **qualidade do dado na geração do plano**, não de exposição no DTO, e deve virar change própria se confirmado como a causa do "zerado" em algum caso concreto.

## What Changes

- `AtletaPerfilCoachOutputDto.TreinoPlanejadoResumoDto`: adicionar campo `tssPlanejado` (Integer, nullable).
- `CoachAthleteProfileServiceImpl.resolverPlanoVigente`: passar `tp.getTssPlanejado()` no construtor do DTO.
- `src/types/AtletaPerfilCoach.ts`: adicionar `tssPlanejado?: number | null` em `TreinoPlanejadoResumoDto`.
- `CurrentWeekPlan.tsx` (`TreinoCard`): renderizar TSS quando `tssPlanejado != null`, seguindo o mesmo padrão visual já usado em `DetalheTreinoDialog.tsx`/`fromTreino.ts` para o treino planejado individual.

## Capabilities

### Modified Capabilities

- Nenhuma capability de produto tem requisito funcional alterado — é correção de exposição de um dado já existente (aditivo, sem mudança de contrato externo além de um novo campo opcional no DTO).

## Impact

**Entidades e banco:** nenhuma alteração de schema — `tss_planejado` já existe em `tb_treino_planejado`.

**APIs:** `GET` do endpoint que retorna `AtletaPerfilCoachOutputDto` ganha um campo novo e opcional (`tssPlanejado`) dentro de `planoVigente`. Mudança aditiva, não quebra contratos existentes.

**Frontend:** `CurrentWeekPlan.tsx` e o tipo `AtletaPerfilCoach.ts` precisam do campo novo; nenhum outro consumidor do tipo é afetado.

**Compatibilidade:** campo nullable/opcional em ambos os lados — clientes antigos do contrato continuam funcionando sem o campo.

## Critérios de aceite

1. **Given** um treino planejado com `tssPlanejado` populado (> 0) no banco, **When** o coach abre o painel "Plano Vigente" na ficha do atleta, **Then** o card do treino exibe o valor de TSS planejado.
2. **Given** um treino planejado com `tssPlanejado` nulo, **When** o coach abre o painel "Plano Vigente", **Then** o card não exibe o bloco de TSS (sem "0" nem traço enganoso) — mesmo padrão de `DetalheTreinoDialog`.
3. **Given** o endpoint de perfil do atleta (coach), **When** chamado para um atleta com plano vigente, **Then** o JSON de resposta inclui `tssPlanejado` dentro de cada item de `planoVigente`.

## Métrica de sucesso

Zero relatos de "TSS planejado sumido/zerado" no painel Plano Vigente após o deploy (hoje: 1 relato conhecido — atleta Leandro, 2026-10-04).

## Open Questions & Assumptions

- **Assumption:** o padrão de renderização (ocultar bloco quando nulo, não mostrar "0") deve seguir o que já existe em `DetalheTreinoDialog.tsx`/`fromTreino.ts`. Não confirmado com design, mas é o padrão já estabelecido no mesmo domínio.
- **Open:** se o TSS exibido ainda aparecer como `0` (não ausente) após esta fix, a causa é o gap de cálculo no schema v1 do LLM (fora de escopo aqui) — precisa virar change própria.
- **Assumption:** não há outro consumidor do tipo `TreinoPlanejadoResumoDto` (frontend) que precise ignorar/tratar o campo novo; a busca no Explore não encontrou outros.
