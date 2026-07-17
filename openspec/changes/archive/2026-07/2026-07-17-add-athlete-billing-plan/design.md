# Design — add-athlete-billing-plan

## D1 — Distinção de nomenclatura: `TipoPlanoAtleta` não é `PlanoAssessoria`

**Problema:** já existe `PlanoAssessoria` (enum `GRATUITO/BASIC/PRO/ENTERPRISE`, campo `plano` em
`Assessoria.java`, seção "PLANO E COBRANÇA") — é o plano **SaaS da assessoria com a Menthoros**.
Também já existe `PlanoMetaDados` (metadados de **plano de treino**, sem relação com cobrança).
Um terceiro conceito de "plano" no mesmo domínio (`Atleta` ↔ `Assessoria`, comercial) precisa de
um nome que não colida nem semanticamente nem lexicamente com os dois anteriores.

**Decisão:** o enum se chama `TipoPlanoAtleta` (valores `MENSAL`, `TRIMESTRAL`, `SEMESTRAL`,
`ANUAL` — periodicidade de cobrança, não tier de features como `PlanoAssessoria`). O campo na
entidade é `tipoPlanoAtleta`, nunca `plano`/`tipoPlano` sozinho, para não ser confundido em code
review com `Assessoria.plano`. Comentário no enum citando essa distinção (mesmo padrão de
`PlanoMetaDados` vs. plano comercial descrito nesta change).

## D2 — Persistido vs. derivado

**Persistido em `Atleta`:** `dataVencimentoPlano` (`LocalDate`, nullable) e `tipoPlanoAtleta`
(enum, nullable) — dados de entrada do treinador, sem lógica.

**Derivado, nunca persistido:** `statusVencimentoPlano` (`EM_DIA`/`PROXIMO_VENCIMENTO`/`VENCIDO`).
Ao contrário de `fonteLimiarPace` (change `infer-threshold-from-race-result`, D6) — que precisa
ser persistido porque descreve *como um valor histórico foi calculado* e recomputar no read
poderia divergir do que gerou o valor salvo — aqui o status **é**, por definição, "a relação entre
a data de vencimento e a data de hoje". Não existe "valor salvo" a preservar; ele *deveria* mudar
sozinho conforme os dias passam (um atleta `EM_DIA` hoje deve virar `PROXIMO_VENCIMENTO`
amanhã, sem nenhuma escrita no banco). Persistir esse status seria dado derivado desatualizando
silenciosamente. Comparação registrada aqui para não repetir a dúvida de design em revisão futura.

## D3 — Fórmula do status e ponto de cálculo

**Constante:** `DIAS_ALERTA_VENCIMENTO = 7` (dias). Nova classe/local: método estático no próprio
enum `StatusVencimentoPlano` (padrão simples, sem service dedicado para uma função pura de 3
linhas):

```java
public enum StatusVencimentoPlano {
    EM_DIA, PROXIMO_VENCIMENTO, VENCIDO;

    private static final int DIAS_ALERTA_VENCIMENTO = 7;

    public static StatusVencimentoPlano resolver(LocalDate dataVencimento, LocalDate hoje) {
        if (dataVencimento == null) return null;
        if (dataVencimento.isBefore(hoje)) return VENCIDO;
        if (!dataVencimento.isAfter(hoje.plusDays(DIAS_ALERTA_VENCIMENTO))) return PROXIMO_VENCIMENTO;
        return EM_DIA;
    }
}
```

**Por que `hoje` como parâmetro (não `LocalDate.now()` interno):** função pura, testável sem mock
de relógio — mesmo motivo pelo qual `CoachDashboardServiceImpl.montarResumo(Atleta atleta,
LocalDate hoje, ...)` já recebe `hoje` como parâmetro hoje (linha 235). O mapper de
`AtletaOutputDto`/`AtletaPerfilCoachOutputDto` (sem um `hoje` de request já disponível) chama
`StatusVencimentoPlano.resolver(atleta.getDataVencimentoPlano(), LocalDate.now())` diretamente —
única exceção onde `now()` é aceitável, por não ter um `hoje` de contexto para propagar.

