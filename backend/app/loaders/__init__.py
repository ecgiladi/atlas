"""Macro-level seed loaders (continents + ~195 countries).

Each source module separates a network `fetch_*` from a pure `parse_*`/`compute_*`
so the parsers are unit-testable with fixtures and no network. The orchestrator is
`seed_countries.py`.
"""
