"""good_for controlled-vocabulary enforcement — at the helper and ORM layers."""

import uuid

import pytest

from app.models.enums import EnrichmentStatus, Level
from app.models.place import Place
from app.vocab import GOOD_FOR_TAGS, validate_good_for


def test_on_list_tags_pass():
    assert validate_good_for(["beach", "food"]) == ["beach", "food"]


def test_none_passes_through():
    assert validate_good_for(None) is None


def test_off_list_tag_rejected():
    with pytest.raises(ValueError):
        validate_good_for(["beaches"])  # plural drift — the exact rot we prevent


def test_orm_write_enforces_vocab():
    p = Place(id=uuid.uuid4(), level=Level.city, name_he="x", name_en="x", slug="x")
    with pytest.raises(ValueError):
        p.good_for = ["nope"]
    p.good_for = ["culture"]
    assert p.good_for == ["culture"]


def test_enrichment_defaults_to_stub_on_insert():
    # default fires on insert; the column is documented stub|partial|enriched
    assert {s.value for s in EnrichmentStatus} == {"stub", "partial", "enriched"}
    assert "beach" in GOOD_FOR_TAGS
