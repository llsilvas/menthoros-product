**Tamanho:** S · **Trilha:** Full (incerteza de design — regra de precedência entre fontes de
limiar e fórmula fisiológica de conversão prova→limiar precisam ser resolvidas antes da
implementação, não durante)

## Why

`ThresholdInferenceService` já infere `fcLimiar`/`paceLimiar` de forma passiva — mediana do
quintil mais rápido entre corridas contínuas/tempo/longas dos últimos 30 dias
(`inferirFcLimiar`/`inferirPaceLimiar`). É um proxy sem fricção para o atleta, mas ruidoso: mistura
"correu rápido num dia bom" com "de fato treina no limiar", e nunca reflete um esforço deliberado
e máximo.

`Prova` já guarda resultado de corrida real (`foiRealizada`, `tempoRealizado`, `distanciaKm`)
quando o coach registra o resultado pelo CRUD existente — a matéria-prima já existe, só falta o
caminho que a transforma em limiar. `RiegelCalculator` (`skills/race/`) já resolve o mesmo
problema matemático (normalizar um tempo de prova entre distâncias) para **projetar** tempos
futuros (`RaceProjectionServiceImpl`), mas está acoplado ao pipeline de projeção (exige
`RegressionResult`) — não é diretamente reaproveitável aqui (ver design.md D2); esta change usa a
mesma fórmula de Riegel de forma isolada.

`paceLimiar` alimenta zonas de treino (`fc-limiar-zones`), TSS/TSB e o prompt de geração de plano
— um valor mais preciso melhora a cadeia inteira sem tocar em nenhuma dessas camadas
consumidoras. `fcLimiar` fica fora do escopo (design.md D1).

## What Changes

- **Novo método em `ThresholdInferenceService`** (ex.: `inferirPaceLimiarDeProva(Prova
  provaValida)`) que, dado o resultado de prova mais recente e válido do atleta (ver critérios de
  validade abaixo), deriva **somente `paceLimiar`** (NÃO `fcLimiar` — ver D1 do design.md, `Prova`
  não tem FC própria e não há vínculo com `TreinoRealizado` para correlacionar) com uma fórmula
  isolada de Riegel + offset de literatura (D2 do design.md — não reusa `RiegelCalculator`
  diretamente, que exige um `RegressionResult` do pipeline de projeção e não é uma função pura
  reaproveitável aqui).
- **Critérios de validade de uma prova** para entrar na inferência: `foiRealizada = true`,
  `tempoRealizado` preenchido, distância entre 5K e **21.1K** (cobre a distância oficial de meia-
  maratona, 21,097km, com tolerância — fora dessa faixa a fórmula fisiológica prova→limiar perde
  precisão: sprints são anaeróbicos, maratona é sub-limiar), e dentro da mesma janela de
  atualidade já usada pela inferência passiva (`DIAS_LIMIAR_DESATUALIZACAO` = 90 dias).
- **Regra de precedência** entre as duas fontes: quando existir uma prova válida dentro da janela
  de atualidade, ela tem prioridade sobre a inferência passiva por quintil (esforço deliberado e
  máximo é mais confiável que corridas de treino incidentais) — só para `paceLimiar`. `fcLimiar`
  continua sempre pelo quintil. Sem prova válida, mantém o comportamento atual (fallback por
  quintil) para os dois.
- **Novo método de repositório** em `ProvaRepository` para buscar a prova realizada mais recente
  de um atleta dentro da janela (`foiRealizada = true`, `distanciaKm` na faixa, ordenado por
  `dataProva` desc) — via `@Query` explícito com `p.assessoria.id = :tenantId` (não existe
  propriedade `tenantId` direta em `Prova`, o campo é `assessoria`; mesmo padrão já usado em
  `findByIdAndTenantId`/`findUpcomingByAtletaIdAndTenantId` neste repositório).
- **`TsbServiceImpl.atualizarLimiareInferidos`** passa a consultar primeiro a prova válida mais
  recente para `paceLimiarEstimado`; só cai para `inferirPaceLimiar` (quintil) quando não houver
  uma. `fcLimiarEstimado` sempre vem de `inferirFcLimiar` (quintil), inalterado. Continua
  escrevendo nos mesmos campos-sombra existentes (`PlanoMetaDados`) — sem endpoint novo.
- **Visibilidade da fonte para o coach** (D4 do design.md): `AtletaPerfilCoachOutputDto` ganha um
  campo novo `fonteLimiarEstimado` (`PROVA_REGISTRADA` | `MEDIA_TREINOS`), já que uma mudança
  silenciosa de fonte afeta zonas/TSS/TSB/prompt sem o coach saber por quê (achado do
  product-reviewer). Exibição na UI (badge/label) é follow-up de frontend, fora desta change.

## Capabilities

### New Capabilities

- `threshold-inference-from-race`: deriva `paceLimiar` estimado a partir do resultado de uma
  prova real recente e válida, com precedência sobre a inferência passiva por quintil. `fcLimiar`
  não é afetado (D1 do design.md).