**Onde roda:**
- `CoachDashboardServiceImpl.montarResumo` (linha ~235-269): já tem `atleta` e `hoje` em escopo —
  chama o resolver e passa o resultado para o novo argumento do `CoachAtletaResumoDto`.
- `AtletaMapper` (MapStruct) — **padrão de `default method` + `expression`, não chamada estática
  totalmente qualificada inline** (achado do pre-mortem, Codex, 2026-07-16: verificado contra o
  estilo real do pacote — `PlanoSemanalMapper.resolveAtletaNome(entity)`,
  `TreinoMapper.safeGetTreinoRealizadoId(treinoPlanejado)`, `ProvaMapper.prova.diasFaltando()`
  seguem todos o padrão `expression = "java(metodoLocal(param))"` chamando um `default method`
  do próprio mapper, não uma chamada estática externa inline). `AtletaMapper` ganha:
  ```java
  default StatusVencimentoPlano resolveStatusVencimentoPlano(Atleta atleta) {
      return StatusVencimentoPlano.resolver(atleta.getDataVencimentoPlano(), LocalDate.now());
  }
  ```
  e `toOutputDto` ganha `@Mapping(target = "statusVencimentoPlano", expression =
  "java(resolveStatusVencimentoPlano(atleta))")` — os dois campos-fonte
  (`dataVencimentoPlano`/`tipoPlanoAtleta`) são mapeados automaticamente por nome idêntico entre
  `Atleta` e `AtletaOutputDto`, sem `@Mapping` extra para eles.
- `CoachAthleteProfileServiceImpl` (construção manual de `AtletaPerfilCoachOutputDto`, linha
  ~114): mesma chamada ao resolver (`StatusVencimentoPlano.resolver(...)` direto, sem MapStruct
  nesse arquivo), inline no ponto de construção do DTO.

## D4 — Edição só via `AtletaDialog.tsx` (perfil do coach é somente leitura)

**Achado ao explorar o frontend:** `CoachAthleteProfilePage.tsx` (perfil do atleta visto pelo
coach) não tem nenhuma ação de edição/save hoje — é uma tela de leitura agregada
(`AtletaPerfilCoachDto`). O único formulário de cadastro/edição de atleta é `AtletaDialog.tsx`
(`components/features/atleta/`, usado por `pages/atletas/AtletasList.tsx`), que já envia
`CreateAtleta`/`UpdateAtleta` para `PUT /api/v1/atletas/{id}`.

**Decisão:** os dois campos editáveis (`dataVencimentoPlano`, `tipoPlanoAtleta`) entram em
`AtletaDialog.tsx` — reusa o fluxo de edição existente, sem criar uma segunda superfície de
edição em `CoachAthleteProfilePage.tsx` (que ganha só exibição, não edição, nesta change).
Construir edição inline no perfil do coach é um follow-up de UX se o founder preferir esse fluxo
no dia a dia, fora do escopo mínimo desta change.

## D5 — Frontend: tipos e wiring do roster

**Tipos (`types/Atleta.ts`):** `TipoPlanoAtleta` (union `'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' |
'ANUAL'`) e `StatusVencimentoPlano` (union `'EM_DIA' | 'PROXIMO_VENCIMENTO' | 'VENCIDO'`) novos,
exportados. Campos `dataVencimentoPlano?: string` (ISO `yyyy-MM-dd`) e `tipoPlanoAtleta?:
TipoPlanoAtleta` em `Atleta`, `CreateAtleta` e `UpdateAtleta`; `statusVencimentoPlano?:
StatusVencimentoPlano` só em `Atleta` (campo de saída, nunca enviado em create/update — é
derivado no backend).

