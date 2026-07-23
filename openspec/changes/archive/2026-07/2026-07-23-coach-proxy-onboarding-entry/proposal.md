# Proposal: Entrada do coach no formulário de onboarding (coach-como-proxy)

**Tamanho:** XS · **Trilha:** Fast

## Problema

`athlete-onboarding-baseline` (arquivada em `archive/2026-07/2026-07-22-athlete-onboarding-baseline`)
implementou o bônus de confiança "coach-como-proxy" (CA7, design.md Decisão 3) — o backend já
deriva `preenchidoPorCoach` do papel do chamador via JWT (`OnboardingController.isCoach()`) e
aplica o bônus no `ConfidenceScorer` sem precisar de nenhum flag do cliente. Mas a UI nunca ganhou
um caminho para o coach efetivamente preencher o onboarding em nome de um atleta — a rota
`/athlete/onboarding` é protegida por `RoleRoute allow={['ATLETA']}` e `useOnboarding` resolve o
`atletaId` via `UsuarioService.getMe().atletaId`, que só existe para quem tem papel ATLETA. Ficou
registrado como pendência (task 7.4) para "decisão do founder" — decisão tomada agora: construir.

Isso é real para atletas legados/pouco tech-savvy sendo cadastrados pelo coach — sem essa entrada,
o bônus de confiança do CA7 nunca é exercitado na prática.

## Goals

- Coach (TECNICO/ADMIN) consegue abrir o mesmo formulário de onboarding a partir do perfil do
  atleta (`CoachAthleteProfilePage`) e preenchê-lo em nome dele.
- Reaproveitar 100% do wizard existente (`AthleteOnboardingPage`/`useOnboarding`) — sem duplicar
  lógica de formulário.
- Nenhuma mudança de contrato de API: o backend já aceita `atletaId` explícito e já deriva
  `preenchidoPorCoach` do papel — o frontend só precisa parar de assumir "o atleta logado".

## Non-Goals

- Reforçar `RoleRoute` no shell `/coach/*` inteiro (hoje sem guard nenhum) — gap pré-existente,
  ortogonal a esta change, registrado em Open Questions para decisão futura separada.
- Qualquer mudança no backend (`OnboardingController`/`OnboardingService`) — já suporta o fluxo.
- Indicador visual "Preenchendo como treinador" além do essencial — a task original mencionava
  isso, mas o dado (`preenchidoPorCoach`) já é derivado no backend; nesta change o foco é a
  ENTRADA (rota + navegação), não um redesign visual do wizard.

## Critérios de aceite

- **CA1:** Um usuário TECNICO/ADMIN, a partir de `/coach/athletes/:atletaId`, consegue navegar
  para uma rota que abre o wizard de onboarding daquele atleta específico (não o seu próprio).
- **CA2:** O wizard funciona identicamente ao fluxo do atleta (draft salvo a cada etapa, retomada
  se interrompido, conclusão calcula baseline/score) — via o mesmo `useOnboarding`, apenas com
  `atletaId` injetado da URL em vez de resolvido via `getMe()`.
- **CA3:** Ao concluir, a navegação final leva de volta para `/coach/athletes/:atletaId` (não para
  `ATHLETE_HOME`, que não faz sentido para o coach).
- **CA4:** Um atleta autenticado como ATLETA continua acessando `/athlete/onboarding` exatamente
  como antes (zero regressão no caminho existente).

## Métrica de sucesso

Proxy indireto (não há métrica de produto isolada para uma entrada de UI): % de atletas Cenário
B/C que tiveram onboarding preenchido pelo coach (`preenchidoPorCoach=true`) — hoje sempre 0% por
falta de caminho de UI; qualquer valor > 0% após o deploy confirma que a entrada está sendo usada.

## Open Questions & Assumptions

- ✅ **Reaproveitar o componente do atleta, não duplicar** — decisão desta proposta.
- ⚠️ **`/coach/*` sem `RoleRoute` guard** — achado durante a investigação (nenhuma rota do shell
  coach tem enforcement de papel no client hoje; a proteção real é só a autorização do backend).
  Não é introduzido por esta change nem piora o estado atual — mas fica registrado como débito de
  segurança de UX (um ATLETA autenticado poderia navegar manualmente para `/coach/...` e ver a
  casca da tela, ainda que as chamadas de API sejam rejeitadas pelo backend). Candidato a change
  de hardening futura, fora de escopo aqui.
- **Indicador "Preenchendo como treinador"** — adiado desta change (ver Non-Goals); se o founder
  quiser o indicador visual, é uma adição pequena e isolada sobre esta base.
