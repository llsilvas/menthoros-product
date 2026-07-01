# PRD — Próxima Feature Prioritária: Tool Calling para Prescrição com Dados sob Demanda

| Campo | Valor |
|---|---|
| **Projeto** | Menthoros |
| **Feature sugerida** | `add-llm-tool-use` — Tool Calling para prescrição com dados sob demanda |
| **Status** | Draft resumido |
| **Base de decisão** | `/workspace/PROJECT.md` e `/workspace/WORKSPACE.md` |
| **Data de referência** | 01/07/2026 |

---

## 1. Decisão de prioridade

A próxima feature mais importante para o Menthoros deve ser **`add-llm-tool-use`**, isto é, permitir que o motor de IA use ferramentas internas para buscar dados sob demanda durante a geração de sugestões de treino.

Motivo: o projeto já possui a jornada coach-in-the-loop v1 funcional — identidade, home do coach, dados reais via log manual, fila de atenção, sugestão explicável de IA, aprovação de plano e drilldown do atleta. O próximo gargalo estratégico é sair do **prompt monolítico** e criar uma base técnica mais confiável para as próximas capacidades de IA, especialmente geração em lote e RAG.

Os bloqueios restantes do go-live de waitlist — DNS, e-mail real, logo e foto — são importantes para lançamento, mas são ajustes operacionais/branding, não uma feature de produto com impacto estrutural na proposta central do Menthoros.

---

## 2. Problema

Hoje, a IA depende de um contexto previamente montado e enviado em um prompt grande. Isso limita:

- a precisão da prescrição quando faltam dados relevantes do atleta;
- a rastreabilidade de quais dados foram usados na sugestão;
- a evolução para RAG e metodologia de treino fundamentada;
- a escalabilidade para geração em lote;
- a confiança do coach ao revisar recomendações da IA.

Para otimizar a rotina do coach, a IA precisa consultar dados específicos no momento certo, em vez de depender apenas de um pacote fixo de contexto.

---

## 3. Persona principal

**Coach de corrida** que revisa sugestões da IA antes de enviá-las ao atleta.

Necessidades principais:

- entender por que a IA sugeriu determinado treino;
- confiar que a sugestão considerou dados relevantes e atuais;
- reduzir tempo de análise sem perder controle;
- manter autoridade final sobre aprovação, edição ou rejeição do plano.

---

## 4. Hipótese

Se a IA puder buscar dados internos sob demanda por meio de ferramentas controladas, então as sugestões de treino serão mais contextualizadas, explicáveis e úteis para o coach, reduzindo retrabalho e criando a fundação para batch generation e RAG.

---

## 5. Objetivo de negócio

Aumentar a qualidade e a confiabilidade das sugestões de treino assistidas por IA, preservando o modelo **coach-in-the-loop** e preparando o produto para escalar a prescrição inteligente sem automatizar o coach para fora do processo.

---

## 6. MVP

### Dentro do escopo

- Criar uma camada de **tool calling interno** para o serviço de IA.
- Disponibilizar ferramentas seguras para consulta de dados necessários à prescrição, por exemplo:
  - perfil do atleta;
  - histórico recente de treinos/logs manuais;
  - zonas de FC por limiar;
  - provas/objetivos cadastrados;
  - contexto de atenção ou risco já existente.
- Registrar quais ferramentas foram chamadas e quais tipos de dados influenciaram a sugestão.
- Exibir no fluxo do coach uma explicação simples do contexto usado pela IA.
- Manter aprovação explícita do coach antes de qualquer plano chegar ao atleta.
- Garantir isolamento multi-tenant e respeito ao `tenant_id` do usuário autenticado.

### Fora do escopo

- RAG com base vetorial/PgVectorStore.
- Personalização profunda por metodologia do coach.
- Geração em lote de planos.
- Integrações Strava, que seguem deferidas por restrição/legalidade.
- Envio automático de plano ao atleta sem ação deliberada do coach.

---

## 7. Fluxo principal

1. O coach abre uma sugestão ou solicita geração/revisão de plano para um atleta.
2. O sistema aciona o motor de IA.
3. A IA identifica quais informações são necessárias para formular a sugestão.
4. A IA chama ferramentas internas permitidas para buscar dados específicos.
5. O backend valida autorização, tenant e escopo de cada chamada.
6. A IA gera uma sugestão de treino com justificativa.
7. O coach vê a sugestão, os principais dados considerados e a explicação.
8. O coach aprova, edita ou rejeita.
9. Apenas após a ação do coach o plano pode seguir para o atleta.

---

## 8. Regras de negócio

