# Backlog — Assertividade na Geração de Treino (FC + Pace)

> Análise realizada em 2026-04-21 sobre `IaServiceImpl`, `ZonaTreinoService` e `PaceValidator`.
> Perspectiva de treinador experiente aplicada à lógica de validação pós-LLM.

---

## Status geral

| Prioridade | Item | Status |
|---|---|---|
| P0 | Etapas auto-inseridas bypassavam validação de FC | ✅ Implementado |
| P1.1 | `zonaEsperadaFC` cega ao `tipoTreino` | ✅ Implementado |
| P1.2 | `ritmoAlvo` ausente por etapa | ✅ Implementado |
| P2 | Triângulo pace × distância × duração sem validação | 🔲 Pendente |
| P2 | `PaceValidator` sem piso (só valida teto) | 🔲 Pendente |
| P3 | CONTINUO / TEMPO_RUN / REGENERATIVO sem validação estrutural | 🔲 Pendente |
| P3 | Distribuição de carga semanal (dias consecutivos intensos) | 🔲 Pendente |

---

## O que foi implementado

### P0 — Bypass silencioso na validação de FC

**Arquivos:** `IaServiceImpl.java`, `IaServiceImplFcValidationTest.java`

**Problema:** `adicionarTiroERecuperacao` e `zonaParaFc` produziam strings no formato
`"90-95% FCmax"`. O método `parseFcRange` só aceita `"NNN-NNN bpm"`, então retornava
`null` e `validarFcEtapa` pulava a validação silenciosamente com um WARN no log.

**Fix:**
- Novo método `bpmDaZona(List<ZonaFC>, int index)` que converte zona em `"fcMin-fcMax bpm"`
- `zonaParaFc(String, List<ZonaFC>)` — retorna bpm absoluto quando zonas disponíveis; fallback percentual mantido para atletas sem FC cadastrado
- `adicionarTiroERecuperacao` recebe `List<ZonaFC>` e emite bpm quando disponível
- `expandirEtapasAgregadas` e `normalizarTreinoIntervalado` propagam zonas até os pontos de criação
- `validarENormalizarPlanoGerado` passa `zonasParaValidacao` (já computado) para todos os call sites

**Testes:** 9 novos em `BypassFcCorrigido` — formato bpm com/sem zonas, prova do bypass corrigido, fallback documentado.

---

### P1.1 — `zonaEsperadaFC` cega ao `tipoTreino`

**Arquivos:** `IaServiceImpl.java`, `IaServiceImplFcValidationTest.java`

**Problema:** A etapa `PRINCIPAL` em qualquer treino era validada contra Z2–Z4,
permitindo FC de Z4 num treino `REGENERATIVO` — risco fisiológico real.

**Fix:**
- `zonaEsperadaFC(String tipoEtapa, String tipoTreino, List<ZonaFC>)` — novo parâmetro `tipoTreino`
- Novo método `zonaParaEtapaPrincipal(String tipoTreino, List<ZonaFC>)` com mapeamento:

| `tipoTreino` | Zona para etapa PRINCIPAL |
|---|---|
| `REGENERATIVO` | Z1–Z2 |
| `CONTINUO`, `FACIL`, `LONGO` | Z2–Z3 |
| `FARTLEK` | Z2–Z4 (variável) |
| `TEMPO_RUN` | Z3–Z4 (limiar) |
| `INTERVALADO`, `TIRO` | Z4–Z5 |
| `null` / default | Z2–Z4 |

- `validarFcEtapa(EtapaTreinoLlmDto, String tipoTreino, List<ZonaFC>)` — recebe e propaga `tipoTreino`
- Call site em `validarENormalizarPlanoGerado` captura `tipoTreinoFinal` antes do stream

**Testes:** 15 novos em `ZonaEsperadaFcPorTipoTreino` — todos os tipos + 3 casos de integração.

---

### P1.2 — `ritmoAlvo` ausente por etapa

**Arquivos:** `EtapaTreinoLlmDto.java`, `EtapaTreino.java`, `IaServiceImpl.java`

