"""CLI do ETL — ponto de entrada do serviço.

Comandos:
    etl jobs                     # lista jobs disponíveis
    etl run daily                # roda todos os jobs diários
    etl run camara-deputados     # roda um job específico
    etl check                    # verifica conexão com DB
"""

from __future__ import annotations

import asyncio
import sys
from typing import Annotated

import structlog
import typer

from etl.config import settings
from etl.db import check_connection

# Garante UTF-8 no stdout no Windows (cp1252 por padrão não encoda ✓/✗)
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

# Configura structlog para output legível no terminal.
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ]
)
logger = structlog.get_logger(__name__)

app = typer.Typer(
    name="etl",
    help="Observatório da Política Brasileira — pipeline de ingestão de dados.",
    no_args_is_help=True,
)


# ---------- Registro de jobs ----------
# Cada job é uma função async que recebe nenhum argumento e dispara seu trabalho.
# Nova fase adiciona entradas aqui.

JOBS: dict[str, tuple[str, str]] = {
    # key: (module, callable_name)
    "camara-deputados": ("etl.sources.camara.deputados", "run"),
    "senado-senadores": ("etl.sources.senado.senadores", "run"),
    "camara-votacoes": ("etl.sources.camara.votacoes", "run"),
    "camara-proposicoes": ("etl.sources.camara.proposicoes", "run"),
    "camara-mps": ("etl.sources.executivo.mps", "run"),
    "executivo-ministros": ("etl.sources.executivo.ministros", "run"),
    "transparencia-emendas": ("etl.sources.transparencia.emendas", "run"),
    "stf-composicao": ("etl.sources.stf.composicao", "run"),
    "stf-pautas": ("etl.sources.stf.pautas", "run"),
    "stf-julgamentos": ("etl.sources.stf.julgamentos", "run"),
    "alertas-digest": ("etl.alertas.digest", "run"),
}

JOB_GROUPS: dict[str, list[str]] = {
    # Diário: deputados/senadores sempre; votações incrementais (7 dias) rápido;
    # proposições enriquece shells criados pelas votações
    "daily": [
        "camara-deputados",
        "senado-senadores",
        "camara-votacoes",
        "camara-proposicoes",
        "camara-mps",
        "stf-pautas",
    ],
    # Semanal: dados que mudam menos (emendas atualizam execução lentamente,
    # composição ministerial e do STF atualizam quando o código é editado) + digest
    "weekly": [
        "transparencia-emendas",
        "executivo-ministros",
        "stf-composicao",
        "stf-julgamentos",
        "alertas-digest",
    ],
}


async def _refresh_views_after_run(job_names: list[str]) -> None:
    """Refresca views materializadas relevantes ao conjunto de jobs executados.

    Falhas são logadas sem derrubar o pipeline — funções podem não existir
    ainda se migrations estiverem pendentes.
    """
    from sqlalchemy import text

    from etl.db import get_engine

    # Mapeamento: função -> jobs que a tornam útil refrescar
    refreshes: list[tuple[str, bool]] = [
        (
            "SELECT refresh_alinhamento_views()",
            any("votacoes" in n for n in job_names),
        ),
        (
            "SELECT refresh_engavetados()",
            any(n in ("camara-proposicoes", "camara-votacoes") for n in job_names),
        ),
        (
            "SELECT refresh_emendas_views()",
            any("emendas" in n for n in job_names),
        ),
    ]

    for stmt, aplicavel in refreshes:
        if not aplicavel:
            continue
        try:
            with get_engine().begin() as conn:
                conn.execute(text(stmt))
            logger.info("view_refreshed", stmt=stmt)
        except Exception as e:
            logger.warning("view_refresh_skipped", stmt=stmt, error=str(e))


@app.command("jobs")
def list_jobs() -> None:
    """Lista jobs e grupos disponíveis."""
    typer.echo("Jobs disponíveis:")
    for name in sorted(JOBS):
        typer.echo(f"  • {name}")
    typer.echo("")
    typer.echo("Grupos (agendamentos):")
    for group, members in JOB_GROUPS.items():
        typer.echo(f"  • {group}: {', '.join(members) if members else '(vazio)'}")


