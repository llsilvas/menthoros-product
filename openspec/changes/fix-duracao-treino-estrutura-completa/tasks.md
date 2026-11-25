# Tasks — fix-duracao-treino-estrutura-completa

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean verify`.

## 1. Duração na soma das etapas

- [ ] 1.1 Teste (vermelho) em `TreinoNormalizadorCorrigirDistanciasTest` (ou no `@Nested` de
      `adotarSomaDasEtapas`, se existir): estrutura completa com todas as etapas com duração → treino com
      `duracaoMin` = soma das durações (CA1); com uma etapa sem duração → `duracaoMin` intacta (CA2).
      verify: o caso CA1 falha em develop.
- [ ] 1.2 `TreinoNormalizador.adotarSomaDasEtapas`: gravar `duracaoMin` = `formatarDuracao(somarDuracoesMin(etapas))`
      quando todas as etapas têm duração > 0.
      verify: 1.1 verde.
- [ ] 1.3 Teste pela receita completa (`NormalizacaoDeTreino#normalizar`) com o caso do CA1 (ritmo do
      cabeçalho 8:00/km): duração do treino = soma das etapas.
      verify: falha sem a 1.2.

## 2. Matriz

- [ ] 2.1 `NormalizacaoDeTreinoInvarianteTotalTest`: na estrutura completa com ritmo, a segunda invariante
      é "total = soma das etapas" (tolerância apertada); demais cenários seguem "total = prescrito".
      Remover `estrutura-completa` de `EXCECOES` e do `INVENTARIO`; atualizar o Javadoc da classe.
      verify: matriz verde com inventário `sem-pace` 504 e `tempo-run-sintetizado` 252 (CA3).
- [ ] 2.2 Validação: `./mvnw clean verify`; esperados alterados listados abaixo (CA4).

## Esperados alterados

(preenchido na 2.2)
