-- =============================================================================
-- Observatório da Política Brasileira — Detecção de proposições engavetadas
-- Migration: 0005_engavetados
-- =============================================================================
-- Uma proposição é considerada "engavetada" quando:
--   • não está arquivada,
--   • não tramita há >= 180 dias (data_ultima_tramitacao),
--   • foi apresentada há pelo menos 1 ano (filtra PLs novos naturalmente lentos).
--
-- A view é materializada e refrescada a cada ETL diário.
-- =============================================================================

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS v_engavetados CASCADE;
CREATE MATERIALIZED VIEW v_engavetados AS
SELECT
    p.id                               AS proposicao_id,
    p.casa                             AS casa,
    p.source_id                        AS source_id,
    p.sigla_tipo                       AS sigla_tipo,
    p.numero                           AS numero,
    p.ano                              AS ano,
    p.ementa                           AS ementa,
    p.descricao_situacao               AS descricao_situacao,
    p.sigla_orgao_atual                AS sigla_orgao_atual,
    p.data_apresentacao                AS data_apresentacao,
    p.data_ultima_tramitacao           AS data_ultima_tramitacao,
    GREATEST(
        0,
        EXTRACT(day FROM NOW() - p.data_ultima_tramitacao)::int
    )                                  AS dias_sem_tramitacao,
    p.nome_autor_principal             AS nome_autor_principal,
    -- Lista de temas como array (vazia se não houver)
    COALESCE(
        (
            SELECT ARRAY_AGG(t.nome ORDER BY t.nome)
              FROM proposicoes_temas pt
              JOIN temas t ON t.id = pt.tema_id
             WHERE pt.proposicao_id = p.id
        ),
        ARRAY[]::text[]
    )                                  AS temas
FROM proposicoes p
WHERE p.arquivada = FALSE
  AND p.data_ultima_tramitacao IS NOT NULL
  AND p.data_ultima_tramitacao < NOW() - INTERVAL '180 days'
  AND p.data_apresentacao IS NOT NULL
  AND p.data_apresentacao < NOW() - INTERVAL '365 days';

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_engavetados_pk
    ON v_engavetados (proposicao_id);
CREATE INDEX IF NOT EXISTS idx_v_engavetados_dias
    ON v_engavetados (dias_sem_tramitacao DESC);
CREATE INDEX IF NOT EXISTS idx_v_engavetados_casa_ano
    ON v_engavetados (casa, ano DESC);
CREATE INDEX IF NOT EXISTS idx_v_engavetados_temas_gin
    ON v_engavetados USING gin (temas);

COMMENT ON MATERIALIZED VIEW v_engavetados IS
'PLs/PECs/MPVs sem movimentação há 180+ dias e não arquivados. Refrescar após ETL diário.';


-- Função de refresh
CREATE OR REPLACE FUNCTION refresh_engavetados()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_engavetados;
END;
$$ LANGUAGE plpgsql;


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0005_engavetados')
ON CONFLICT (version) DO NOTHING;

COMMIT;
