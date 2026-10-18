/**
 * Schema Drizzle espelhando as tabelas de db/migrations/.
 *
 * IMPORTANTE: este arquivo descreve o schema para o Drizzle (queries tipadas
 * e geração de migration diff). A VERDADE do schema é db/migrations/*.sql —
 * nunca gere migrations do Drizzle automaticamente, use SQL versionado.
 *
 * Para novas tabelas: 1) crie o .sql; 2) espelhe aqui pra tipagem.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
export const casaLegislativa = pgEnum('casa_legislativa', ['camara', 'senado']);
export const regiaoBrasil = pgEnum('regiao_brasil', [
  'Norte',
  'Nordeste',
  'Centro-Oeste',
  'Sudeste',
  'Sul',
]);
export const ingestStatus = pgEnum('ingest_status', ['running', 'success', 'failed']);

// ---------- Tabelas ----------
export const ufs = pgTable('ufs', {
  id: serial('id').primaryKey(),
  sigla: char('sigla', { length: 2 }).notNull().unique(),
  nome: text('nome').notNull(),
  regiao: regiaoBrasil('regiao').notNull(),
});

export const partidos = pgTable('partidos', {
  id: serial('id').primaryKey(),
  sigla: text('sigla').notNull().unique(),
  nome: text('nome').notNull(),
  numero: integer('numero').unique(),
  fundacao: date('fundacao'),
  site: text('site'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const legislaturas = pgTable('legislaturas', {
  id: integer('id').primaryKey(),
  numero: integer('numero').notNull(),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
});

export const parlamentares = pgTable('parlamentares', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  casa: casaLegislativa('casa').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  nome: text('nome').notNull(),
  nomeCivil: text('nome_civil'),
  cpf: text('cpf'),
  sexo: char('sexo', { length: 1 }),
  dataNascimento: date('data_nascimento'),
  ufId: integer('uf_id').references(() => ufs.id),
  partidoId: integer('partido_id').references(() => partidos.id),
  fotoUrl: text('foto_url'),
  email: text('email'),
  site: text('site'),
  redes: jsonb('redes').notNull().default(sql`'{}'::jsonb`),
  biografia: text('biografia'),
  escolaridade: text('escolaridade'),
  profissao: text('profissao'),
  situacao: text('situacao'),
  emExercicio: boolean('em_exercicio').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const mandatos = pgTable('mandatos', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  parlamentarId: uuid('parlamentar_id')
    .notNull()
    .references(() => parlamentares.id, { onDelete: 'cascade' }),
  casa: casaLegislativa('casa').notNull(),
  legislaturaId: integer('legislatura_id')
    .notNull()
    .references(() => legislaturas.id),
  partidoId: integer('partido_id').references(() => partidos.id),
  ufId: integer('uf_id').references(() => ufs.id),
  tipo: text('tipo'),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const ingestRuns = pgTable('ingest_runs', {
  id: uuid('id').primaryKey(),
  source: text('source').notNull(),
  job: text('job').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: ingestStatus('status').notNull().default('running'),
  stats: jsonb('stats').notNull().default(sql`'{}'::jsonb`),
  error: text('error'),
});

// ---------- Migration 0002: proposições/votações ----------

export const proposicoes = pgTable('proposicoes', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  casa: casaLegislativa('casa').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  siglaTipo: text('sigla_tipo').notNull(),
  numero: integer('numero').notNull(),
  ano: integer('ano').notNull(),
  ementa: text('ementa').notNull(),
  ementaDetalhada: text('ementa_detalhada'),
  keywords: text('keywords'),
  dataApresentacao: date('data_apresentacao'),
  dataUltimaTramitacao: timestamp('data_ultima_tramitacao', { withTimezone: true }),
  siglaOrgaoAtual: text('sigla_orgao_atual'),
  descricaoSituacao: text('descricao_situacao'),
  descricaoTramitacao: text('descricao_tramitacao'),
  arquivada: boolean('arquivada').notNull().default(false),
  uri: text('uri'),
  urlInteiroTeor: text('url_inteiro_teor'),
  nomeAutorPrincipal: text('nome_autor_principal'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const temas = pgTable('temas', {
  id: integer('id').primaryKey(),
  nome: text('nome').notNull(),
  uri: text('uri'),
});

export const proposicoesTemas = pgTable('proposicoes_temas', {
  proposicaoId: uuid('proposicao_id')
    .notNull()
    .references(() => proposicoes.id, { onDelete: 'cascade' }),
  temaId: integer('tema_id')
    .notNull()
    .references(() => temas.id),
  relevancia: integer('relevancia'),
});

export const proposicoesAutores = pgTable('proposicoes_autores', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  proposicaoId: uuid('proposicao_id')
    .notNull()
    .references(() => proposicoes.id, { onDelete: 'cascade' }),
  parlamentarId: uuid('parlamentar_id').references(() => parlamentares.id),
  nomeLivre: text('nome_livre'),
  tipoAutor: text('tipo_autor'),
  ordemAssinatura: integer('ordem_assinatura').default(1),
});

export const tramitacoes = pgTable('tramitacoes', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  proposicaoId: uuid('proposicao_id')
    .notNull()
    .references(() => proposicoes.id, { onDelete: 'cascade' }),
  sequencia: integer('sequencia').notNull(),
  data: timestamp('data', { withTimezone: true }).notNull(),
  siglaOrgao: text('sigla_orgao'),
  descricaoTramitacao: text('descricao_tramitacao'),
  descricaoSituacao: text('descricao_situacao'),
  despacho: text('despacho'),
  url: text('url'),
});

export const votacoes = pgTable('votacoes', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  casa: casaLegislativa('casa').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  proposicaoId: uuid('proposicao_id').references(() => proposicoes.id),
  dataHoraRegistro: timestamp('data_hora_registro', { withTimezone: true }).notNull(),
  siglaOrgao: text('sigla_orgao'),
  descricao: text('descricao').notNull(),
  aprovacao: boolean('aprovacao'),
  votosSim: integer('votos_sim').default(0),
  votosNao: integer('votos_nao').default(0),
  votosAbstencao: integer('votos_abstencao').default(0),
  votosOutros: integer('votos_outros').default(0),
  uriEvento: text('uri_evento'),
  uri: text('uri'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const votos = pgTable('votos', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  votacaoId: uuid('votacao_id')
    .notNull()
    .references(() => votacoes.id, { onDelete: 'cascade' }),
  parlamentarId: uuid('parlamentar_id')
    .notNull()
    .references(() => parlamentares.id),
  tipoVoto: text('tipo_voto').notNull(),
  partidoIdNaEpoca: integer('partido_id_na_epoca').references(() => partidos.id),
  dataRegistro: timestamp('data_registro', { withTimezone: true }),
});

export const orientacoesPartidarias = pgTable('orientacoes_partidarias', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  votacaoId: uuid('votacao_id')
    .notNull()
    .references(() => votacoes.id, { onDelete: 'cascade' }),
  partidoId: integer('partido_id')
    .notNull()
    .references(() => partidos.id),
  orientacao: text('orientacao').notNull(),
});

// ---------- Migration 0004: emendas ----------

// ---------- Migration 0007: favoritos ----------

export const favoritosParlamentares = pgTable('favoritos_parlamentares', {
  userId: uuid('user_id').notNull(),
  parlamentarId: uuid('parlamentar_id')
    .notNull()
    .references(() => parlamentares.id, { onDelete: 'cascade' }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const favoritosProposicoes = pgTable('favoritos_proposicoes', {
  userId: uuid('user_id').notNull(),
  proposicaoId: uuid('proposicao_id')
    .notNull()
    .references(() => proposicoes.id, { onDelete: 'cascade' }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Migration 0010: STF julgamentos (experimental) ----------

export const stfJulgamentos = pgTable('stf_julgamentos', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  sourceId: text('source_id').notNull(),
  sourceUrl: text('source_url').notNull(),
  titulo: text('titulo').notNull(),
  dataPublicacao: timestamp('data_publicacao', { withTimezone: true }).notNull(),
  dataJulgamento: date('data_julgamento'),
  processoClasse: text('processo_classe'),
  processoNumero: text('processo_numero'),
  processoIncidente: text('processo_incidente'),
  processoUrlOficial: text('processo_url_oficial'),
  temaRepercussaoGeral: text('tema_repercussao_geral'),
  resumo: text('resumo').notNull(),
  teseFixada: text('tese_fixada'),
  resultado: text('resultado'),
  foiUnanime: boolean('foi_unanime').notNull().default(false),
  tipoSessao: text('tipo_sessao'),
  ministrosVencedores: text('ministros_vencedores').array(),
  ministrosVencidos: text('ministros_vencidos').array(),
  ministrosImpedidos: text('ministros_impedidos').array(),
  confiancaParsing: integer('confianca_parsing').notNull().default(50),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Migration 0009: STF pautas ----------

export const stfSessoes = pgTable('stf_sessoes', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  sourceId: text('source_id').notNull(),
  colegiadoCodigo: text('colegiado_codigo').notNull(),
  colegiadoDescricao: text('colegiado_descricao').notNull(),
  dataInicio: timestamp('data_inicio', { withTimezone: true }).notNull(),
  tipo: text('tipo').notNull(),
  numero: integer('numero'),
  ano: integer('ano'),
  observacao: text('observacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const stfPautaProcessos = pgTable('stf_pauta_processos', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  sessaoId: uuid('sessao_id')
    .notNull()
    .references(() => stfSessoes.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  classe: text('classe').notNull(),
  numero: text('numero').notNull(),
  relator: text('relator'),
  ministroVista: text('ministro_vista'),
  destaque: text('destaque'),
  materiaRelevante: boolean('materia_relevante').notNull().default(false),
  repercussaoGeral: boolean('repercussao_geral').notNull().default(false),
  assuncaoCompetencia: boolean('assuncao_competencia').notNull().default(false),
  situacaoProcessoSessao: text('situacao_processo_sessao'),
  resumoTema: text('resumo_tema'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Migration 0008: STF ----------

export const stfMinistros = pgTable('stf_ministros', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  nome: text('nome').notNull(),
  nomeCompleto: text('nome_completo'),
  dataNascimento: date('data_nascimento'),
  localNascimento: text('local_nascimento'),
  presidenteIndicou: text('presidente_indicou').notNull(),
  partidoIndicacao: text('partido_indicacao'),
  dataPosse: date('data_posse').notNull(),
  dataAposentadoria: date('data_aposentadoria'),
  dataAposentadoriaCompulsoria: date('data_aposentadoria_compulsoria'),
  cargoAtual: text('cargo_atual'),
  formacaoAcademica: text('formacao_academica'),
  biografiaUrl: text('biografia_url'),
  fotoUrl: text('foto_url'),
  emExercicio: boolean('em_exercicio').notNull().default(true),
  ordemAntiguidade: integer('ordem_antiguidade'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Migration 0006: executivo ----------

export const ministros = pgTable('ministros', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgaoSigla: text('orgao_sigla').notNull(),
  orgaoNome: text('orgao_nome').notNull(),
  nome: text('nome').notNull(),
  cpf: text('cpf'),
  partidoSigla: text('partido_sigla'),
  fotoUrl: text('foto_url'),
  siteOficial: text('site_oficial'),
  dataInicioGestao: date('data_inicio_gestao'),
  dataFimGestao: date('data_fim_gestao'),
  biografiaUrl: text('biografia_url'),
  emExercicio: boolean('em_exercicio').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Migration 0004: emendas ----------

export const emendas = pgTable('emendas', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  codigoEmenda: text('codigo_emenda').notNull().unique(),
  numeroEmenda: text('numero_emenda'),
  ano: integer('ano').notNull(),
  tipoEmenda: text('tipo_emenda'),
  autorLivre: text('autor_livre').notNull(),
  parlamentarId: uuid('parlamentar_id').references(() => parlamentares.id, {
    onDelete: 'set null',
  }),
  funcao: text('funcao'),
  subfuncao: text('subfuncao'),
  localidadeDoGasto: text('localidade_do_gasto'),
  valorEmpenhado: text('valor_empenhado'), // numeric vem como string via driver
  valorLiquidado: text('valor_liquidado'),
  valorPago: text('valor_pago'),
  valorRestoInscrito: text('valor_resto_inscrito'),
  valorRestoCancelado: text('valor_resto_cancelado'),
  valorRestoPago: text('valor_resto_pago'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Tipos derivados (uso em todo o app) ----------
export type Parlamentar = typeof parlamentares.$inferSelect;
export type ParlamentarInsert = typeof parlamentares.$inferInsert;
export type Partido = typeof partidos.$inferSelect;
export type Uf = typeof ufs.$inferSelect;
export type Mandato = typeof mandatos.$inferSelect;
export type Legislatura = typeof legislaturas.$inferSelect;
export type Proposicao = typeof proposicoes.$inferSelect;
export type Tramitacao = typeof tramitacoes.$inferSelect;
export type Votacao = typeof votacoes.$inferSelect;
export type Voto = typeof votos.$inferSelect;
export type OrientacaoPartidaria = typeof orientacoesPartidarias.$inferSelect;
export type Tema = typeof temas.$inferSelect;
export type StfMinistro = typeof stfMinistros.$inferSelect;
export type StfSessao = typeof stfSessoes.$inferSelect;
export type StfPautaProcesso = typeof stfPautaProcessos.$inferSelect;
export type StfJulgamento = typeof stfJulgamentos.$inferSelect;
