-- =============================================================================
-- Observatório da Política Brasileira — STF julgamentos (EXPERIMENTAL)
-- Migration: 0010_stf_julgamentos
-- =============================================================================
-- Importante: esta tabela é alimentada por SCRAPING do Portal de Notícias do
-- STF (WordPress REST API em noticias.stf.jus.br/wp-json/wp/v2/posts). As
-- informações extraídas são *inferências textuais* — pode haver erros ou
-- posts incorretamente classificados como "julgamento concluído". A UI
-- DEVE mostrar badge de alerta.
--
-- A tabela stf_votos_julgamento guarda alinhamento INFERIDO dos ministros
-- com base em padrões de linguagem do post. Nunca substitui o acórdão
-- oficial.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS stf_julgamentos (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id               TEXT NOT NULL,         -- id do post WP ("166989")
    source_url              TEXT NOT NULL,         -- URL original da notícia
    titulo                  TEXT NOT NULL,
    data_publicacao         TIMESTAMPTZ NOT NULL,
    data_julgamento         DATE,                   -- extraída do corpo quando possível
    processo_classe         TEXT,                   -- "ADI", "RE", "ARE", "ADPF"
    processo_numero         TEXT,                   -- "1141156", "7717"
    processo_incidente      TEXT,                   -- id oficial STF (ex: "5491645")
    processo_url_oficial    TEXT,                   -- https://portal.stf.jus.br/processos/detalhe.asp?incidente=X
    tema_repercussao_geral  TEXT,                   -- "Tema 1.016"
    resumo                  TEXT NOT NULL,          -- excerpt do post
    tese_fixada             TEXT,                   -- texto da tese quando identificada
    resultado               TEXT,                   -- "unanime", "maioria", "modulada", "nao_classificado"
    foi_unanime             BOOLEAN NOT NULL DEFAULT FALSE,
    tipo_sessao             TEXT,                   -- "presencial", "virtual", NULL
    ministros_vencedores    TEXT[],                 -- nomes extraídos (sem MIN. prefix)
    ministros_vencidos      TEXT[],
    ministros_impedidos     TEXT[],
    confianca_parsing       SMALLINT NOT NULL DEFAULT 50,  -- 0-100: 100 = tudo extraído, 0 = nada
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stf_julgamentos_unique UNIQUE (source_id)
);

DROP TRIGGER IF EXISTS trg_stf_julgamentos_updated ON stf_julgamentos;
CREATE TRIGGER trg_stf_julgamentos_updated
    BEFORE UPDATE ON stf_julgamentos
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_stf_julgamentos_data_publicacao
    ON stf_julgamentos (data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_stf_julgamentos_processo
    ON stf_julgamentos (processo_classe, processo_numero);
CREATE INDEX IF NOT EXISTS idx_stf_julgamentos_confianca
    ON stf_julgamentos (confianca_parsing DESC);

COMMENT ON TABLE stf_julgamentos IS
'Julgamentos do STF extraídos (scraping) do Portal de Notícias. Experimental: ministros_vencedores/vencidos são inferência textual, não votos literais.';

COMMENT ON COLUMN stf_julgamentos.confianca_parsing IS
'Score 0-100 baseado em quantos campos foram extraídos corretamente. UI exibe baixo = aviso extra.';


-- Registra a migration
INSERT INTO schema_migrations (version) VALUES ('0010_stf_julgamentos')
ON CONFLICT (version) DO NOTHING;

COMMIT;
