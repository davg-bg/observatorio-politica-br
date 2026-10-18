-- =============================================================================
-- Observatório da Política Brasileira — Emendas parlamentares
-- Migration: 0004_emendas
-- =============================================================================
-- Dados do Portal da Transparência (CGU) sobre emendas parlamentares.
-- A API retorna o autor como texto livre (nome + partido-UF), então
-- `autor_livre` é a chave primária de autoria; `parlamentar_id` é
-- opcional, preenchido quando casa com um parlamentar no nosso banco.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS emendas (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Chave natural: código da emenda no SIOP (único entre todas as emendas)
    codigo_emenda       TEXT NOT NULL UNIQUE,
    numero_emenda       TEXT,
    ano                 INTEGER NOT NULL,
    tipo_emenda         TEXT,   -- "Individual", "Bancada", "Comissão", "Relator"

    -- Autoria
    autor_livre         TEXT NOT NULL,   -- "FULANO DA SILVA (PT/SP)" por ex.
    parlamentar_id      UUID REFERENCES parlamentares(id) ON DELETE SET NULL,

    -- Classificação orçamentária
    funcao              TEXT,
    subfuncao           TEXT,
    localidade_do_gasto TEXT,   -- nome do município + UF ou "Nacional"

    -- Execução financeira (valores em BRL)
    valor_empenhado     NUMERIC(14,2) DEFAULT 0,
    valor_liquidado     NUMERIC(14,2) DEFAULT 0,
    valor_pago          NUMERIC(14,2) DEFAULT 0,
    valor_resto_inscrito NUMERIC(14,2) DEFAULT 0,
    valor_resto_cancelado NUMERIC(14,2) DEFAULT 0,
    valor_resto_pago    NUMERIC(14,2) DEFAULT 0,

    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_emendas_updated ON emendas;
CREATE TRIGGER trg_emendas_updated
    BEFORE UPDATE ON emendas
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_emendas_ano         ON emendas (ano DESC);
CREATE INDEX IF NOT EXISTS idx_emendas_tipo        ON emendas (tipo_emenda);
CREATE INDEX IF NOT EXISTS idx_emendas_parlamentar ON emendas (parlamentar_id) WHERE parlamentar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emendas_autor_trgm  ON emendas USING gin (autor_livre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_emendas_valor_pago  ON emendas (valor_pago DESC);


-- -----------------------------------------------------------------------------
-- View materializada: ranking de parlamentares por valor executado
-- -----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS v_ranking_emendas_parlamentar CASCADE;
CREATE MATERIALIZED VIEW v_ranking_emendas_parlamentar AS
SELECT
    p.id                          AS parlamentar_id,
    p.nome                        AS parlamentar_nome,
    p.casa                        AS casa,
    pt.sigla                      AS partido_sigla,
    uf.sigla                      AS uf_sigla,
    e.ano                         AS ano,
    COUNT(*)                      AS num_emendas,
    SUM(e.valor_empenhado)        AS total_empenhado,
    SUM(e.valor_pago)             AS total_pago,
    SUM(e.valor_resto_pago)       AS total_resto_pago
FROM emendas e
JOIN parlamentares p ON p.id = e.parlamentar_id
LEFT JOIN partidos pt ON pt.id = p.partido_id
LEFT JOIN ufs uf ON uf.id = p.uf_id
GROUP BY p.id, p.nome, p.casa, pt.sigla, uf.sigla, e.ano;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_ranking_emendas_pk
    ON v_ranking_emendas_parlamentar (parlamentar_id, ano);
CREATE INDEX IF NOT EXISTS idx_v_ranking_emendas_ano_pago
    ON v_ranking_emendas_parlamentar (ano, total_pago DESC);


-- Função de refresh das views de emendas
CREATE OR REPLACE FUNCTION refresh_emendas_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_ranking_emendas_parlamentar;
END;
$$ LANGUAGE plpgsql;


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0004_emendas')
ON CONFLICT (version) DO NOTHING;

COMMIT;
