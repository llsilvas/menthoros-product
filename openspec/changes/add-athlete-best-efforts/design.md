# design — add-athlete-best-efforts

## 1. DTO compartilhado

```java
public record MelhorEsforcoDto(
    String distanciaLabel,   // "400m", "800m", "1.5k", "1mi", "3k", "5k", "10k"
    double distanciaMetros,  // ponto real do curve mais próximo do alvo
    int tempoSegundos,
    String paceLabel         // "mm:ss/km", derivado de tempoSegundos/distanciaMetros
) {}
```

Usado nos dois pontos de exposição (item 2 e 3) — o serviço que busca/extrai é o mesmo, só o
chamador muda.

## 2. Perfil do coach (CA1, CA2, CA5)

`AtletaPerfilCoachOutputDto` ganha `List<MelhorEsforcoDto> melhoresEsforcos` (novo campo,
`@JsonInclude(NON_NULL)`, não quebra clientes existentes). Populado em
`CoachAthleteProfileServiceImpl.buscarPerfil` no mesmo padrão partial-failure dos campos vizinhos:

```java
List<MelhorEsforcoDto> melhoresEsforcos = buscarLista("melhoresEsforcos", avisos,
        () -> melhorEsforcoService.buscar(atletaId, "42d"));
```

Janela fixa `42d` nesta exposição (o coach vê o snapshot recente, sem seletor — é um card no meio
de outros dados do perfil, não uma tela dedicada). Atleta sem integração ou sem dados: lista vazia,
sem entrar em `avisos` (não é erro, é estado normal — mesma lógica de `recordes` hoje).

## 3. Endpoint do atleta (CA3, CA4)

`GET /api/v1/atletas/me/melhores-esforcos?janela={42d|1y|all}` (default `42d`) — usa o mesmo
`MelhorEsforcoService`, com `janela` vindo da query em vez de fixa. Resposta:

```java
public record MelhoresEsforcosOutputDto(
    List<MelhorEsforcoDto> marcas,
    boolean integracaoConectada
) {}
```

`integracaoConectada=false` + `marcas=[]` é a resposta pra CA2 nesta tela — `200`, não `404` nem
`422`: não é erro, é estado válido que o front trata como "mostrar CTA de conexão".

## 4. Client HTTP

Novo método em `IntervalsIcuClient`/`IntervalsIcuClientImpl`, mesmo estilo de
`listarAtividades`/`atualizarSportSettings` (ver `sync-fc-atleta-intervals-icu-sport-settings`,
arquivada em 2026-09-17):

```java
/** GET /api/v1/athlete/{id}/pace-curves.json?type=Run&curves={janela}. */
IcuPaceCurveDto buscarPaceCurves(String token, String externalAthleteId, String janela);
```

`IcuPaceCurveDto` mapeia só os campos que a feature usa do `DataCurveSetPaceCurve` real: `list`
(array de `DataCurve`, cada um com `distance: float[]` e `values: int[]` paralelos — índice `i` de
`distance` casa com índice `i` de `values`, que é o tempo em segundos pra cobrir aquela distância).
Não mapear `activities` (fora do escopo, ver Non-goals do proposal).

## 5. Algoritmo de extração dos checkpoints (`MelhorEsforcoServiceImpl`)

Alvos fixos: `{400, 800, 1500, 1609.34, 3000, 5000, 10000}` metros.

Para cada alvo, varrer `distance[]` do primeiro `DataCurve` da resposta (índice 0 — o curve sem
filtro) e escolher o índice `i` cujo `distance[i]` está mais próximo do alvo, **com tolerância
máxima de 1%**. Fora da tolerância, a marca não entra na lista — é isso que resolve CA3 (sem dado
suficiente, sem inventar).

`pace` = `tempoSegundos / (distanciaMetros / 1000)`, formatado `mm:ss/km` (mesmo formatador já usado
em `IntervalsIcuTargetParser`/telas existentes de pace).

**Validado contra a API real (2026-09-18, conta de teste — task 1.1):** o `DataCurve` do
intervals.icu **já traz pontos exatos** nas 7 distâncias-alvo (`400/800/1500/1609.34/3000/5000/
10000` → desvio 0,00% em todos), não é amostra orgânica só das atividades do atleta — o provedor
pré-computa checkpoints padrão. Curve com 107 pontos no total, indo até 21000m. Tolerância de 1% é
folga suficiente (cobre arredondamento de ponto flutuante), não uma tolerância "larga" para
compensar amostragem esparsa como se imaginava antes da validação. `ACTIVITY:READ` (escopo Bearer
já concedido na conexão) confirmado suficiente — sem necessidade de novo consentimento do atleta.

## 6. Cache

**TTL de 5 minutos por (atletaId, janela)**, em memória (Caffeine, já é dependência do projeto —
confirmar em `pom.xml` antes de assumir; se não for, usar cache simples `ConcurrentHashMap` com
expiração manual, sem introduzir dependência nova). Motivo: evitar bater o rate limit do
intervals.icu a cada re-render da tela do atleta (o front não deveria precisar, mas um refresh
acidental ou StrictMode duplicando o efeito não pode virar duas chamadas externas). Sem
persistência — cache é só otimização de tráfego, não fonte de verdade.

## 7. Tratamento de erro (CA5)

- **Perfil do coach:** `MelhorEsforcoServiceImpl.buscar` lançando é capturado pelo próprio
  `buscarLista` do endpoint agregador (padrão partial-failure já existente) — vira entrada em
  `avisos`, resto do perfil carrega normal. Nada novo a implementar aqui além de plugar no padrão.
- **Endpoint do atleta:** falha na chamada ao intervals.icu (timeout, 4xx, 5xx) → responde `502`
  com corpo padrão de erro do domínio (`DomainRuleViolationException` ou exceção dedicada, seguir
  convenção de `GlobalExceptionHandler`). O front trata `502` nesta seção especificamente como
  "erro ao carregar, tentar de novo" — não propaga pra um error boundary de página inteira.

## 8. Frontend

- **Perfil do coach:** nova seção "Melhores Esforços" em `CoachAthleteProfilePage`
  (`features/coach/pages/`). **Correção (2026-09-18, verificado contra o código real):** `recordes`
  existe no DTO (`AtletaPerfilCoach.ts:99`) mas **não é renderizado em nenhum componente do coach
  hoje** — só aparece em fixtures de teste (`CoachAthleteProfilePage.test.tsx`,
  `CoachInboxPage.test.tsx`). Não há "ao lado de" pra reaproveitar; a task de implementação escolhe
  o painel certo (provável candidato: `DiagnosisTabPanel.tsx`, que já agrega dados fisiológicos do
  atleta) e decide sozinha o layout, sem precedente visual a copiar. Sem seletor de janela (fixo
  `42d`, vem pronto do backend).
- **Tela de Progresso do atleta:** componente novo `MelhoresEsforcosCard` (ou aba — a task de
  implementação escolhe o ponto de encaixe exato ao ver o layout atual), com seletor de janela (3
  opções: `42d`/`1y`/`all`) e três estados: carregando, `integracaoConectada=false` (CTA conectar),
  lista de marcas (`marcas.length === 0` depois de conectado é um sub-estado "sem dados ainda",
  texto diferente do CTA de conexão).
