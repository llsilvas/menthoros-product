# Design — add-watch-brand-connection-guide

## Contexto

Estado do código em 2026-10-15 (verificado):

- `DispositivoMarca { GARMIN, COROS, POLAR, SUUNTO, APPLE, OUTRO }` em `enums/`, obrigatório no
  onboarding (`AtletaOnboardingPage.isValid` exige `dispositivoMarca`), persistido em
  `tb_perfil_onboarding_atleta.dispositivo_marca VARCHAR(20)` (V67). `dispositivoModelo` texto
  livre opcional.
- `FontePriority.PRIORIDADE_DISPOSITIVO`: Garmin 1; COROS/Polar/Suunto 2; Apple 3; Outro 4;
  default 10 para marca não mapeada. Consumido só por `ConfidenceScorerImpl.pontuarFonteConfiavel`
  quando ainda não há histórico de atividades.
- Front: `types/Onboarding.ts` espelha o enum como union + `DISPOSITIVO_MARCA_LABELS`;
  `OnboardingPerfilStep` deriva as opções do objeto de labels (`Object.keys`), então adicionar
  um label já adiciona o chip.
- `OnboardingService` (front) expõe `GET/POST /api/v1/atletas/{atletaId}/onboarding`; o hook
  `useOnboarding(atletaId?)` resolve o atleta do JWT quando o id não vem da URL.
- `IntervalsIcuConnectionCard` não sabe a marca; `AthleteProfilePage` só renderiza o card e o
  logout. `CoachAthleteProfilePage` tem `SectionCard` próprio e o botão "Preencher onboarding".
- `SyncStatusChip.resolveVisual` grava "Enviado ao intervals.icu/Garmin" no tooltip de sucesso.
- `IntervalsIcuService.getStatus()` devolve `null` em 404 (atleta nunca conectou) — por isso a
  marca **não pode** vir do status de conexão: o guia é mais útil justamente antes de conectar.
- `GET .../onboarding` devolve **204** (corpo vazio) quando não há perfil — não 404.
  `OnboardingService.buscarRascunho` já traduz para `undefined`. O hook de leitura da marca (task
  3.1) trata 204 como "sem marca", não como erro.
- `useOnboarding` não busca no mount, expõe dez membros de edição e retém o perfil anterior quando
  a resposta vem vazia — inadequado para só ler dois campos; a leitura da marca usa hook próprio.

## Decisões

### D1 — A marca vem do perfil de onboarding, não de um campo novo no atleta

O levantamento propunha coluna nova em `tb_atleta`. Ela já existe em
`tb_perfil_onboarding_atleta`, com DTO, mapper, endpoint e uso no scorer. Criar outra seria
duplicar o que `WatchBrand`/`DispositivoMarca` já duplicam. Consequências aceitas:

- Atleta sem perfil de onboarding (anterior à V67 ou cadastrado só pelo coach sem preencher) não
  tem marca → o guia cai no modo "todas fechadas + dica" (CA4) e o coach vê "não informado".
- O front faz **uma chamada a mais** no perfil do atleta (`GET .../onboarding`) e uma a mais na
  página do coach. Ambas já existem e são baratas (`OneToOne` por `atleta_id`).

Alternativa descartada: incluir `dispositivoMarca` em `IntervalsIcuConnectionStatusDto`. Além
do 404 antes de conectar, misturaria "estado da conexão" com "perfil do atleta".

### D2 — Prior do `ConfidenceScorer` para as marcas novas (revisado 2026-10-16: prior no enum)

O prior deixa de ser uma tabela em `FontePriority` e passa a ser propriedade de cada constante:
`DispositivoMarca.GARMIN(1)`, `COROS(2)`, …, `AMAZFIT(3)`, `SAMSUNG(3)`, com `prior()`.
`FontePriority.PRIORIDADE_DISPOSITIVO` e `deDispositivo` são removidos (um só chamador,
`ConfidenceScorerImpl.pontuarFonteConfiavel`, que passa a ler `marca.prior()`). Motivo (revisão de
arquitetura, 2026-10-15): a tabela era um pass-through com `getOrDefault(…, 10)` — uma marca nova
sem prior compilava e caía no default em silêncio; o CA1 existia para vigiar esse buraco. No enum,
a omissão não compila, e valor e justificativa ficam lado a lado. `FontePriority` volta a ser só o
que o Javadoc dele diz: prioridade por `FonteDados`, compartilhada entre dedup e scorer.

