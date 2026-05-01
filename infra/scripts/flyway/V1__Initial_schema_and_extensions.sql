-- =====================================================================
-- V1: Schema inicial + extensões obrigatórias + core tables
-- =====================================================================
-- Consolida: V1 (Initial_schema), V4 (metadata), V5 (constants/elevation)
-- Cria tabelas base sem multi-tenancy (adicionado em V2)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;

-- ========================================
-- 1. ATLETA - Perfil completo com fisiologia
-- ========================================

CREATE TABLE IF NOT EXISTS tb_atleta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Identificação
    nome VARCHAR(100) NOT NULL,
    sobrenome VARCHAR(100),
    data_nascimento DATE,
    sexo VARCHAR(1) CHECK (sexo IS NULL OR sexo IN ('M', 'F', 'O')),
    email VARCHAR(255) UNIQUE,
    -- Perfil
    objetivo VARCHAR(500),
    nivel_experiencia VARCHAR(20) NOT NULL,
    dia_preferido_longo VARCHAR(20),
    -- Antropometria
    peso_kg DECIMAL(5,2) CHECK (peso_kg IS NULL OR (peso_kg > 0 AND peso_kg <= 300)),
    altura_cm DECIMAL(5,2) CHECK (altura_cm IS NULL OR (altura_cm >= 100 AND altura_cm <= 250)),
    -- Fisiologia (FC)
    fc_maxima INTEGER,
    fc_repouso INTEGER,
    fc_limiar INTEGER,
    data_ultimo_teste_fc DATE,
    -- Fisiologia (Pace/Velocidade)
    pace_limiar DECIMAL(5,2),
    velocidade_limiar DECIMAL(5,2),
    data_ultimo_teste_pace DATE,
    -- VO2max
    vo2max_estimado DECIMAL(5,2),
    -- Capacidades de treinamento
    distancia_maxima_longo INTEGER CHECK (distancia_maxima_longo IS NULL OR (distancia_maxima_longo >= 5 AND distancia_maxima_longo <= 100)),
    volume_semanal_max INTEGER CHECK (volume_semanal_max IS NULL OR (volume_semanal_max >= 10 AND volume_semanal_max <= 300)),
    -- Constantes de tempo adaptativas (V5)
    ctl_time_constant INTEGER,
    atl_time_constant INTEGER,
    -- Lesões
    tem_lesao BOOLEAN DEFAULT FALSE,
    descricao_lesao VARCHAR(1000),
    data_ultima_lesao DATE,
    historico_lesoes TEXT,
    -- Status
    ativo VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    -- Embeddings (pgvector)
    embedding vector(1536),
    -- Auditoria
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comentários para documentação
COMMENT ON TABLE tb_atleta IS 'Perfil completo do atleta com dados fisiológicos e capacidades de treinamento';
COMMENT ON COLUMN tb_atleta.ctl_time_constant IS 'Constante de tempo CTL personalizada (dias). NULL = usar valor padrão por nivel_experiencia';
COMMENT ON COLUMN tb_atleta.atl_time_constant IS 'Constante de tempo ATL personalizada (dias). NULL = usar valor padrão por nivel_experiencia';
COMMENT ON COLUMN tb_atleta.fc_maxima IS 'Frequência Cardíaca Máxima (bpm). NULL = calcular automaticamente (220 - idade)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_atleta_ativo ON tb_atleta(ativo);
CREATE INDEX IF NOT EXISTS idx_atleta_email ON tb_atleta(email);
CREATE INDEX IF NOT EXISTS idx_atleta_nivel_experiencia ON tb_atleta(nivel_experiencia);
CREATE INDEX IF NOT EXISTS idx_atleta_testes_desatualizados ON tb_atleta(data_ultimo_teste_fc, data_ultimo_teste_pace);
CREATE INDEX IF NOT EXISTS idx_atleta_custom_constants ON tb_atleta(ctl_time_constant, atl_time_constant) 
    WHERE ctl_time_constant IS NOT NULL OR atl_time_constant IS NOT NULL;

-- ========================================
-- 2. DIAS DISPONÍVEIS
-- ========================================

CREATE TABLE IF NOT EXISTS tb_dias_disponiveis (
    atleta_id UUID NOT NULL,
    dia VARCHAR(20) NOT NULL,
    PRIMARY KEY (atleta_id, dia),
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE
);

-- ========================================
-- 3. PROVA
-- ========================================

