-- =============================================================================
-- Observatório da Política Brasileira — Schema inicial
-- Migration: 0001_init
-- =============================================================================
-- Modelagem:
--   • Dados de referência: ufs, partidos, legislaturas (seeded)
--   • Dados ingeridos:     parlamentares, mandatos
--   • Observabilidade:     ingest_runs
--
-- Convenções:
--   • timestamps em timestamptz, nunca naive
--   • chaves naturais externas em (source, source_id) para idempotência
--   • boolean "em_exercicio" indica o estado atual (único verdadeiro por parlamentar)
--
-- Idempotente: tudo com `IF NOT EXISTS` para permitir reaplicar sem erro.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- busca textual por nome


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE casa_legislativa AS ENUM ('camara', 'senado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE regiao_brasil AS ENUM ('Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ingest_status AS ENUM ('running', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- -----------------------------------------------------------------------------
-- Função utilitária: atualiza automaticamente a coluna `atualizado_em`
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- Tabela: ufs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ufs (
    id          SERIAL PRIMARY KEY,
    sigla       CHAR(2) NOT NULL UNIQUE,
    nome        TEXT NOT NULL,
    regiao      regiao_brasil NOT NULL
);

COMMENT ON TABLE ufs IS 'Unidades da Federação (27: 26 estados + DF).';


-- -----------------------------------------------------------------------------
-- Tabela: partidos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partidos (
    id              SERIAL PRIMARY KEY,
    sigla           TEXT NOT NULL UNIQUE,
    nome            TEXT NOT NULL,
    numero          INTEGER UNIQUE,
    fundacao        DATE,
    site            TEXT,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_partidos_updated ON partidos;
CREATE TRIGGER trg_partidos_updated
    BEFORE UPDATE ON partidos
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

COMMENT ON TABLE partidos IS 'Partidos políticos reconhecidos pelo TSE.';


-- -----------------------------------------------------------------------------
-- Tabela: legislaturas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legislaturas (
    id          INTEGER PRIMARY KEY,  -- mesmo número usado pelas APIs oficiais (56, 57, ...)
    numero      INTEGER NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim    DATE NOT NULL,
    CONSTRAINT legislatura_coerente CHECK (data_fim > data_inicio)
);

COMMENT ON TABLE legislaturas IS 'Períodos legislativos (4 anos). Legislatura 57 = 2023–2027.';


-- -----------------------------------------------------------------------------
-- Tabela: parlamentares (unifica deputados e senadores)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parlamentares (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    casa                casa_legislativa NOT NULL,
    source              TEXT NOT NULL,     -- 'camara' ou 'senado' (igual a `casa`, mas explícito para joins com ingest_runs)
    source_id           TEXT NOT NULL,     -- id na API da origem
    nome                TEXT NOT NULL,
    nome_civil          TEXT,
    cpf                 TEXT,
    sexo                CHAR(1) CHECK (sexo IN ('M', 'F') OR sexo IS NULL),
    data_nascimento     DATE,
    uf_id               INTEGER REFERENCES ufs(id),
    partido_id          INTEGER REFERENCES partidos(id),
    foto_url            TEXT,
    email               TEXT,
    site                TEXT,
    redes               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {twitter, instagram, facebook, youtube, tiktok}
    biografia           TEXT,
    escolaridade        TEXT,
    profissao           TEXT,
    situacao            TEXT,
    em_exercicio        BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT parlamentares_unique_source UNIQUE (casa, source_id)
);

DROP TRIGGER IF EXISTS trg_parlamentares_updated ON parlamentares;
CREATE TRIGGER trg_parlamentares_updated
    BEFORE UPDATE ON parlamentares
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_parlamentares_casa_em_exercicio
    ON parlamentares (casa, em_exercicio);
CREATE INDEX IF NOT EXISTS idx_parlamentares_partido
    ON parlamentares (partido_id);
CREATE INDEX IF NOT EXISTS idx_parlamentares_uf
    ON parlamentares (uf_id);
CREATE INDEX IF NOT EXISTS idx_parlamentares_nome_trgm
    ON parlamentares USING gin (nome gin_trgm_ops);

COMMENT ON TABLE parlamentares IS 'Deputados e senadores (atuais e histórico). Chave natural: (casa, source_id).';


-- -----------------------------------------------------------------------------
-- Tabela: mandatos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandatos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parlamentar_id      UUID NOT NULL REFERENCES parlamentares(id) ON DELETE CASCADE,
    casa                casa_legislativa NOT NULL,
    legislatura_id      INTEGER NOT NULL REFERENCES legislaturas(id),
    partido_id          INTEGER REFERENCES partidos(id),
    uf_id               INTEGER REFERENCES ufs(id),
    tipo                TEXT,              -- 'Titular', 'Suplente', '1º Suplente', etc
    data_inicio         DATE NOT NULL,
    data_fim            DATE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mandatos_unique UNIQUE (parlamentar_id, legislatura_id, casa)
);

CREATE INDEX IF NOT EXISTS idx_mandatos_parlamentar ON mandatos (parlamentar_id);
CREATE INDEX IF NOT EXISTS idx_mandatos_legislatura ON mandatos (legislatura_id);

COMMENT ON TABLE mandatos IS 'Mandatos individuais por legislatura (um parlamentar pode ter vários ao longo do tempo).';


-- -----------------------------------------------------------------------------
-- Tabela: ingest_runs — já consumida pelo widget de status
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_runs (
    id          UUID PRIMARY KEY,
    source      TEXT NOT NULL,
    job         TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    status      ingest_status NOT NULL DEFAULT 'running',
    stats       JSONB NOT NULL DEFAULT '{}'::jsonb,
    error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_source_job_started
    ON ingest_runs (source, job, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_finished_at
    ON ingest_runs (finished_at DESC NULLS LAST);

COMMENT ON TABLE ingest_runs IS 'Histórico de execuções do ETL (uma linha por job rodado).';


-- -----------------------------------------------------------------------------
-- Tabela: schema_migrations — rastreia quais migrations foram aplicadas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- Seeds
-- =============================================================================

-- Seeds: UFs (27 unidades da federação, com região)
INSERT INTO ufs (sigla, nome, regiao) VALUES
    ('AC', 'Acre', 'Norte'),
    ('AL', 'Alagoas', 'Nordeste'),
    ('AP', 'Amapá', 'Norte'),
    ('AM', 'Amazonas', 'Norte'),
    ('BA', 'Bahia', 'Nordeste'),
    ('CE', 'Ceará', 'Nordeste'),
    ('DF', 'Distrito Federal', 'Centro-Oeste'),
    ('ES', 'Espírito Santo', 'Sudeste'),
    ('GO', 'Goiás', 'Centro-Oeste'),
    ('MA', 'Maranhão', 'Nordeste'),
    ('MT', 'Mato Grosso', 'Centro-Oeste'),
    ('MS', 'Mato Grosso do Sul', 'Centro-Oeste'),
    ('MG', 'Minas Gerais', 'Sudeste'),
    ('PA', 'Pará', 'Norte'),
    ('PB', 'Paraíba', 'Nordeste'),
    ('PR', 'Paraná', 'Sul'),
    ('PE', 'Pernambuco', 'Nordeste'),
    ('PI', 'Piauí', 'Nordeste'),
    ('RJ', 'Rio de Janeiro', 'Sudeste'),
    ('RN', 'Rio Grande do Norte', 'Nordeste'),
    ('RS', 'Rio Grande do Sul', 'Sul'),
    ('RO', 'Rondônia', 'Norte'),
    ('RR', 'Roraima', 'Norte'),
    ('SC', 'Santa Catarina', 'Sul'),
    ('SP', 'São Paulo', 'Sudeste'),
    ('SE', 'Sergipe', 'Nordeste'),
    ('TO', 'Tocantins', 'Norte')
ON CONFLICT (sigla) DO NOTHING;


-- Seeds: Legislaturas recentes
INSERT INTO legislaturas (id, numero, data_inicio, data_fim) VALUES
    (56, 56, '2019-02-01', '2023-01-31'),
    (57, 57, '2023-02-01', '2027-01-31'),
    (58, 58, '2027-02-01', '2031-01-31')
ON CONFLICT (id) DO NOTHING;


-- Seeds: Partidos (33 agremiações registradas no TSE em 2024/2025, principais ativos)
-- Lista baseada em partidos com representação no Congresso. Novos partidos ou
-- federações recém-formadas aparecem via ETL conforme a API retornar.
INSERT INTO partidos (sigla, nome, numero) VALUES
    ('PT', 'Partido dos Trabalhadores', 13),
    ('MDB', 'Movimento Democrático Brasileiro', 15),
    ('PSDB', 'Partido da Social Democracia Brasileira', 45),
    ('PP', 'Progressistas', 11),
    ('UNIÃO', 'União Brasil', 44),
    ('REPUBLICANOS', 'Republicanos', 10),
    ('PL', 'Partido Liberal', 22),
    ('PSB', 'Partido Socialista Brasileiro', 40),
    ('PDT', 'Partido Democrático Trabalhista', 12),
    ('PODE', 'Podemos', 20),
    ('SOLIDARIEDADE', 'Solidariedade', 77),
    ('PSOL', 'Partido Socialismo e Liberdade', 50),
    ('PCdoB', 'Partido Comunista do Brasil', 65),
    ('REDE', 'Rede Sustentabilidade', 18),
    ('CIDADANIA', 'Cidadania', 23),
    ('AVANTE', 'Avante', 70),
    ('PRD', 'Partido Renovação Democrática', 25),
    ('NOVO', 'Novo', 30),
    ('PV', 'Partido Verde', 43),
    ('AGIR', 'Agir', 36),
    ('PSD', 'Partido Social Democrático', 55),
    ('PATRIOTA', 'Patriota', 51),
    ('PMB', 'Partido da Mulher Brasileira', 35),
    ('PRTB', 'Partido Renovador Trabalhista Brasileiro', 28),
    ('UP', 'Unidade Popular', 80),
    ('DC', 'Democracia Cristã', 27),
    ('MOBILIZA', 'Mobiliza', 33),
    ('PCB', 'Partido Comunista Brasileiro', 21),
    ('PCO', 'Partido da Causa Operária', 29),
    ('PSTU', 'Partido Socialista dos Trabalhadores Unificado', 16)
ON CONFLICT (sigla) DO NOTHING;


-- Registra esta migration como aplicada
INSERT INTO schema_migrations (version) VALUES ('0001_init')
ON CONFLICT (version) DO NOTHING;

COMMIT;
