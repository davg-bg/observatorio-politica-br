"""Job: busca Medidas Provisórias ativas na API da Câmara.

MPs têm siglaTipo='MPV' na API. Como já temos `camara-proposicoes` que
enriquece shells existentes, aqui apenas descobrimos novas MPs via GET
/proposicoes?siglaTipo=MPV&ano=... e inserimos shells.

Rodando daily, mantemos a lista atualizada.
"""

from __future__ import annotations

from datetime import date

import structlog

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run
from etl.sinks.votacoes import upsert_proposicao_shell

from ..camara.client import CamaraClient

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point: ingere shells de MPs do ano atual + anterior."""
    hoje = date.today()
    anos = [hoje.year, hoje.year - 1]

    async with CamaraClient() as client:
        with record_run("camara", "mps") as run_state:
            await _process(client, run_state["stats"], anos=anos)


async def _process(client: CamaraClient, stats: dict, *, anos: list[int]) -> None:
    stats.setdefault("mps_vistas", 0)
    stats.setdefault("mps_shells", 0)
    stats.setdefault("errors", 0)

    limit = settings.etl_limit
    count = 0

    for ano in anos:
        try:
            # /proposicoes?siglaTipo=MPV&ano=X — API suporta esse filtro.
            # Como o método list não aceita siglaTipo direto, usamos get_json cru.
            pagina = 1
            while True:
                if limit is not None and count >= limit:
                    return
                raw = await client._http.get_json(  # type: ignore[attr-defined]
                    "/proposicoes",
                    params={
                        "siglaTipo": "MPV",
                        "ano": ano,
                        "itens": 100,
                        "pagina": pagina,
                        "ordem": "DESC",
                        "ordenarPor": "id",
                    },
                )
                dados = raw.get("dados") or []
                if not dados:
                    break

                for item in dados:
                    if limit is not None and count >= limit:
                        return
                    stats["mps_vistas"] += 1
                    count += 1
                    try:
                        with session_scope() as session:
                            upsert_proposicao_shell(
                                session,
                                casa="camara",
                                source_id=str(item["id"]),
                                sigla_tipo=item.get("siglaTipo") or "MPV",
                                numero=int(item.get("numero") or 0),
                                ano=int(item.get("ano") or ano),
                                ementa=item.get("ementa") or "",
                                uri=item.get("uri"),
                            )
                            stats["mps_shells"] += 1
                    except Exception as e:
                        logger.warning("upsert_mp_failed", source_id=item.get("id"), error=str(e))
                        stats["errors"] += 1

                links = raw.get("links") or []
                has_next = any(link.get("rel") == "next" for link in links)
                if not has_next:
                    break
                pagina += 1
        except Exception as e:
            logger.exception("list_mps_failed", ano=ano, error=str(e))
            stats["errors"] += 1
