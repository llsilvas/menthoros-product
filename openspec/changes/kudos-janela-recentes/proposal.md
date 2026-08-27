**Tamanho:** XS · **Trilha:** Fast

## Why

"Kudos recentes" na Home do atleta hoje é limitado por contagem (`LIMIT 10`, mais recentes
primeiro), não por tempo — `KudosRepository.findTop10ByAtletaIdAndTenantIdOrderByCreatedAtDesc`.
Um atleta que recebe poucos kudos pode ver um reconhecimento de meses atrás ainda marcado como
"recente" na tela, até que 10 mais novos o empurrem para fora.

**Por que isso importa para o treinador.** Kudos são o gesto de reconhecimento do coach —
o produto os expõe como sinal "recente" para reforçar o momento certo. Quando esse sinal fica
preso (um kudo antigo ocupando o lugar de um novo, ou parecendo atual quando não é), o
reconhecimento perde o timing que o motivou, e a seção passa a mentir sobre "agora" — o oposto do
efeito que o coach quis produzir ao dar o kudo.

## What Changes

Só `apps/menthoros-backend`. `KudosRepository` troca o `LIMIT 10` por uma janela de tempo:
`WHERE k.createdAt >= :desde`, sem limite de contagem. `KudosServiceImpl.listarRecentes` calcula
`desde = Instant.now(clock).minus(7, ChronoUnit.DAYS)` — a classe já injeta `Clock` (usado hoje em
`existsByAtletaIdAndCoachIdAndMotivoAndData`), nenhuma configuração nova.

Contrato inalterado (`List<KudosRecenteOutputDto>`); o front não muda —
`KudosCard.tsx` já corta para os 3 primeiros e já retorna `null` quando a lista vem vazia (linha
22), então uma janela mais curta só faz a seção sumir mais cedo, comportamento que já existe.

**Janela escolhida: 7 dias**, alinhada ao ciclo semanal que já organiza o resto da experiência do
atleta (plano da semana, aderência, "Sua semana" na Home) — decisão de produto validada com o
founder antes desta change.

## Non-Goals

- Não persiste dispensa de banners (`CalibrationBanner`/`WeekClosedBanner`) — investigado na
  mesma conversa, é um problema diferente (já documentado como follow-up no código,
  `AthleteHomePage.tsx:71`), fora do escopo aqui.
- Não adiciona paginação nem "ver todos os kudos" — fora do pedido original.
- Não muda a regra de deduplicação de kudos (`existsByAtletaIdAndCoachIdAndMotivoAndData`).

## Critérios de aceite

1. Given um kudo criado há 6 dias, When `GET` (via `listarRecentes`), Then ele aparece no
   resultado.
2. Given um kudo criado há 8 dias, When `GET`, Then ele **não** aparece no resultado.
3. Given um kudo criado exatamente há 7 dias (limite), Then aparece — a janela é `>=`, inclusiva.
4. Given nenhum kudo nos últimos 7 dias, When `GET`, Then a lista vem vazia (`[]`), e o
   `KudosCard` do front continua se auto-ocultando (comportamento existente, sem mudança de
   código no front).
5. Isolamento de tenant preservado — a query já filtra por `tenantId`, esta change não altera
   esse filtro.

## Métrica de sucesso

Não há métrica numérica nova a instrumentar — é uma correção de UX (o "recente" volta a
significar recente). Sinal qualitativo: nenhum kudo com mais de 7 dias aparece na Home em smoke
manual pós-deploy.

## Open Questions & Assumptions

- **Resolvido com o founder:** janela de 7 dias, alinhada ao ciclo semanal do produto (alternativa
  considerada: 14 dias, descartada por enquanto — revisitar se o padrão real de uso mostrar
  coaches dando kudos com pouca frequência e a seção sumindo demais).
- **Premissa:** `Kudos.createdAt` é `Instant` (confirmado no código) — o cálculo de `desde` usa
  `Instant.now(clock).minus(7, ChronoUnit.DAYS)`, não `LocalDate`.
- **Premissa:** sem coach algum enviando kudos em volume alto o suficiente para a query sem
  `LIMIT` retornar uma lista grande — o cenário real (kudos são manuais, um por vez) não pede um
  teto de segurança; se isso mudar, é ajuste trivial de adicionar um `LIMIT` de volta.
