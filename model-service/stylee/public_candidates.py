"""Small GAP1 boundary: strict input and exact, request-local gap identity."""
from __future__ import annotations

from dataclasses import replace
import re

from .contracts import Category, GapSuggestion, PublicCandidate, RequestContext


class PublicCandidatesError(ValueError):
    def __init__(self) -> None:
        super().__init__("invalid_public_candidates")


def parse_public_candidates(value: object) -> tuple[PublicCandidate, ...]:
    if not isinstance(value, list) or len(value) > 64:
        raise PublicCandidatesError()
    categories = {"上装", "下装", "连体装", "外套", "鞋履", "包袋", "帽巾", "配饰"}
    result = []
    ids = set()
    for row in value:
        if not isinstance(row, dict) or set(row) != {"candidate_id", "name", "category", "color"}:
            raise PublicCandidatesError()
        candidate_id, name, category, color = (row[key] for key in ("candidate_id", "name", "category", "color"))
        if (not isinstance(candidate_id, str)
                or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9:_-]{0,127}", candidate_id) is None
                or candidate_id in ids
                or not isinstance(name, str) or not name.strip() or len(name) > 200
                or not isinstance(category, str) or category not in categories
                or not isinstance(color, str) or len(color.encode("utf-16-le", "surrogatepass")) > 400):
            raise PublicCandidatesError()
        ids.add(candidate_id)
        result.append(PublicCandidate(candidate_id, name, category, color))
    return tuple(result)


def model_category(value: str, name: str = "") -> Category:
    """Existing App category mapping, shared by wardrobe and public gap input."""
    lowered = str(name or "").lower()
    if value == "帽巾":
        if any(token in lowered for token in ("帽", "cap", "hat", "beanie")):
            return Category.HAT
        if any(token in lowered for token in ("围巾", "丝巾", "领巾", "scarf")):
            return Category.SCARF
        return Category.SCARF
    if value == "配饰":
        return Category.ACCESSORY
    aliases = {"连体装": Category.DRESS, "鞋履": Category.SHOES, "包袋": Category.BAG}
    if value in aliases:
        return aliases[value]
    for category in Category:
        if category.value == value:
            return category
    return Category.TOP


def find_public_candidate(ctx: RequestContext | None, candidate_id: object) -> PublicCandidate | None:
    if ctx is None or not isinstance(candidate_id, str):
        return None
    return next((candidate for candidate in ctx.public_candidates if candidate.candidate_id == candidate_id), None)


def bind_public_gap(suggestion: GapSuggestion, ctx: RequestContext | None) -> GapSuggestion:
    candidate = find_public_candidate(ctx, suggestion.candidate_id)
    if candidate is None:
        return replace(suggestion, candidate_id=None) if suggestion.candidate_id is not None else suggestion
    return replace(suggestion, category=model_category(candidate.category, candidate.name),
                   desc=candidate.name, candidate_id=candidate.candidate_id)
