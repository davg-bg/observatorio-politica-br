-- =============================================================================
-- Observatório da Política Brasileira — STF
-- Migration: 0008_stf
-- =============================================================================
-- Composição atual do Supremo Tribunal Federal. Alimentada por lista curada
-- (etl/sources/stf/ministros_data.py) — scraping do portal do STF é frágil.
--
-- Em tasks posteriores, 0009 adiciona pautas de plenário e 0010 votos.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS stf_ministros (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome                TEXT NOT NULL,
    nome_completo       TEXT,
    data_nascimento     DATE,
    local_nascimento    TEXT,
    presidente_indicou  TEXT NOT NULL,         -- "Luiz Inácio Lula da Silva"
    partido_indicacao   TEXT,                   -- partido do presidente na indicação
    data_posse          DATE NOT NULL,
    data_aposentadoria  DATE,                   -- NULL = em exercício
    data_aposentadoria_compulsoria DATE,       -- 75 anos
    cargo_atual         TEXT,                   -- "presidente", "vice-presidente" ou NULL
    formacao_academica  TEXT,
    biografia_url       TEXT,
    foto_url            TEXT,
    em_exercicio        BOOLEAN NOT NULL DEFAULT TRUE,
    ordem_antiguidade   INTEGER,                -- 1 = mais antigo em exercício
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Chave natural: um ministro por posse (pode voltar depois? ok, trata como novo)
    CONSTRAINT stf_ministros_unique UNIQUE (nome, data_posse)
);

DROP TRIGGER IF EXISTS trg_stf_ministros_updated ON stf_ministros;
CREATE TRIGGER trg_stf_ministros_updated
    BEFORE UPDATE ON stf_ministros
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_stf_ministros_em_exercicio
    ON stf_ministros (em_exercicio);
CREATE INDEX IF NOT EXISTS idx_stf_ministros_antiguidade
    ON stf_ministros (ordem_antiguidade)
    WHERE em_exercicio = TRUE;

COMMENT ON TABLE stf_ministros IS
'Composição do STF (11 cadeiras). Alimentada por lista curada no ETL; data_aposentadoria_compulsoria = data_nascimento + 75 anos.';


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0008_stf')
ON CONFLICT (version) DO NOTHING;

COMMIT;
