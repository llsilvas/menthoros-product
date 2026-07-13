# Design: fit-lap-derived-metrics

## D1 — Arquitetura dos calculators

Mesmo padrão do `DecouplingCalculatorService`: componente puro em `services/helper`, sem estado,
sem persistência, derivado na leitura. JavaDoc com Idempotent/Side Effects/Tenant-aware.

```
LapEfficiencySeriesCalculator.serie(List<EtapaRealizada>, BigDecimal pesoKg) -> LapEfficiencySeries

record LapEfficiencySeries(
    OrigemCalculo origem,           // POR_VOLTA nesta change; POR_AMOSTRA quando o metrics-analyzer supersedar
    int totalVoltas,                // voltas do treino, incluídas ou não
    List<VoltaOmitida> voltasOmitidas,  // ordem + motivo (SEM_FC, SEM_VELOCIDADE, DURACAO_ZERO)
    List<LapEfficiencyPoint> pontos
)

record VoltaOmitida(int ordem, MotivoOmissao motivo)

record LapEfficiencyPoint(
    int ordem,
    Double velocidadeKmh,     // reusa a resolução vel/pace do DecouplingCalculatorService (extrair helper comum)
    Integer fcMedia,
    Double efPace,            // velocidadeKmh / fcMedia
    Double efPotencia,        // potenciaMedia / fcMedia (null sem potência)
    Double wPorKg,            // potenciaMedia / pesoKg (null sem peso ou sem potência)
    Duration paceGap          // pace ajustado por gradiente (null sem elevação ou fora de sanidade)
)
```

Elegibilidade por ponto (não por treino): volta entra na série se tiver duração > 0, FC > 0 e
velocidade resolvível — série parcial é aceitável (o gráfico mostra buracos); diferente do
decoupling escalar, que mantém seus gates globais.

**Reconciliação série × escalar (achado Codex #5):** série parcial com escalar null (ou
vice-versa) parece inconsistência para o coach se a API não explicar o porquê. Por isso a série
carrega `totalVoltas` + `voltasOmitidas` com motivo, e o decoupling escalar expõe `motivoNull`
(D4) — a UI consegue reconciliar "gráfico com buracos" com "escalar não calculado" sem adivinhar.

## D2 — GAP interno (fórmula v1)

Gradiente médio da volta: `g = (elevacaoGanhoMetros − elevacaoPerdaMetros) / (distanciaKm × 1000)`
(adimensional; nomes reais dos campos em `EtapaRealizada:85-89`).

Fator de custo (aproximação linear de Minetti na faixa habitual de corrida, |g| ≤ 0,10):

```
custoRelativo(g) = 1 + 9.0 * g       // subida encarece ~9% por 1% de gradiente
                                     // descida: usar 1 + 4.5 * g (benefício menor que o custo simétrico)
paceGap = paceBruto / custoRelativo(g)
```

- **Sanidade:** |g| > 0,10 (10%) ou subida+descida > 30% da distância → `paceGap = null` (dado de
  barômetro suspeito ou trail fora do modelo).
