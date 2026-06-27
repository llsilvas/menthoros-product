# ADR 0010 - Sistema de cor do frontend Premium v2.0 (instrument-grade)

## Status
Proposto

## Data
2026-06-27

## Decisores
Frontend architecture · Design system

## Contexto
O sistema de cor do frontend (`apps/menthoros-front`) acumulou três dívidas:

1. **Sobrecarga do lime** (`#D4FF3A`): significa marca, ação primária, readiness 70–89, zona Z2 e a etapa `principal` — quatro intenções numa cor.
2. **Colisão semântico × categórico**: tipos de treino e etapas reaproveitam `danger`/`warning`/`success`/`info` em `src/shared/theme/workoutColors.ts`, tornando um chip vermelho ambíguo entre "erro" e "INTERVALADO".
3. **Premium drift**: lime neon + glass pesado (`blur(10px)` + white-alpha) leem energy-drink, não instrumento.

Estado medido: **111** hex crus + **189** `rgba(...)` em **24** componentes. O arquivo `theme.premium.ts` define a v2.0 (lime tamed `#BDDE5A`, paleta `categorical` dedicada, readiness sem lime, Z2 verde, status semântico). Restrições: tokens permanecem TypeScript + MUI dark (sem Tailwind / CSS color vars); a lógica de domínio (limiares de readiness, TSB→Forma, regras de zona) é do backend; a UI só renderiza o valor resolvido.

## Opções consideradas
1. **Big-bang**: trocar todos os tokens e componentes num único PR.
2. **Migração faseada com gate de lint + teste de invariante** (mecânica → colisão → polish).
3. **Tema paralelo via feature flag** (`PREMIUM_V2`) alternando o objeto de tokens.

## Decisão
Escolhida a **opção 2**. Adotar `theme.premium.ts` como fonte de verdade e migrar em três fases isoladas e reversíveis, protegidas por uma regra ESLint (`no-raw-color-literals`) que falha CI em cor crua e por um teste de invariante que garante categoria ≠ hex semântico. Lime restrito a marca/ação + uma métrica-chave por view; vermelho puro reservado a lesão.

Justificativa: o big-bang (1) torna o rollback grosseiro e o review impossível de validar visualmente; o flag (3) adiciona complexidade de tema dual sem necessidade — a reversão por commit de valor único já cobre o risco. A opção 2 entrega rollback granular (cada fase = 1 commit; lime = 1 valor) e regressão impedida por gate automatizado.

## Consequências
### Positivas
- Cada cor passa a ter um único significado → confiabilidade visual.
- Dívida de cor crua eliminada e impedida de voltar (gate de CI).
- Coach cockpit mais legível (material/hairline sobre glow).
- Rollback barato e por fase.

### Negativas / Trade-offs
- Usuários veem chips de treino com cores novas (re-treino visual; esperado).
- Remoção do blur exige reajuste de profundidade via background-shift + hairline.
- Regra de lint pode exigir allowlist inicial e ignorar comentários.

## Plano de revisão
Revisar após a Fase 3 e a revisão de visual diff (cockpit / plan / workout detail). Gatilhos de reavaliação: introdução de light mode, novo shell de produto, ou mudança de marca que reabra o valor do lime.

## Referências
- OpenSpec change: `openspec/changes/migrate-frontend-color-system-premium-v2/`
- Fonte de verdade: `theme.premium.ts` (Premium v2.0)
- ADR-0008 (frontend React + TypeScript com contratos tipados)
