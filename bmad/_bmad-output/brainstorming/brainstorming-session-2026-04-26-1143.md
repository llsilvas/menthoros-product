---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Strava Integration - feature /strava-integration no backend Menthoros'
session_goals: 'Explorar ideias novas, pontos cegos, riscos não mapeados e oportunidades de valor além do openspec existente'
selected_approach: 'user-selected'
techniques_used: ['Transferência de Atributos']
ideas_generated: 40
context_file: 'menthoros/openspec/changes/strava-integration'
session_active: false
workflow_completed: true
continuation_date: '2026-04-26'
---

# Brainstorming Session Results

**Facilitador:** Leandro Silva
**Data:** 2026-04-26 11:43

---

## Session Overview

**Tópico:** Feature `/strava-integration` no backend Menthoros (Spring Boot 3.5.4 / Java 21)
**Goals:** Explorar ideias novas, pontos cegos, riscos não mapeados e oportunidades de valor que essa integração pode trazer além do que já está documentado no openspec

### Contexto Carregado

O openspec existente em `menthoros/openspec/changes/strava-integration` já cobre:
- Fluxo OAuth2 completo (authorize → callback → token → refresh)
- Entidade `IntegracaoExterna` extensível para múltiplas plataformas
- Sincronização de atividades → `TreinoRealizado` com deduplicação
- Importação de laps → `EtapaRealizada`
- Webhooks em tempo real (create/update/delete)
- Decisões de design: D1–D7 (tabela separada, WebClient, async webhook, dedup, inferência de TipoTreino, SufferScore cross-check, multi-tenancy)
- Riscos mapeados: tokens em texto plano, rate limit Strava, webhook sem assinatura verificável, scope `activity:read_all` amplo

---

## Seleção de Técnicas

**Abordagem:** Técnicas Selecionadas pelo Usuário — Categoria: Pensamento Estruturado

**Técnica Principal:**
- **Transferência de Atributos:** Empresta atributos de soluções bem-sucedidas em domínios não relacionados para aprimorar o design da integração Strava. A sessão evoluiu organicamente para cobrir experiência de integração, dashboard do treinador, aderência de atletas, oportunidades de negócio e evolução de IA.

---

## Inventário Completo de Ideias

### Tema 1 — Integração Transparente
*Como fazer a sync Strava "simplesmente funcionar" sem fricção visível*

