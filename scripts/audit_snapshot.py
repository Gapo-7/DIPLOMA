"""Check the imported public snapshot against its saved sitemap.

Run from anywhere: python scripts/audit_snapshot.py
This script reads local files only. It does not test the original server or forms.
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET


REPO = Path(__file__).resolve().parents[1]
SNAPSHOT = REPO / "prototype" / "snapshot"
SOURCE = REPO / "docs" / "source-snapshot"
ORIGIN = "87.255.201.20:8000"


def local_path(url: str) -> Path:
    parsed = urlsplit(url)
    if parsed.scheme != "http" or parsed.netloc != ORIGIN or parsed.query or parsed.fragment:
        raise ValueError(f"Unexpected sitemap URL: {url}")
    path = unquote(parsed.path)
    parts = path.strip("/").split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"Unsafe sitemap path: {url}")
    result = SNAPSHOT.joinpath(*parts)
    return result / "index.html" if path.endswith("/") else result


class PageLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.static_paths: set[str] = set()
        self.filled_csrf = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "input" and values.get("name") == "csrfmiddlewaretoken":
            self.filled_csrf += bool(values.get("value"))
        for key in ("src", "href"):
            value = values.get(key)
            if value:
                path = unquote(urlsplit(value).path)
                if path.startswith("/static/"):
                    self.static_paths.add(path)


def main() -> int:
    sitemap = ET.parse(SOURCE / "sitemap.xml")
    urls = [node.text for node in sitemap.iter() if node.tag.rsplit("}", 1)[-1] == "loc"]
    if any(url is None for url in urls) or len(urls) != len(set(urls)):
        raise ValueError("Sitemap has empty or duplicate URLs")
    listed = {local_path(url) for url in urls if url is not None}

    missing_urls = (SOURCE / "missing_urls.txt").read_text(encoding="utf-8").splitlines()
    if len(missing_urls) != len(set(missing_urls)):
        raise ValueError("Missing URL list has duplicates")
    reported_missing = {local_path(url) for url in missing_urls}
    actual_missing = {path for path in listed if not path.is_file()}

    html_files = set(SNAPSHOT.rglob("*.html"))
    absent_static: set[str] = set()
    filled_csrf = 0
    for file in html_files:
        page = PageLinks()
        page.feed(file.read_text(encoding="utf-8-sig"))
        filled_csrf += page.filled_csrf
        for path in page.static_paths:
            if not (SNAPSHOT / path.lstrip("/")).is_file():
                absent_static.add(path)

    print(f"Sitemap URLs: {len(urls)}")
    print(f"Saved sitemap pages: {len(listed - actual_missing)}")
    print(f"Missing sitemap pages: {len(actual_missing)}")
    print(f"HTML files outside sitemap: {len(html_files - listed)}")
    print(f"Missing static paths: {len(absent_static)}")
    print(f"Filled CSRF fields: {filled_csrf}")
    for path in sorted(absent_static):
        print(f"  {path}")

    if actual_missing != reported_missing:
        print(f"Missing list mismatch: {len(actual_missing ^ reported_missing)} URLs")
        return 1
    if filled_csrf:
        return 1
    print("Audit passed: missing_urls.txt matches the local sitemap gaps.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