### Modified Capabilities

<!-- Nenhuma capability existente tem requisitos alterados — a inferência por quintil continua
existindo como fallback, comportamento inalterado quando não há prova válida. -->

## Impact

**Entidades e banco:** nenhuma alteração de schema. Opera sobre `Prova`/`PlanoMetaDados`
existentes.

**APIs:** nenhum endpoint novo. `AtletaPerfilCoachOutputDto` (já retornado pelo perfil do atleta
visto pelo coach) ganha um campo aditivo `fonteLimiarEstimado` (D4 do design.md) — compatível
com clientes existentes (campo novo, não remove/renomeia nada).

**Repositórios:** `ProvaRepository` ganha uma query nova (busca de prova válida mais recente).

**Comportamento:** atletas com uma prova de 5K-21.1K registrada nos últimos 90 dias passam a ter
`paceLimiarEstimado` (não `fcLimiar`) estimado a partir dela em vez do quintil — valor pode mudar
perceptivelmente no primeiro recálculo pós-deploy (mitigação: log comparativo com sinalização de
outlier, D5 do design.md).

**Dependências:** nenhuma — `RiegelCalculator`/`Prova` já existem e não estão em outra change
ativa que altere sua interface.

## Critérios de aceite

1. **Given** um atleta com uma prova de 10K registrada (`foiRealizada=true`, `tempoRealizado`
   preenchido) há 30 dias, **when** `atualizarLimiareInferidos` roda no próximo sync de treino,
   **then** `PlanoMetaDados.paceLimiarEstimado` reflete o pace derivado da prova, não o quintil.
2. **Given** um atleta sem nenhuma prova válida (nenhuma realizada, ou só fora da faixa
   5K-21.1K, ou fora da janela de 90 dias), **when** a inferência roda, **then** o comportamento é
   idêntico ao atual (fallback por quintil, sem regressão) para `paceLimiar` e `fcLimiar`.
3. **Given** um atleta com uma prova válida de 30 dias atrás E outra de 100 dias atrás,
   **when** a inferência roda, **then** só a prova de 30 dias (dentro da janela) é considerada.
4. **Given** uma prova de 3K (fora da faixa 5K-21.1K) registrada, **when** a inferência roda,
   **then** ela é ignorada e o quintil (ou o vazio) prevalece.
5. **Given** uma prova de meia-maratona oficial (21,097km ou 21,1km cadastrados), **when** a
   inferência roda, **then** ela é considerada válida (não excluída pelo corte de distância —
   achado do pre-mortem que quebrava esse caso).
6. **Given** um atleta cujo `paceLimiarEstimado` passou a vir de uma prova, **when** o coach abre
   o perfil do atleta, **then** `fonteLimiarEstimado` retorna `PROVA_REGISTRADA` (não
   `MEDIA_TREINOS`).

## Métrica de sucesso

**Sinalização de outlier no recálculo, não um sanity check tautológico** (revisado após achado do
pre-mortem — a métrica original comparava o resultado contra a própria fórmula que o gerou):
monitorar `Δ = paceLimiarEstimado_novo - paceLimiarEstimado_antigo` no primeiro recálculo
pós-deploy por atleta; `|Δ| > 20s/km` gera log de atenção para revisão manual do founder/coach
(D5 do design.md). Este é um refinamento de motor de cálculo, não uma feature nova voltada ao
coach — não há métrica de produto contínua associada.

## Open Questions & Assumptions

- **Resolvido (design.md D2):** fórmula prova→limiar não reusa `RiegelCalculator` diretamente
  (exige `RegressionResult` do pipeline de projeção, não é função pura reaproveitável aqui) — usa
  Riegel isolado com expoente fixo `1.06` (mesmo valor de `RiegelCalculator.DEFAULT_EXPONENT`,
  duplicado deliberadamente) + offset de literatura `+8s/km`, sem calibração por atleta no v1.
- **Resolvido (design.md D1):** `fcLimiar` fica fora do escopo desta change — `Prova` não tem FC
  própria e não há vínculo com `TreinoRealizado` para correlacionar com segurança. Candidato a
  change futura se o founder quiser esse vínculo.
- **Resolvido (design.md D4, achado do product-reviewer):** a mudança de fonte do limiar precisa
  ser visível ao coach — `fonteLimiarEstimado` novo em `AtletaPerfilCoachOutputDto`. Exibição na
  UI é follow-up de frontend.
- **Assumido:** o coach já registra `tempoRealizado` de provas passadas pelo fluxo existente
  (`ProvaInputDto`/CRUD) — nenhuma mudança de UX é necessária para popular o dado-fonte.
- **Aberto:** o offset `+8s/km` não foi calibrado com dado real do Menthoros (nenhum atleta com
  prova E teste de limiar formal disponível hoje para validar). Mitigado por D5 (sinalização de
  outlier), não bloqueia o merge — ação de acompanhamento pós-deploy.