O limiar do scorer é **binário**: `pontuarFonteConfiavel` dá 15 pontos inteiros quando
`FontePriority.deDispositivo(marca) <= 2`, e zero acima. Sem histórico, onboarding completo + FC
máxima + pace limiar somam 35; prior ≤ 2 leva a 50. Limiares: A ≥ 75, B ≥ 45 — 50 é **B**, mas
`preenchidoPorCoach` promove um tier (`ConfidenceScorerImpl:67`), e aí vira **A**;
`persistirBaselineSnapshot` **não inicia a calibração** quando o primeiro snapshot já é tier A
(achado do Codex; limiares corrigidos no DoR de 2026-10-16 — a versão anterior dizia "50 = A" sem a
condição do coach). Entrar na faixa
confiável é, portanto, dispensar a calibração com base só na marca declarada — inaceitável sem
gate.

| Marca | Prior | Justificativa |
|---|---|---|
| `AMAZFIT` | 3 | Ingestão nativa mas **sem laps** no intervals.icu — mesmo patamar da Apple |
| `SAMSUNG` | 3 | Só via bridge (Health Sync); sem HRV; mesmo patamar da Apple |

Os seis valores atuais não mudam (Suunto segue em 2, como hoje). Promover uma marca depois do
gate é uma linha no enum, coberta pelo teste integrado da task 1.4 (score → tier → calibração).
Teste parametrizado cobre os oito (CA1); não há mais default — o compilador é a defesa.

### D3 — Matriz de compatibilidade é conteúdo estático do front

```ts
// apps/menthoros-front/src/features/athlete/watchCompatibility.ts
export type ModoPush = 'NATIVO' | 'NATIVO_JANELA_7_DIAS' | 'PARCIAL_POR_MODELO' | 'VIA_APP_PARCEIRO' | 'SEM_PUSH' | 'NAO_VERIFICADO';
export type ModoIngestao = 'NATIVO' | 'VIA_APP_PARCEIRO' | 'NAO_VERIFICADO';
// NAO_VERIFICADO: marcas NAO_COBERTO (Suunto, Outro) — não afirmamos capacidade que não validamos.
export type Posicionamento = 'SUPORTADO' | 'EM_VALIDACAO' | 'COMPATIVEL_VIA_APP' | 'PARCIAL_POR_MODELO' | 'SO_TREINO_REALIZADO' | 'NAO_COBERTO';

export interface WatchCompatibility {
  marca: DispositivoMarca;
  posicionamento: Posicionamento;
  push: ModoPush;
  ingestao: ModoIngestao;
  passos: string[];          // passo a passo para o atleta, PT-BR
  avisos?: string[];         // limitações que o atleta precisa saber (janela de 7 dias, modelos)
  appParceiro?: { nome: string; url: string }[];
  resumoParaCoach: string;   // condicional, nunca afirma chegada: "chegam ao relógio se o atleta ligou X"
  criterioPromocao?: string; // para EM_VALIDACAO: o que precisa acontecer para virar SUPORTADO
  docOficialUrl?: string;    // página do intervals.icu para o que muda rápido (janela, modelos)
  verificadoEm: string;      // 'YYYY-MM', mostrado no guia; revisado pelo item recorrente do Kanban
  fontes: string[];          // Garmin cita o gate de 2026-07-14
}
export const WATCH_COMPATIBILITY: readonly WatchCompatibility[]; // ordenado pela prioridade do founder
export function compatibilidadeDe(marca: DispositivoMarca): WatchCompatibility;
```

Por que no front e não no backend: nada no servidor decide com base nela nesta change; quando
C3/C4 precisarem (push condicional por marca, status de conexão do relógio), a matriz migra para
o backend e o front passa a consumi-la por endpoint — a forma dos tipos acima foi escolhida para
que essa migração seja mecânica. Mantê-la em um arquivo com `verificadoEm` e `fontes` por marca
responde ao risco "conteúdo desatualiza".

A **ordem das entradas** (e do acordeão em D4, dos chips do onboarding e dos gates) é a ordem de
prioridade decidida pelo founder em 2026-10-15: Garmin, Apple, Amazfit, COROS, Samsung, Polar,
e por último Suunto e Outro como "ainda não coberto" (Huawei e Wahoo nem entram no enum —
ficam para um follow-up). A matriz é um array ordenado, não um `Record` — a ordem é conteúdo.
Consequência honesta dessa ordem: as posições 2 e 3 (Apple, Amazfit) são as de circuito
**parcial** (app parceiro / por modelo), então o gate manual delas vem antes do gate de COROS,
ao contrário da recomendação original do levantamento (seção 8), que ordenava por facilidade
técnica e não por uso.

Conteúdo por marca (resumo; o texto final é PT-BR no arquivo):