**Problema:** Sem `ritmoAlvo` no nível da etapa, o LLM expressava pace em texto livre
na `descricaoEtapa`, sem validação possível. Tiros e recuperações compartilhavam
o mesmo range de pace do treino inteiro.

**Fix:**
- `EtapaTreinoLlmDto` — novo campo `String ritmoAlvo` (nullable, ao final do record)
- `EtapaTreino` entity — mapeado para `ritmo_alvo VARCHAR(50)` (coluna já existia desde `V1__Initial_schema_and_extensions.sql` — sem nova migration)
- Schema JSON em `buildSchemaTightInlineOrDefs` — `ritmoAlvo` adicionado nas etapas como:
  ```json
  { "anyOf": [
      { "type": "string", "pattern": "^[0-9]{1,2}:[0-5][0-9]-[0-9]{1,2}:[0-5][0-9]/km$" },
      { "type": "null" }
  ]}
  ```
  Compatível com `strict: true` do OpenAI (campo em `required`, mas nullable via `anyOf`)
- 10 construções de `EtapaTreinoLlmDto` em `IaServiceImpl` atualizadas:
  - Etapas **modificadas** (FC correction, clamp, reordering): preservam `e.ritmoAlvo()`
  - Etapas **criadas** por normalização extra (`adicionarTiroERecuperacao`): `null`
  - **Expansão NxDist**: tiros herdam `ritmoAlvo` da etapa agregada; recuperações da template adjacente
  - **Expansão Fartlek**: mesma lógica de herança

---

## O que falta implementar

### P2-A — `PaceValidator` sem piso

**Arquivo:** `PaceValidator.java`

**Problema:** O validador só corrige pace mais rápido que o `teto` (melhor histórico × 0.98).
Não existe validação de piso — um INTERVALADO prescrito em 8:00/km passaria sem alerta,
mesmo que o atleta faça 4:30/km em treinos fáceis.

**O que implementar:**
1. Calcular `pisosPorTipo` em `PaceHistoricoFormatter` (ex: pace médio dos últimos LONGAS × 1.25)
2. Adicionar parâmetro `piso` em `PaceValidator.validar(ritmoAlvo, teto, piso)`
3. Se `paceMax > piso` → deslocar o range para baixo preservando amplitude
4. Logar WARN com `ritmoAlvo` original e corrigido

**Referência:** `PaceHistoricoFormatter.calcularTetoPorTipo()` como modelo para `calcularPisoPorTipo()`.

---

### P2-B — Triângulo pace × distância × duração sem validação

**Arquivo:** `IaServiceImpl.java`

**Problema:** `ritmoAlvo`, `distanciaKm` e `duracaoMin` formam uma identidade matemática
(`pace × distância = duração`) que nunca é verificada. O LLM pode gerar combinações
fisicamente impossíveis (ex: 5:00/km, 10 km, 45 min).

**O que implementar:**
Novo método privado `validarTrianguloPaceDuracaoDistancia(TreinoPlanejadoLlmDto treino)`:
1. Parsear `ritmoAlvo` (reutilizar lógica de `PaceValidator.parsear()`)
2. Calcular duração esperada: `paceMedia × distanciaKm` (onde `paceMedia = (paceMin + paceMax) / 2`)
3. Parsear `duracaoMin` (converter string `"MM:SS"` → minutos)
4. Se desvio > 20% → logar WARN com valores reais vs esperados
5. Não corrigir automaticamente (conflito de qual valor é canônico); apenas sinalizar para log

Chamar em `validarENormalizarPlanoGerado` para todos os tipos de treino após as normalizações.

---

### P3-A — CONTINUO, TEMPO_RUN e REGENERATIVO sem validação estrutural

**Arquivo:** `IaServiceImpl.java`

**Problema:** Apenas INTERVALADO/TIRO, FARTLEK e LONGO têm validação especializada. Os
outros passam direto pelo pipeline sem nenhuma verificação estrutural.

