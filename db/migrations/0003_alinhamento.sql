-- =============================================================================
-- Observatório da Política Brasileira — Views de alinhamento partidário
-- Migration: 0003_alinhamento
-- =============================================================================
-- Views materializadas que calculam:
--   • v_coesao_partido         Índice de Rice por partido e janela temporal
--   • v_alinhamento_partidos   similaridade cosseno entre pares de partidos
--
-- Metodologia (documentada em /sobre):
--   • Rice = |Sim − Não| / (Sim + Não), por votação, média do partido na janela.
--     Varia de 0 (sempre dividido) a 1 (sempre unânime). Ignora
--     abstenções/outros no denominador. Só contabiliza votações com ≥ 5
--     parlamentares do partido presentes (filtra ruído de bancadas pequenas).
--
--   • Posição do partido numa votação = {+1 se maioria Sim; −1 se maioria Não;
--     0 se dividido ou abstenções majoritárias}. Vetor de posições × par de
--     partidos → similaridade cosseno (−1 oposição total, +1 alinhamento
--     total, 0 ortogonais). Só considera votações em que AMBOS os partidos
--     tomaram posição (≠ 0), senão o vetor zero inflaria o denominador.
--
-- Refresh: concurrent, chamado pelo ETL após cada ingestão de votações.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Função utilitária: lista das janelas suportadas.
-- Mantida como função pra adicionar/remover janelas sem recriar as views.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION alinhamento_janelas()
RETURNS TABLE (janela TEXT, dias INTEGER) AS $$
    SELECT * FROM (VALUES
        ('30d',   30),
        ('90d',   90),
        ('365d', 365)
    ) AS t(janela, dias);
$$ LANGUAGE SQL IMMUTABLE;


-- -----------------------------------------------------------------------------
-- View intermediária: posição de cada partido em cada votação.
--
-- Material: usamos uma CTE/VIEW NÃO materializada aqui pra que mudanças de
-- votos individuais se propaguem automaticamente nos refreshes das views
-- consolidadas abaixo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_posicao_partido_votacao AS
SELECT
    v.votacao_id,
    v.partido_id_na_epoca            AS partido_id,
    vote.data_hora_registro          AS data_votacao,
    COUNT(*) FILTER (WHERE v.tipo_voto = 'Sim')         AS sim,
    COUNT(*) FILTER (WHERE v.tipo_voto = 'Não')         AS nao,
    COUNT(*) FILTER (WHERE v.tipo_voto = 'Abstenção')   AS abstencao,
    COUNT(*)                                            AS total,
    CASE
        WHEN COUNT(*) FILTER (WHERE v.tipo_voto = 'Sim')
             > COUNT(*) FILTER (WHERE v.tipo_voto = 'Não') THEN 1
        WHEN COUNT(*) FILTER (WHERE v.tipo_voto = 'Não')
             > COUNT(*) FILTER (WHERE v.tipo_voto = 'Sim') THEN -1
        ELSE 0
    END AS posicao
FROM votos v
JOIN votacoes vote ON vote.id = v.votacao_id
WHERE v.partido_id_na_epoca IS NOT NULL
GROUP BY v.votacao_id, v.partido_id_na_epoca, vote.data_hora_registro;

COMMENT ON VIEW v_posicao_partido_votacao IS
'Agregação por (votação, partido): contagens e posição majoritária (+1/0/−1).';


-- -----------------------------------------------------------------------------
-- MVIEW: v_coesao_partido — Índice de Rice por partido × janela
-- -----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS v_coesao_partido CASCADE;
CREATE MATERIALIZED VIEW v_coesao_partido AS
SELECT
    p.id                                           AS partido_id,
    p.sigla                                        AS partido_sigla,
    j.janela                                       AS janela,
    j.dias                                         AS janela_dias,
    COUNT(*)                                       AS votacoes_consideradas,
    AVG(
        CASE
            WHEN (pos.sim + pos.nao) >= 5
            THEN ABS(pos.sim - pos.nao)::real / (pos.sim + pos.nao)
            ELSE NULL
        END
    )                                              AS rice_medio,
    SUM(pos.sim)                                   AS total_sim,
    SUM(pos.nao)                                   AS total_nao,
    SUM(pos.abstencao)                             AS total_abstencao
