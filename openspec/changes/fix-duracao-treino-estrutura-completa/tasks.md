# Tasks — fix-duracao-treino-estrutura-completa

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean verify`.

## 1. Duração na soma das etapas

- [ ] 1.1 Teste (vermelho) em `TreinoNormalizadorCorrigirDistanciasTest` (ou no `@Nested` de
      `adotarSomaDasEtapas`, se existir): estrutura completa com todas as etapas com duração → treino com
      `duracaoMin` = soma das durações (CA1); distância já igual à soma → `duracaoMin` = soma (CA1b);
      aquecimento com distância e sem duração → `duracaoMin` intacta (CA2).
      verify: CA1 e CA1b falham em develop; CA2 passa.
- [ ] 1.2 `TreinoNormalizador.adotarSomaDasEtapas`: gravar `duracaoMin` = `formatarDuracao(somarDuracoesMin(etapas))`
      quando todas as etapas têm duração > 0 — também no retorno antecipado (distância já igual à soma).
      verify: 1.1 verde.
- [ ] 1.3 Teste pela receita completa (`NormalizacaoDeTreino#normalizar`) com o caso exato do CA1 (limiar
      5:00 com zonas de pace, PRINCIPAL 69 min, cabeçalho `8:00-8:00/km`, `96:00`) → `84:00`; e o CA1b.
      verify: falha sem a 1.2 (develop mantém `96:00`).

## 2. Matriz

- [ ] 2.1 `NormalizacaoDeTreinoInvarianteTotalTest`: na estrutura completa com ritmo, a segunda invariante
      é "total = soma das etapas" com a mesma tolerância da matriz (max(2%, 0,05 km); 1 min); demais
      cenários seguem "total = prescrito". A matriz não gera o caso "total já igual à soma" — ele fica
      coberto pelo CA1b (1.1 e 1.3).
      Remover `estrutura-completa` de `EXCECOES` e do `INVENTARIO`; atualizar o Javadoc da classe.
      verify: matriz verde com inventário `sem-pace` 504 e `tempo-run-sintetizado` 252 (CA3).
- [ ] 2.2 Validação: `./mvnw clean verify`; esperados alterados listados abaixo (CA4).

## Esperados alterados

(preenchido na 2.2)
