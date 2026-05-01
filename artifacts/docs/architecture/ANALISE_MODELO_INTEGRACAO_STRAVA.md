# Análise do Modelo de Domínio para Integração Strava e Geração de Treinos

**Data:** 2026-03-29
**Autor:** Análise sobre o estado atual das entidades Java
**Status:** Documento de referência para implementação

> **Contexto:** Este documento analisa as entidades JPA existentes no backend (`src/main/java/com/menthoros/entity/`) para mapear o que já está pronto para a integração com o Strava e o que precisa ser adicionado para alimentar a geração de treinos com IA. Leia junto com:
> - [STRAVA_INTEGRATION_GUIDE.md](./STRAVA_INTEGRATION_GUIDE.md) — guia técnico de implementação OAuth2
> - [STRAVA_IMPLEMENTATION_ROADMAP.md](./STRAVA_IMPLEMENTATION_ROADMAP.md) — checklist de sprints
> - [integracao-garmin-strava.md](./integracao-garmin-strava.md) — arquitetura de importação de laps

---

## Índice

1. [O que já existe para a integração Strava](#1-o-que-já-existe-para-a-integração-strava)
2. [O que falta — gaps críticos no modelo](#2-o-que-falta--gaps-críticos-no-modelo)
3. [O que já existe para geração de treinos com IA](#3-o-que-já-existe-para-geração-de-treinos-com-ia)
4. [O que o Strava traz que enriquece a geração de treinos](#4-o-que-o-strava-traz-que-enriquece-a-geração-de-treinos)
5. [Mapeamento completo: API Strava vs Entidades](#5-mapeamento-completo-api-strava-vs-entidades)
6. [Decisão de arquitetura: tokens na entidade vs tabela separada](#6-decisão-de-arquitetura-tokens-na-entidade-vs-tabela-separada)
7. [Prioridades de implementação](#7-prioridades-de-implementação)
8. [Migrations necessárias](#8-migrations-necessárias)

---

## 1. O que já existe para a integração Strava

### 1.1 Feature flag por assessoria

```java
// Assessoria.java
@Column(name = "feature_integracao_strava", columnDefinition = "boolean default true")
private Boolean featureIntegracaoStrava = true; // habilitada por padrão
```

A integração é controlável por assessoria (multi-tenancy). Antes de qualquer chamada ao Strava, verificar `assessoria.getFeatureIntegracaoStrava()`.

---

### 1.2 Identificação de origem dos dados

O campo `fonteDados` e o campo `criadoPor` já estão em `TreinoBase` (superclasse de `TreinoPlanejado` e `TreinoRealizado`):

```java
// TreinoBase.java (MappedSuperclass)
@Column(name = "criado_por")
private String criadoPor; // "IA", "USUARIO", "GARMIN", "STRAVA"
```

```java
// FonteDados.java (enum)
STRAVA("Strava", "#FC4C02"),   // cor oficial do Strava
GARMIN("Garmin", "#007ACC"),
IA_GERADO("IA Gerado", "#9C27B0"),
MANUAL("Manual", "#9E9E9E");
```

Ambos os campos estão prontos. A distinção entre `STRAVA` e `GARMIN` já existe no modelo.

---

### 1.3 Infraestrutura de sincronização completa em `TreinoPlanejado`

`TreinoPlanejado` tem toda a infra para push ao Strava (exportar treino planejado):

| Campo | Tipo | Função |
|---|---|---|
| `externalId` | String(255) | ID da atividade no Strava após exportar |
| `urlExterno` | String(500) | Link direto para abrir no Strava |
| `statusSincronizacao` | `StatusSincronizacao` | Estado atual (14 estados possíveis) |
| `sincronizadoEm` | LocalDateTime | Timestamp de sucesso |
| `ultimaTentativaSincronizacao` | LocalDateTime | Para controle de retry |
| `tentativasSincronizacao` | Integer (default: 0) | Contador de tentativas |
| `exportadoPara` | String (JSON array) | Ex: `["STRAVA", "GARMIN"]` |
| `erroSincronizacao` | TEXT | Detalhe do último erro |
| `metadadosSincronizacao` | String (JSON) | Dados extras da plataforma |

Métodos já implementados em `TreinoPlanejado`:
- `precisaSincronizar()` — decide se deve ser enviado ao Strava
- `podeRetentarSincronizacao()` — respeita intervalo de 5 min entre retries
- `atingiuLimiteTentativas()` — máx. 5 tentativas
- `registrarTentativaSincronizacao()` — incrementa contador
- `marcarComoSincronizado(plataforma)` — adiciona plataforma ao JSON `exportadoPara`
- `marcarErroSincronizacao(status, mensagem)` — registra falha
- `resetarSincronizacao()` — permite retry manual

---

### 1.4 Enum `StatusSincronizacao` com 14 estados

Cobre todos os cenários de falha e sucesso:

```java
NAO_SINCRONIZADO    // estado inicial
PENDENTE            // aguardando ser processado
SINCRONIZANDO       // em progresso
AGUARDANDO_RETRY    // falhou, aguarda retry
SINCRONIZADO        // sucesso em todas as plataformas
SINCRONIZADO_PARCIAL // sucesso em algumas plataformas
ERRO_TEMPORARIO     // erro transitório, vai retry automático
ERRO_AUTENTICACAO   // token expirado/inválido → precisa reautenticar
ERRO_VALIDACAO      // dados inválidos para a plataforma
ERRO_LIMITE_RATE    // rate limit atingido → throttle
ERRO_PERMANENTE     // não vai fazer retry
DESABILITADO        // usuário desabilitou sync
CONFLITO            // conflito de dados entre local e externo
CANCELADO           // cancelado por usuário/sistema
```

Métodos úteis no enum:
- `podeTentarNovamente()` — só retorna true para erros temporários/retry
- `precisaIntervencaoUsuario()` — true para `ERRO_AUTENTICACAO`
- `estaSincronizado()` — true para `SINCRONIZADO` e `SINCRONIZADO_PARCIAL`
- `temErro()` — true para qualquer status de erro
- `emProcesso()` — true para `PENDENTE` e `SINCRONIZANDO`

---

### 1.5 Campo `externalId` em `TreinoRealizado`

```java
// TreinoRealizado.java
@Column(name = "external_id")
private String externalId; // referência ao ID da atividade no Strava
```

Permite deduplicação: antes de salvar um treino importado do Strava, buscar por `externalId` para evitar duplicatas.

---

### 1.6 Estrutura `EtapaRealizada` pronta para receber splits e laps

```java
@Entity
public class EtapaRealizada {
    private Integer ordem;
    private String tipoEtapa;       // AQUECIMENTO, PRINCIPAL, INTERVALADO, RECUPERACAO, DESAQUECIMENTO
    private String descricao;
    private Duration duracao;
    private BigDecimal distanciaKm;
    private Integer fcMedia;
    private Integer fcMax;
    private Duration paceMedia;
    private BigDecimal velocidadeMedia;
    private Integer percepcaoEsforco;
    private Integer cadenciaMedia;
    private Integer potenciaMedia;
    private String observacao;
    private EtapaTreino etapaPlanejada; // link opcional com o que estava planejado
}
```

A estrutura cobre os campos retornados por `GET /activities/{id}/laps` do Strava. Veja o mapeamento detalhado na [seção 5](#5-mapeamento-completo-api-strava-vs-entidades).

---

## 2. O que falta — gaps críticos no modelo

### 2.1 CRÍTICO: Ausência de OAuth em `Atleta`

Para qualquer integração Strava, o atleta precisa ter tokens OAuth armazenados. Hoje `Atleta` não tem nenhum campo relacionado ao Strava.

**Decisão arquitetural:** Há duas abordagens (ver [seção 6](#6-decisão-de-arquitetura-tokens-na-entidade-vs-tabela-separada) para comparação). A opção recomendada é uma **tabela separada `IntegracaoExterna`** (já descrita em [integracao-garmin-strava.md](./integracao-garmin-strava.md)).

Se optar por campos diretos em `Atleta` (abordagem mais simples, apenas Strava):

```java
// Campos a adicionar em Atleta.java
@Column(name = "strava_athlete_id")
private Long stravaAthleteId;               // ID do atleta no Strava

@Column(name = "strava_access_token", length = 512)
private String stravaAccessToken;           // token de acesso (curta duração ~6h)

@Column(name = "strava_refresh_token", length = 512)
private String stravaRefreshToken;          // token de refresh (longa duração)

@Column(name = "strava_token_expires_at")
private LocalDateTime stravaTokenExpiresAt; // quando o access token expira

@Column(name = "strava_connected_at")
private LocalDateTime stravaConnectedAt;    // quando conectou a conta

@Column(name = "strava_disconnected_at")
private LocalDateTime stravaDisconnectedAt; // quando desconectou (nullable)

@Column(name = "strava_webhook_sub_id")
private Long stravaWebhookSubscriptionId;   // ID da assinatura de webhook

@Column(name = "strava_auto_sync", columnDefinition = "boolean default true")
private Boolean stravaAutoSync = true;      // preferência de sync automático
```

Método helper a adicionar:
```java
public boolean isStravaTokenExpirado() {
    return stravaTokenExpiresAt != null &&
           stravaTokenExpiresAt.isBefore(LocalDateTime.now().plusMinutes(5));
}

public boolean isStravaConectado() {
    return stravaAthleteId != null && stravaAccessToken != null
           && stravaDisconnectedAt == null;
}
```

---

### 2.2 CRÍTICO: Campos de sync ausentes em `TreinoRealizado`

`TreinoPlanejado` tem toda a infraestrutura de sincronização, mas `TreinoRealizado` não tem os campos equivalentes para rastrear a **importação** do Strava:

```java
// Campos a adicionar em TreinoRealizado.java

@Enumerated(EnumType.STRING)
@Column(name = "status_sincronizacao", length = 50)
@Builder.Default
private StatusSincronizacao statusSincronizacao = StatusSincronizacao.NAO_SINCRONIZADO;

@Column(name = "sincronizado_em")
private LocalDateTime sincronizadoEm;           // quando foi importado com sucesso

@Column(name = "url_externo", length = 500)
private String urlExterno;                       // link para a atividade no Strava

@Column(name = "metadados_sincronizacao", columnDefinition = "TEXT")
private String metadadosSincronizacao;           // JSON com dados extras do webhook
```

---

### 2.3 Campos do Strava sem mapeamento em `TreinoRealizado`

Campos retornados pela API do Strava que precisam de campo correspondente:

```java
// Campos a adicionar em TreinoRealizado.java

@Column(name = "elapsed_time_seg")
private Integer elapsedTimeSeg;    // elapsed_time do Strava (inclui pausas)
                                   // movingTime já existe como duracaoMin
                                   // a diferença indica tempo parado no treino

@Column(name = "suffer_score")
private Integer sufferScore;       // suffer_score do Strava
                                   // TRIMP proprietário do Strava
                                   // útil para cross-check do TSS calculado
                                   // escala ~0-300 (similar ao TSS)

@Column(name = "device_name", length = 100)
private String deviceName;         // device_name: ex "Garmin Forerunner 265"
                                   // importante para saber se dados vêm de GPS watch
                                   // (mais confiáveis que smartphone)

@Column(name = "gear_name", length = 100)
private String gearName;           // gear.name: qual tênis foi usado
                                   // útil para alertas de desgaste de equipamento
```

---

### 2.4 Campos ausentes em `EtapaRealizada` (para splits do Strava)

O endpoint `GET /activities/{id}/laps` retorna campos que não têm mapeamento em `EtapaRealizada`:

```java
// Campos a adicionar em EtapaRealizada.java

@Column(name = "split_index")
private Integer splitIndex;         // lapIndex do Strava (1, 2, 3...)
                                    // identifica a qual km/volta corresponde

@Column(name = "elevacao_ganho_metros")
private Integer elevacaoGanhoMetros; // elevation_difference positivo por etapa

@Column(name = "elevacao_perda_metros")
private Integer elevacaoPerdaMetros; // elevation_difference negativo por etapa
```

---

### 2.5 Campos opcionais que enriquecem o contexto de geração

Dados ambientais e de localização ausentes em `TreinoRealizado`:

```java
// Campos opcionais — prioridade baixa

@Column(name = "temperatura_ambiente_c")
private Integer temperaturaAmbienteC;  // temperatura em graus Celsius
                                       // calor >28°C aumenta FC, afeta recuperação

@Column(name = "umidade_percentual")
private Integer umidadePercentual;     // umidade relativa %
                                       // combinada com calor, stressante fisiologicamente

@Column(name = "localizacao_treino", length = 200)
private String localizacaoTreino;      // cidade/região
                                       // altitude alta altera adaptações fisiológicas

@Column(name = "horario_inicio")
private LocalTime horarioInicio;       // hora de início do treino
                                       // manhã vs tarde vs noite afeta performance
                                       // importante para ritmo circadiano
```

---

## 3. O que já existe para geração de treinos com IA

### 3.1 Dados do atleta para o prompt de geração

Todos os seguintes campos já existem em `Atleta`:

| Campo | Tipo | Uso na Geração |
|---|---|---|
| `nivelExperiencia` | `NivelExperiencia` (enum) | Calibrar dificuldade e volume semanal |
| `fcMaxima` | Integer | Calcular zonas de FC (Z1–Z5) |
| `fcRepouso` | Integer | Fórmula de Karvonen para zonas personalizadas |
| `fcLimiar` | Integer | Zona de limiar anaeróbico |
| `dataUltimoTesteFc` | LocalDate | Saber se os dados de FC estão desatualizados |
| `paceLimiar` | BigDecimal (min/km) | Definir zonas de pace |
| `velocidadeLimiar` | BigDecimal (km/h) | Alternativa ao pace limiar |
| `dataUltimoTestePace` | LocalDate | Verificar validade do dado |
| `vo2maxEstimado` | BigDecimal | Personalizar intensidade de treinos aeróbicos |
| `diasDisponiveis` | `List<DiaSemana>` | Distribuição dos treinos na semana |
| `diaPreferidoLongo` | `DiaSemana` | Alocação do treino longo |
| `distanciaMaximaLongo` | Integer (km) | Teto do treino longo |
| `volumeSemanalMax` | Integer (km/semana) | Teto de volume semanal |
| `temLesao` | Boolean | Restrição médica ativa |
| `descricaoLesao` | String | Detalhe da lesão atual |
| `historicoLesoes` | TEXT | Histórico completo de lesões |
| `objetivo` | String | Personalização da narrativa do plano |
| `ctlTimeConstant` | Integer | Constante adaptativa CTL (padrão: 42 dias) |
| `atlTimeConstant` | Integer | Constante adaptativa ATL (padrão: 7 dias) |

---

### 3.2 Métricas de carga já calculadas em `PlanoMetaDados`

`PlanoMetaDados` é o snapshot de estado do atleta, atualizado a cada treino:

| Campo | Uso na Geração |
|---|---|
| `ctlAtual` | Fitness atual — base para calcular carga progressiva |
| `atlAtual` | Fadiga atual — detectar necessidade de descanso |
| `tsbAtual` | Forma atual — decidir intensidade da semana |
| `rampRateAtual` | Taxa de crescimento — evitar sobrecarga aguda |
| `volumeSemanalMedio` | Volume histórico médio — referência de progressão |
| `tssSemanalMedio` | TSS médio semanal — referência de carga habitual |
| `treinosPorSemanaMedio` | Frequência habitual — não mudar bruscamente |
| `diasConsecutivosTreino` | Controlar frequência sem descanso |
| `diasDesdeUltimoDescanso` | Detectar necessidade de recuperação |
| `semanasProgressaoContinua` | Acionar semana de recuperação (a cada 3–4 semanas) |
| `fasePeriodizacao` | Tipo de semana: BASE, BUILD, ESPECIFICO, TAPER, etc. |
| `alertaSobrecarga` | Flag: TSB < -30 |
| `alertaRampAlto` | Flag: ramp rate > 8 TSS/semana |
| `alertaDiasConsecutivos` | Flag: > 5 dias sem descanso |
| `alertaNecessitaDescanso` | Flag: combinação de indicadores |
| `statusGeral` | Resumo textual do estado |
| `recomendacaoTreino` | Recomendação gerada na última análise |

Métodos úteis em `PlanoMetaDados`:
- `estaEmFormaIdeal()` — TSB entre 5 e 15
- `estaMuitoFatigado()` — TSB < -30
- `getInterpretacaoTsb()` — retorna `FaixaTsb` enum
- `avaliarStatusGeral()` — atualiza `statusGeral` e `recomendacaoTreino`

---

### 3.3 Enum `FasePeriodizacao` com lógica de distribuição

```java
// FasePeriodizacao.java
public enum FasePeriodizacao {
    BASE("80% fácil / 20% moderado", "Z2 focus"),
    BUILD("70% fácil / 20% específico / 10% intenso", "Z3-Z4"),
    ESPECIFICO("60% fácil / 30% específico / 10% regenerativo", "Pace alvo"),
    TAPER("Redução 40-60% volume, manter intensidade", "Recovery"),
    SEMANA_PROVA("Apenas treinos leves curtos", "TSB +5 a +10"),
    POS_PROVA("Regenerativo 1-2 semanas", "Z1"),
    DESENVOLVIMENTO_GERAL("Manter consistência", "Z2");

    // Métodos disponíveis:
    // determinarPorSemanasFaltando(int semanas) → fase adequada
    // determinarPorDiasFaltando(int dias) → fase adequada
    // getDistribuicaoTreinos() → distribuição em formato String
    // isFaseAltoVolume() → true para BASE e BUILD
    // isFaseRecuperacao() → true para TAPER, SEMANA_PROVA, POS_PROVA
    // isFaseEspecifica() → true para ESPECIFICO e SEMANA_PROVA
}
```

---

### 3.4 Enum `FaixaTsb` com limiares e recomendações

```java
// FaixaTsb.java
FADIGA_EXCESSIVA  // TSB < -35   → Descanso obrigatório
FADIGA_ALTA       // -35 a -30  → Reduzir volume 30-40%
FADIGA_MODERADA   // -30 a -20  → Reduzir intensidade
ACUMULANDO_FADIGA // -20 a -10  → Evitar sessões intensas consecutivas
FATIGADO          // -10 a 0    → Respeitar recuperação
RECUPERANDO       // 0 a 5      → Bom para construção de base
FORMA_IDEAL       // 5 a 15     → Condições ideais para treinos intensos e provas
DESCANSADO        // 15 a 25    → Incluir sessão de qualidade
MUITO_DESCANSADO  // > 25       → Risco de perda de adaptações
```

---

### 3.5 Série temporal em `MetricasDiarias`

```java
// MetricasDiarias.java — um registro por dia
LocalDate data;
Integer tss;           // TSS do dia
Double ctl;            // fitness no dia
Double atl;            // fadiga no dia
Double tsb;            // forma no dia
Double rampRate;       // taxa de crescimento
Double fatigueRatio;   // CTL/ATL
Double formaPercentual; // TSB/CTL * 100
Integer treinosRealizados;
BigDecimal volumeKm;
Boolean foiDiaDescanso;
```

A série temporal de `MetricasDiarias` é a fonte para análise de tendências: quantas semanas de progressão, padrão de descanso, sazonalidade.

---

## 4. O que o Strava traz que enriquece a geração de treinos

### 4.1 Dados por split (km a km) — maior granularidade

O endpoint `GET /activities/{id}/laps` retorna dados por volta/km que hoje são perdidos no lançamento manual. Com esses dados:

- Identificar **fade de pace** (atleta começa rápido, termina devagar) — sinal de pacing incorreto
- Identificar **drift de FC** (FC sobe com o tempo a pace constante) — sinal de fadiga acumulada
- Gerar treinos futuros com **pace targets por split** mais precisos
- Detectar treinos de **negative split** bem executados — indicador de boa forma

### 4.2 Suffer Score como validação do TSS calculado

O `suffer_score` do Strava é seu próprio TRIMP, calculado por uma fórmula proprietária baseada em zonas de FC. Ao importar, podemos:

1. Comparar `sufferScore` do Strava com o `tssCalculado` do Menthoros
2. Se divergência > 20%, logar para revisão do modelo de cálculo
3. Usar como fallback quando FC não está disponível

### 4.3 Tipo de atividade mapeado para `TipoTreino`

```
Strava sportType    →  Menthoros TipoTreino
─────────────────────────────────────────────
"Run"               →  CONTINUO, LONGO ou FACIL (por duração/pace)
"TrailRun"          →  SUBIDA ou LONGO (por elevação)
"VirtualRun"        →  CONTINUO (esteira)
workoutType = 1     →  PROVA (race)
workoutType = 2     →  LONGO (long run)
workoutType = 3     →  INTERVALADO ou TEMPO_RUN (workout)
workoutType = 0     →  inferir por FC/pace médio
```

### 4.4 Histórico de inatividade detectado automaticamente

Ao importar atividades históricas do Strava com `after` e `before`, é possível identificar:

- Períodos sem atividade → possíveis lesões ou férias
- Quedas abruptas de volume → cross-check com `historicoLesoes` do atleta
- Retornos graduais → calibrar CTL inicial com mais precisão

### 4.5 Consistência e confiabilidade dos dados

- Dados de GPS watch (identificados por `device_name`) são mais confiáveis que smartphone
- `has_heartrate = true` garante que FC está disponível para cálculo de TSS por FC
- `manual = true` indica que foi criada manualmente (menos confiável para pace/distância)

---

## 5. Mapeamento completo: API Strava vs Entidades

### 5.1 Campos de `GET /activities/{id}` vs `TreinoRealizado`

| Campo Strava | Tipo Strava | Campo Menthoros | Status |
|---|---|---|---|
| `id` | Long | `externalId` | ✅ OK |
| `name` | String | `descricao` | ✅ OK |
| `sport_type` | String | `tipoTreino` (inferido) | ✅ Mapear |
| `start_date_local` | ISO8601 | `dataTreino` | ✅ OK |
| `distance` | Float (metros) | `distanciaKm` (÷1000) | ✅ OK + converter |
| `moving_time` | Integer (seg) | `duracaoMin` (Duration) | ✅ OK + converter |
| `elapsed_time` | Integer (seg) | `elapsedTimeSeg` | ❌ FALTA |
| `total_elevation_gain` | Float (metros) | `elevacaoGanhoMetros` | ✅ OK |
| `average_speed` | Float (m/s) | `velocidadeMedia` (×3.6) | ✅ OK + converter |
| `average_heartrate` | Float | `fcMedia` | ✅ OK |
| `max_heartrate` | Float | `fcMax` | ✅ OK |
| `average_cadence` | Float | `cadenciaMedia` (×2 se Strava) | ✅ OK + fator |
| `average_watts` | Float | `potenciaMedia` | ✅ OK |
| `suffer_score` | Integer | `sufferScore` | ❌ FALTA |
| `perceived_exertion` | Integer (1-10) | `percepcaoEsforco` | ✅ OK |
| `calories` | Float | — | Não necessário |
| `workout_type` | Integer | `tipoTreino` (ajuda na inferência) | ✅ Usar |
| `manual` | Boolean | `fonteDados` (MANUAL vs STRAVA) | ✅ OK |
| `has_heartrate` | Boolean | Lógica de `metodoCalculoTss` | ✅ Usar |
| `device_name` | String | `deviceName` | ❌ FALTA |
| `gear.name` | String | `gearName` | ❌ FALTA |
| `map.summary_polyline` | String | — | Não prioritário |
| `start_latlng` | Float[] | — | Não prioritário |
| `athlete.id` | Long | `stravaAthleteId` (em Atleta) | ❌ CRÍTICO |

### 5.2 Campos de `GET /activities/{id}/laps` vs `EtapaRealizada`

| Campo Strava (lap) | Tipo | Campo Menthoros | Status |
|---|---|---|---|
| `lap_index` | Integer | `splitIndex` | ❌ FALTA |
| `elapsed_time` | Integer (seg) | `duracao` (Duration) | ✅ OK + converter |
| `moving_time` | Integer (seg) | — (usar elapsed_time) | ✅ usar `duracao` |
| `distance` | Float (metros) | `distanciaKm` (÷1000) | ✅ OK |
| `average_speed` | Float (m/s) | `velocidadeMedia` (×3.6) | ✅ OK |
| `average_heartrate` | Float | `fcMedia` | ✅ OK |
| `max_heartrate` | Float | `fcMax` | ✅ OK |
| `average_cadence` | Float (half-step) | `cadenciaMedia` (×2) | ✅ OK + fator |
| `average_watts` | Float | `potenciaMedia` | ✅ OK |
| `elevation_difference` | Float | `elevacaoGanhoMetros` / `elevacaoPerdaMetros` | ❌ FALTA |

---

## 6. Decisão de arquitetura: tokens na entidade vs tabela separada

Há dois caminhos para armazenar os tokens OAuth:

### Opção A — Campos diretos em `Atleta` (mais simples, apenas Strava)

**Vantagens:**
- Menos complexidade — sem join extra
- Acesso direto ao token ao buscar atleta

**Desvantagens:**
- Não escala para Garmin, TrainingPeaks, Polar etc.
- Aumenta tamanho da tabela `tb_atleta`
- Tokens em tabela sem criptografia dedicada

### Opção B — Tabela `IntegracaoExterna` (recomendada, já documentada)

Conforme [integracao-garmin-strava.md](./integracao-garmin-strava.md), seção 3.3:

```java
@Entity
@Table(name = "tb_integracao_externa")
public class IntegracaoExterna {
    // atleta (FK)
    // plataforma: FonteDados (STRAVA, GARMIN, TRAINING_PEAKS...)
    // externalAthleteId
    // accessToken (TEXT, criptografado)
    // refreshToken (TEXT, criptografado)
    // tokenExpiraEm
    // scopes
    // ativo
    // ultimaSincronizacao
}
```

**Vantagens:**
- Suporta múltiplas plataformas por atleta
- Tabela dedicada facilita criptografia de tokens
- Isolamento de responsabilidade
- Mais fácil revogar/auditar acessos por plataforma

**Recomendação:** Usar **Opção B** para novas implementações. Mantém o modelo extensível.

---

## 7. Prioridades de implementação

### Prioridade 1 — Bloqueante (sem isso, nada funciona)

| Item | Arquivo | Ação |
|---|---|---|
| Tabela de tokens OAuth | Nova entidade `IntegracaoExterna.java` | Criar entidade + migration |
| Repository OAuth | `IntegracaoExternaRepository.java` | Criar |
| Campos de sync em `TreinoRealizado` | `TreinoRealizado.java` | Adicionar 4 campos |
| Migration para novos campos | `V17__Add_strava_integration_fields.sql` | Criar |

### Prioridade 2 — Enriquece dados para IA (importante)

| Item | Arquivo | Ação |
|---|---|---|
| `elapsedTimeSeg` | `TreinoRealizado.java` | Adicionar campo |
| `sufferScore` | `TreinoRealizado.java` | Adicionar campo |
| `splitIndex` | `EtapaRealizada.java` | Adicionar campo |
| `elevacaoGanhoMetros` + `elevacaoPerdaMetros` | `EtapaRealizada.java` | Adicionar campos |
| DTOs atualizados | `TreinoRealizadoInputDto.java` / `OutputDto.java` | Refletir novos campos |

### Prioridade 3 — Qualidade (desejável)

| Item | Arquivo | Ação |
|---|---|---|
| `deviceName` | `TreinoRealizado.java` | Adicionar campo |
| `gearName` | `TreinoRealizado.java` | Adicionar campo |
| Campos ambientais | `TreinoRealizado.java` | `temperaturaAmbienteC`, `umidadePercentual`, `localizacaoTreino`, `horarioInicio` |

---

## 8. Migrations necessárias

### V17: Campos de sincronização em `TreinoRealizado`

```sql
-- V17__Add_strava_fields_to_treino_realizado.sql

ALTER TABLE tb_treino_realizado
    ADD COLUMN IF NOT EXISTS status_sincronizacao   VARCHAR(50)  DEFAULT 'NAO_SINCRONIZADO',
    ADD COLUMN IF NOT EXISTS sincronizado_em         TIMESTAMP,
    ADD COLUMN IF NOT EXISTS url_externo             VARCHAR(500),
    ADD COLUMN IF NOT EXISTS metadados_sincronizacao TEXT,
    ADD COLUMN IF NOT EXISTS elapsed_time_seg        INTEGER,
    ADD COLUMN IF NOT EXISTS suffer_score            INTEGER,
    ADD COLUMN IF NOT EXISTS device_name             VARCHAR(100),
    ADD COLUMN IF NOT EXISTS gear_name               VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_treino_realizado_status_sync
    ON tb_treino_realizado(status_sincronizacao);
```

### V18: Campos em `EtapaRealizada`

```sql
-- V18__Add_strava_fields_to_etapa_realizada.sql

ALTER TABLE tb_etapa_realizada
    ADD COLUMN IF NOT EXISTS split_index            INTEGER,
    ADD COLUMN IF NOT EXISTS elevacao_ganho_metros  INTEGER,
    ADD COLUMN IF NOT EXISTS elevacao_perda_metros  INTEGER;
```

### V19: Tabela de integrações externas

```sql
-- V19__Create_integracao_externa_table.sql

CREATE TABLE IF NOT EXISTS tb_integracao_externa (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id            UUID         NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    plataforma           VARCHAR(50)  NOT NULL,  -- STRAVA, GARMIN, etc.
    external_athlete_id  VARCHAR(100),
    access_token         TEXT,                    -- armazenar criptografado
    refresh_token        TEXT,                    -- armazenar criptografado
    token_expira_em      TIMESTAMP,
    scopes               VARCHAR(255),
    ativo                BOOLEAN      DEFAULT TRUE,
    ultima_sincronizacao TIMESTAMP,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP,
    tenant_id            UUID         NOT NULL,

    CONSTRAINT uk_atleta_plataforma UNIQUE (atleta_id, plataforma)
);

CREATE INDEX idx_integracao_atleta ON tb_integracao_externa(atleta_id);
CREATE INDEX idx_integracao_plataforma ON tb_integracao_externa(plataforma);
CREATE INDEX idx_integracao_ativo ON tb_integracao_externa(ativo);
```

---

## Referências e documentos relacionados

| Documento | Conteúdo |
|---|---|
| [STRAVA_INTEGRATION_GUIDE.md](./STRAVA_INTEGRATION_GUIDE.md) | Implementação OAuth2 passo a passo, código de services e controllers |
| [STRAVA_IMPLEMENTATION_ROADMAP.md](./STRAVA_IMPLEMENTATION_ROADMAP.md) | Cronograma de sprints, checklist de tarefas |
| [integracao-garmin-strava.md](./integracao-garmin-strava.md) | Arquitetura completa com interface `ExternalActivityImporter`, mapeamento de laps, inferência de tipo de etapa, retry, deduplicação |
| [ROADMAP_TRAINING_ZONE_ASSESSMENT.md](./ROADMAP_TRAINING_ZONE_ASSESSMENT.md) | Zonas de treinamento e testes fisiológicos |
