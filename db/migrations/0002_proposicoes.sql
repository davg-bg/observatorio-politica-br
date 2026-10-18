-- =============================================================================
-- Observatório da Política Brasileira — Schema de atividade legislativa
-- Migration: 0002_proposicoes
-- =============================================================================
-- Adiciona o modelo de proposições, tramitações, votações e votos individuais.
-- Base para Fases 2 (agenda, votações recentes), 3 (alinhamento, fidelidade)
-- e 4 (engavetados).
--
-- Convenções:
--   • Chaves naturais (source, source_id) para idempotência.
--   • Tipos de voto como TEXT livre normalizado pelo ETL (não enum rígido,
--     porque a Câmara ocasionalmente adiciona "Artigo 17", "LideraSim" etc).
--   • `arquivada` é derivada no ETL a partir de `descricao_situacao`.
--   • Partição por ano fica para quando o volume justificar.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Tabela: proposicoes
--
-- Uma proposição = PL, PEC, MPV, PDL, etc. Pode estar em tramitação ou arquivada.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposicoes (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    casa                    casa_legislativa NOT NULL,
    source                  TEXT NOT NULL,
    source_id               TEXT NOT NULL,

    -- Identificação legislativa (ex: "PL 1234/2024")
    sigla_tipo              TEXT NOT NULL,
    numero                  INTEGER NOT NULL,
    ano                     INTEGER NOT NULL,

    -- Conteúdo
    ementa                  TEXT NOT NULL,
    ementa_detalhada        TEXT,
    keywords                TEXT,

    -- Datas e situação
    data_apresentacao       DATE,
    data_ultima_tramitacao  TIMESTAMPTZ,
    sigla_orgao_atual       TEXT,
    descricao_situacao      TEXT,
    descricao_tramitacao    TEXT,
    arquivada               BOOLEAN NOT NULL DEFAULT FALSE,

    -- URLs oficiais
    uri                     TEXT,
    url_inteiro_teor        TEXT,

    -- Autor principal (string livre; a lista completa fica em proposicoes_autores)
    nome_autor_principal    TEXT,

    -- Timestamps
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT proposicoes_unique_source UNIQUE (casa, source_id)
);

DROP TRIGGER IF EXISTS trg_proposicoes_updated ON proposicoes;
CREATE TRIGGER trg_proposicoes_updated
    BEFORE UPDATE ON proposicoes
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_proposicoes_casa_ano
    ON proposicoes (casa, ano DESC);