CREATE TABLE IF NOT EXISTS tb_prova (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL,
    nome VARCHAR(100) NOT NULL,
    tipo_prova VARCHAR(20) NOT NULL,
    data_prova DATE,
    -- Distância (consolidação de V22)
    distancia VARCHAR(50),
    distancia_km DECIMAL(8,2),
    -- Objetivos
    tempo_objetivo TIME,
    tempo_meta TIME,
    pace_objetivo DECIMAL(5,2),
    tsb_ideal_prova DOUBLE PRECISION,
    -- Status e resultado (V22)
    status_prova VARCHAR(20) NOT NULL DEFAULT 'PLANEJADA',
    foi_realizada BOOLEAN DEFAULT FALSE,
    tempo_realizado TIME,
    posicao_geral INTEGER,
    posicao_categoria INTEGER,
    tss_prova INTEGER,
    percepcao_esforco_prova INTEGER,
    feedback_prova TEXT,
    semanas_preparacao INTEGER,
    inicio_preparacao DATE,
    -- Auditoria
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prova_atleta ON tb_prova(atleta_id);
CREATE INDEX IF NOT EXISTS idx_prova_data ON tb_prova(data_prova);
CREATE INDEX IF NOT EXISTS idx_prova_status ON tb_prova(status_prova);

-- ========================================
-- 4. PLANO METADADOS
-- ========================================

CREATE TABLE IF NOT EXISTS tb_plano_metadados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL,
    contexto TEXT,
    embedding vector(1536),
    -- Status e recomendações (V4)
    status_geral VARCHAR(50),
    recomendacao_treino TEXT,
    fase_periodizacao VARCHAR(30),
    -- Métricas calculadas (V20)
    data_ultima_atualizacao DATE,
    ctl_atual DOUBLE PRECISION DEFAULT 0.0,
    atl_atual DOUBLE PRECISION DEFAULT 0.0,
    tsb_atual DOUBLE PRECISION DEFAULT 0.0,
    ramp_rate_atual DOUBLE PRECISION DEFAULT 0.0,
    volume_semanal_medio DECIMAL(10,2),
    volume_planejado DECIMAL(10,2),
    tss_semanal_medio INTEGER,
    treinos_por_semana_medio DOUBLE PRECISION,
    dias_consecutivos_treino INTEGER DEFAULT 0,
    dias_desde_ultimo_descanso INTEGER DEFAULT 0,
    semanas_progressao_continua INTEGER DEFAULT 0,
    -- Alertas (V20)
    alerta_sobrecarga BOOLEAN DEFAULT FALSE,
    alerta_ramp_alto BOOLEAN DEFAULT FALSE,
    alerta_dias_consecutivos BOOLEAN DEFAULT FALSE,
    alerta_necessita_descanso BOOLEAN DEFAULT FALSE,
    mensagem_alerta TEXT,
    -- Auditoria
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metadados_status_geral ON tb_plano_metadados(status_geral);
CREATE INDEX IF NOT EXISTS idx_metadados_fase_periodizacao ON tb_plano_metadados(fase_periodizacao);

-- ========================================
-- 5. PLANO TREINO
-- ========================================

CREATE TABLE IF NOT EXISTS tb_plano_treino (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL,
    prova_id UUID NOT NULL,
    contexto_id UUID,
    prova_alvo_id UUID,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT NOT NULL,
    data_inicio DATE NOT NULL,
    objetivo VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE,
    FOREIGN KEY (prova_id) REFERENCES tb_prova(id) ON DELETE CASCADE,
    FOREIGN KEY (contexto_id) REFERENCES tb_plano_metadados(id),
    FOREIGN KEY (prova_alvo_id) REFERENCES tb_prova(id)
);

CREATE INDEX IF NOT EXISTS idx_plano_treino_atleta ON tb_plano_treino(atleta_id);

-- ========================================
-- 6. PLANO SEMANAL (com relationship ManyToOne com PlanoMetaDados - V15)
-- ========================================

CREATE TABLE IF NOT EXISTS tb_plano_semanal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL,
    plano_treino_id UUID,
    plano_metadados_id UUID NOT NULL,
    semana INTEGER NOT NULL,
    semana_inicio DATE NOT NULL,
    semana_fim DATE NOT NULL,
    data_inicio DATE,
    data_fim DATE,
    -- Volume (V15)
    volume_planejado_km DECIMAL(10,3) NOT NULL DEFAULT 0,
    volume_realizado_km DECIMAL(10,3),
    volume_alvo_km DECIMAL(10,3),
    -- TSB (V15)
    tsb_inicio DECIMAL(10,3),
    tsb_fim DECIMAL(10,3),
    -- Status (V15)
    status VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO',
    objetivo_semana VARCHAR(500),
    versao BIGINT DEFAULT 0,
    observacoes TEXT,
    -- Auditoria
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE,
    FOREIGN KEY (plano_treino_id) REFERENCES tb_plano_treino(id) ON DELETE CASCADE,
    FOREIGN KEY (plano_metadados_id) REFERENCES tb_plano_metadados(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_plano_semanal_atleta ON tb_plano_semanal(atleta_id);
CREATE INDEX IF NOT EXISTS idx_plano_semanal_metadados ON tb_plano_semanal(plano_metadados_id);

-- ========================================
-- 7. TREINO PLANEJADO (consolidação V9, V11, V13, V22)
-- ========================================

CREATE TABLE IF NOT EXISTS tb_treino_planejado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL,
    plano_semanal_id UUID NOT NULL,
    -- Base (V9)
    tipo_treino VARCHAR(20) NOT NULL,
    dia_semana VARCHAR(20) NOT NULL,
    data_treino DATE,
    distancia_km DECIMAL(8,2),
    duracao_min INTERVAL,
    intensidade VARCHAR(20),
    descricao TEXT,
    zona_alvo VARCHAR(50),
    -- Elevação (V5)
    elevacao_ganho_metros INTEGER,
    elevacao_perda_metros INTEGER,
    -- TSS e planejamento (V22)
    tss_planejado INTEGER,
    intensidade_planejada DOUBLE PRECISION,
    observacao TEXT,
    percepcao_esforco_esperada INTEGER CHECK (percepcao_esforco_esperada IS NULL OR (percepcao_esforco_esperada >= 1 AND percepcao_esforco_esperada <= 10)),
    status_treino VARCHAR(50),
    justificativa_ia TEXT,
    -- Sincronização (V22)
    fonte_dados VARCHAR(50),
    url_externo VARCHAR(500),
    status_sincronizacao VARCHAR(50),
    sincronizado_em TIMESTAMP,
    ultima_tentativa_sincronizacao TIMESTAMP,
    tentativas_sincronizacao INTEGER DEFAULT 0,
    exportado_para TEXT,
    erro_sincronizacao TEXT,
    metadados_sincronizacao TEXT,
    -- External ID (V24)
    external_id VARCHAR(255),
    -- Auditoria (V13)
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP,
    criado_por VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE,
    FOREIGN KEY (plano_semanal_id) REFERENCES tb_plano_semanal(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_treino_planejado_atleta ON tb_treino_planejado(atleta_id);
CREATE INDEX IF NOT EXISTS idx_treino_planejado_data ON tb_treino_planejado(data_treino);

-- ========================================
-- 8. ETAPA TREINO
-- ========================================

CREATE TABLE IF NOT EXISTS tb_etapa_treino (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treino_planejado_id UUID NOT NULL,
    ordem INTEGER NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    distancia_metros INTEGER,
    duracao_segundos INTEGER,
    ritmo_segundos_por_km INTEGER,
    repeticoes INTEGER DEFAULT 1,
    descanso_segundos INTEGER DEFAULT 0,
    intensidade VARCHAR(20),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (treino_planejado_id) REFERENCES tb_treino_planejado(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_etapa_treino_ordem ON tb_etapa_treino(treino_planejado_id, ordem);

-- ========================================
-- 9. TREINO REALIZADO (consolidação V9, V10, V11, V13, V22, V25)
-- ========================================

CREATE TABLE IF NOT EXISTS tb_treino_realizado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL,
    -- Base (V9)
    tipo_treino VARCHAR(20) NOT NULL,
    dia_semana VARCHAR(20) NOT NULL,
    data_realizacao DATE NOT NULL,
    distancia_km DECIMAL(8,2),
    duracao_min INTERVAL,
    intensidade VARCHAR(20),
    descricao TEXT,
    zona_alvo VARCHAR(50),
    -- Elevação (V5, V10)
    elevacao_ganho_metros INTEGER,
    elevacao_perda_metros INTEGER,
    -- TSS e intensidade (V22)
    tss_calculado INTEGER,
    metodo_calculo_tss VARCHAR(50),
    velocidade_media DOUBLE PRECISION,
    pace_media INTERVAL,
    intensidade_real DOUBLE PRECISION,
    -- Esforço subjetivo
    percepcao_esforco INTEGER CHECK (percepcao_esforco IS NULL OR (percepcao_esforco >= 1 AND percepcao_esforco <= 10)),
    qualidade_sono_noite_anterior INTEGER,
    nivel_estresse INTEGER,
    -- Frequência cardíaca (V10)
    fc_media INTEGER,
    fc_maxima_treino INTEGER,
    fc_minima INTEGER,
    -- Potência e cadência (V10)
    potencia_media INTEGER,
    cadencia_media INTEGER,
    -- Feedback (V10)
    feedback_atleta TEXT,
    condicoes_climaticas VARCHAR(100),
    -- Status e sincronização (V22)
    status VARCHAR(50),
    fonte_dados VARCHAR(50),
    url_externo VARCHAR(500),
    status_sincronizacao VARCHAR(50),
    sincronizado_em TIMESTAMP,
    ultima_tentativa_sincronizacao TIMESTAMP,
    tentativas_sincronizacao INTEGER DEFAULT 0,
    exportado_para TEXT,
    erro_sincronizacao TEXT,
    metadados_sincronizacao TEXT,
    -- External ID com UNIQUE (V25)
    external_id VARCHAR(255) UNIQUE,
    -- Auditoria (V13)
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP,
    criado_por VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES tb_atleta(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_treino_realizado_atleta ON tb_treino_realizado(atleta_id);
CREATE INDEX IF NOT EXISTS idx_treino_realizado_data ON tb_treino_realizado(data_realizacao);
CREATE INDEX IF NOT EXISTS idx_treino_realizado_potencia ON tb_treino_realizado(potencia_media) WHERE potencia_media IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treino_realizado_cadencia ON tb_treino_realizado(cadencia_media) WHERE cadencia_media IS NOT NULL;

-- ========================================
-- 10. ETAPA REALIZADA (V16)
-- ========================================

CREATE TABLE IF NOT EXISTS tb_etapa_realizada (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treino_realizado_id UUID NOT NULL REFERENCES tb_treino_realizado(id) ON DELETE CASCADE,
    etapa_planejada_id UUID REFERENCES tb_etapa_treino(id) ON DELETE SET NULL,
    ordem INTEGER NOT NULL,
    tipo_etapa VARCHAR(50),
    descricao VARCHAR(500),
    duracao INTERVAL,
    distancia_km DECIMAL(10,3),
    fc_media INTEGER,
    fc_max INTEGER,
    pace_media INTERVAL,
    velocidade_media DECIMAL(5,2),
    percepcao_esforco INTEGER CHECK (percepcao_esforco IS NULL OR (percepcao_esforco BETWEEN 1 AND 10)),
    cadencia_media INTEGER,
    potencia_media INTEGER,
    observacao VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_etapa_realizada_treino ON tb_etapa_realizada(treino_realizado_id);
CREATE INDEX IF NOT EXISTS idx_etapa_realizada_ordem ON tb_etapa_realizada(treino_realizado_id, ordem);

-- ========================================
-- 11. MÉTRICAS DIÁRIAS (V19, com tenant_id em V2)
-- ========================================

CREATE TABLE IF NOT EXISTS tb_metricas_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    tss INTEGER NOT NULL DEFAULT 0,
    ctl DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    atl DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    tsb DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    ramp_rate DOUBLE PRECISION DEFAULT 0.0,
    fatigue_ratio DOUBLE PRECISION DEFAULT 0.0,
    forma_percentual DOUBLE PRECISION,
    treinos_realizados INTEGER DEFAULT 0,
    volume_km DECIMAL(6,2),
    foi_dia_descanso BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_metricas_diarias_atleta_data UNIQUE (atleta_id, data)
);

CREATE INDEX IF NOT EXISTS idx_metricas_diarias_atleta_data ON tb_metricas_diarias(atleta_id, data DESC);

-- ========================================
-- Finalização
-- ========================================

DO $$
BEGIN
    RAISE NOTICE '✅ V1 - Schema inicial criado com sucesso';
    RAISE NOTICE '   - Extensões: vector, uuid-ossp';
    RAISE NOTICE '   - 11 tabelas core criadas';
    RAISE NOTICE '   - Índices para performance adicionados';
END$$;