**O que implementar por tipo:**

#### REGENERATIVO
- Deve ter 3 etapas: AQUECIMENTO → PRINCIPAL → DESAQUECIMENTO
- `duracaoMin` do treino: 20–45 min (acima disso deixa de ser regenerativo)
- Nenhuma etapa pode ter FC prescrita acima de Z2 (já coberto por P1.1 mas sem validação estrutural explícita)

#### CONTINUO
- Deve ter 3 etapas: AQUECIMENTO → PRINCIPAL → DESAQUECIMENTO
- `distanciaKm`: mínimo 5 km (abaixo não faz sentido como treino contínuo)

#### TEMPO_RUN
- Deve ter 3 etapas: AQUECIMENTO → PRINCIPAL (bloco de limiar) → DESAQUECIMENTO
- PRINCIPAL: mínimo 15 min (menos que isso não induz adaptação de limiar)
- PRINCIPAL: FC deve estar em Z3–Z4 (já coberto por P1.1, mas sem validação estrutural explícita)
- `ritmoAlvo` do PRINCIPAL deve estar próximo do `paceLimiar` do atleta (±10%)

**Modelo de implementação:** seguir o padrão de `validarTreinoLongo()` em `IaServiceImpl.java:1169`.

---

### P3-B — Distribuição de carga semanal

**Arquivo:** `IaServiceImpl.java` (em `validarENormalizarPlanoGerado`)

**Problema:** Não há verificação de que dias adjacentes não concentram treinos intensos.
Dois INTERVALADO em dias consecutivos (ex: terça e quarta) não são detectados.

**O que implementar:**
Novo método `validarDistribuicaoCargaSemanal(List<TreinoPlanejadoLlmDto> treinos)`:

1. Mapear `DiaSemana` → `TipoTreino` para o plano gerado
2. Definir treinos "duros": `INTERVALADO`, `TIRO`, `TEMPO_RUN`
3. Para cada par de dias consecutivos no calendário semanal (DOM→SEG→TER…):
   - Se ambos forem "duros" → logar WARN com os dias e tipos
   - Não rejeitar o plano (LLM pode ter razão em casos edge como bikers); apenas alertar

**Referência de ordenação:** usar `DiaSemana.ordinal()` ou definir ordem explícita
(SEGUNDA=1 … DOMINGO=7) para detectar adjacência.

---

## Gap arquitetural não resolvido — threshold de sobreposição FC (50%)

**Localização:** `IaServiceImpl.java:452` (`overlapPct < 0.50`)

**Problema:** 50% de sobreposição é permissivo demais para zonas de alta intensidade.
Uma etapa INTERVALADO prescrita 25–30 bpm abaixo do início de Z4 passa na validação se tiver
range amplo o suficiente.

**Sugestão futura:** threshold dinâmico por zona:
- Z1–Z2: 50% (zonas de recuperação têm mais tolerância)
- Z3: 60%
- Z4–Z5: 70% (alta intensidade exige prescrição mais precisa)

Não é bloqueante para as demais implementações; pode ser ajustado isoladamente em `validarFcEtapa`.

---

## Arquivos chave para referência

| Arquivo | Responsabilidade |
|---|---|
| `services/impl/IaServiceImpl.java` | Orquestração, validação e normalização pós-LLM |
| `services/helper/ZonaTreinoService.java` | Cálculo de zonas FC (LTHR) e Pace |
| `services/helper/PaceValidator.java` | Validação de teto de pace por tipo |
| `services/prompt/PaceHistoricoFormatter.java` | Histórico de pace e cálculo de teto |
| `dto/llm/EtapaTreinoLlmDto.java` | DTO de etapa para o LLM (inclui `ritmoAlvo`) |
| `dto/llm/TreinoPlanejadoLlmDto.java` | DTO de treino planejado para o LLM |
| `entity/EtapaTreino.java` | Entidade persistida (inclui `ritmo_alvo`) |
| `services/impl/IaServiceImplFcValidationTest.java` | Testes unitários de validação FC |
