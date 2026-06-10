## ADDED Requirements

### Requirement: Manter base de conhecimento de lesão curada e indexada

O sistema SHALL manter, na base de conhecimento universal, um domínio de lesão com protocolos de retorno-ao-corrida, contraindicações por tipo de lesão e sinais de bandeira-vermelha, curado por profissional de saúde.

#### Scenario: Documentos de lesão indexados com metadata clínico
- **WHEN** um documento de lesão for ingerido
- **THEN** o chunk SHALL conter metadata: `domain = lesao`, `language`, `source`, e quando aplicável `red_flag` e `tipos_contraindicados`
- **THEN** o conteúdo SHALL ser de escopo global (universal) e NÃO SHALL conter dados pessoais de atleta

#### Scenario: Curadoria obrigatória
- **WHEN** o corpus de lesão for preparado para ingestão
- **THEN** os documentos SHALL ter sido revisados por profissional de saúde antes da ingestão
- **THEN** o sistema NÃO SHALL ingerir conteúdo clínico não curado

### Requirement: Recuperar contexto de lesão na geração de planos de atletas lesionados

O sistema SHALL recuperar o contexto de lesão quando o atleta tiver lesão ativa e usá-lo para enriquecer a prescrição.

#### Scenario: Atleta com lesão ativa
- **WHEN** `gerarPlano(atletaId, semana)` for invocado e `atleta.temLesao == true`
- **THEN** o sistema SHALL montar a query a partir de `descricaoLesao` + região corporal + fase e recuperar chunks com `domain = lesao`
- **THEN** o sistema SHALL injetar os chunks recuperados no prompt de geração e citar as fontes na justificativa

#### Scenario: Atleta sem lesão
- **WHEN** `gerarPlano(atletaId, semana)` for invocado e `atleta.temLesao == false`
- **THEN** o sistema NÃO SHALL executar recuperação de contexto de lesão

#### Scenario: Lesão não mapeada (baixa confiança)
- **WHEN** nenhum chunk de lesão atingir o threshold de similaridade para a `descricaoLesao` informada
- **THEN** o sistema SHALL prescrever de forma conservadora (regenerativo/cross-training) sem inventar protocolo específico
- **THEN** o sistema SHALL escalar ao coach com nota "lesão não mapeada — revisar"

### Requirement: Vetar sessões contraindicadas pela lesão

O sistema SHALL impedir que o plano final contenha sessões contraindicadas para a lesão do atleta.

#### Scenario: Sessão contraindicada removida pela guarda
- **WHEN** o contexto de lesão indicar tipos de sessão contraindicados e o plano gerado contiver uma sessão desse tipo
- **THEN** o `TrainingPrescriptionGuardSkill` SHALL vetar/substituir a sessão antes de persistir

#### Scenario: Segurança permanece determinística
- **WHEN** uma skill determinística (`IntervaladoElegibilidadeSkill`, `RecoveryCargaSkill`) bloquear um tipo de sessão por lesão
- **THEN** nenhum contexto recuperado via RAG SHALL reabilitar essa sessão no plano final
- **THEN** a decisão de bloqueio SHALL permanecer na skill, não no LLM

### Requirement: Escalar sinais de bandeira-vermelha ao coach

O sistema SHALL detectar sinais de bandeira-vermelha e escalá-los, independentemente do plano gerado.

#### Scenario: Bandeira-vermelha detectada
- **WHEN** o contexto de lesão recuperado contiver chunk marcado como `red_flag`
- **THEN** o plano SHALL incluir disclaimer obrigatório recomendando avaliação de profissional de saúde
- **THEN** o sistema SHALL criar item na fila de atenção do coach com a descrição da lesão e o motivo

#### Scenario: Sem bandeira-vermelha
- **WHEN** nenhum chunk recuperado for `red_flag`
- **THEN** o sistema NÃO SHALL criar item de escalonamento por esse motivo