**[Atributo #1]**: Renovação de Token Silenciosa com Fallback Gracioso
_Concept_: O sistema renova tokens proativamente antes de expirar, sem notificar o atleta. Se falhar, agenda retry em background com backoff exponencial — e só notifica o usuário quando o problema persiste por mais de X horas.
_Novelty_: O openspec mapeia o fluxo de refresh, mas não aborda a experiência de falha do ponto de vista do atleta. A maioria das integrações só pensa no happy path.

**[Atributo #2]**: Camada de Tradução Versionada
_Concept_: Em vez de adaptar diretamente no serviço de sync, criar uma camada de mapeamento explícita e versionada — `StravaActivityMapper v1`, `v2` — que pode ser atualizada quando o Strava muda seu modelo sem tocar na lógica de domínio.
_Novelty_: O openspec não menciona versionamento do mapeamento. O Strava já quebrou APIs antes — isso protege o domínio do Menthoros de mudanças externas.

**[Atributo #3]**: Armazenamento do Payload Original
_Concept_: Salvar o JSON bruto da atividade Strava junto com o `TreinoRealizado`, permitindo re-processar com regras de mapeamento atualizadas sem precisar buscar do Strava novamente.
_Novelty_: Se a inferência de `TipoTreino` melhorar amanhã, os dados históricos se beneficiam automaticamente — sem depender da API externa para reprocessar.

**[Atributo #4]**: Score de Confiança do Mapeamento
_Concept_: Cada `TreinoRealizado` importado recebe um `confiancaMapeamento` (0–100) indicando o quanto a inferência foi direta vs. estimada. Atleta e treinador sabem quando confiar cegamente e quando revisar.
_Novelty_: O openspec faz inferência de TipoTreino mas não expõe a incerteza desse processo. Uma corrida classificada errada como ciclismo pode arruinar o plano inteiro.

**[Atributo #5]**: Modelo de Importação Tolerante a Nulos
_Concept_: Tornar `fcMedia`, `fcMax` e `paceMedia` nullable para treinos com `fonteDados = STRAVA`, e adaptar o cálculo de TSS para operar em modo degradado quando dados de FC não estão disponíveis.
_Novelty_: O openspec não endereça essa incompatibilidade de schema. Sem isso, todo atleta sem monitor cardíaco teria a importação silenciosamente bloqueada. _(Nota: mitigado pelo perfil do usuário alvo — atletas em assessoria com smartwatch — mas vale manter como salvaguarda.)_

**[Atributo #6]**: Perfil de Completude por Importação
_Concept_: Cada `TreinoRealizado` importado recebe um `camposDisponiveis` (bitmask ou enum set) indicando quais métricas vieram preenchidas do Strava. A UI e o LLM adaptam seus comportamentos baseados nesse perfil.
_Novelty_: Evita que análises do LLM e cálculo de TSS operem com dados imputados silenciosamente.

**[Atributo #7]**: Estratégia de TSS por Fonte de Dados
_Concept_: Quando FC não está disponível, o sistema automaticamente elege `PACE` como método de cálculo de TSS em vez de `FC`, e registra isso em `metodoCalculoTss`. O campo já existe — falta a lógica de eleição automática.
_Novelty_: O campo `metodoCalculoTss` já existe no modelo mas é preenchido manualmente hoje. Automatizar isso para o contexto Strava elimina uma adaptação manual.

---

### Tema 2 — Aproveitamento de Dados Ricos do Smartwatch
*Extrair valor de tudo que o relógio entrega além do básico*

**[Atributo #8]**: Variabilidade de FC como Sinal de Qualidade de Treino
_Concept_: Smartwatches registram FC ponto a ponto via Strava Streams API. A variabilidade de FC durante o treino é um indicador de execução — um intervalado bem feito tem picos e vales nítidos; um mal executado tem FC elevada o tempo todo.
_Novelty_: O openspec importa `average_heartrate` e `max_heartrate`, mas ignora os streams de FC. A diferença entre "fez o treino" e "fez o treino certo" está na curva — não na média.

**[Atributo #9]**: HRV Pós-Treino como Dado de Recuperação
_Concept_: Alguns relógios Garmin e Polar exportam HRV para o Strava. Cruzar o HRV da manhã seguinte com o `TreinoRealizado` do dia anterior fecha o loop de recuperação — o LLM teria dados reais para embasar recomendações de carga.
_Novelty_: O openspec não menciona HRV. É o dado mais valioso que um atleta com smartwatch moderno possui — e está sendo desperdiçado.

**[Atributo #10]**: Cadência como Detector de TipoTreino
_Concept_: Cadência média + variação de cadência é um sinal forte de tipo de treino. Usar cadência junto com pace e FC para inferir `TipoTreino` tornaria a classificação muito mais precisa que apenas pace ou FC isolados.
_Novelty_: O openspec menciona inferência de TipoTreino (D5) mas não especifica os sinais usados. Cadência já vem no payload Strava e está mapeada em `TreinoRealizado` — mas fica subutilizada na inferência.

---

### Tema 3 — Loop Coach-Atleta via LLM
*Fechar o ciclo de feedback automaticamente, sem depender do treinador olhar tudo*

**[Atributo #11]**: Alerta Proativo de Desvio de Carga
_Concept_: Quando uma atividade Strava é sincronizada, o LLM compara automaticamente o TSS realizado vs. planejado, a FC de execução vs. zona esperada, e a cadência vs. perfil histórico — e gera um alerta estruturado para o treinador caso algum desvio significativo seja detectado.
_Novelty_: O openspec faz sync e persiste dados, mas não fecha o loop com o treinador. A integração hoje é passiva — o treinador ainda precisa olhar para perceber que algo mudou.

**[Atributo #12]**: Contexto Acumulado de Semana em Andamento
_Concept_: A cada nova atividade Strava sincronizada, o LLM recalcula o estado da semana atual — carga acumulada, TSB projetado para o fim da semana, aderência ao plano — e atualiza um "painel de semana" em tempo real.
_Novelty_: O openspec trata cada atividade isoladamente. O valor do LLM está no padrão acumulado — não no treino individual.

**[Atributo #13]**: Pergunta Gerada Automaticamente para o Atleta
_Concept_: Após sincronizar uma atividade que desviou do planejado, o LLM gera uma pergunta contextualizada para o atleta. A resposta alimenta o modelo de contexto do atleta para análises futuras.
_Novelty_: O campo `feedbackAtleta` existe mas é preenchido voluntariamente. Transformar isso em pergunta dirigida aumenta a qualidade do dado qualitativo — e fecha o loop sem depender da disciplina do atleta.

---

### Tema 4 — Dashboard do Treinador
*Tornar o dashboard tão relevante que o treinador queira abrir todo dia*

**[Atributo #14]**: Headline Diária Gerada pelo LLM
_Concept_: Todo dia o sistema gera uma frase de abertura do dashboard baseada nos dados do dia anterior. O treinador abre o dashboard porque a headline já diz se há algo para fazer ou não.
_Novelty_: A maioria dos dashboards exige que o treinador interprete os dados. Uma headline contextualizada inverte isso — o LLM já fez a leitura, o treinador só decide se age.

**[Atributo #15]**: Fila de Decisões Pendentes
_Concept_: O dashboard não mostra dados — mostra **decisões**. Cada atividade Strava sincronizada que gerou desvio vira um card de decisão: "Ajustar treino de quinta?" com contexto resumido.
_Novelty_: Transforma o treinador de analista em curador — reduz o tempo de revisão de 20 minutos para 3 minutos por dia.

**[Atributo #16]**: Semáforo de Atletas por Risco
_Concept_: O dashboard abre com todos os atletas listados por status — verde (na linha), amarelo (atenção), vermelho (intervenção necessária). O status é calculado pelo LLM cruzando dados Strava da semana com o plano.
_Novelty_: Escalabilidade para o treinador que gerencia 20-50 atletas. Sem isso, ele precisa revisar cada atleta individualmente — inviável no dia a dia.

**[Atributo #17]**: Linha do Tempo de Fadiga Projetada
_Concept_: Com base nas atividades Strava da semana corrente, o LLM projeta a curva de TSB até o dia da próxima prova do atleta. Se a curva indica overtraining, o dashboard sinaliza agora — não na véspera.
_Novelty_: O TSB já é calculado no Menthoros de forma retrospectiva. Usar os dados Strava para projeção futura transforma o dashboard de espelho em janela.

**[Atributo #18]**: Comparação Semana vs. Semana com Narrativa
_Concept_: O LLM gera um parágrafo curto comparando a semana atual com a mesma semana do ciclo anterior — não só números, mas interpretação em linguagem natural.
_Novelty_: Comparações históricas existem em todo app de treino. A diferença é a narrativa contextualizada que elimina a necessidade de o treinador interpretar os números.

**[Atributo #19]**: Detecção de Padrão de Evasão
_Concept_: O LLM aprende o padrão individual de cada atleta e detecta sinais precoces de abandono — treinos encurtados progressivamente, pace caindo sem justificativa fisiológica, atividades registradas mas sem lap data.
_Novelty_: Nenhum app de treino detecta evasão iminente — eles só registram quando o atleta já foi. O Menthoros pode intervir quando ainda há tempo.

**[Atributo #20]**: Visão de Grupo — Carga Coletiva da Assessoria
_Concept_: O dashboard mostra a distribuição de carga de toda a assessoria — quantos atletas estão em pico de carga, quantos em taper, quantos em recuperação.
_Novelty_: Apps de coaching mostram atleta por atleta. Uma visão agregada trata o treinador como gestor de portfólio — que é exatamente o que ele é.

---

### Tema 5 — Aderência dos Atletas
*Tornar aderência uma métrica objetiva e gerenciável, não autodeclarada*

**[Atributo #21]**: Score de Aderência Multidimensional
_Concept_: Em vez de um binário fez/não fez, o LLM calcula um score de aderência com três dimensões independentes — **temporal** (fez no dia planejado?), **volumétrica** (completou a distância/duração?), e **qualitativa** (executou nas zonas corretas?).
_Novelty_: Sem essa granularidade, o treinador não sabe se o problema é disciplina, disponibilidade de tempo ou incompreensão do estímulo.

**[Atributo #22]**: Ranking de Aderência da Assessoria
_Concept_: O dashboard mostra todos os atletas ordenados por score de aderência da semana — quem está 100%, quem está em queda, quem sumiu.
_Novelty_: Trata a aderência como métrica de gestão, não só de análise individual. Inviável de rastrear manualmente com 30+ atletas.

**[Atributo #23]**: Aderência ao Longo do Macrociclo
_Concept_: Gráfico de tendência de aderência individual semana a semana. O LLM identifica padrões — atleta que adere bem nas primeiras 4 semanas e cai na 5ª sempre.
_Novelty_: Aderência pontual é dado; aderência como padrão ao longo do tempo é inteligência.

**[Atributo #24]**: Diferença entre Não Fez e Não Registrou
_Concept_: O sistema detecta se a ausência de atividade Strava é porque o atleta não treinou ou porque treinou mas não sincronizou — cruzando padrão histórico de sync com a ausência.
_Novelty_: Trata a ausência de dado como dado. A maioria dos sistemas simplesmente ignora o que não chegou — o Menthoros questiona o porquê.

---

### Tema 6 — Negócio: Aquisição
*Usar o Strava como canal de crescimento*

**[Negócio #25]**: Strava como Canal de Aquisição de Atletas
_Concept_: O processo de onboarding é simplesmente "conecte seu Strava". Zero fricção de entrada de dados — a vida de treino do atleta já está lá. O primeiro momento de valor acontece antes de terminar o cadastro.
_Novelty_: A maioria das plataformas pede que o atleta preencha histórico, zonas, métricas. O Strava já tem tudo isso.

**[Negócio #29]**: Clube Strava como Vitrine da Assessoria
_Concept_: A assessoria cria um Clube no Strava. O Menthoros monitora as atividades dos membros e identifica atletas sem assessoria profissional pelo padrão de treino irregular — gerando uma lista de leads qualificados.
_Novelty_: Inverte o funil de vendas — em vez de o atleta procurar a assessoria, a assessoria encontra atletas prontos para evoluir.

**[Negócio #30]**: Onboarding por Histórico Strava
_Concept_: No momento do cadastro, o LLM analisa os últimos 90 dias de atividade Strava para gerar automaticamente o perfil inicial do atleta. O primeiro plano já é personalizado antes da primeira conversa com o treinador.
_Novelty_: O atleta sente valor imediato antes de pagar qualquer coisa.

---

### Tema 7 — Negócio: Retenção
*Criar valor que torna a saída cara para atletas e assessorias*

**[Negócio #26]**: Precificação Baseada em Volume de Atletas Conectados
_Concept_: O modelo de pricing da assessoria atrelado ao número de atletas com Strava ativo e sincronizando — não ao número de atletas cadastrados. Alinha o incentivo do Menthoros com o sucesso real da assessoria.
_Novelty_: Diferencia o Menthoros de plataformas que cobram por seat independente de uso.

**[Negócio #28]**: Relatório de Progresso como Ferramenta de Retenção
_Concept_: Mensalmente, o sistema gera um relatório personalizado para o atleta narrado pelo LLM em linguagem acessível. O atleta recebe isso do treinador — que fica bem na foto.
_Novelty_: Transforma o Menthoros em ferramenta de marketing do treinador.

**[Negócio #31]**: Memória de Longo Prazo do Atleta
_Concept_: O Menthoros acumula anos de dados Strava interpretados pelo LLM. O switching cost não é burocrático — é cognitivo. Nenhum concorrente vai conhecer aquele atleta como o Menthoros conhece.
_Novelty_: Dados brutos o atleta pode exportar de qualquer lugar. Interpretação contextualizada ao longo de anos é insubstituível.

**[Negócio #32]**: Celebração Automática de Marcos
_Concept_: O LLM detecta marcos significativos nas atividades Strava — primeiro longão acima de 30km, melhor pace histórico em 5km, 100ª atividade na assessoria — e gera uma mensagem de celebração que o treinador envia ao atleta.
_Novelty_: Aumenta o vínculo emocional atleta-treinador usando dados objetivos como gatilho.

---

### Tema 8 — Negócio: Diferenciação Competitiva
*O que impede um concorrente de copiar o Menthoros*

**[Negócio #27]**: Benchmark Anônimo entre Assessorias
_Concept_: Com dados agregados de múltiplas assessorias, o LLM gera benchmarks anônimos — "atletas na sua faixa de pace, em assessorias similares, têm TSB médio de X nessa fase do macrociclo."
_Novelty_: Nenhuma plataforma de coaching oferece inteligência de mercado para o treinador.

**[Negócio #33]**: LLM Treinado no Vocabulário do Treinador
_Concept_: Com o tempo, o LLM aprende o estilo de comunicação e as preferências de prescrição de cada treinador. As sugestões refletem a filosofia do treinador, não uma fórmula genérica. O produto fica mais valioso quanto mais é usado.
_Novelty_: Concorrentes oferecem IA genérica. O Menthoros oferece IA que amplifica a inteligência específica de cada treinador.

**[Negócio #34]**: Portabilidade Zero para o Concorrente
_Concept_: O valor do Menthoros não está nos dados brutos do Strava — mas no grafo de decisões do LLM construído sobre esses dados: por que o treinador ajustou o plano, qual foi o impacto, o que o LLM aprendeu. Esse contexto não é exportável.
_Novelty_: A maioria das plataformas SaaS tem switching cost baixo. O Menthoros cria um ativo que cresce com o uso e que nenhum concorrente consegue replicar.

---

### Tema 9 — Arquitetura Resiliente
*Mitigar rate limits e garantir operação sustentável em multi-tenancy*

**[Técnico #35]**: Webhook-First com Fila de Prioridade
_Concept_: Eventos Strava chegam via webhook e entram numa fila priorizada — atividades de atletas com prova próxima ou desvio de carga recente têm prioridade sobre syncs rotineiros.
_Novelty_: O openspec define webhook mas não define priorização. Sem fila de prioridade, um atleta recreativo consome a mesma cota que um atleta em semana de taper antes de uma maratona.

**[Técnico #36]**: Análise LLM Assíncrona e Condicional
_Concept_: Nem toda atividade Strava sincronizada dispara uma chamada LLM. O sistema avalia primeiro regras leves — desvio de TSS acima de X%, FC fora da zona por mais de Y minutos — e só chama o LLM quando há sinal real.
_Novelty_: Reduz o consumo de tokens do LLM em 60-80% nos dias normais. O LLM é caro e lento — reservá-lo para quando há sinal real é arquitetura, não otimização prematura.

**[Técnico #37]**: Cache de Contexto do Atleta para o LLM
_Concept_: O contexto completo de cada atleta é pré-computado e cacheado após cada sync. Quando o LLM é chamado, recebe contexto pronto. Habilita prompt caching nativo da Anthropic/OpenAI.
_Novelty_: O Menthoros já usa Caffeine para cache de dados. Estender isso para contexto LLM pré-montado é o passo natural — e o pgvector existente serve como memória de longo prazo.

---

### Tema 10 — Evolução da Inteligência Artificial
*Roadmap de IA: do today ao modelo proprietário*

**[IA #38]**: Estágio 1 — RAG sobre Decisões Históricas do Treinador
_Concept_: Cada ajuste de plano feito pelo treinador é armazenado como embedding no pgvector junto com o contexto que motivou a decisão. Quando o LLM gera uma sugestão nova, recupera decisões similares do passado como exemplos.
_Novelty_: O pgvector já está no stack. Este estágio não requer modelo novo — só disciplina de armazenar cada decisão como dado treinável. É o investimento que viabiliza os estágios seguintes.

**[IA #39]**: Estágio 2 — Fine-tuning por Treinador
_Concept_: Com 6-12 meses de decisões armazenadas, fine-tuning de um modelo base (GPT-4o Mini ou Claude Haiku) com os pares decisão-contexto de cada treinador. Resultado: modelo leve e personalizado que custa centavos por chamada.
_Novelty_: Fine-tuning em GPT-4o Mini custa ~$3/M tokens de treino. Um corpus de 500 decisões de um treinador é suficiente para personalização mensurável.

**[IA #40]**: Estágio 3 — Modelo Proprietário Menthoros
_Concept_: Com dados anonimizados de centenas de treinadores e milhares de atletas, treinar um modelo base no domínio específico de coaching de corrida — periodização, TSS, zonas de FC, linguagem de assessoria brasileira.
_Novelty_: A base de dados do Menthoros — cruzamento de plano planejado × realizado × feedback × resultado de prova — é um ativo que nenhuma OpenAI ou Anthropic tem. Um modelo nesse domínio superaria GPT-4o genérico com menos tokens e custo menor.

---

## Organização e Priorização

### Priorização para MVP (foco em entrega rápida)

**MVP — Entregar Agora**
*O mínimo que torna a integração confiável e entrega o diferencial LLM visível*

| # | Ideia | Por quê é MVP |
|---|-------|---------------|
| **#1** | Renovação de Token Silenciosa | Fundação obrigatória — sem isso a sync quebra silenciosamente |
| **#7** | Estratégia de TSS por Fonte de Dados | TSS errado invalida toda análise do LLM |
| **#35** | Webhook-First com Fila de Prioridade | Controla rate limit desde o dia 1 — sem isso o multi-tenancy escala mal |
| **#36** | Análise LLM Assíncrona e Condicional | Controla custo de LLM — sem isso cada sync dispara uma chamada cara |
| **#11** | Alerta Proativo de Desvio de Carga | Diferencial visível — o treinador vê valor imediato na primeira semana |
| **#16** | Semáforo de Atletas por Risco | Interface simples, alto impacto — o treinador sabe em 5 segundos o que fazer |

**Resultado esperado do MVP:** sync confiável + custo controlado + primeiro momento de valor LLM visível para o treinador.

---

**Pós-MVP — Próximo Ciclo**
*Consolidam o diferencial depois que o básico está rodando*

| # | Ideia | Valor |
|---|-------|-------|
| **#21** | Score de Aderência Multidimensional | Transforma aderência em dado objetivo — complementa o semáforo |
| **#12** | Contexto Acumulado de Semana em Andamento | Eleva a análise de treino isolado para visão de semana |
| **#14** | Headline Diária Gerada pelo LLM | Torna o dashboard magnético — hábito diário do treinador |
| **#37** | Cache de Contexto do Atleta para o LLM | Reduz custo e latência conforme a base de atletas cresce |
| **#38** | RAG sobre Decisões Históricas do Treinador | Primeiro passo para IA personalizada — começa a acumular o ativo |

---

**Roadmap — Longo Prazo**

| Tema | Ideias | Horizonte |
|------|--------|-----------|
| Dashboard completo | #15, #17, #18, #19, #20, #22, #23, #24 | 3–6 meses |
| Negócio / Crescimento | #25, #27, #28, #29, #30, #31, #32 | 6–12 meses |
| Evolução IA | #39 Fine-tuning, #40 Modelo próprio | 12–24 meses |
| Smartwatch avançado | #8 HRV, #9 Streams de FC, #10 Cadência | Pós-MVP estável |

---

### Simplificações para o MVP

Três riscos de escopo que podem atrasar o MVP:

1. **Streams API do Strava** — dados ponto a ponto de FC e cadência são ricos mas complexos. MVP usa só os campos agregados do payload padrão da atividade.
2. **Inferência de TipoTreino (D5)** — começar com mapeamento simples por `sport_type` + limiar de pace. Refinar depois com cadência e FC.
3. **Webhook de delete/update** — MVP prioriza `create`. Delete e update tratados como backlog imediato.

---

## Narrativa da Sessão

A sessão partiu da pergunta "o que faz uma integração *simplesmente funcionar*" e evoluiu organicamente por três camadas de profundidade crescente:

**Camada 1 — Confiabilidade:** A integração precisa ser invisível. Token renewal silencioso, payload original armazenado, mapeamento versionado e tolerante — o atleta nunca deve saber que a integração existe.

**Camada 2 — Inteligência:** O diferencial do Menthoros não é o Strava — é o LLM olhando para os dados de forma dinâmica. O treinador não gerencia dados; gerencia decisões. O dashboard precisa ser magnético o suficiente para virar hábito diário.

**Camada 3 — Negócio:** A integração Strava não é só uma feature — é uma alavanca de aquisição (onboarding instantâneo), retenção (memória insubstituível) e diferenciação (IA que aprende a filosofia de cada treinador). O modelo proprietário Menthoros é o horizonte natural desse ativo acumulado.

**Breakthroughs da sessão:**
- A ausência de dado também é dado (#24)
- O switching cost real é cognitivo, não burocrático (#31, #34)
- O LLM é um amplificador da inteligência do treinador — não um substituto (#33)
- Dados brutos são commodities; interpretação acumulada ao longo do tempo é o fosso competitivo real

---

## Próximos Passos Recomendados no Workflow BMad

1. **Atualizar o openspec** da feature `strava-integration` incorporando as ideias do MVP (#1, #7, #35, #36, #11, #16) como novos requisitos ou refinamentos das decisões D1–D7 existentes
2. **Criar PRD** formalizando o escopo do MVP com foco em multi-tenancy + Strava
3. **Criar/atualizar Arquitetura** contemplando a fila de prioridade, análise LLM condicional e cache de contexto
4. **Sprint Planning** com as histórias derivadas das 6 ideias do MVP

