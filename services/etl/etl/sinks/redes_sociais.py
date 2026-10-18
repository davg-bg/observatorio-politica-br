"""Normalização de URLs de redes sociais em um dict { plataforma: handle }."""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Padrões por plataforma. Cada entrada é (nome, regex_host, regex_path_handle).
# O handle extraído é a primeira capture group do path.
PATTERNS: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    (
        "twitter",
        re.compile(r"(?:^|\.)(twitter|x)\.com$", re.IGNORECASE),
        re.compile(r"^/@?([A-Za-z0-9_]+)/?"),
    ),
    (
        "instagram",
        re.compile(r"(?:^|\.)instagram\.com$", re.IGNORECASE),
        re.compile(r"^/@?([A-Za-z0-9_.]+)/?"),
    ),
    (
        "facebook",
        re.compile(r"(?:^|\.)facebook\.com$", re.IGNORECASE),
        re.compile(r"^/([A-Za-z0-9._-]+)/?"),
    ),
    (
        "youtube",
        re.compile(r"(?:^|\.)youtube\.com$", re.IGNORECASE),
        re.compile(r"^/(?:@|user/|c/|channel/)?([A-Za-z0-9_-]+)/?"),
    ),
    (
        "tiktok",
        re.compile(r"(?:^|\.)tiktok\.com$", re.IGNORECASE),
        re.compile(r"^/@?([A-Za-z0-9_.]+)/?"),
    ),
    (
        "linkedin",
        re.compile(r"(?:^|\.)linkedin\.com$", re.IGNORECASE),
        re.compile(r"^/in/([A-Za-z0-9_-]+)/?"),
    ),
]


def parse_redes(urls: list[str]) -> dict[str, dict[str, str]]:
    """Converte lista de URLs em { plataforma: { handle, url } }.

    Em caso de múltiplas URLs do mesmo tipo, a última ganha.
    URLs irreconhecíveis são ignoradas (não quebram o pipeline).
    """
    out: dict[str, dict[str, str]] = {}
    for raw in urls:
        if not raw:
            continue
        try:
            parsed = urlparse(raw.strip())
        except ValueError:
            continue
        host = (parsed.netloc or "").lower()
        if not host:
            continue
        # Remove 'www.' pra matching
        host_clean = host.removeprefix("www.")

        for name, host_re, path_re in PATTERNS:
            if not host_re.search(host_clean):
                continue
            match = path_re.search(parsed.path or "/")
            if not match:
                continue
            handle = match.group(1)
            out[name] = {"handle": handle, "url": raw}
            break
    return out
