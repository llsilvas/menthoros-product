# Tasks — eval-progression-adherence-rollout

Branch `feature/eval-progression-adherence-rollout` no backend. Origem: seção 3 (Pós-deploy) de
`fix-progression-adherence-window` (PR #155, mergeado em `develop` em 2026-10-01).

## 1. Medição

- [ ] 1.1 Operacionalizar a consulta de "aprovado sem edição de volume" sobre `PlanoSemanal`
  (comparar `volumePlanejadoKm` da geração com o volume vigente na aprovação — ver Open Questions do
  proposal) e rodar para as duas janelas de 4 semanas (antes/depois do deploy do PR #155)
  - verify: CA1 — n ≥ 20 em cada janela; se não tiver, registrar aqui que a decisão fica adiada e
    quando reavaliar
- [ ] 1.2 Calcular a taxa de aceitação sem edição em cada janela e a diferença em p.p.
  - verify: número documentado nesta task, com a consulta usada anexada (script descartável, não
    commitado, como no gate de merge da change de origem)

## 2. Decisão

- [ ] 2.1 Se queda > 5 p.p.: desligar `menthoros.progressao.aderencia-devidos.enabled` via config
  (sem deploy de código) e registrar o achado aqui e no `SPRINTS.md`
  - verify: CA2
- [ ] 2.2 Se estável (sem queda > 5 p.p.): seguir para a seção 3 (limpeza)
  - verify: CA3 (gate de entrada da seção 3)

## 3. Limpeza (só se 2.2 — estável)

- [ ] 3.1 Remover a flag `menthoros.progressao.aderencia-devidos.enabled`, o branch condicional em
  `ProgressaoTreinoServiceImpl` e a configuração correspondente
- [ ] 3.2 Remover os testes de `ProgressaoTreinoServiceImplTest` que exercitam exclusivamente a regra
  antiga (CA8 original)
- [ ] 3.3 Validação: `./mvnw clean verify`
  - verify: CA3 — suíte verde sem a flag nem o branch antigo

## Nota

Se a task 1.1 encontrar n < 20 em alguma janela no momento da execução, a change fica com a task 1
em aberto até a janela completar — não pular a medição nem decidir com amostra insuficiente (CA1).