- AI output nunca deve ser exposto diretamente ao atleta sem aprovação do coach.
- Toda chamada de ferramenta deve respeitar autenticação, autorização e isolamento por tenant.
- A IA só pode acessar ferramentas explicitamente registradas e permitidas.
- A resposta final deve ser explicável para o coach em linguagem simples.
- Falha em uma ferramenta não deve gerar sugestão enganosa; o sistema deve degradar com transparência ou bloquear a geração quando o dado for indispensável.
- Dados de Strava não devem ser usados neste MVP.

---

## 9. Histórias de usuário

- Como coach, quero que a IA consulte dados recentes do atleta automaticamente para que a sugestão de treino reflita o estado atual dele.
- Como coach, quero ver quais informações principais foram consideradas para confiar melhor na recomendação.
- Como coach, quero continuar podendo aprovar, editar ou rejeitar toda sugestão antes que ela chegue ao atleta.
- Como sistema, quero limitar as ferramentas disponíveis à IA para reduzir risco de acesso indevido ou comportamento não controlado.
- Como produto, quero substituir progressivamente o prompt monolítico por uma arquitetura mais modular para habilitar RAG e geração em lote no futuro.

---

## 10. Critérios de aceite

- Dado um coach autenticado, quando a IA gerar uma sugestão, então ela só poderá consultar dados pertencentes ao tenant autorizado.
- Dado um atleta com histórico recente, quando a sugestão for gerada, então a IA deverá poder buscar esse histórico via ferramenta interna em vez de depender apenas do prompt inicial.
- Dada uma sugestão gerada, quando o coach visualizar a recomendação, então o sistema deverá apresentar uma explicação dos principais dados considerados.
- Dada uma falha em ferramenta crítica, quando a IA não tiver dados mínimos para prescrição, então o sistema deverá informar limitação em vez de inventar contexto.
- Dada uma sugestão pronta, quando nenhum coach aprovar ou editar, então nada deverá ser enviado ao atleta.
- Dado o MVP concluído, a arquitetura deve estar preparada para evoluir para `coach-batch-plan-generation` e `rag-tool-calling-prescription-engine`.

---

## 11. Métricas de sucesso

| Métrica | Baseline | Meta inicial |
|---|---:|---:|
| % de sugestões com contexto rastreável de dados usados | A medir | >= 90% |
| Tempo médio do coach para decidir sobre uma sugestão | A medir | -20% |
| Taxa de sugestões editadas por falta de contexto | A medir | -25% |
| Falhas de geração por ausência de dados obrigatórios tratadas com transparência | A medir | 100% |
| Incidentes de vazamento cross-tenant | 0 | 0 |

---

## 12. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| IA chamar ferramentas desnecessárias ou caras | Médio | allowlist, limites, observabilidade e testes de comportamento |
| Vazamento de dados entre tenants | Alto | validação obrigatória por tenant em cada ferramenta |
| Explicação excessivamente técnica para o coach | Médio | camada de resumo em PT-BR focada em decisão |
| Dependência excessiva da IA na decisão | Alto | manter aprovação/edição/rejeição explícita do coach |
| Escopo crescer para RAG antes da base estar estável | Médio | limitar MVP a tool calling e rastreabilidade básica |

---

## 13. ROI resumido

| Dimensão | Score | Justificativa |
|---|---:|---|
| Alinhamento com North Star | 5/5 | Melhora diretamente a decisão e produtividade do coach |
| Desbloqueio de roadmap | 5/5 | Pré-requisito natural para batch generation e RAG |
| Valor percebido pelo coach | 4/5 | Sugestões mais confiáveis e explicáveis reduzem retrabalho |
| Esforço relativo | 3/5 | Exige backend/IA/observabilidade, mas aproveita jornada v1 existente |
| Risco | 3/5 | Riscos controláveis com allowlist, tenant isolation e logs |

**Prioridade recomendada:** Alta.

---

## 14. Próximos passos

1. Formalizar o OpenSpec de `add-llm-tool-use` se ainda não estiver detalhado.
2. Definir a primeira lista de ferramentas permitidas para prescrição.
3. Mapear dados mínimos necessários para gerar uma sugestão segura.
4. Desenhar contrato de auditoria: ferramenta chamada, atleta, tenant, motivo e resultado resumido.
5. Implementar em backend primeiro, com testes de isolamento multi-tenant.
6. Atualizar frontend para mostrar ao coach o contexto usado na sugestão.
7. Validar com cenários reais de treino antes de avançar para geração em lote ou RAG.

---

*Documento vivo — resumido e sujeito a revisão quando os artefatos canônicos de OpenSpec estiverem disponíveis no workspace.*
