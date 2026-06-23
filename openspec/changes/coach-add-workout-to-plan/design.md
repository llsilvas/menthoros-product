# Design: coach-add-workout-to-plan

## Decisões de Design

### D1 — diaSemana derivado no backend via dataTreino

O cliente envia `dataTreino` (LocalDate). O backend converte `dataTreino.getDayOfWeek()` para o enum `DiaSemana` interno. Razão: evitar inconsistência entre data e dia enviados pelo frontend; o cliente não tem responsabilidade sobre esse mapeamento.

Mapeamento: `DayOfWeek.MONDAY → DiaSemana.SEGUNDA`, …, `DayOfWeek.SUNDAY → DiaSemana.DOMINGO`.

### D2 — Ordem das etapas atribuída por posição no array

`EtapaInputDto` não tem campo `ordem`. O backend atribui `etapa.ordem = index + 1` pela posição da lista recebida. A ordem visual no dialog é a mesma que a ordem de prescrição — nenhuma lógica extra necessária no frontend.

### D3 — Reutilizar EtapaInputDto e TssCalculatorService

Ambos foram introduzidos em `coach-edit-planned-workout` e cobrem exatamente o que este endpoint precisa. Não duplicar DTOs nem lógica de cálculo.

### D4 — adicionadoPeloCoach como sinal distinto de editadoPeloCoach

`editadoPeloCoach = true` sinaliza modificação pós-geração. `adicionadoPeloCoach = true` sinaliza criação manual pelo coach. São sinais distintos para `rag-coach-methodology-personalization` (Sprint 17): "o coach editou o que a IA sugeriu" vs. "o coach adicionou algo que a IA não previu". Um treino adicionado e depois editado via `coach-edit-planned-workout` teria ambos `true`.

### D5 — Resposta 201 com DTO completo

O endpoint retorna `TreinoPlanejadoOutputDto` do treino recém-criado. O frontend pode atualizar o estado local de forma otimista ou fazer re-fetch do plano (opção preferida para simplicidade).

### D6 — Validações no service, não em Bean Validation

- `dataTreino ∈ [semanaInicio, semanaFim]`: requer leitura do plano — não pode ser feita por annotation.
- `reviewStatus = AGUARDANDO_REVISAO`: estado de domínio — validado pelo service antes de persistir.
- `tipoTreino` como enum: conversão tentativa no service → `DomainRuleViolationException` se não reconhecido.

### D7 — Conversão Integer → Duration para TssCalculatorService e duracaoMin

`TreinoBase.duracaoMin` é `Duration` (`nullable=false`). O DTO recebe `Integer duracaoMin` (minutos). O service converte via `Duration.ofMinutes(duracaoMin)` antes de chamar `TssCalculatorService.calcularTssEstimado(Duration, Integer)`. Quando `duracaoMin` é `null` no payload, o service aplica `Duration.ZERO` (constraint NOT NULL exige default).

### D8 — Reutilizar mapeamento DayOfWeek → DiaSemana

O mapeamento já existe duplicado em `TreinoServiceImpl` e `StravaActivityServiceImpl`. Extrair para método estático em `DiaSemanaUtils` (ou inner method do service) em vez de reimplementar.

### D9 — Carregar PlanoSemanal com atleta e assessoria via JOIN FETCH

O `@PrePersist` de `TreinoPlanejado` deriva `atleta` e `tenantId` do `planoSemanal`. Se `planoSemanal.atleta` e `planoSemanal.assessoria` são LAZY e não estiverem carregados na sessão JPA, o `@PrePersist` silencia ou lança `LazyInitializationException`. A query de busca do plano deve usar JOIN FETCH:
```java
@Query("SELECT p FROM PlanoSemanal p JOIN FETCH p.atleta JOIN FETCH p.assessoria WHERE p.id = :id AND p.assessoria.id = :tenantId")
```

### D10 — Aviso de double-day no frontend

Quando `dataTreino` selecionado já tem `N` treinos no plano (verificação local no dialog contra a lista de treinos carregados), exibir alert MUI `severity="warning"` abaixo do Select de data:
> "Já existe N treino(s) nesta data. Double-day é permitido — confirme se é intencional."

Sem bloqueio de submissão.

### D11 — Seção de etapas colapsada no dialog

Para manter o caso comum (treino simples, sem etapas) rápido e sem atrito, a seção de etapas aparece colapsada por default. Um botão "Adicionar etapas" expande a lista. A seção pode ser recolhida e as etapas descartadas antes de salvar.

## Modelo de dados

```
TreinoPlanejado (existente, alterado)
  + adicionado_pelo_coach  BOOLEAN NOT NULL DEFAULT FALSE   ← V41
  
EtapaTreino (existente, sem alteração)
  ordem, tipoEtapa, descricaoEtapa, duracaoMin, distanciaKm, fcAlvoEtapa, repeticoes
```

## Fluxo de criação

```
POST /coach/planos/{planoId}/treinos
  │
  ├── PlanoSemanal.findByIdAndTenant(planoId, tenantId)  → 404 se não encontrado
  ├── plano.reviewStatus == AGUARDANDO_REVISAO?          → 422 se não
  ├── dataTreino ∈ [semanaInicio, semanaFim]?            → 422 se fora
  ├── diaSemana = mapDayOfWeek(dataTreino)
  ├── new TreinoPlanejado(input, plano, atleta, tenant)
  │     adicionadoPeloCoach = true
  │     statusTreino = PENDENTE
  │     fonteDados = MANUAL
  ├── if (etapas != null) → save TreinoPlanejado first, then save etapas (ordem = index+1)
  ├── if (duracaoMin != null && tssPlanejado == null)
  │     tssPlanejado = TssCalculatorService.calcularTssEstimado(duracaoMin, rpe)
  └── return TreinoPlanejadoOutputDto (201 Created)
```

## Interface do TreinoAddDialog

```
┌─────────────────────────────────────────────┐
│ Adicionar treino                         [X] │
├─────────────────────────────────────────────┤
│ Tipo de treino *    [Select ▼]               │
│ Data do treino *    [Select: seg/ter/...▼]   │
│ Distância (km)      [TextField numérico]     │
│ Duração (min)       [TextField numérico]     │
│ Zona alvo           [TextField]              │
│ RPE esperado        [Slider 1──────10]       │
│ TSS (opcional)      [TextField numérico]     │
│ Observações         [TextField multiline]    │
├─────────────────────────────────────────────┤
│ ▶ Etapas (opcional)                [+Add]   │
│   ┌────────────────────────────────────────┐ │
│   │ Tipo    Descrição  Dur  Dist  FC  [×]  │ │
│   └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│              [Cancelar]    [Salvar treino]   │
└─────────────────────────────────────────────┘
```

"Data do treino" é um Select populado com os dias da semana disponíveis no intervalo do plano (semanaInicio..semanaFim), exibidos como "Seg 30/06", "Ter 01/07", etc.