@app.command("check")
def check() -> None:
    """Verifica conexão com o banco."""
    if check_connection():
        typer.secho("✓ Banco acessível", fg=typer.colors.GREEN)
    else:
        typer.secho("✗ Banco inacessível (verifique DATABASE_URL)", fg=typer.colors.RED)
        raise typer.Exit(code=1)


@app.command("migrate")
def migrate(
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Apenas lista migrations pendentes")
    ] = False,
) -> None:
    """Aplica migrations SQL pendentes de db/migrations/."""
    from etl.migrate import run_pending

    try:
        result = run_pending(dry_run=dry_run)
    except Exception as e:
        typer.secho(f"✗ Erro ao aplicar migrations: {e}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from e

    if result["applied"]:
        verb = "Pendentes" if dry_run else "Aplicadas"
        typer.secho(
            f"✓ {verb}: {', '.join(result['applied'])}",
            fg=typer.colors.GREEN,
        )
    if result["skipped"]:
        typer.secho(
            f"  Já aplicadas: {', '.join(result['skipped'])}",
            fg=typer.colors.BLUE,
        )
    if not result["applied"] and not result["skipped"]:
        typer.secho("Nenhuma migration encontrada.", fg=typer.colors.YELLOW)


@app.command("refresh-views")
def refresh_views() -> None:
    """Refresca views materializadas de alinhamento partidário."""
    from sqlalchemy import text

    from etl.db import get_engine

    try:
        with get_engine().begin() as conn:
            conn.execute(text("SELECT refresh_alinhamento_views()"))
    except Exception as e:
        typer.secho(f"✗ Erro: {e}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from e
    typer.secho("✓ Views de alinhamento refrescadas.", fg=typer.colors.GREEN)


@app.command("run")
def run(
    target: Annotated[
        str, typer.Argument(help="Nome do job ou grupo (ex: daily, camara-deputados)")
    ],
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Não grava no banco")] = False,
    limit: Annotated[
        int | None,
        typer.Option("--limit", help="Limite de registros processados (dev)"),
    ] = None,
) -> None:
    """Executa um job ou grupo de jobs."""
    if dry_run:
        settings.etl_dry_run = True
    if limit is not None:
        settings.etl_limit = limit

    jobs_to_run: list[str]
    if target in JOB_GROUPS:
        jobs_to_run = JOB_GROUPS[target]
        if not jobs_to_run:
            typer.secho(f"Grupo '{target}' está vazio.", fg=typer.colors.YELLOW)
            raise typer.Exit(code=0)
    elif target in JOBS:
        jobs_to_run = [target]
    else:
        typer.secho(f"Job/grupo '{target}' desconhecido.", fg=typer.colors.RED)
        typer.echo("Rode 'etl jobs' para ver a lista.")
        raise typer.Exit(code=1)

    logger.info("run_starting", jobs=jobs_to_run, dry_run=settings.etl_dry_run)
    exit_code = asyncio.run(_run_many(jobs_to_run))
    raise typer.Exit(code=exit_code)


async def _run_many(job_names: list[str]) -> int:
    """Roda jobs sequencialmente. Falha em um job não impede os demais."""
    failures: list[tuple[str, Exception]] = []
    for name in job_names:
        module_name, callable_name = JOBS[name]
        try:
            module = __import__(module_name, fromlist=[callable_name])
            fn = getattr(module, callable_name)
            logger.info("job_starting", job=name)
            if asyncio.iscoroutinefunction(fn):
                await fn()
            else:
                fn()
            logger.info("job_finished", job=name)
        except Exception as e:
            logger.exception("job_failed", job=name)
            failures.append((name, e))

    # Refresca views materializadas conforme os jobs executados
    if not settings.etl_dry_run:
        await _refresh_views_after_run(job_names)

    if failures:
        logger.error("run_finished_with_failures", failures=[name for name, _ in failures])
        return 1
    logger.info("run_finished", jobs=job_names)
    return 0


if __name__ == "__main__":  # pragma: no cover
    app()
