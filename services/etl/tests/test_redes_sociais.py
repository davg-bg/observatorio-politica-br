"""Testa o parser de redes sociais."""

from __future__ import annotations

import pytest

from etl.sinks.redes_sociais import parse_redes


def test_empty_list() -> None:
    assert parse_redes([]) == {}


def test_twitter_x_e_facebook() -> None:
    urls = [
        "https://twitter.com/acaciofavacho",
        "https://x.com/outro_handle",
        "https://www.facebook.com/deputadofederalacaciofavacho",
    ]
    result = parse_redes(urls)
    # twitter e x.com caem no mesmo bucket; o último sobrescreve
    assert result["twitter"]["handle"] == "outro_handle"
    assert result["facebook"]["handle"] == "deputadofederalacaciofavacho"


def test_youtube_variants() -> None:
    for url, handle in [
        ("https://youtube.com/channel/UCWNbptIjAriL2pt8H3W6CGw", "UCWNbptIjAriL2pt8H3W6CGw"),
        ("https://www.youtube.com/@algumhandle", "algumhandle"),
        ("https://youtube.com/user/foouser", "foouser"),
        ("https://youtube.com/c/barchannel", "barchannel"),
    ]:
        result = parse_redes([url])
        assert "youtube" in result, f"faltou youtube pra {url}"
        assert result["youtube"]["handle"] == handle


def test_instagram_e_tiktok() -> None:
    result = parse_redes(
        [
            "https://www.instagram.com/handle.com.ponto",
            "https://www.tiktok.com/@tiktokeiro",
        ]
    )
    assert result["instagram"]["handle"] == "handle.com.ponto"
    assert result["tiktok"]["handle"] == "tiktokeiro"


def test_linkedin() -> None:
    result = parse_redes(["https://linkedin.com/in/some-person"])
    assert result["linkedin"]["handle"] == "some-person"


def test_ignores_unknown_and_malformed() -> None:
    result = parse_redes(
        [
            "https://exemplo.com/perfil",
            "",
            None,  # type: ignore[list-item]
            "nao-eh-url",
        ]
    )
    assert result == {}


def test_preserves_original_url() -> None:
    url = "https://twitter.com/foo"
    result = parse_redes([url])
    assert result["twitter"]["url"] == url


@pytest.mark.parametrize(
    "url,expected_platform",
    [
        ("https://twitter.com/foo", "twitter"),
        ("https://x.com/foo", "twitter"),
        ("https://www.instagram.com/foo", "instagram"),
        ("https://facebook.com/foo", "facebook"),
        ("https://youtube.com/@foo", "youtube"),
        ("https://tiktok.com/@foo", "tiktok"),
    ],
)
def test_platform_detection(url: str, expected_platform: str) -> None:
    result = parse_redes([url])
    assert expected_platform in result