**Roster (`CoachAthletesPage.tsx`):** `AthleteRow` (interface local do arquivo, linha 67 — não
confundir com o componente `components/AthleteRow.tsx`, não utilizado nesta tela) ganha os três
campos; o `useMemo` que converte `roster: CoachAtletaResumo[]` em `AthleteRow[]` (linha ~282)
repassa os valores; uma nova `GridColDef` no array `columns` (linha ~320) renderiza data
formatada (reusa o helper `formatDate` já existente no arquivo, linha 108) + `StatusBadge` com
mapeamento `VENCIDO→'danger'`, `PROXIMO_VENCIMENTO→'warning'`, `EM_DIA→'active'`,
ausente→célula vazia (`—`), sem criar nenhum componente novo — `StatusBadge` já aceita
`variant`/`label` genéricos.

**API client curado (`src/api`):** os tipos gerados/curados para `AtletaOutputDto`,
`AtletaInputDto`, `CoachAtletaResumoDto` precisam refletir os campos novos (regenerar com
`npm run generate:api` como referência, portar à mão para a fachada curada — convenção já
documentada no `CLAUDE.md` do frontend).

## Riscos e mitigações

- **Threshold de 7 dias pode não ser o ideal na prática:** constante isolada e nomeada
  (`DIAS_ALERTA_VENCIMENTO`), fácil de ajustar sem migration — não é um valor de configuração
  por assessoria nesta v1 (feature creep evitado; se um founder pedir customização por tenant,
  vira change própria).
- **Campo de plano comercial (`TipoPlanoAtleta`) pode ser confundido com `PlanoAssessoria` em
  revisão de código futura:** mitigado por D1 (nomenclatura explícita + comentário no enum).
- **Edição só via `AtletaDialog.tsx`, não no perfil do coach:** pode não ser o fluxo mais
  conveniente no dia a dia do treinador (ele passa mais tempo no perfil do atleta que na lista
  de cadastro) — aceito nesta v1 para não expandir escopo de UI; registrado como candidato a
  follow-up (D4).
- **Staleness do status derivado sob cache (achado do pre-mortem, Codex, 2026-07-17):**
  `AtletaServiceImpl.getAtletaById`/`getAllAtletas` são `@Cacheable` (caches `atletas`/
  `atletas-list`, `CacheConfig.java`), e `statusVencimentoPlano` é computado com `LocalDate
  .now()` no momento em que a entrada do cache é populada (D3) — não recalculado a cada leitura
  do cache. **Verificado: `expireAfterWrite` = 30 minutos** (`application.yml:160`,
  `cache.default-ttl: PT30M`), sem TTL por cache. Como o status muda no máximo uma vez por dia
  (granularidade de `LocalDate`), uma janela de até 30min de atraso após a virada do dia é
  desprezível para um indicador visual passivo (não é dado financeiro nem de segurança) — aceito
  sem mitigação adicional (sem invalidação de cache por tempo, sem job de refresh).
- **Sem bounds de validação em `dataVencimentoPlano` (achado do pre-mortem, Codex):** o campo
  aceita qualquer `LocalDate`, passado ou futuro, sem limite — um erro de digitação (ex.: ano
  1900) não é rejeitado pela API. Aceito deliberadamente: o dado é preenchido por um treinador
  (usuário confiável, não input público), e o pior caso é um badge com cor errada até o
  treinador corrigir — sem risco de segurança ou dado financeiro real (não há gateway de
  pagamento nesta change). Validação de faixa fica como candidato a follow-up se a prática
  mostrar erros de digitação frequentes.
- **Corrida de numeração de migration com outras changes Full-track ativas (achado do
  pre-mortem, Codex):** nenhuma change ativa hoje (`openspec/changes/*`) reivindica
  explicitamente `V57` no texto, mas o risco geral existe sempre que duas changes Full tocam
  schema em paralelo e ambas descrevem "próximo número livre" na data do proposal, não da
  implementação. Já mitigado pela tarefa 0.1 do `tasks.md`, que instrui reconferir `ls
  src/main/resources/db/migration/ | sort -V | tail -3` **no momento da implementação**, não
  confiar no número `V57` fixado aqui — mesma convenção já usada nas changes anteriores
  (`infer-threshold-from-race-result`).
