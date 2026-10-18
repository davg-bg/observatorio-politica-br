"""Geração de digest semanal para usuários com favoritos.

Fluxo:
    1. Busca todos os usuários (auth.users) com pelo menos um favorito.
    2. Para cada usuário, coleta:
       - Votações nos últimos 7 dias dos parlamentares favoritados.
       - Tramitações nos últimos 7 dias das proposições favoritadas.
    3. Monta um HTML simples e envia via Resend.
    4. Se não tiver RESEND_API_KEY, apenas loga (modo dry-run contínuo).

Idempotência: se o digest já foi enviado para um usuário num intervalo recente,
podemos registrar numa tabela `digests_enviados` em uma iteração futura; por
ora, confiamos no cron weekly do GitHub Actions pra garantir a cadência.
"""

from __future__ import annotations

import html
import os
from dataclasses import dataclass, field
from datetime import date, timedelta

import httpx
import structlog
from sqlalchemy import text

from etl.db import get_engine
from etl.ingest_runs import record_run

logger = structlog.get_logger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


@dataclass
class VotacaoDigest:
    descricao: str
    data: str
    tipo_voto: str
    aprovacao: bool | None


@dataclass
class ProposicaoDigest:
    sigla: str
    numero: int
    ano: int
    data_tramitacao: str
    descricao: str


@dataclass
class UserDigest:
    user_id: str
    email: str
    votacoes_recentes: list[VotacaoDigest] = field(default_factory=list)
    tramitacoes_recentes: list[ProposicaoDigest] = field(default_factory=list)
    num_parlamentares: int = 0
    num_proposicoes: int = 0

    @property
    def is_vazio(self) -> bool:
        return not self.votacoes_recentes and not self.tramitacoes_recentes


async def run() -> None:
    """Entry point do job 'digest'."""
    resend_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("ALERT_FROM_EMAIL") or "observatorio@example.com"

    with record_run("alertas", "digest") as run_state:
        await _run(run_state["stats"], resend_key=resend_key, from_email=from_email)


async def _run(stats: dict, *, resend_key: str | None, from_email: str) -> None:
    stats.setdefault("usuarios_processados", 0)
    stats.setdefault("digests_enviados", 0)
    stats.setdefault("digests_vazios", 0)
    stats.setdefault("errors", 0)

    try:
        users = _list_users_with_favorites()
    except Exception as e:
        logger.exception("list_users_failed", error=str(e))
        stats["errors"] += 1
        return

    logger.info("digest_starting", users=len(users), resend=bool(resend_key))

    for user_id, email in users:
        stats["usuarios_processados"] += 1
        try:
            digest = _build_digest(user_id, email)

            if digest.is_vazio:
                stats["digests_vazios"] += 1
                logger.info("digest_vazio_skip", user=email)
                continue

            html_body = _render_html(digest)

            if resend_key:
                await _send_resend(
                    api_key=resend_key,
                    from_email=from_email,
                    to=email,
                    subject=f"Observatório: {_subject_for(digest)}",
                    html_body=html_body,
                )
                stats["digests_enviados"] += 1
                logger.info("digest_sent", user=email)
            else:
                # Dry-run: só loga
                logger.info(
                    "digest_dry_run",
                    user=email,
                    votacoes=len(digest.votacoes_recentes),
                    tramitacoes=len(digest.tramitacoes_recentes),
                )
                stats["digests_enviados"] += 1
        except Exception as e:
            logger.exception("digest_failed_for_user", user=email, error=str(e))
            stats["errors"] += 1


def _list_users_with_favorites() -> list[tuple[str, str]]:
    """Retorna [(user_id, email), ...] dos usuários com pelo menos um favorito.

    Precisa de acesso a `auth.users` — só funciona com service_role_key no
    DATABASE_URL ou se o usuário conectado tiver permissão de admin.
    """
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text(
                """
                SELECT DISTINCT u.id, u.email
                  FROM auth.users u
                 WHERE EXISTS (
                           SELECT 1 FROM favoritos_parlamentares fp WHERE fp.user_id = u.id
                       )
                    OR EXISTS (
                           SELECT 1 FROM favoritos_proposicoes fpr WHERE fpr.user_id = u.id
                       )
                """
            )
        )
        return [(str(r[0]), str(r[1])) for r in result]


