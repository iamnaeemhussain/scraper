"""HTML helpers used by the live adapters.

Uses Scrapling's parser when available (it is built on lxml), otherwise falls back
to lxml.html directly. Only structured, publicly rendered markup is read — no
anti-bot circumvention, no JS challenge solving.
"""
from __future__ import annotations

import json
import re
from typing import Any, Iterable

try:
    from scrapling.parser import Selector as ScraplingSelector

    _HAS_SCRAPLING_SELECTOR = True
except Exception:  # pragma: no cover - optional dependency
    ScraplingSelector = None  # type: ignore[assignment]
    _HAS_SCRAPLING_SELECTOR = False

try:
    import lxml.html

    _HAS_LXML = True
except Exception:  # pragma: no cover - optional dependency
    _HAS_LXML = False
    lxml = None  # type: ignore[assignment]


class HtmlUnavailable(RuntimeError):
    pass


class Node:
    """Uniform wrapper so adapters do not care which parser produced the node."""

    def __init__(self, node: Any, backend: str):
        self._node = node
        self._backend = backend

    @property
    def text(self) -> str:
        try:
            if self._backend == "lxml":
                value = self._node.text_content()
            else:
                value = getattr(self._node, "text", "") or ""
        except Exception:
            value = ""
        return re.sub(r"\s+", " ", value or "").strip()

    @property
    def html(self) -> str:
        try:
            if self._backend == "lxml":
                return lxml.html.tostring(self._node, encoding="unicode")
            return getattr(self._node, "html_content", "") or ""
        except Exception:
            return ""

    def attr(self, name: str) -> str | None:
        try:
            if self._backend == "lxml":
                return self._node.get(name)
            return self._node.attrib.get(name)
        except Exception:
            return None

    def css(self, selector: str) -> list["Node"]:
        return select_nodes(self._node, selector, backend=self._backend)


def parse(html: str) -> Any:
    if _HAS_LXML:
        try:
            return lxml.html.fromstring(html)
        except Exception:
            return None
    if _HAS_SCRAPLING_SELECTOR:
        return ScraplingSelector(html)
    raise HtmlUnavailable("No HTML parser available. Install lxml (pip install lxml).")


def _split_selector(selector: str) -> tuple[string, str | None]:
    """Support `a::attr(href)` and `h2::text` shorthand."""
    match = re.match(r"^(?P<base>.*?)::(?:attr\((?P<attr>[\w\-]+)\)|text)$", selector.strip())
    if match:
        return match.group("base").strip() or "*", match.group("attr") or "text"
    return selector.strip(), None


def _cssselect(node: Any, selector: str, backend: str) -> list[Any]:
    if backend == "lxml":
        return list(node.cssselect(selector))
    try:
        return list(node.css(selector))
    except Exception:
        return []


def select_nodes(node: Any, selector: str, *, backend: str | None = None) -> list[Node]:
    base, pseudo = _split_selector(selector)
    backend = backend or ("lxml" if _HAS_LXML else "scrapling")
    raw = _cssselect(node, base, backend)
    if pseudo == "text":
        return [Node(r, backend) for r in raw]
    return [Node(r, backend) for r in raw]


def select(html_or_node: Any, selector: str) -> list[Node]:
    """Select nodes from an HTML string or an existing Node."""
    if isinstance(html_or_node, Node):
        node = html_or_node
    else:
        node = parse(html_or_node)
        if node is None:
            return []
        node = Node(node, backend="lxml" if _HAS_LXML else "scrapling")
    return select_nodes(node._node, selector, backend=node._backend)


def text_of(root: Any, selector: str, default: str | None = None) -> str | None:
    if not selector:
        return default
    base, pseudo = _split_selector(selector)
    nodes = _cssselect(root._node if isinstance(root, Node) else root, base,
                       root._backend if isinstance(root, Node) else "lxml")
    if not nodes:
        return default
    node = Node(nodes[0], root._backend if isinstance(root, Node) else "lxml")
    if pseudo and pseudo != "text":
        return node.attr(pseudo) or default
    return node.text or default


def extract_first_matching(root: Any, selectors: Iterable[str]) -> str | None:
    for selector in selectors:
        if not selector:
            continue
        value = text_of(root, selector)
        if value:
            return value
    return None


# --------------------------------------------------------------------------- #
# Structured data extraction
# --------------------------------------------------------------------------- #
def json_ld_blocks(html: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    ):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict) and "@graph" in item:
                blocks.extend([g for g in item["@graph"] if isinstance(g, dict)])
            elif isinstance(item, dict):
                blocks.append(item)
    return blocks


ORG_TYPES = {
    "Organization", "LocalBusiness", "Corporation", "Store", "Restaurant", "Dentist",
    "MedicalBusiness", "AutoRepair", "ProfessionalService", "HomeAndConstructionBusiness",
    "LegalService", "AccountingService", "RealEstateAgent", "HealthAndBeautyBusiness",
    "FinancialService", "EducationalOrganization", "NGO", "Pharmacy", "VeterinaryCare",
}


def organization_from_json_ld(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    for block in blocks:
        types = block.get("@type")
        type_list = types if isinstance(types, list) else [types]
        if not any(t in ORG_TYPES for t in type_list if isinstance(t, str)):
            continue
        address = block.get("address") or {}
        if isinstance(address, list):
            address = address[0] if address and isinstance(address[0], dict) else {}
        if isinstance(address, str):
            address = {"streetAddress": address}
        email = block.get("email")
        if isinstance(email, list):
            email = email[0] if email else None
        telephone = block.get("telephone")
        if isinstance(telephone, list):
            telephone = telephone[0] if telephone else None
        website = block.get("url")
        if isinstance(website, list):
            website = website[0] if website else None
        return {
            "business_name": block.get("name"),
            "phone": telephone,
            "email": str(email).replace("mailto:", "") if email else None,
            "address_line1": address.get("streetAddress"),
            "city": address.get("addressLocality"),
            "state": address.get("addressRegion"),
            "zip_code": address.get("postalCode"),
            "country": address.get("addressCountry"),
            "industry": type_list[0] if type_list else None,
            "website": website,
            "contact_title": None,
            "contact_name": None,
        }
    return {}


def contact_links(html: str) -> dict[str, list[str]]:
    telephones = re.findall(r'href=["\']tel:([^"\']+)["\']', html, re.IGNORECASE)
    emails = re.findall(r'href=["\']mailto:([^"\'?]+)', html, re.IGNORECASE)
    return {"phones": telephones, "emails": emails}


def looks_like_contact_page(html: str) -> bool:
    lowered = html.lower()
    return any(token in lowered for token in ("contact us", "get in touch", "contact information"))
