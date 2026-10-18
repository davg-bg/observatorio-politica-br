-- =============================================================================
-- Observatório da Política Brasileira — STF pautas (agenda do plenário)
-- Migration: 0009_stf_pautas
-- =============================================================================
-- Alimentada pelo endpoint JSON oficial descoberto no portal do STF:
--   GET /pauta/services/calendario-service.asp?dados=sessao-presencial&data=DD/MM/YYYY
--
-- Estrutura:
--   stf_sessoes          Sessões presenciais (plenário e turmas)
--   stf_pauta_processos  Processos listados em cada sessão
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS stf_sessoes (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id               TEXT NOT NULL,         -- id numérico da API ("87059")
    colegiado_codigo        TEXT NOT NULL,         -- "TP" (plenário), "1T", "2T"
    colegiado_descricao     TEXT NOT NULL,         -- "Plenário", "Primeira Turma", "Segunda Turma"
    data_inicio             TIMESTAMPTZ NOT NULL,  -- "15/10/2026 14:00" parsed
    tipo                    TEXT NOT NULL,         -- "E" (extraordinária), "O" (ordinária)
    numero                  INTEGER,
    ano                     INTEGER,
    observacao              TEXT,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stf_sessoes_unique UNIQUE (source_id)
);

DROP TRIGGER IF EXISTS trg_stf_sessoes_updated ON stf_sessoes;
CREATE TRIGGER trg_stf_sessoes_updated
    BEFORE UPDATE ON stf_sessoes
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_stf_sessoes_data
    ON stf_sessoes (data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_stf_sessoes_colegiado
    ON stf_sessoes (colegiado_codigo);


CREATE TABLE IF NOT EXISTS stf_pauta_processos (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sessao_id                       UUID NOT NULL
                                        REFERENCES stf_sessoes(id) ON DELETE CASCADE,
    source_id                       TEXT NOT NULL,   -- idInformacaoPautaProcesso ("79023")
    classe                          TEXT NOT NULL,   -- "ADI", "RE", "ADPF", etc.
    numero                          TEXT NOT NULL,   -- "4395" (string pra lidar com variações)
    relator                         TEXT,            -- "MIN. GILMAR MENDES"
    ministro_vista                  TEXT,
    destaque                        TEXT,            -- ministro que pediu destaque
    materia_relevante               BOOLEAN NOT NULL DEFAULT FALSE,  -- "S"/"N" na API
    repercussao_geral               BOOLEAN NOT NULL DEFAULT FALSE,
    assuncao_competencia            BOOLEAN NOT NULL DEFAULT FALSE,
    situacao_processo_sessao        TEXT,
    resumo_tema                     TEXT,
    criado_em                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stf_pauta_processos_unique UNIQUE (sessao_id, source_id)
);

DROP TRIGGER IF EXISTS trg_stf_pauta_processos_updated ON stf_pauta_processos;
CREATE TRIGGER trg_stf_pauta_processos_updated
    BEFORE UPDATE ON stf_pauta_processos
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_stf_pauta_sessao
    ON stf_pauta_processos (sessao_id);
CREATE INDEX IF NOT EXISTS idx_stf_pauta_classe_numero
    ON stf_pauta_processos (classe, numero);
CREATE INDEX IF NOT EXISTS idx_stf_pauta_relevante
    ON stf_pauta_processos (materia_relevante)
    WHERE materia_relevante = TRUE;

COMMENT ON TABLE stf_sessoes IS
'Sessões presenciais do STF (plenário e turmas) extraídas do calendario-service.asp.';

COMMENT ON TABLE stf_pauta_processos IS
'Processos pautados em cada sessão. source_id corresponde a idInformacaoPautaProcesso da API.';


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0009_stf_pautas')
ON CONFLICT (version) DO NOTHING;

COMMIT;