FROM partidos p
CROSS JOIN alinhamento_janelas() j
JOIN v_posicao_partido_votacao pos ON pos.partido_id = p.id
WHERE pos.data_votacao >= NOW() - MAKE_INTERVAL(days => j.dias)
GROUP BY p.id, p.sigla, j.janela, j.dias;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_coesao_partido_pk
    ON v_coesao_partido (partido_id, janela);
CREATE INDEX IF NOT EXISTS idx_v_coesao_partido_janela_rice
    ON v_coesao_partido (janela, rice_medio DESC NULLS LAST);

COMMENT ON MATERIALIZED VIEW v_coesao_partido IS
'Índice de Rice (coesão interna) por partido e janela temporal.';


-- -----------------------------------------------------------------------------
-- MVIEW: v_alinhamento_partidos — similaridade cosseno entre pares de partidos
--
-- Observações:
--   • Guardamos APENAS pares (a < b) para evitar duplicação (relação simétrica).
--   • Excluímos pares com menos de 10 votações comuns — abaixo disso o número
--     não é estatisticamente útil.
-- -----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS v_alinhamento_partidos CASCADE;
CREATE MATERIALIZED VIEW v_alinhamento_partidos AS
WITH pares AS (
    SELECT
        a.partido_id       AS partido_a_id,
        b.partido_id       AS partido_b_id,
        a.votacao_id,
        a.posicao          AS pos_a,
        b.posicao          AS pos_b,
        a.data_votacao
    FROM v_posicao_partido_votacao a
    JOIN v_posicao_partido_votacao b
        ON b.votacao_id = a.votacao_id
       AND b.partido_id > a.partido_id
    WHERE a.posicao <> 0 AND b.posicao <> 0  -- ignora quando algum não tomou posição
)
SELECT
    pa.sigla                                             AS partido_a_sigla,
    pb.sigla                                             AS partido_b_sigla,
    pares.partido_a_id,
    pares.partido_b_id,
    j.janela,
    j.dias                                               AS janela_dias,
    COUNT(*)                                             AS votacoes_comuns,
    -- Similaridade cosseno: ambos vetores têm norma = sqrt(N) quando posição
    -- é sempre ±1 (que é o caso após filtro `posicao <> 0`), então
    -- cos(θ) = Σ(a·b) / N
    SUM(pares.pos_a * pares.pos_b)::real / NULLIF(COUNT(*), 0)
                                                         AS similaridade,
    -- Interpretação intuitiva: % de votações em que votaram igual
    (SUM(CASE WHEN pares.pos_a = pares.pos_b THEN 1 ELSE 0 END)::real
        / NULLIF(COUNT(*), 0)) * 100
                                                         AS pct_concordancia
FROM pares
JOIN partidos pa ON pa.id = pares.partido_a_id
JOIN partidos pb ON pb.id = pares.partido_b_id
CROSS JOIN alinhamento_janelas() j
WHERE pares.data_votacao >= NOW() - MAKE_INTERVAL(days => j.dias)
GROUP BY pares.partido_a_id, pares.partido_b_id, pa.sigla, pb.sigla, j.janela, j.dias
HAVING COUNT(*) >= 10;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_alinhamento_partidos_pk
    ON v_alinhamento_partidos (partido_a_id, partido_b_id, janela);
CREATE INDEX IF NOT EXISTS idx_v_alinhamento_similaridade
    ON v_alinhamento_partidos (janela, similaridade DESC);

COMMENT ON MATERIALIZED VIEW v_alinhamento_partidos IS
'Similaridade cosseno entre pares de partidos por janela temporal. Pares (a < b) apenas.';


-- -----------------------------------------------------------------------------
-- Função: refresh_alinhamento_views()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_alinhamento_views()
RETURNS VOID AS $$
BEGIN
    -- CONCURRENTLY exige que exista um UNIQUE index (já criamos acima).
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_coesao_partido;
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_alinhamento_partidos;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_alinhamento_views IS
'Refresca as views materializadas de alinhamento. Chamado pelo ETL após ingestão.';


-- Registra esta migration como aplicada
INSERT INTO schema_migrations (version) VALUES ('0003_alinhamento')
ON CONFLICT (version) DO NOTHING;

COMMIT;