CREATE INDEX IF NOT EXISTS idx_proposicoes_data_apresentacao
    ON proposicoes (data_apresentacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_proposicoes_ultima_tramitacao
    ON proposicoes (data_ultima_tramitacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_proposicoes_arquivada
    ON proposicoes (arquivada, data_ultima_tramitacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_proposicoes_sigla_tipo
    ON proposicoes (sigla_tipo);
CREATE INDEX IF NOT EXISTS idx_proposicoes_ementa_trgm
    ON proposicoes USING gin (ementa gin_trgm_ops);

COMMENT ON TABLE proposicoes IS 'PLs, PECs, MPVs, PDLs e outras proposições em tramitação ou arquivadas.';
COMMENT ON COLUMN proposicoes.arquivada IS 'True quando descricao_situacao começa com "Arquivada" ou código equivalente.';


-- -----------------------------------------------------------------------------
-- Tabela: temas (taxonomia da Câmara)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temas (
    id          INTEGER PRIMARY KEY,  -- ID vindo da API da Câmara
    nome        TEXT NOT NULL,
    uri         TEXT
);

COMMENT ON TABLE temas IS 'Taxonomia oficial de temas da Câmara (ex: Saúde, Economia).';


-- -----------------------------------------------------------------------------
-- Tabela associativa: proposicoes_temas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposicoes_temas (
    proposicao_id   UUID NOT NULL REFERENCES proposicoes(id) ON DELETE CASCADE,
    tema_id         INTEGER NOT NULL REFERENCES temas(id),
    relevancia      REAL,  -- 0..1, se a API retornar
    PRIMARY KEY (proposicao_id, tema_id)
);

CREATE INDEX IF NOT EXISTS idx_proposicoes_temas_tema
    ON proposicoes_temas (tema_id);


-- -----------------------------------------------------------------------------
-- Tabela associativa: proposicoes_autores
--
-- Autores podem ser parlamentares (parlamentar_id ponteiro) OU não-parlamentares
-- (nome_livre). Uma proposição tem múltiplos autores.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposicoes_autores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposicao_id   UUID NOT NULL REFERENCES proposicoes(id) ON DELETE CASCADE,
    parlamentar_id  UUID REFERENCES parlamentares(id),
    nome_livre      TEXT,   -- quando o autor não é um parlamentar atual (ex: comissão, STF, Executivo)
    tipo_autor      TEXT,   -- "Deputado", "Senador", "Órgão", "Comissão", etc
    ordem_assinatura INTEGER DEFAULT 1,
    CONSTRAINT autor_identificado CHECK (parlamentar_id IS NOT NULL OR nome_livre IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_proposicoes_autores_proposicao
    ON proposicoes_autores (proposicao_id);
CREATE INDEX IF NOT EXISTS idx_proposicoes_autores_parlamentar
    ON proposicoes_autores (parlamentar_id)
    WHERE parlamentar_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- Tabela: tramitacoes
--
-- Cada movimentação de uma proposição. A última dessas drives
-- `data_ultima_tramitacao` em proposicoes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tramitacoes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposicao_id   UUID NOT NULL REFERENCES proposicoes(id) ON DELETE CASCADE,
    sequencia       INTEGER NOT NULL,
    data            TIMESTAMPTZ NOT NULL,
    sigla_orgao     TEXT,
    descricao_tramitacao TEXT,
    descricao_situacao   TEXT,
    despacho        TEXT,
    url             TEXT,
    CONSTRAINT tramitacao_unique UNIQUE (proposicao_id, sequencia)
);

CREATE INDEX IF NOT EXISTS idx_tramitacoes_proposicao_data
    ON tramitacoes (proposicao_id, data DESC);


-- -----------------------------------------------------------------------------
-- Tabela: votacoes
--
-- Uma sessão de votação. Pode estar associada a uma proposição ou ser uma
-- votação procedural isolada (ex: requerimento de urgência).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votacoes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    casa                casa_legislativa NOT NULL,
    source              TEXT NOT NULL,
    source_id           TEXT NOT NULL,
    proposicao_id       UUID REFERENCES proposicoes(id),

    data_hora_registro  TIMESTAMPTZ NOT NULL,
    sigla_orgao         TEXT,
    descricao           TEXT NOT NULL,
    aprovacao           BOOLEAN,

    -- Contagens agregadas
    votos_sim           INTEGER DEFAULT 0,
    votos_nao           INTEGER DEFAULT 0,
    votos_abstencao     INTEGER DEFAULT 0,
    votos_outros        INTEGER DEFAULT 0,

    uri_evento          TEXT,
    uri                 TEXT,

    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT votacoes_unique_source UNIQUE (casa, source_id)
);

CREATE INDEX IF NOT EXISTS idx_votacoes_data_registro
    ON votacoes (data_hora_registro DESC);
CREATE INDEX IF NOT EXISTS idx_votacoes_proposicao
    ON votacoes (proposicao_id)
    WHERE proposicao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_votacoes_casa_data
    ON votacoes (casa, data_hora_registro DESC);

COMMENT ON TABLE votacoes IS 'Sessões de votação nominal registradas no plenário ou em comissões.';


-- -----------------------------------------------------------------------------
-- Tabela: votos
--
-- Voto individual de um parlamentar numa votação. Tipo de voto fica como
-- TEXT normalizado pelo ETL (valores canônicos: Sim, Não, Abstenção,
-- Obstrução, Artigo 17, Branco; demais caem em "Outro").
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    votacao_id      UUID NOT NULL REFERENCES votacoes(id) ON DELETE CASCADE,
    parlamentar_id  UUID NOT NULL REFERENCES parlamentares(id),
    tipo_voto       TEXT NOT NULL,

    -- Snapshot do contexto no momento do voto (parlamentar pode mudar de partido depois)
    partido_id_na_epoca INTEGER REFERENCES partidos(id),

    data_registro   TIMESTAMPTZ,
    CONSTRAINT votos_unique UNIQUE (votacao_id, parlamentar_id)
);

CREATE INDEX IF NOT EXISTS idx_votos_parlamentar
    ON votos (parlamentar_id);
CREATE INDEX IF NOT EXISTS idx_votos_votacao
    ON votos (votacao_id);
CREATE INDEX IF NOT EXISTS idx_votos_tipo
    ON votos (votacao_id, tipo_voto);
CREATE INDEX IF NOT EXISTS idx_votos_partido_epoca
    ON votos (votacao_id, partido_id_na_epoca)
    WHERE partido_id_na_epoca IS NOT NULL;

COMMENT ON COLUMN votos.partido_id_na_epoca IS 'Partido do parlamentar NO MOMENTO da votação (importante pra análise temporal — ele pode trocar de partido depois).';


-- -----------------------------------------------------------------------------
-- Tabela: orientacoes_partidarias
--
-- Orientação do líder do partido para uma dada votação. Permite calcular
-- fidelidade (voto do parlamentar vs. orientação do líder).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orientacoes_partidarias (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    votacao_id      UUID NOT NULL REFERENCES votacoes(id) ON DELETE CASCADE,
    partido_id      INTEGER NOT NULL REFERENCES partidos(id),
    orientacao      TEXT NOT NULL,  -- "Sim", "Não", "Liberado", "Obstrução", etc
    CONSTRAINT orientacao_unique UNIQUE (votacao_id, partido_id)
);

CREATE INDEX IF NOT EXISTS idx_orientacoes_votacao
    ON orientacoes_partidarias (votacao_id);


-- Registra esta migration como aplicada
INSERT INTO schema_migrations (version) VALUES ('0002_proposicoes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