| Marca | Posicionamento | Push | Passos essenciais | Avisos |
|---|---|---|---|---|
| GARMIN | SUPORTADO (gate 2026-07-14) | NATIVO | Connections → Garmin → marcar *Upload planned workouts* | — |
| COROS | EM_VALIDACAO (→ SUPORTADO após gate com atleta real) | NATIVO_JANELA_7_DIAS | Connections → COROS; no app COROS, adicionar o calendário *Intervals.icu Training Plan* | só os próximos 7 dias; um tipo de alvo por treino; apagar no Menthoros não remove do relógio |
| SUUNTO | NAO_COBERTO | — | abrir Connections no intervals.icu e procurar a marca; avisar o treinador | fora do escopo desta change (decisão do founder); conteúdo do levantamento fica para o follow-up |
| AMAZFIT | PARCIAL_POR_MODELO | PARCIAL_POR_MODELO | Zepp → conectar Intervals.icu | push automático só em **T-Rex 3 Pro** e **Balance 2**; demais: importar `.fit` no Zepp; atividade volta **sem laps** |
| POLAR | SO_TREINO_REALIZADO | SEM_PUSH | Connections → Polar (só ingestão) | treino planejado **não** chega ao relógio; montar o alvo no Polar Flow à mão |
| APPLE | COMPATIVEL_VIA_APP | VIA_APP_PARCEIRO | instalar *Intervals.icu Companion* (ou *Watchletic*), ligar Apple Health ↔ intervals.icu | app de terceiro; envio pode ser manual; natação sem estrutura |
| SAMSUNG | COMPATIVEL_VIA_APP | VIA_APP_PARCEIRO | *Health Sync* (Samsung Health → intervals.icu) + *Watchletic for Wear OS* | app de terceiro; sem HRV; sono sim |
| OUTRO | NAO_COBERTO | — | abrir Connections no intervals.icu e procurar a marca | — |

### D4 — Guia como acordeão com a marca do atleta aberta

Em vez de "escolher a marca" (o que duplicaria o onboarding), o card mostra um acordeão com as
oito marcas na ordem de prioridade do founder; a do perfil vem aberta no topo, as demais fechadas
abaixo de "Outro relógio?", mantendo a ordem. Xiaomi aparece como uma linha dentro de "Outro"
(sem conexão com o intervals.icu; só via bridge no celular). Cobre
a **consulta** ao guia de outra marca ("comprei outro relógio, o que faço?") sem endpoint de
edição. **Não** atualiza a marca persistida: o coach e o scorer continuam lendo a do onboarding —
por isso a linha do coach (D6) diz "informada no onboarding, não confirmada", e o follow-up
`add-athlete-watch-update` (marca/modelo editáveis; `salvarRascunho` já aceita escrita em
`COMPLETO`) fica registrado. O painel aberto tem:
rótulo de posicionamento (chip), `passos` numerados, `avisos` em `Alert` de warning,
`appParceiro` como links externos, "Informações de <verificadoEm>".

