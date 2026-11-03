# Design — coach-ver-treino-realizado

## Contexto

- Backend: `GET /api/v1/treinos/realizados/{id}` (`TreinoRealizadoController.obterRealizado`),
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, isolamento por tenant no service
  (`findByIdAndTenantId` → 404). Devolve `TreinoRealizadoOutputDto` com `runningDynamics`,
  `decoupling`, `serieEficiencia` (só no detalhe) e `etapasRealizadas`.
- `.fit`: `FitParseServiceImpl` coleta `LapBruto` e a Session, monta `FitSessionData` após o decode;
  `FitTreinoPersister` grava em `TreinoRealizado`/`EtapaRealizada`.
- Front: `TreinoService.obterRealizado` existe no cliente curado; `useDecouplingRealizado`
  (`components/features/planos`) já consome o endpoint para o decoupling.

## D1 — Três colunas novas na sessão, sem backfill

Migration (próximo número livre, hoje `V108`) em `tb_treino_realizado`:

- `velocidade_max_kmh NUMERIC(5,2) NULL`
- `temperatura_min_c NUMERIC(4,1) NULL`
- `temperatura_max_c NUMERIC(4,1) NULL`

Só a nível de sessão. Laps não ganham os campos: a tabela de Intervalos não os usa.

Velocidade em km/h, não pace: segue `velocidadeMedia` (km/h) já existente; o front converte para
min/km. Guardar pace como `Duration` acoplaria a unidade de corrida ao dado bruto.

Sem backfill: o `.fit` original não é guardado, então não há de onde reprocessar.

## D2 — Parse do `.fit`

Na Session: `getEnhancedMaxSpeed()` (fallback `getMaxSpeed()`), `getMinTemperature()`,
`getMaxTemperature()`. Conversão m/s → km/h no parse; temperatura `Byte` → `BigDecimal` com o mesmo
`celsiusDeByte` dos laps. Valores inválidos do FIT (sentinela/0xFF já tratados pelo SDK como
`null`) ficam nulos.

## D3 — Contrato

`TreinoRealizadoOutputDto` ganha `velocidadeMaxKmh`, `temperaturaMinC`, `temperaturaMaxC` no nível
raiz — junto de `velocidadeMedia`, não dentro de `runningDynamics` (temperatura média está lá por
herança, mas mín/máx não são running dynamics). `NON_NULL` já vale para o record. Mudança aditiva:
nenhum consumidor quebra.

Front: alinhar `src/types/TreinoRealizado.ts` (tipo de leitura) ao DTO à mão, conforme a regra do
cliente curado. Separar o tipo de leitura (`TreinoRealizadoDetalhe`) do tipo de escrita
(`CreateTreinoRealizado`), que hoje compartilham forma e divergem do output.

## D4 — Front: estrutura

```
features/coach/
  hooks/useTreinoRealizadoDetalhe.ts       ← busca por id; loading/error/data/refetch
  adapters/treinoRealizadoDetalheAdapters.ts  ← DTO → view model (seções, linhas, total)
  types/TreinoRealizadoDetalhe.ts           ← view model
  components/TreinoRealizadoDrawer.tsx      ← drawer + cabeçalho + resumo + abas
  components/TreinoRealizadoEstatisticas.tsx
  components/TreinoRealizadoIntervalos.tsx
```

- `TreinoPlanejadoCard` não busca nada: recebe a ação por `actions` (já existente) ou por um prop
  novo `onVerRealizado`. Preferir reusar `actions`/`rodape` — o card é só visual por contrato.
- Formatação num ponto só, no adapter: vírgula decimal, `--` para ausente, pace a partir de km/h,
  duração `MM:SS`/`HH:MM:SS`. Reusar helpers de `utils/` se já existirem (conferir antes de criar).
- Linha **Total** da aba Intervalos vem dos campos da sessão (CA5): somar voltas no front diverge
  quando há pausa ou volta parcial.
- Zona da volta: usa `zona` vinda do backend e a cor de `activeTheme.zones`; o front não deriva zona.
- O drawer busca só quando abre (lazy) e por `treinoRealizadoId`; fechar e reabrir o mesmo id pode
  reusar o resultado em memória do hook — sem cache global.

## D5 — Telemetria da métrica

Evento de abertura do painel com `treinoRealizadoId` e `atletaId`, pelo mecanismo de telemetria
que o front já usar. Se não houver mecanismo, a métrica de adoção vira pendência registrada em
`tasks.md`, não um sistema novo nesta change.

## Riscos e mitigações

- **R1 — Melhor ritmo irreal por pico de GPS.** `enhanced_max_speed` pode registrar 2:30/km numa
  corrida leve. Mitigação: mostrar como veio (é o que o Garmin mostra) com o rótulo "Melhor ritmo";
  se os pilotos reportarem ruído, descartar acima de um teto físico em follow-up.
- **R2 — Migration colide com `coach-editar-treino-aprovado`.** As duas estão abertas. Mitigação:
  número definido no commit, conferindo `db/migration` em `develop`.
- **R3 — Tipo de leitura do front desalinhado continua escondendo campo.** Mitigação: teste do
  adapter com um payload real do endpoint (fixture capturada do backend local), não um objeto
  montado à mão.
- **R4 — Painel vazio para treinos manuais.** Lançamento manual não tem running dynamics nem voltas.
  Mitigação: CA4/CA6 cobrem `--` e estado vazio; o cabeçalho mostra a fonte ("Manual").

## Rollback

- Front: reverter o PR; o card volta a não ter ação.
- Backend: colunas nulas e aditivas — reverter o código deixa as colunas sem uso, sem perda de dado.
  Não há `DROP` no rollback.
