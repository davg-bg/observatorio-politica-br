-- =============================================================================
-- Observatório da Política Brasileira — Executivo federal
-- Migration: 0006_executivo
-- =============================================================================
-- Tabela de ministros + view para Medidas Provisórias (reutilizando proposicoes
-- com siglaTipo='MPV'). Decretos ficam para follow-up (requer INLABS).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ministros (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orgao_sigla         TEXT NOT NULL,         -- "MF", "MJSP", etc.
    orgao_nome          TEXT NOT NULL,         -- "Ministério da Fazenda"
    nome                TEXT NOT NULL,
    cpf                 TEXT,
    partido_sigla       TEXT,
    foto_url            TEXT,
    site_oficial        TEXT,
    data_inicio_gestao  DATE,
    data_fim_gestao     DATE,                  -- NULL = em exercício
    biografia_url       TEXT,
    em_exercicio        BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Chave natural: um ministro por órgão por período
    CONSTRAINT ministros_unique UNIQUE (orgao_sigla, nome, data_inicio_gestao)
);

DROP TRIGGER IF EXISTS trg_ministros_updated ON ministros;
CREATE TRIGGER trg_ministros_updated
    BEFORE UPDATE ON ministros
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_ministros_em_exercicio
    ON ministros (em_exercicio);
CREATE INDEX IF NOT EXISTS idx_ministros_orgao
    ON ministros (orgao_sigla);


-- -----------------------------------------------------------------------------
-- View: Medidas Provisórias em tramitação (reutiliza proposicoes)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_medidas_provisorias AS
SELECT
    p.id,
    p.casa,
    p.source_id,
    p.sigla_tipo,
    p.numero,
    p.ano,
    p.ementa,
    p.data_apresentacao,
    p.data_ultima_tramitacao,
    p.descricao_situacao,
    p.sigla_orgao_atual,
    p.arquivada,
    p.nome_autor_principal,
    p.url_inteiro_teor,
    -- Data limite de vigência: MP vale por 60 dias + 60 prorrogáveis = 120 dias
    (p.data_apresentacao + INTERVAL '120 days')::date AS data_vigencia_estimada,
    -- Classifica no estado atual
    CASE
        WHEN p.arquivada THEN 'arquivada'
        WHEN p.descricao_situacao ILIKE '%vigência encerrada%' THEN 'caducou'
        WHEN p.descricao_situacao ILIKE '%transformad%' THEN 'convertida_em_lei'
        WHEN p.data_apresentacao + INTERVAL '120 days' < NOW() THEN 'possivel_caduca'
        ELSE 'em_tramitacao'
    END AS status_resumido
FROM proposicoes p
WHERE p.sigla_tipo IN ('MPV', 'MP');

COMMENT ON VIEW v_medidas_provisorias IS
'Medidas Provisórias — reusa a tabela proposicoes filtrando siglaTipo. Status derivado da data_apresentacao (60+60 dias).';


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0006_executivo')
ON CONFLICT (version) DO NOTHING;

COMMIT;