Estado "conectado" vs "não conectado": o guia é o mesmo; muda só a frase de contexto acima dele
("Antes de conectar, veja o que o seu relógio precisa" / "Conectado. Confira se o relógio está
recebendo os treinos"). O botão "Conectar com intervals.icu" fica **acima** do guia — a ação
principal não pode ficar depois de dez acordeões.

### D5 — Enum forward-only; rollback só do front

Backend primeiro (enum aceita os valores), front depois (chips passam a oferecê-los).

**A adição ao enum nunca é revertida.** A primeira versão deste design previa um `UPDATE ... SET
dispositivo_marca = 'OUTRO'` antes de reverter o backend. O Codex derrubou: uma aba do front
aberta antes do rollback continua oferecendo `AMAZFIT`, e `OnboardingServiceImpl.salvarRascunho`
aceita e persiste — inclusive em perfil `COMPLETO`. Qualquer gravação entre o `UPDATE` e a subida
do backend antigo reintroduz o valor, e o backend antigo falha ao carregar o perfil (também em
`montarContexto`, na geração de plano). Fechar essa janela exigiria drenar escritas, e o `UPDATE`
destruiria a marca original sem backup. Não vale o risco para quatro constantes.

Regras:
- O enum e o `FontePriority` vão num **commit próprio**, primeiro da branch, para que o restante
  do backend possa ser revertido sem levá-los junto.
- Rollback operacional é **só o front** (os valores só nascem do chip group). Se o backend inteiro
  precisar voltar, o commit do enum é reaplicado por cima (cherry-pick) antes do deploy.
- Se um dia for preciso remover um valor: change própria, com migration que normaliza, backup da
  coluna e bloqueio de escrita — não é cenário desta change.

### D6 — Coach: uma linha honesta, mais o guia em modo leitura (revisado 2026-10-16: fonte é o perfil agregado)

**De onde a marca vem para o coach:** de `AtletaPerfilCoachOutputDto.relogio { marca, modelo }`,
preenchido em `CoachAthleteProfileServiceImpl.buscarPerfil` por `buscarNullable("relogio", …)`
sobre `PerfilOnboardingAtletaRepository.findByAtletaIdAndTenantId` (OneToOne, um atleta por
request). Sem perfil, ou perfil com `dispositivo_marca` nulo (registros anteriores ao `@NotNull` de D7 —
V67 permite) → `relogio` nulo sem aviso; consulta falhou → nulo com `"relogio"` em `avisos`, como
os demais blocos. `relogio` só existe com marca; modelo sem marca não é devolvido. A versão anterior deste design previa `useOnboarding(atletaId)` na
página — um sétimo hook (com interface de editor) para ler dois campos, mais um mock no teste da
página, quando o backend já tem o módulo "tudo que o coach vê do atleta" com partial-failure.
A página passa a ler `profile.relogio`; C3 (status da conexão do relógio) entra no mesmo DTO. O
`GET .../onboarding` continua sendo o seam do **atleta** (D1, task 3.1).

`CoachAthleteProfilePage` já é longa (oito `SectionCard`). A marca entra no cabeçalho, ao lado dos
dados do atleta, como `Relógio: COROS · Forerunner 265 · treinos aprovados vão ao intervals.icu e
chegam ao relógio se o atleta ligou a conexão COROS e o upload de treinos planejados (próximos 7
dias; não verificado automaticamente)`. A frase é **condicional de propósito**: o sistema não sabe
se o atleta ligou o upload (isso é C3), e afirmar "chegam automaticamente" daria confiança falsa
ao coach — pior que nada. Para `SO_TREINO_REALIZADO`, `COMPATIVEL_VIA_APP` e `PARCIAL_POR_MODELO`,
a frase vira um `Alert` info de uma linha com a consequência para a rotina ("o atleta vê o treino
no Menthoros e no intervals.icu, não no relógio"). Ao lado, o link "O que pedir ao atleta" abre
o `WatchConnectionGuide` da marca em modo leitura (mesmo componente, sem botão de conectar) —
é o que o coach usa na hora do ticket. A linha deixa claro que a marca é **"informada no
onboarding, não confirmada"** (o atleta pode ter trocado; ver D4) e mostra o chip de
posicionamento (inclusive "Em validação") e os `avisos` de formato que afetam o treino que o
coach aprova — um tipo de alvo por treino no COROS — porque o
`IntervalsIcuWorkoutConverter` hoje escolhe FC ou pace por etapa e prioriza distância, e tratar
isso no push é C4. Sem perfil: "Relógio não informado" e o botão "Preencher onboarding"
existente.

### D7 — `dispositivoMarca` obrigatória também no backend

`AtletaOnboardingInputDto.dispositivoMarca` ganha `@NotNull` (decisão do founder, 2026-10-16). O
proposal sempre a descreveu como obrigatória, mas só `AtletaOnboardingPage.isValid` (etapa 1)
exigia. Verificado: o front só chama `salvarRascunho` quando a etapa atual é válida, e a etapa 1
exige `nivelExperiencia`, `dispositivoMarca` e `canalIntegracao` — logo nenhum rascunho é enviado
sem marca hoje, e o `@NotNull` só fecha a porta para clientes fora do formulário. O service
revalida (regra do `CLAUDE.md`: não confiar no DTO). CA4 (atleta sem perfil) não é afetado: ele
trata quem nunca enviou rascunho, não um rascunho sem marca.

### D8 — Chip de sincronização: "No intervals.icu", universal

`SyncStatusChip.resolveVisual` para `SINCRONIZADO`/`SINCRONIZADO_PARCIAL` passa a dizer
**"No intervals.icu"** (rótulo) e "Enviado ao intervals.icu" (tooltip). O rótulo "No relógio" era
verdadeiro só para Garmin; para Polar era promessa falsa visível na tela do coach (achado do Codex
no DoR). A versão por marca ("No relógio" quando há push nativo) exige a marca em
`TreinoPlanejadoResumoDto` e fica em C4/C6.

## Fora do design (confirmado como non-goal)

Chip de status por marca, leitura de `icu_*_upload_workouts`, push condicional, fallback de laps,
unificação de `WatchBrand`. Ver proposal.