def _build_digest(user_id: str, email: str) -> UserDigest:
    """Monta o digest coletando as atividades dos últimos 7 dias."""
    data_corte = date.today() - timedelta(days=7)
    digest = UserDigest(user_id=user_id, email=email)
    engine = get_engine()

    with engine.connect() as conn:
        # Votações recentes dos parlamentares favoritados
        rows = conn.execute(
            text(
                """
                SELECT v.descricao, v.data_hora_registro::date, vo.tipo_voto, v.aprovacao
                  FROM favoritos_parlamentares fp
                  JOIN votos vo ON vo.parlamentar_id = fp.parlamentar_id
                  JOIN votacoes v ON v.id = vo.votacao_id
                 WHERE fp.user_id = :uid
                   AND v.data_hora_registro >= :cutoff
                 ORDER BY v.data_hora_registro DESC
                 LIMIT 20
                """
            ),
            {"uid": user_id, "cutoff": data_corte},
        ).fetchall()
        digest.votacoes_recentes = [
            VotacaoDigest(
                descricao=str(r[0]),
                data=str(r[1]),
                tipo_voto=str(r[2]),
                aprovacao=r[3],
            )
            for r in rows
        ]

        # Tramitações recentes das proposições favoritadas
        rows = conn.execute(
            text(
                """
                SELECT p.sigla_tipo, p.numero, p.ano,
                       COALESCE(t.data, p.data_ultima_tramitacao)::date,
                       COALESCE(t.descricao_tramitacao, p.descricao_tramitacao)
                  FROM favoritos_proposicoes fp
                  JOIN proposicoes p ON p.id = fp.proposicao_id
                  LEFT JOIN tramitacoes t ON t.proposicao_id = p.id
                 WHERE fp.user_id = :uid
                   AND COALESCE(t.data, p.data_ultima_tramitacao) >= :cutoff
                 ORDER BY COALESCE(t.data, p.data_ultima_tramitacao) DESC
                 LIMIT 20
                """
            ),
            {"uid": user_id, "cutoff": data_corte},
        ).fetchall()
        digest.tramitacoes_recentes = [
            ProposicaoDigest(
                sigla=str(r[0]),
                numero=int(r[1]),
                ano=int(r[2]),
                data_tramitacao=str(r[3]),
                descricao=str(r[4] or "(sem descrição)"),
            )
            for r in rows
        ]

        # Totais pra o cabeçalho
        row = conn.execute(
            text(
                """
                SELECT
                    (SELECT COUNT(*) FROM favoritos_parlamentares WHERE user_id = :uid),
                    (SELECT COUNT(*) FROM favoritos_proposicoes WHERE user_id = :uid)
                """
            ),
            {"uid": user_id},
        ).fetchone()
        if row:
            digest.num_parlamentares = int(row[0])
            digest.num_proposicoes = int(row[1])

    return digest


def _render_html(d: UserDigest) -> str:
    """Renderiza HTML inline simples para o email."""
    estilo = "font-family:-apple-system,sans-serif;color:#1e293b;max-width:600px;margin:auto;padding:16px"
    header = (
        f'<h1 style="font-size:18px;margin:0 0 8px 0;">Observatório da Política Brasileira</h1>'
        f'<p style="color:#64748b;font-size:13px;margin:0 0 24px 0;">'
        f"Resumo da semana · {d.num_parlamentares} parlamentar(es) e {d.num_proposicoes} proposição(ões) favoritados"
        f"</p>"
    )

    secoes = []
    if d.votacoes_recentes:
        itens = "".join(
            (
                '<li style="margin:0 0 12px 0;">'
                f"<strong>{_voto_badge(v.tipo_voto)} {html.escape(v.tipo_voto)}</strong>"
                f' <span style="color:#64748b;font-size:12px;">em {html.escape(v.data)}</span><br>'
                f'<span style="font-size:13px;">{html.escape(v.descricao[:200])}</span>'
                "</li>"
            )
            for v in d.votacoes_recentes[:10]
        )
        secoes.append(
            '<h2 style="font-size:15px;margin:24px 0 8px 0;">Votações recentes dos seus favoritos</h2>'
            f'<ul style="list-style:none;padding:0;margin:0;">{itens}</ul>'
        )

    if d.tramitacoes_recentes:
        itens = "".join(
            (
                '<li style="margin:0 0 10px 0;">'
                f'<code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;font-size:12px;">'
                f"{html.escape(t.sigla)} {t.numero}/{t.ano}</code>"
                f' <span style="color:#64748b;font-size:12px;">em {html.escape(t.data_tramitacao)}</span><br>'
                f'<span style="font-size:13px;">{html.escape(t.descricao[:200])}</span>'
                "</li>"
            )
            for t in d.tramitacoes_recentes[:10]
        )
        secoes.append(
            '<h2 style="font-size:15px;margin:24px 0 8px 0;">Tramitações das suas proposições favoritas</h2>'
            f'<ul style="list-style:none;padding:0;margin:0;">{itens}</ul>'
        )

    footer = (
        '<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px 0;">'
        '<p style="color:#94a3b8;font-size:11px;">'
        "Você está recebendo porque favoritou parlamentares/proposições no Observatório. "
        "Para parar, remova os favoritos em /me/favoritos."
        "</p>"
    )
    return f'<div style="{estilo}">{header}{"".join(secoes)}{footer}</div>'


def _voto_badge(tipo: str) -> str:
    """Emoji para visualização rápida do voto no email."""
    return {
        "Sim": "✅",
        "Não": "❌",
        "Abstenção": "⚪",
        "Obstrução": "🟡",
    }.get(tipo, "·")


def _subject_for(d: UserDigest) -> str:
    """Assunto curto que resume o conteúdo."""
    nv = len(d.votacoes_recentes)
    nt = len(d.tramitacoes_recentes)
    if nv and nt:
        return f"{nv} votações e {nt} tramitações dos seus favoritos"
    if nv:
        return f"{nv} votações dos seus favoritos esta semana"
    if nt:
        return f"{nt} tramitações dos seus favoritos esta semana"
    return "Resumo da semana"


async def _send_resend(
    *,
    api_key: str,
    from_email: str,
    to: str,
    subject: str,
    html_body: str,
) -> None:
    """Envia o email via Resend API."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": from_email,
                "to": [to],
                "subject": subject,
                "html": html_body,
            },
        )
        response.raise_for_status()
