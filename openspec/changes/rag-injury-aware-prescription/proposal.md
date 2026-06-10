## Why

O atleta tem campos de lesão (`Atleta.temLesao`, `descricaoLesao`, `dataUltimaLesao`) já consumidos por skills determinísticas: `IntervaladoElegibilidadeSkill` **bloqueia** intervalado com lesão ativa, `RecoveryCargaSkill` ajusta carga. Mas hoje a lesão só **degrada ou bloqueia** — o sistema não sabe **o que prescrever no lugar**, nem **por quê**, nem **quais sessões são contraindicadas** para aquela lesão específica.

Resultado: para atletas lesionados, o plano gerado é genérico-conservador (ou só "regenerativo"), sem fundamentação de retorno-ao-corrida (return-to-run), sem distinguir uma tendinite de aquiles de uma fascite plantar, e sem alertar sinais de bandeira-vermelha que exigem encaminhamento profissional.

**Meta:** quando o atleta tem lesão ativa, recuperar conhecimento revisado de medicina esportiva (protocolos de retorno, sessões contraindicadas por tipo de lesão, sinais de alerta) e usá-lo para (a) **enriquecer** a prescrição alternativa e sua justificativa, (b) **filtrar** sessões contraindicadas, e (c) **escalar** sinais de bandeira-vermelha ao coach — mantendo as decisões de bloqueio nas skills determinísticas (não delegar segurança ao LLM).

Depende de `rag-tool-calling-prescription-engine` (infra RAG/KB) e integra com `add-recommendation-explainability` (citações) e `add-coach-attention-queue` (escalonamento).

## What Changes

**RAG — domínio de lesão na KB:**
- Estender a base de conhecimento universal com `domain = lesao`: protocolos de return-to-run, sessões contraindicadas por tipo de lesão, sinais de bandeira-vermelha — corpus **curado por profissional** (não auto-ingestão da web)

**Recuperação consciente de lesão:**
- `InjuryContextRetriever` que monta a query a partir de `descricaoLesao` + região corporal + fase, recupera chunks `domain=lesao` e extrai a lista de **tipos de sessão contraindicados**

**Integração na geração e na guarda:**
- Quando `temLesao = true`, injetar contexto de lesão no prompt de geração (com citação) e alimentar `TrainingPrescriptionGuardSkill` com os tipos contraindicados para filtrar sessões geradas
- Detecção de bandeira-vermelha → disclaimer obrigatório "procurar profissional" + item na fila de atenção do coach (`add-coach-attention-queue`)

**Invariante de segurança:**
- A decisão determinística de **bloquear/substituir** (skills existentes) permanece a fonte de verdade; o RAG **enriquece**, nunca **sobrepõe** uma regra de segurança

## Capabilities

### New Capabilities

- `injury-knowledge-rag`: base vetorial curada de protocolos de lesão e contraindicações, recuperada na geração de planos de atletas com lesão ativa; provê contexto de prescrição, filtro de sessões contraindicadas e detecção de bandeira-vermelha

### Modified Capabilities

- `plano-semanal-generation`: para atletas com lesão ativa, a geração injeta contexto de lesão recuperado e respeita o filtro de contraindicação
- `training-prescription-guard`: passa a vetar sessões contraindicadas pela lesão recuperadas via RAG, além das regras estruturais atuais

## Impact

**Vetor:**
- Novos documentos com `domain = lesao` na `vector_store` (escopo **global**, curado) — mesma infra da change base; sem dado de atleta
- Estrutura `src/main/resources/knowledge-base/lesao/`

**Código:**
- Novo `InjuryContextRetriever` em `com.menthoros.ai.rag`
- `TrainingPrescriptionGuardSkill` estendida para aceitar tipos de sessão contraindicados
- Integração de bandeira-vermelha com a fila de atenção do coach

**APIs:** nenhum endpoint novo para coach/atleta

**Custo:** marginal — recuperação extra apenas para atletas com `temLesao = true`

## Riscos e mitigações

- **Conselho clínico incorreto/dano ao atleta** (impacto Crítico): corpus **curado e revisado por profissional**; o sistema **não diagnostica**; disclaimer obrigatório; decisão de bloqueio permanece determinística (skills), não no LLM
- **`descricaoLesao` é texto livre e ambíguo** (impacto Alto): mapear para taxonomia de lesão por similaridade + região corporal; quando confiança baixa, ser conservador (regenerativo) e escalar ao coach em vez de inferir protocolo específico
- **RAG sobrepõe regra de segurança** (impacto Alto): invariante — RAG enriquece, skills determinísticas decidem bloqueio; teste garante que contexto RAG nunca reabilita uma sessão bloqueada por skill
- **Bandeira-vermelha ignorada** (impacto Médio): detecção dispara disclaimer + item na fila de atenção do coach, independentemente do plano gerado

## Referências

- OpenSpec `rag-tool-calling-prescription-engine` — fundação RAG/KB
- OpenSpec `add-coach-attention-queue` — escalonamento de bandeira-vermelha
- OpenSpec `add-recommendation-explainability` — citação de fontes clínicas
- Skills existentes: `IntervaladoElegibilidadeSkill`, `RecoveryCargaSkill`, `TrainingPrescriptionGuardSkill`
