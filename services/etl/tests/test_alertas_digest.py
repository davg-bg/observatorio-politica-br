"""Testes do digest de alertas."""

from __future__ import annotations

from etl.alertas.digest import (
    ProposicaoDigest,
    UserDigest,
    VotacaoDigest,
    _render_html,
    _subject_for,
    _voto_badge,
)


def _make_digest(
    *,
    votacoes: list[VotacaoDigest] | None = None,
    tramitacoes: list[ProposicaoDigest] | None = None,
    num_parlamentares: int = 0,
    num_proposicoes: int = 0,
) -> UserDigest:
    return UserDigest(
        user_id="user-1",
        email="x@example.com",
        votacoes_recentes=votacoes or [],
        tramitacoes_recentes=tramitacoes or [],
        num_parlamentares=num_parlamentares,
        num_proposicoes=num_proposicoes,
    )


# ---------- _voto_badge ----------


def test_voto_badge_conhecidos():
    assert _voto_badge("Sim") == "✅"
    assert _voto_badge("Não") == "❌"
    assert _voto_badge("Abstenção") == "⚪"
    assert _voto_badge("Obstrução") == "🟡"


def test_voto_badge_fallback():
    assert _voto_badge("desconhecido") == "·"
    assert _voto_badge("") == "·"


# ---------- _subject_for ----------


def test_subject_for_so_votacoes():
    d = _make_digest(votacoes=[VotacaoDigest("x", "2025-01-01", "Sim", True)])
    assert "votações" in _subject_for(d)


def test_subject_for_so_tramitacoes():
    d = _make_digest(tramitacoes=[ProposicaoDigest("PL", 1, 2025, "2025-01-01", "x")])
    assert "tramitações" in _subject_for(d)


def test_subject_for_ambos():
    d = _make_digest(
        votacoes=[VotacaoDigest("x", "2025-01-01", "Sim", True)],
        tramitacoes=[ProposicaoDigest("PL", 1, 2025, "2025-01-01", "x")],
    )
    r = _subject_for(d)
    assert "votações" in r and "tramitações" in r


def test_subject_for_vazio():
    assert _subject_for(_make_digest()) == "Resumo da semana"


# ---------- _render_html ----------


def test_render_html_tem_estrutura_basica():
    d = _make_digest(num_parlamentares=2, num_proposicoes=3)
    out = _render_html(d)
    assert "Observatório da Política Brasileira" in out
    assert "2 parlamentar(es)" in out
    assert "3 proposição(ões)" in out


def test_render_html_com_votacoes():
    d = _make_digest(
        votacoes=[
            VotacaoDigest(
                descricao="PL 1234/2025 — Reforma tal",
                data="2025-10-01",
                tipo_voto="Sim",
                aprovacao=True,
            )
        ],
        num_parlamentares=1,
    )
    out = _render_html(d)
    assert "Votações recentes" in out
    assert "Sim" in out
    assert "✅" in out
    assert "PL 1234/2025" in out


def test_render_html_com_tramitacoes():
    d = _make_digest(
        tramitacoes=[
            ProposicaoDigest(
                sigla="PL",
                numero=1234,
                ano=2025,
                data_tramitacao="2025-10-01",
                descricao="Encaminhada à CCJ",
            )
        ],
        num_proposicoes=1,
    )
    out = _render_html(d)
    assert "Tramitações" in out
    assert "PL 1234/2025" in out
    assert "Encaminhada à CCJ" in out


def test_render_html_escapa_html():
    """Garantia contra HTML injection em descrições vindas do banco."""
    d = _make_digest(
        votacoes=[
            VotacaoDigest(
                descricao="<script>alert('xss')</script>",
                data="2025-10-01",
                tipo_voto="Sim",
                aprovacao=True,
            )
        ],
    )
    out = _render_html(d)
    assert "<script>" not in out
    assert "&lt;script&gt;" in out


def test_render_html_vazio_so_header_e_footer():
    d = _make_digest(num_parlamentares=1, num_proposicoes=1)
    out = _render_html(d)
    assert "Votações recentes" not in out
    assert "Tramitações" not in out
    # Mas o footer deve estar lá
    assert "/me/favoritos" in out


# ---------- UserDigest.is_vazio ----------


def test_is_vazio_true_quando_sem_atividade():
    assert _make_digest().is_vazio is True


def test_is_vazio_false_com_votacoes():
    d = _make_digest(votacoes=[VotacaoDigest("x", "2025-01-01", "Sim", True)])
    assert d.is_vazio is False


def test_is_vazio_false_com_tramitacoes():
    d = _make_digest(tramitacoes=[ProposicaoDigest("PL", 1, 2025, "2025-01-01", "x")])
    assert d.is_vazio is False