- **Calibração por MATRIZ de fixtures (endurecida pelo adversarial review Codex — achado high #2):**
  um único treino de 16 voltas não valida um modelo visível ao coach (overfit de dispositivo, rota,
  clima e implementação do Garmin). A calibração exige uma matriz representativa, cada fixture
  versionada em `src/test/resources/fit/` com os valores de GAP do Garmin Connect, e o resultado
  registrado **por fixture** (não só agregado):
  - plano, ondulado, net-up e net-down;
  - sem elevação (esteira / dispositivo sem barômetro) → GAP null esperado;
  - lap com distância ~0 e laps irregulares/autopause → GAP null esperado (gates de sanidade);
  - idealmente ≥ 2 dispositivos/fontes.
  Meta dupla por fixture elegível: erro médio ≤ 3 s/km **e** desvio máximo por volta ≤ 5 s/km na
  faixa |g| ≤ 3%. Os coeficientes (9.0/4.5) são constantes nomeadas ajustáveis sem mudar contrato.
- **HARD GATE (achado high #1):** enquanto a matriz não passar, o GAP **não é exposto na API e —
  crucialmente — não altera a elegibilidade do decoupling escalar** (o gate de CV GAP-ajustado do
  D3 fica desligado). Adiar o GAP significa adiar as duas coisas juntas; nunca entregar um
  `decouplingPercentual` que só existe por causa de uma transformação não validada. A change
  continua entregável sem GAP (série de EF + Pw:HR + metadados).
- **Estado atual da matriz:** só existe 1 fixture real (16 laps, ondulado leve). Expectativa
  explícita: o GAP nasce implementado mas **desligado** (constante/flag interna), e só liga quando
  a matriz estiver coletada e verde — coletar os .fit adicionais é task da change, não pré-requisito
  para mergear o resto.
- **Não-objetivo v1:** trail/montanha (|g| > 10%); modelar custo não-linear completo de Minetti.

## D3 — Pw:HR no DecouplingCalculatorService

Reescrito após o adversarial review (achado medium #3): velocidade e potência **não compartilham
o mesmo pipeline de elegibilidade** — potência tem ruído, dropouts e suporte de dispositivo
próprios, e o CV de velocidade é hoje a defesa primária do Pa:HR contra falso-positivo; acoplar
os dois silenciosamente contaminaria essa defesa.

- **O que é compartilhado (mecânica pura):** a partição temporal em metades (mesmo corte de tempo
  para as duas métricas) e a ponderação por duração. O "extrator de intensidade" é detalhe INTERNO
  dessa mecânica — só existe depois que os characterization tests provarem Pa:HR byte a byte.
- **O que é independente (elegibilidade):**
  - Pa:HR: gates atuais intactos (CV_FC/CV_VEL, duração, tipo, metades válidas).
  - Pw:HR: cobertura de potência ≥ 80% da duração elegível **por metade** (não global — cobertura
    global de 80% concentrada na 1ª metade compararia janelas diferentes); volta sem potência é
    excluída do Pw:HR mas continua no Pa:HR; `CV_POT_MAX = 0.15` como constante própria e
    calibrável, não um alias de `CV_VEL_MAX`.
  - Um lado pode ser null com o outro calculado — os `motivoNull` (D4) explicam cada um.
- **Gate de CV com GAP (extensão CONDICIONADA — ver hard gate no D2):** quando o GAP estiver
  calibrado e ligado, e todas as voltas elegíveis tiverem `paceGap`, o CV de velocidade do Pa:HR
  pode usar a velocidade GAP-ajustada — é isso que destrava percurso ondulado. Nasce desligado;
  teste dedicado prova que treino plano não muda de resultado (CA4) e que o gate desligado
  reproduz o comportamento atual byte a byte.

## D4 — Exposição na API (com proveniência — achado Codex #4)

Todo valor derivado exposto carrega origem de cálculo e motivo de null — não só a série. Sem
isso, a supersessão futura (lap-based → sample-based) mudaria números confiáveis silenciosamente.

- **Envelope de decoupling** (campo novo `decoupling` no detalhe do treino):
  ```
  record DecouplingResultadoDto(
      Double percentual,           // Pa:HR — mesmo valor do campo legado decouplingPercentual
      MotivoNullDecoupling motivoNull,          // null quando calculado; senão CV_ALTO, DURACAO_INSUFICIENTE, TIPO_NAO_CONTINUO, ...
      Double potenciaPercentual,   // Pw:HR
      MotivoNullDecoupling motivoNullPotencia,  // ex.: COBERTURA_POTENCIA_INSUFICIENTE
      OrigemCalculo origem         // POR_VOLTA nesta change
  )
  ```
- **Compatibilidade (CA4):** `decouplingPercentual` legado permanece no DTO com o mesmo valor de
  `decoupling.percentual` — clientes atuais não quebram; o envelope é o caminho novo.
- **GAP por volta** (`paceGap` no `LapEfficiencyPoint`) só aparece com o hard gate do D2 liberado.
- Série de EF (com `origem`, `totalVoltas`, `voltasOmitidas`) e envelope **somente** no endpoint
  de detalhe do treino — path real: `GET /api/v1/treinos/realizados/{id}`
  (`TreinoRealizadoController:172`) — listagens/paginados não carregam nada disso. Mapper via
  MapStruct com `qualifiedByName`, como o decoupling atual (`TreinoMapper:171`).

## D5 — Composição futura com add-workout-metrics-analyzer

Calculators recebem coleções/valores primitivos (nunca JPA em skills — se algum cálculo migrar
para skill, aplicar o padrão de records de input). Quando o metrics-analyzer chegar com amostras
densas, a resolução por segundo substitui a por volta atrás da mesma interface de resultado; o
lap-based permanece como fallback documentado.

## Pre-mortem (resumo)

> Adversarial review cross-model (Codex, 2026-07-13, veredito needs-attention) incorporado:
> hard gate do GAP sobre a elegibilidade do escalar (D2), matriz de calibração por fixture (D2),
> pipelines de elegibilidade separados Pa:HR × Pw:HR com cobertura por metade (D3), proveniência
> e motivo de null em todos os escalares (D4), metadados de reconciliação série × escalar (D1).

- *"GAP diverge do Garmin e mina a confiança do coach"* → calibração empírica na task 3.1 com o CSV
  de referência antes de expor; se erro > meta, expor série sem GAP e adiar o campo.
- *"Refactor do decoupling quebra o Pa:HR existente"* → CA4 fixa golden tests com os valores atuais
  antes do refactor (characterization tests).
- *"Série incha o payload"* → só no detalhe (D4).
- *"Potência parcial distorce o Pw:HR"* → threshold de cobertura ponderado por duração (D3).
