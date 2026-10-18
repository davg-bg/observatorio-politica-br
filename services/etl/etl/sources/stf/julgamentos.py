"""Job EXPERIMENTAL: ingere julgamentos do STF via scraping do Portal de Notícias.

Fonte: noticias.stf.jus.br/wp-json/wp/v2/posts
Estratégia:
  1. Busca posts recentes com termos de resultado ("decide", "fixa", "declara", etc).
  2. Filtra pautas e matérias não-decisórias.
  3. Extrai: processo (classe + número), incidente oficial, tema RG, tese,
     ministros vencedores/vencidos/impedidos, unanimidade.
  4. Grava com `confianca_parsing` 0-100 baseado em quantos campos foram
     achados — permite UI filtrar o lixo.

**Importante**: ministros_vencedores/vencidos são INFERÊNCIA TEXTUAL. Não
substitui o acórdão oficial. A UI tem badge "scraping — pode conter erros".
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import httpx
import structlog
from sqlalchemy import text

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run

logger = structlog.get_logger(__name__)

BASE_URL = "https://noticias.stf.jus.br/wp-json/wp/v2/posts"
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

# Termos de busca que capturam notícias de resultado (não só pauta).
TERMOS_RESULTADO = [
    "STF decide",
    "STF declara",
    "STF fixa",
    "STF reafirma",
    "STF mantém",
    "STF reconhece",
    "concluiu julgamento",
    "Plenário aprova",
]

# Termos que indicam que o post é PAUTA (anuncia o julgamento, não resultado)
TERMOS_PAUTA = [
    "confira a pauta",
    "pauta do stf",
    "destaques do plenário virtual",
]

# Lista canônica de ministros (nomes como aparecem no post). Pra matching
# determinístico. Deve espelhar MINISTROS_STF — se mudar lá, atualize aqui.
MINISTROS_CANONICOS: list[tuple[str, list[str]]] = [
    ("Gilmar Mendes", ["Gilmar Mendes", "Gilmar Ferreira Mendes"]),
    ("Cármen Lúcia", ["Cármen Lúcia", "Carmen Lúcia", "Cármen Lúcia Antunes Rocha"]),
    ("Dias Toffoli", ["Dias Toffoli", "José Antonio Dias Toffoli", "Toffoli"]),
    ("Luiz Fux", ["Luiz Fux", "Fux"]),
    ("Edson Fachin", ["Edson Fachin", "Luiz Edson Fachin", "Fachin"]),
    ("Alexandre de Moraes", ["Alexandre de Moraes"]),
    ("Nunes Marques", ["Nunes Marques", "Kassio Nunes Marques", "Kassio"]),
    ("André Mendonça", ["André Mendonça", "Mendonça"]),
    ("Cristiano Zanin", ["Cristiano Zanin", "Zanin"]),
    ("Flávio Dino", ["Flávio Dino", "Dino"]),
]


# ---------------------------------------------------------------------------
# Modelo intermediário do parse
# ---------------------------------------------------------------------------


@dataclass
class JulgamentoExtraido:
    source_id: str
    source_url: str
    titulo: str
    data_publicacao: datetime
    resumo: str
    data_julgamento: date | None = None
    processo_classe: str | None = None
    processo_numero: str | None = None
    processo_incidente: str | None = None
    processo_url_oficial: str | None = None
    tema_repercussao_geral: str | None = None
    tese_fixada: str | None = None
    resultado: str | None = None
    foi_unanime: bool = False
    tipo_sessao: str | None = None
    ministros_vencedores: list[str] = field(default_factory=list)
    ministros_vencidos: list[str] = field(default_factory=list)
    ministros_impedidos: list[str] = field(default_factory=list)
    confianca_parsing: int = 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def run() -> None:
    """Entry point: busca termos, filtra e persiste."""
    with record_run("stf", "julgamentos") as run_state:
        await _run(run_state["stats"])


async def _run(stats: dict) -> None:
    stats.setdefault("posts_buscados", 0)
    stats.setdefault("posts_pulados_pauta", 0)
    stats.setdefault("julgamentos_upsert", 0)
    stats.setdefault("baixa_confianca", 0)
    stats.setdefault("errors", 0)

    per_page = settings.etl_limit or 10
    posts_por_id: dict[int, dict] = {}

    async with httpx.AsyncClient(timeout=30, headers=BROWSER_HEADERS) as client:
        for termo in TERMOS_RESULTADO:
            try:
                r = await client.get(
                    BASE_URL,
                    params={
                        "search": termo,
                        "per_page": per_page,
                        "orderby": "date",
                        "order": "desc",
                    },
                )
                r.raise_for_status()
                for post in r.json():
                    pid = int(post["id"])
                    if pid not in posts_por_id:
                        posts_por_id[pid] = post
            except Exception as e:
                logger.warning("stf_julgamentos_busca_falhou", termo=termo, error=str(e))
                stats["errors"] += 1

    stats["posts_buscados"] = len(posts_por_id)
    logger.info("stf_julgamentos_fetched", total=stats["posts_buscados"])

    for post in posts_por_id.values():
        if _parece_pauta(post):
            stats["posts_pulados_pauta"] += 1
            continue
        try:
            extraido = extract_julgamento(post)
            if extraido.confianca_parsing < 30:
                stats["baixa_confianca"] += 1
            _upsert(extraido)
            stats["julgamentos_upsert"] += 1
        except Exception as e:
            logger.exception("stf_julgamento_falhou", post_id=post.get("id"), error=str(e))
            stats["errors"] += 1


def _parece_pauta(post: dict) -> bool:
    titulo = (post.get("title", {}).get("rendered") or "").lower()
    return any(t in titulo for t in TERMOS_PAUTA)


# ---------------------------------------------------------------------------
# Extração (puro, testável sem rede)
# ---------------------------------------------------------------------------


def extract_julgamento(post: dict) -> JulgamentoExtraido:
    """Converte um post WP em JulgamentoExtraido.

    Puro — não faz rede nem banco. Usado nos testes.
    """
    source_id = str(post["id"])
    source_url = str(post.get("link") or "")
    titulo_html = post.get("title", {}).get("rendered") or ""
    titulo = _strip_html(titulo_html).strip()

    data_pub = _parse_wp_date(post.get("date_gmt") or post.get("date") or "")

    content_html = post.get("content", {}).get("rendered") or ""
    content_txt = _strip_html(content_html)

    excerpt_html = post.get("excerpt", {}).get("rendered") or ""
    resumo = _strip_html(excerpt_html).strip() or (content_txt[:300].strip() + "…")

    extraido = JulgamentoExtraido(
        source_id=source_id,
        source_url=source_url,
        titulo=titulo,
        data_publicacao=data_pub,
        resumo=resumo,
    )

    # Processo + incidente
    classe, numero = _parse_processo(titulo + " " + content_txt)
    extraido.processo_classe = classe
    extraido.processo_numero = numero

    incidente, url_oficial = _parse_incidente(content_html)
    extraido.processo_incidente = incidente
    extraido.processo_url_oficial = url_oficial

    # Tema RG
    extraido.tema_repercussao_geral = _parse_tema(content_txt)

    # Tipo sessão (inclui título + excerpt pra pegar "Plenário afastou" etc)
    extraido.tipo_sessao = _parse_tipo_sessao(f"{titulo}. {resumo}. {content_txt}")

    # Unanimidade / maioria
    extraido.foi_unanime = _detecta_unanimidade(content_txt)

    # Ministros
    vencedores, vencidos, impedidos = _parse_ministros(content_txt)
    extraido.ministros_vencedores = vencedores
    extraido.ministros_vencidos = vencidos
    extraido.ministros_impedidos = impedidos

    # Resultado agregado
    if extraido.foi_unanime:
        extraido.resultado = "unanime"
    elif vencidos:
        extraido.resultado = "maioria"
    elif re.search(r"\bmodula\w+\b", content_txt, re.IGNORECASE):
        extraido.resultado = "modulada"
    else:
        extraido.resultado = "nao_classificado"

    # Tese fixada
    extraido.tese_fixada = _parse_tese(content_html)

    # Data do julgamento (procura "nesta quarta-feira (14)" etc)
    extraido.data_julgamento = _parse_data_julgamento(content_txt, data_pub)

    # Confiança: um score 0-100
    extraido.confianca_parsing = _calcular_confianca(extraido)

    return extraido


# ---------- Helpers de parsing (puros) ----------


def _strip_html(s: str) -> str:
    """Remove tags e entities HTML preservando espaçamento."""
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s)
    return s


def _parse_wp_date(s: str) -> datetime:
    """WordPress retorna '2026-10-14T20:10:53' ou com Z."""
    if not s:
        return datetime.now()
    s = s.rstrip("Z")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return datetime.now()


PROCESSO_PATTERNS = [
    # "(RE) 1141156" ou "(ARE) 1593784"
    re.compile(
        r"\((ADI|ADC|ADPF|ADO|RE|ARE|HC|RHC|MS|MI|AP|Rcl)\)\s*(\d[\d\.]*(?:-\d+)?)",
        re.IGNORECASE,
    ),
    # "ADI 7717" ou "RE 835818"
    re.compile(
        r"\b(ADI|ADC|ADPF|ADO|RE|ARE|HC|RHC|MS|MI|AP|Rcl)\s+(\d[\d\.]{2,}(?:-\d+)?)",
        re.IGNORECASE,
    ),
]


def _parse_processo(txt: str) -> tuple[str | None, str | None]:
    for pat in PROCESSO_PATTERNS:
        m = pat.search(txt)
        if m:
            classe = m.group(1).upper()
            numero = m.group(2).replace(".", "")
            return classe, numero
    return None, None


INCIDENTE_RE = re.compile(
    r'href="(https?://portal\.stf\.jus\.br/processos/detalhe\.asp\?incidente=(\d+))"',
    re.IGNORECASE,
)


def _parse_incidente(content_html: str) -> tuple[str | None, str | None]:
    """Extrai o id de incidente oficial do link no corpo do post."""
    m = INCIDENTE_RE.search(content_html or "")
    if not m:
        return None, None
    return m.group(2), m.group(1)


TEMA_RE = re.compile(r"\bTema\s+(\d[\d\.]*)\b", re.IGNORECASE)


def _parse_tema(txt: str) -> str | None:
    m = TEMA_RE.search(txt)
    if not m:
        return None
    numero = m.group(1).replace(".", "")
    return f"Tema {numero}"


def _parse_tipo_sessao(txt: str) -> str | None:
    txt_low = txt.lower()
    if "plenário virtual" in txt_low or "sessão virtual" in txt_low:
        return "virtual"
    if "sessão presencial" in txt_low or "sessão plenária" in txt_low:
        return "presencial"
    if "plenário" in txt_low:
        return "presencial"
    return None


def _detecta_unanimidade(txt: str) -> bool:
    return bool(re.search(r"\b(unanimidade|un[âa]nime)\b", txt, re.IGNORECASE))


# Nome: letras unicode + espaços, começa com maiúscula
_NOME_RE = r"[A-ZÀ-Ü][a-zà-ÿ]+(?:\s+[A-ZÀ-Üa-zà-ÿ]+){0,3}"


def _parse_ministros(txt: str) -> tuple[list[str], list[str], list[str]]:
    """Extrai ministros vencedores, vencidos e impedidos.

    Estratégia conservadora:
      - "Prevaleceu o entendimento proposto pelo ministro X" → X vencedor
      - "A corrente foi acompanhada pela ministra X e pelos ministros Y, Z" → vencedores
      - "Ficaram vencidos ... ministros X, Y" → vencidos
      - "O ministro X não participou ... impedido" → impedido
    """
    vencedores: list[str] = []
    vencidos: list[str] = []
    impedidos: list[str] = []

    # Vencedores: autor da divergência prevalente
    for m in re.finditer(
        r"(?:[Pp]revaleceu|[Vv]encedor[a]?|[Aa]briu\s+a\s+diverg[êe]ncia|[Pp]roposta\s+(?:do|da))\s+"
        r"(?:o\s+entendimento\s+proposto\s+)?(?:pelo|pela)\s+(?:ministro|ministra)\s+("
        + _NOME_RE
        + r")",
        txt,
    ):
        vencedores.append(m.group(1))

    # Vencedores: lista "foi acompanhada pela ministra X e pelos ministros Y, Z"
    # Captura o bloco após "acompanhad[oa]" e extrai todos os nomes canônicos.
    for m in re.finditer(
        r"[Aa]companh[ao]u?[^.]{0,500}",
        txt,
    ):
        bloco = m.group(0)
        for nome_m in re.finditer(_NOME_RE, bloco):
            nome = nome_m.group(0)
            if nome.lower() not in {
                "acompanhou",
                "acompanhada",
                "acompanharam",
                "ministra",
                "ministro",
                "corrente",
                "divergência",
                "divergencia",
                "voto",
                "stf",
            }:
                vencedores.append(nome)

    # Vencidos: "Ficaram vencidos ... ministros X, Y"
    for m in re.finditer(
        r"[Ff]icaram\s+vencidos?[^.]{0,500}",
        txt,
    ):
        bloco = m.group(0)
        for nome_m in re.finditer(_NOME_RE, bloco):
            # Filtra palavras genéricas comuns
            nome = nome_m.group(0)
            if nome.lower() not in {"ficaram", "vencidos", "vencido", "ministro", "ministra"}:
                vencidos.append(nome)

    # Impedidos: "O ministro X não participou"
    for m in re.finditer(
        r"(?:ministro|ministra)\s+(" + _NOME_RE + r")\s+n[ãa]o\s+participou",
        txt,
    ):
        impedidos.append(m.group(1))

    # Normaliza contra lista canônica, deduplica
    def normaliza(nomes: list[str]) -> list[str]:
        resultado: list[str] = []
        for n in nomes:
            canonico = _match_canonico(n)
            if canonico and canonico not in resultado:
                resultado.append(canonico)
        return resultado

    return normaliza(vencedores), normaliza(vencidos), normaliza(impedidos)


def _match_canonico(nome: str) -> str | None:
    """Normaliza um nome parcial contra MINISTROS_CANONICOS.

    'Toffoli' → 'Dias Toffoli'. Retorna None se não match.
    """
    nome_n = nome.strip()
    nome_low = nome_n.lower()
    for canonico, variantes in MINISTROS_CANONICOS:
        for v in variantes:
            v_low = v.lower()
            # Match exato ou substring (pra "Toffoli" vs "Dias Toffoli")
            if nome_low == v_low or (
                len(nome_low) >= 4 and (nome_low in v_low or v_low in nome_low)
            ):
                return canonico
    return None


TESE_HEADING_RE = re.compile(
    r"<h\d[^>]*>\s*<strong[^>]*>\s*Tese\s*</strong>\s*</h\d>(.*?)(?=<h\d|$)",
    re.IGNORECASE | re.DOTALL,
)


def _parse_tese(content_html: str) -> str | None:
    """Extrai o parágrafo da tese fixada."""
    if not content_html:
        return None
    m = TESE_HEADING_RE.search(content_html)
    if not m:
        return None
    bloco = m.group(1)
    tese = _strip_html(bloco).strip()
    # Limita pra evitar texto gigante
    if len(tese) > 2000:
        tese = tese[:2000] + "…"
    return tese or None


# "nesta quarta-feira (14)", "no último dia 8 de outubro"
DATA_JULG_RES = [
    re.compile(
        r"nest[aeo]\s+\w+-feira\s*\((\d{1,2})\)",
        re.IGNORECASE,
    ),
    re.compile(
        r"na\s+sess[ãa]o\s+(?:de|virtual\s+encerrada\s+em)\s+(\d{1,2})(?:\s+de\s+(\w+))?",
        re.IGNORECASE,
    ),
]
MESES_PT = {
    "janeiro": 1,
    "fevereiro": 2,
    "março": 3,
    "marco": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
}


def _parse_data_julgamento(txt: str, data_pub: datetime) -> date | None:
    """Tenta extrair a data concreta do julgamento. Fallback = data da publicação."""
    for pat in DATA_JULG_RES:
        m = pat.search(txt)
        if not m:
            continue
        dia_s = m.group(1)
        try:
            dia = int(dia_s)
        except ValueError:
            continue
        mes_s = m.group(2) if m.lastindex and m.lastindex >= 2 else None
        mes = (MESES_PT.get(mes_s.lower()) if mes_s else data_pub.month) or data_pub.month
        try:
            return date(data_pub.year, mes, dia)
        except ValueError:
            continue
    # Fallback
    return data_pub.date() if data_pub else None


def _calcular_confianca(e: JulgamentoExtraido) -> int:
    """Score 0-100 de quão rica foi a extração."""
    pontos = 0
    if e.processo_classe and e.processo_numero:
        pontos += 25
    if e.processo_incidente:
        pontos += 15
    if e.tema_repercussao_geral:
        pontos += 10
    if e.ministros_vencedores:
        pontos += 20
    if e.foi_unanime or e.ministros_vencidos:
        pontos += 10
    if e.tese_fixada:
        pontos += 15
    if e.tipo_sessao:
        pontos += 5
    return min(pontos, 100)


# ---------------------------------------------------------------------------
# Persistência
# ---------------------------------------------------------------------------


def _upsert(e: JulgamentoExtraido) -> None:
    with session_scope() as session:
        _upsert_in_session(session, e)


def _upsert_in_session(session: Any, e: JulgamentoExtraido) -> None:
    """Separado pra permitir testes com FakeSession."""
    session.execute(
        text(
            """
            INSERT INTO stf_julgamentos (
                source_id, source_url, titulo, data_publicacao, data_julgamento,
                processo_classe, processo_numero, processo_incidente,
                processo_url_oficial, tema_repercussao_geral, resumo, tese_fixada,
                resultado, foi_unanime, tipo_sessao,
                ministros_vencedores, ministros_vencidos, ministros_impedidos,
                confianca_parsing
            ) VALUES (
                :source_id, :source_url, :titulo, :data_pub, :data_julg,
                :classe, :numero, :incidente,
                :url_oficial, :tema, :resumo, :tese,
                :resultado, :unanime, :sessao,
                :vencedores, :vencidos, :impedidos,
                :confianca
            )
            ON CONFLICT (source_id) DO UPDATE SET
                source_url            = EXCLUDED.source_url,
                titulo                = EXCLUDED.titulo,
                data_publicacao       = EXCLUDED.data_publicacao,
                data_julgamento       = EXCLUDED.data_julgamento,
                processo_classe       = COALESCE(EXCLUDED.processo_classe, stf_julgamentos.processo_classe),
                processo_numero       = COALESCE(EXCLUDED.processo_numero, stf_julgamentos.processo_numero),
                processo_incidente    = COALESCE(EXCLUDED.processo_incidente, stf_julgamentos.processo_incidente),
                processo_url_oficial  = COALESCE(EXCLUDED.processo_url_oficial, stf_julgamentos.processo_url_oficial),
                tema_repercussao_geral= COALESCE(EXCLUDED.tema_repercussao_geral, stf_julgamentos.tema_repercussao_geral),
                resumo                = EXCLUDED.resumo,
                tese_fixada           = COALESCE(EXCLUDED.tese_fixada, stf_julgamentos.tese_fixada),
                resultado             = EXCLUDED.resultado,
                foi_unanime           = EXCLUDED.foi_unanime,
                tipo_sessao           = COALESCE(EXCLUDED.tipo_sessao, stf_julgamentos.tipo_sessao),
                ministros_vencedores  = EXCLUDED.ministros_vencedores,
                ministros_vencidos    = EXCLUDED.ministros_vencidos,
                ministros_impedidos   = EXCLUDED.ministros_impedidos,
                confianca_parsing     = EXCLUDED.confianca_parsing
            """
        ),
        {
            "source_id": e.source_id,
            "source_url": e.source_url,
            "titulo": e.titulo,
            "data_pub": e.data_publicacao,
            "data_julg": e.data_julgamento,
            "classe": e.processo_classe,
            "numero": e.processo_numero,
            "incidente": e.processo_incidente,
            "url_oficial": e.processo_url_oficial,
            "tema": e.tema_repercussao_geral,
            "resumo": e.resumo,
            "tese": e.tese_fixada,
            "resultado": e.resultado,
            "unanime": e.foi_unanime,
            "sessao": e.tipo_sessao,
            "vencedores": e.ministros_vencedores,
            "vencidos": e.ministros_vencidos,
            "impedidos": e.ministros_impedidos,
            "confianca": e.confianca_parsing,
        },
    )
