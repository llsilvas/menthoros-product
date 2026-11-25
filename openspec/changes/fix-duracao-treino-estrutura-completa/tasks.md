# Tasks — fix-duracao-treino-estrutura-completa

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean verify`.

## 1. Duração na soma das etapas

- [x] 1.1 Teste (vermelho) em `TreinoNormalizadorCorrigirDistanciasTest` (ou no `@Nested` de
      `adotarSomaDasEtapas`, se existir): estrutura completa com todas as etapas com duração → treino com
      `duracaoMin` = soma das durações (CA1); distância já igual à soma → `duracaoMin` = soma (CA1b);
      aquecimento com distância e sem duração → `duracaoMin` intacta (CA2).
      verify: CA1 e CA1b falham em develop; CA2 passa.
- [x] 1.2 `TreinoNormalizador.adotarSomaDasEtapas`: gravar `duracaoMin` = `formatarDuracao(somarDuracoesMin(etapas))`
      quando todas as etapas têm duração > 0 — também no retorno antecipado (distância já igual à soma).
      verify: 1.1 verde.
- [x] 1.3 Teste pela receita completa (`NormalizacaoDeTreino#normalizar`) com o caso exato do CA1 (limiar
      5:00 com zonas de pace, PRINCIPAL 69 min, cabeçalho `8:00-8:00/km`, `96:00`) → `84:00`; e o CA1b.
      verify: falha sem a 1.2 (develop mantém `96:00`).

## 2. Matriz

- [x] 2.1 `NormalizacaoDeTreinoInvarianteTotalTest`: na estrutura completa com ritmo, a segunda invariante
      é "total = soma das etapas" com a mesma tolerância da matriz (max(2%, 0,05 km); 1 min); demais
      cenários seguem "total = prescrito". A matriz não gera o caso "total já igual à soma" — ele fica
      coberto pelo CA1b (1.1 e 1.3).
      Remover `estrutura-completa` de `EXCECOES` e do `INVENTARIO`; atualizar o Javadoc da classe.
      verify: matriz verde com inventário `sem-pace` 504 e `tempo-run-sintetizado` 252 (CA3).
- [x] 2.2 Validação: `./mvnw clean verify`; esperados alterados listados abaixo (CA4).

## Esperados alterados

- `TreinoNormalizadorDistanciaPrincipalPorPaceTest` › `soOTotalMuda`: passa a ignorar também `duracaoMin`
  na comparação recursiva. O treino de teste declara `45:00` com etapas somando 40 min; agora a duração
  vira a soma (40), que é o comportamento da change. Distância continua afirmada (5,22).
- Caracterização (`NormalizacaoDeTreinoCaracterizacaoTest`) e goldens: nenhum esperado alterado.

## Resultado

- Matriz: 5.045 testes, 756 cenários nas exceções (`sem-pace` 504, `tempo-run-sintetizado` 252); a exceção
  `estrutura-completa` (1.004) saiu. Teste da receita completa (CA1/CA1b) vermelho sem o fix (`96:00`)
  e verde com ele (`84:00`).
- `./mvnw clean verify`: 12.048 unitários (757 pulados: 756 da matriz + 1 pré-existente) e 366 de
  integração, verde.

## QA (2026-11-25)

`code-reviewer`, `security-reviewer` e `clean-code-reviewer`: nada Critical/High/Medium. Corrigido (`6b9e067`):
critério "todas as etapas com duração" num helper só (`comDuracaoDaSoma`), usado pelo encaixe e por
`adotarSomaDasEtapas`; comentário sem o id da change; `soOTotalMuda` afirma a duração (`40:00`); import do
`offset`.

Não corrigido: "total ≈ soma" na fatia da estrutura completa (já é a invariante card = editor de
distância); `somarDuracoesMin` ignora `repeticoes` (pré-existente, raro em contínuo); estouro de `int` com
duração absurda da LLM (Low, mesmo follow-up de teto de duração da change anterior).

Gate: `./mvnw clean verify` verde — 12.048 unitários (757 pulados) e 366 de integração. Uma execução
intermediária falhou em `GarminClientImplTest.criaWorkout` (404 do mock HTTP); isolado e na execução
seguinte passou — instabilidade, sem relação com a change.
