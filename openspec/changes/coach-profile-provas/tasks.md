# Tasks — coach-profile-provas

Repo: `apps/menthoros-backend`, branch `fix/coach-profile-provas`. Validação: `./mvnw clean test`.

## 1. Backend

- [ ] 1.1 Teste (vermelho) em `CoachAthleteProfileServiceImplTest`: preparatória antes da prova-alvo
      → `provas` com as duas em ordem e `proximaProva` = preparatória; sem provas → `provas` vazio.
      verify: o teste falha por falta do campo.
- [ ] 1.2 `AtletaPerfilCoachOutputDto.provas` logo depois de `proximaProva`; o service passa a lista
      de `buscarProvas`; `@Schema` de `proximaProva` corrigido; construtores dos testes de controller
      ajustados. verify: `./mvnw clean test` verde.

## 2. Validação

- [ ] 2.1 Dev local com `SEASON_PLAN_ENABLED=true`: a aba Temporada do atleta com prova-alvo mostra o
      botão de gerar. verify: manual, pelo treinador.
