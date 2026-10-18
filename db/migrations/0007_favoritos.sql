-- =============================================================================
-- Observatório da Política Brasileira — Favoritos por usuário
-- Migration: 0007_favoritos
-- =============================================================================
-- Tabelas de favoritos ligadas ao auth.users do Supabase, com RLS garantindo
-- que cada usuário só vê e manipula os próprios favoritos.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- favoritos_parlamentares
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favoritos_parlamentares (
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parlamentar_id  UUID NOT NULL REFERENCES parlamentares(id) ON DELETE CASCADE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, parlamentar_id)
);

CREATE INDEX IF NOT EXISTS idx_favoritos_parlamentares_user
    ON favoritos_parlamentares (user_id, criado_em DESC);

ALTER TABLE favoritos_parlamentares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_parl_select_own" ON favoritos_parlamentares;
CREATE POLICY "fav_parl_select_own"
    ON favoritos_parlamentares FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_parl_insert_own" ON favoritos_parlamentares;
CREATE POLICY "fav_parl_insert_own"
    ON favoritos_parlamentares FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_parl_delete_own" ON favoritos_parlamentares;
CREATE POLICY "fav_parl_delete_own"
    ON favoritos_parlamentares FOR DELETE
    USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- favoritos_proposicoes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favoritos_proposicoes (
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proposicao_id   UUID NOT NULL REFERENCES proposicoes(id) ON DELETE CASCADE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, proposicao_id)
);

CREATE INDEX IF NOT EXISTS idx_favoritos_proposicoes_user
    ON favoritos_proposicoes (user_id, criado_em DESC);

ALTER TABLE favoritos_proposicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_prop_select_own" ON favoritos_proposicoes;
CREATE POLICY "fav_prop_select_own"
    ON favoritos_proposicoes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_prop_insert_own" ON favoritos_proposicoes;
CREATE POLICY "fav_prop_insert_own"
    ON favoritos_proposicoes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_prop_delete_own" ON favoritos_proposicoes;
CREATE POLICY "fav_prop_delete_own"
    ON favoritos_proposicoes FOR DELETE
    USING (auth.uid() = user_id);


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0007_favoritos')
ON CONFLICT (version) DO NOTHING;

COMMIT;
