"""Fonte curada da composição ministerial atual.

A API oficial da Esplanada (gov.br/planalto) não é um endpoint estável — o
site muda com frequência e inclui ministros interinos sem distinção clara.
Mantemos uma lista versionada no código, atualizada manualmente conforme
mudanças de gabinete.

**Como atualizar**: edite `MINISTROS_ATUAIS` abaixo quando houver troca
oficial anunciada em DOU. Mantenha ordem alfabética por órgão.

Fonte referência: https://www.gov.br/planalto/pt-br/conheca-a-presidencia/acervo/galeria-de-ministros
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MinistroEntry:
    orgao_sigla: str
    orgao_nome: str
    nome: str
    partido_sigla: str | None = None
    site_oficial: str | None = None


# Lista mantida manualmente. Em um follow-up, substituir por scraping leve.
# Esta lista é apenas um exemplo-base; atualize após o próximo deploy.
MINISTROS_ATUAIS: list[MinistroEntry] = [
    MinistroEntry(
        orgao_sigla="MF",
        orgao_nome="Ministério da Fazenda",
        nome="Fernando Haddad",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/fazenda",
    ),
    MinistroEntry(
        orgao_sigla="MP",
        orgao_nome="Ministério do Planejamento e Orçamento",
        nome="Simone Tebet",
        partido_sigla="MDB",
        site_oficial="https://www.gov.br/planejamento",
    ),
    MinistroEntry(
        orgao_sigla="MJSP",
        orgao_nome="Ministério da Justiça e Segurança Pública",
        nome="Ricardo Lewandowski",
        partido_sigla=None,
        site_oficial="https://www.gov.br/mj",
    ),
    MinistroEntry(
        orgao_sigla="MRE",
        orgao_nome="Ministério das Relações Exteriores",
        nome="Mauro Vieira",
        partido_sigla=None,
        site_oficial="https://www.gov.br/mre",
    ),
    MinistroEntry(
        orgao_sigla="MDIC",
        orgao_nome="Ministério do Desenvolvimento, Indústria, Comércio e Serviços",
        nome="Geraldo Alckmin",
        partido_sigla="PSB",
        site_oficial="https://www.gov.br/mdic",
    ),
    MinistroEntry(
        orgao_sigla="MEC",
        orgao_nome="Ministério da Educação",
        nome="Camilo Santana",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/mec",
    ),
    MinistroEntry(
        orgao_sigla="MS",
        orgao_nome="Ministério da Saúde",
        nome="Nísia Trindade",
        partido_sigla=None,
        site_oficial="https://www.gov.br/saude",
    ),
    MinistroEntry(
        orgao_sigla="MMA",
        orgao_nome="Ministério do Meio Ambiente e Mudança do Clima",
        nome="Marina Silva",
        partido_sigla="REDE",
        site_oficial="https://www.gov.br/mma",
    ),
    MinistroEntry(
        orgao_sigla="MAPA",
        orgao_nome="Ministério da Agricultura e Pecuária",
        nome="Carlos Fávaro",
        partido_sigla="PSD",
        site_oficial="https://www.gov.br/agricultura",
    ),
    MinistroEntry(
        orgao_sigla="MDA",
        orgao_nome="Ministério do Desenvolvimento Agrário",
        nome="Paulo Teixeira",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/mda",
    ),
    MinistroEntry(
        orgao_sigla="MDS",
        orgao_nome="Ministério do Desenvolvimento e Assistência Social",
        nome="Wellington Dias",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/mds",
    ),
    MinistroEntry(
        orgao_sigla="MTB",
        orgao_nome="Ministério do Trabalho e Emprego",
        nome="Luiz Marinho",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/trabalho",
    ),
    MinistroEntry(
        orgao_sigla="MDH",
        orgao_nome="Ministério dos Direitos Humanos e da Cidadania",
        nome="Macaé Evaristo",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/mdh",
    ),
    MinistroEntry(
        orgao_sigla="MMulheres",
        orgao_nome="Ministério das Mulheres",
        nome="Cida Gonçalves",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/mulheres",
    ),
    MinistroEntry(
        orgao_sigla="MIR",
        orgao_nome="Ministério da Igualdade Racial",
        nome="Anielle Franco",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/igualdaderacial",
    ),
    MinistroEntry(
        orgao_sigla="MMinC",
        orgao_nome="Ministério da Cultura",
        nome="Margareth Menezes",
        partido_sigla=None,
        site_oficial="https://www.gov.br/cultura",
    ),
    MinistroEntry(
        orgao_sigla="MinC",
        orgao_nome="Ministério das Comunicações",
        nome="Juscelino Filho",
        partido_sigla="UNIÃO",
        site_oficial="https://www.gov.br/mcom",
    ),
    MinistroEntry(
        orgao_sigla="MCTI",
        orgao_nome="Ministério da Ciência, Tecnologia e Inovação",
        nome="Luciana Santos",
        partido_sigla="PCdoB",
        site_oficial="https://www.gov.br/mcti",
    ),
    MinistroEntry(
        orgao_sigla="MIDR",
        orgao_nome="Ministério da Integração e Desenvolvimento Regional",
        nome="Waldez Góes",
        partido_sigla="PDT",
        site_oficial="https://www.gov.br/mdr",
    ),
    MinistroEntry(
        orgao_sigla="MCID",
        orgao_nome="Ministério das Cidades",
        nome="Jader Filho",
        partido_sigla="MDB",
        site_oficial="https://www.gov.br/cidades",
    ),
    MinistroEntry(
        orgao_sigla="MInfra",
        orgao_nome="Ministério dos Transportes",
        nome="Renan Filho",
        partido_sigla="MDB",
        site_oficial="https://www.gov.br/transportes",
    ),
    MinistroEntry(
        orgao_sigla="MPO",
        orgao_nome="Ministério de Portos e Aeroportos",
        nome="Silvio Costa Filho",
        partido_sigla="REPUBLICANOS",
        site_oficial="https://www.gov.br/portos-e-aeroportos",
    ),
    MinistroEntry(
        orgao_sigla="MME",
        orgao_nome="Ministério de Minas e Energia",
        nome="Alexandre Silveira",
        partido_sigla="PSD",
        site_oficial="https://www.gov.br/mme",
    ),
    MinistroEntry(
        orgao_sigla="MD",
        orgao_nome="Ministério da Defesa",
        nome="José Múcio Monteiro",
        partido_sigla=None,
        site_oficial="https://www.gov.br/defesa",
    ),
    MinistroEntry(
        orgao_sigla="MGI",
        orgao_nome="Ministério da Gestão e Inovação em Serviços Públicos",
        nome="Esther Dweck",
        partido_sigla=None,
        site_oficial="https://www.gov.br/gestao",
    ),
    MinistroEntry(
        orgao_sigla="MTur",
        orgao_nome="Ministério do Turismo",
        nome="Celso Sabino",
        partido_sigla="UNIÃO",
        site_oficial="https://www.gov.br/turismo",
    ),
    MinistroEntry(
        orgao_sigla="MEsp",
        orgao_nome="Ministério do Esporte",
        nome="André Fufuca",
        partido_sigla="PP",
        site_oficial="https://www.gov.br/esporte",
    ),
    MinistroEntry(
        orgao_sigla="MPI",
        orgao_nome="Ministério dos Povos Indígenas",
        nome="Sonia Guajajara",
        partido_sigla="PSOL",
        site_oficial="https://www.gov.br/povosindigenas",
    ),
    MinistroEntry(
        orgao_sigla="MPesca",
        orgao_nome="Ministério da Pesca e Aquicultura",
        nome="André de Paula",
        partido_sigla="PSD",
        site_oficial="https://www.gov.br/mpa",
    ),
    MinistroEntry(
        orgao_sigla="MPrev",
        orgao_nome="Ministério da Previdência Social",
        nome="Carlos Lupi",
        partido_sigla="PDT",
        site_oficial="https://www.gov.br/previdencia",
    ),
    MinistroEntry(
        orgao_sigla="MEmpr",
        orgao_nome="Ministério do Empreendedorismo, Microempresa e Pequena Empresa",
        nome="Márcio França",
        partido_sigla="PSB",
        site_oficial="https://www.gov.br/empreendedorismo",
    ),
    MinistroEntry(
        orgao_sigla="SG",
        orgao_nome="Secretaria-Geral da Presidência",
        nome="Márcio Macêdo",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/secretariageral",
    ),
    MinistroEntry(
        orgao_sigla="SRI",
        orgao_nome="Secretaria de Relações Institucionais",
        nome="Alexandre Padilha",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/sri",
    ),
    MinistroEntry(
        orgao_sigla="CC",
        orgao_nome="Casa Civil da Presidência",
        nome="Rui Costa",
        partido_sigla="PT",
        site_oficial="https://www.gov.br/casacivil",
    ),
    MinistroEntry(
        orgao_sigla="AGU",
        orgao_nome="Advocacia-Geral da União",
        nome="Jorge Messias",
        partido_sigla=None,
        site_oficial="https://www.gov.br/agu",
    ),
    MinistroEntry(
        orgao_sigla="CGU",
        orgao_nome="Controladoria-Geral da União",
        nome="Vinícius Carvalho",
        partido_sigla=None,
        site_oficial="https://www.gov.br/cgu",
    ),
    MinistroEntry(
        orgao_sigla="GSI",
        orgao_nome="Gabinete de Segurança Institucional",
        nome="Marcos Antônio Amaro",
        partido_sigla=None,
        site_oficial="https://www.gov.br/gsi",
    ),
]
