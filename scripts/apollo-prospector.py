#!/usr/bin/env python3
"""
GrantPipe Apollo Prospecting Script
=====================================
Search (free) + enrich (1 credit each) + create in Apollo CRM for
GrantPipe ICP nonprofit segments. Routes contacts to persona-specific
lists (GP-ICP1–GP-ICP4) based on title. Runs until CREDIT_LIMIT reached
or all segments are exhausted.

Usage:
    python scripts/apollo-prospector.py --api-key YOUR_KEY
    python scripts/apollo-prospector.py --api-key YOUR_KEY --credit-limit 500 --dry-run

Resume: re-running automatically skips already-enriched Apollo person IDs
        logged in data/apollo-grantpipe-enrichments.jsonl, and resumes from
        the segment/page stored in data/apollo-prospector-state.json.

Apollo lists to pre-create in Apollo UI (required before first run):
    GP-ICP1 Grants Managers
    GP-ICP2 Executive Directors
    GP-ICP3 Nonprofit Finance
    GP-ICP4 Development Leadership
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR     = Path(__file__).parent.parent
DATA_DIR     = BASE_DIR / "data"
JSONL_FILE   = DATA_DIR / "apollo-grantpipe-enrichments.jsonl"
LOG_FILE     = DATA_DIR / "apollo-prospector.log"
SUMMARY_FILE = DATA_DIR / "apollo-segment-summary.json"
STATE_FILE   = DATA_DIR / "apollo-prospector-state.json"
SEGS_FILE    = DATA_DIR / "apollo-prospector-segments.json"

# ── Apollo endpoints ──────────────────────────────────────────────────────────

BASE_URL   = "https://api.apollo.io/api/v1"
EP_SEARCH  = f"{BASE_URL}/mixed_people/api_search"
EP_ENRICH  = f"{BASE_URL}/people/match"
EP_CONTACT = f"{BASE_URL}/contacts"
EP_PROFILE = f"{BASE_URL}/auth/health"

# ── Pacing (mirrors camaudit-v2 proven settings) ──────────────────────────────

ENRICHMENT_DELAY    = 0.5    # seconds before each enrichment call
CREATE_DELAY        = 1.0    # seconds after each contact creation
SEGMENT_COOLDOWN    = 10.0   # seconds between segments
BACKOFF_START       = 60     # seconds for first 429 backoff
BACKOFF_MAX         = 300    # max backoff seconds
CREDITS_CHECK_EVERY = 100    # re-verify remaining credits every N enrichments

# ── Batch tag ─────────────────────────────────────────────────────────────────

BATCH_TAG = "batch-2026-04-week2-grantpipe-seed"

# ── Persona → Apollo list routing ─────────────────────────────────────────────
# Each tuple is (title_keywords, list_name). First match wins.
# Titles are lowercased before matching.

LIST_ROUTING: list[tuple[list[str], str]] = [
    (
        ["grants manager", "director of grants", "grant writer", "grants administrator",
         "grants coordinator", "grant manager", "director of grant"],
        "GP-ICP1 Grants Managers",
    ),
    (
        ["vp of development", "vp development", "vice president of development",
         "director of development", "director of advancement", "director, development",
         "chief development officer", "development director", "advancement director"],
        "GP-ICP4 Development Leadership",
    ),
    (
        ["cfo", "chief financial officer", "controller", "finance director",
         "director of finance", "compliance manager", "director of compliance",
         "chief compliance officer"],
        "GP-ICP3 Nonprofit Finance",
    ),
    (
        ["executive director", "ceo", "chief executive", "coo", "chief operating",
         "president"],
        "GP-ICP2 Executive Directors",
    ),
]

DEFAULT_LIST = "GP-ICP1 Grants Managers"  # fallback if no routing match


def route_to_list(title: str) -> str:
    title_lower = title.lower()
    for keywords, list_name in LIST_ROUTING:
        if any(kw in title_lower for kw in keywords):
            return list_name
    return DEFAULT_LIST


# ── Search title pool (all 4 personas combined) ───────────────────────────────

SEARCH_TITLES = [
    # ICP1 — Grants Managers
    "Grants Manager",
    "Director of Grants",
    "Grant Writer",
    "Grants Administrator",
    "Grants Coordinator",
    # ICP2 — Executive Directors
    "Executive Director",
    "CEO",
    "COO",
    "President",
    # ICP3 — Nonprofit Finance
    "CFO",
    "Controller",
    "Finance Director",
    "Director of Finance",
    "Compliance Manager",
    # ICP4 — Development Leadership
    "VP of Development",
    "Director of Development",
    "Director of Advancement",
    "Chief Development Officer",
]

# ── Nonprofit industry keywords (vet_person uses these) ──────────────────────

NONPROFIT_INDUSTRIES = {
    "non-profit", "nonprofit", "philanthropy", "charitable",
    "individual & family services", "civic & social organization",
    "religious institutions", "libraries", "museums and institutions",
    "think tanks", "fund-raising",
}

# Industries that indicate for-profit and should be excluded
EXCLUDED_INDUSTRIES = {
    "real estate", "commercial real estate", "property management",
    "financial services", "banking", "insurance", "investment management",
    "retail", "consumer goods", "automotive",
}

# ── Logging setup ─────────────────────────────────────────────────────────────


def setup_logging(log_path: Path) -> logging.Logger:
    logger = logging.getLogger("apollo_grantpipe")
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    sh = logging.StreamHandler(sys.stderr)
    sh.setLevel(logging.WARNING)
    sh.setFormatter(fmt)
    logger.addHandler(sh)
    return logger


# ── Event emission (Monitor-visible stdout) ───────────────────────────────────


def emit(msg: str) -> None:
    """Print one line to stdout — each line becomes a Monitor notification."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Apollo API helpers ────────────────────────────────────────────────────────


class ApolloError(Exception):
    pass


class RateLimited(Exception):
    pass


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }


def _call_with_backoff(
    fn: Any,
    logger: logging.Logger,
    *args: Any,
    **kwargs: Any,
) -> Any:
    """Call fn(*args, **kwargs) with exponential backoff on 429."""
    delay = BACKOFF_START
    for attempt in range(8):
        try:
            return fn(*args, **kwargs)
        except RateLimited:
            wait = min(delay, BACKOFF_MAX)
            emit(f"[RATE LIMIT] sleeping {wait}s (attempt {attempt + 1})")
            logger.warning("Rate limited — sleeping %ds", wait)
            time.sleep(wait)
            delay = min(delay * 2, BACKOFF_MAX)
    raise ApolloError("Rate limit exceeded after 8 retries")


def get_profile(api_key: str) -> dict[str, Any]:
    resp = requests.get(
        EP_PROFILE,
        headers=_headers(api_key),
        timeout=30,
    )
    if resp.status_code == 429:
        raise RateLimited
    resp.raise_for_status()
    return resp.json()  # type: ignore[no-any-return]


def search_people(
    api_key: str,
    segment: dict[str, Any],
    page: int,
    per_page: int = 100,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "person_titles": SEARCH_TITLES,
        "person_locations": ["United States"],
        "page": page,
        "per_page": per_page,
        "include_similar_titles": True,
    }

    # Keyword strategy: q_org_keyword_tags for broad industry filter,
    # q_keywords for literal company-name matching (e.g. "food bank").
    # NOTE: organization_num_employees_ranges conflicts with q_keywords in
    # Apollo's API and returns 0 results — only apply it for tag-based segments.
    if "q_org_keyword_tags" in segment:
        body["q_organization_keyword_tags"] = segment["q_org_keyword_tags"]
        body["organization_num_employees_ranges"] = segment.get(
            "organization_num_employees_ranges",
            ["11,50", "51,200", "201,500", "501,1000"],
        )
    elif "q_keywords" in segment:
        body["q_keywords"] = segment["q_keywords"]

    resp = requests.post(
        EP_SEARCH,
        headers=_headers(api_key),
        json=body,
        timeout=30,
    )
    if resp.status_code == 429:
        raise RateLimited
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    # api_search returns total_entries at top level; normalise to match old shape
    if "total_entries" in data and "pagination" not in data:
        data["pagination"] = {"total_entries": data["total_entries"]}
    return data  # type: ignore[no-any-return]


def enrich_person(api_key: str, apollo_id: str) -> dict[str, Any] | None:
    body = {"id": apollo_id, "reveal_personal_emails": True}
    resp = requests.post(
        EP_ENRICH,
        headers=_headers(api_key),
        json=body,
        timeout=30,
    )
    if resp.status_code == 429:
        raise RateLimited
    if resp.status_code in (404, 422):
        return None
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    return data.get("person") or data.get("match")  # type: ignore[return-value]


def create_contact(
    api_key: str,
    contact: dict[str, Any],
    dry_run: bool,
) -> str | None:
    if dry_run:
        return "dry-run-id"
    resp = requests.post(
        EP_CONTACT,
        headers=_headers(api_key),
        json=contact,
        timeout=30,
    )
    if resp.status_code == 429:
        raise RateLimited
    if resp.status_code in (400, 409, 422):
        return None
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    contact_obj: dict[str, Any] = data.get("contact", {})
    return str(contact_obj.get("id", "")) or None


# ── Vetting logic ─────────────────────────────────────────────────────────────


def vet_person(
    person: dict[str, Any],
    segment: dict[str, Any],
) -> tuple[bool, str]:
    """Return (keep, reason). Nonprofit-specific filters."""
    email = (person.get("email") or "").strip()
    personal_emails: list[str] = person.get("personal_emails") or []
    if not email and not personal_emails:
        return False, "no email"

    country = (person.get("country") or "").lower()
    if country and country not in ("united states", "us", "usa", ""):
        return False, f"non-US ({country})"

    org: dict[str, Any] = person.get("organization") or {}
    industry = (org.get("industry") or "").lower()

    # Hard exclude clearly for-profit industries
    if any(term in industry for term in EXCLUDED_INDUSTRIES):
        return False, f"excluded industry ({industry})"

    # Title must be one of the 4 ICP personas
    title = (person.get("title") or "").lower()
    if not title:
        return False, "no title"

    org_name = (org.get("name") or person.get("organization_name") or "").lower()
    if not org_name:
        return False, "no org name"

    # Exclude mega-nonprofits (national HQs)
    for excluded in segment.get("exclude_lower", []):
        if excluded.lower() in org_name:
            return False, f"mega-nonprofit excluded ({excluded})"

    # Size guard: exclude very large orgs (10k+ employees = Tier 1 hospital system etc.)
    num_employees: int = org.get("estimated_num_employees") or org.get("num_employees") or 0
    if num_employees and num_employees > 5000:
        return False, f"too large ({num_employees} emp)"

    return True, ""


# ── State helpers ─────────────────────────────────────────────────────────────

DEFAULT_STATE: dict[str, Any] = {
    "segment_index": 0,
    "page": 1,
    "credits_used": 0,
    "contacts_created": 0,
    "contacts_skipped": 0,
    "credit_limit": 1400,
    "batch_size": 10,
    "status": "running",
    "started_at": None,
    "last_run_at": None,
    "segment_credits": {},
}


def load_state() -> dict[str, Any]:
    if STATE_FILE.exists():
        with STATE_FILE.open(encoding="utf-8") as f:
            return json.load(f)
    return dict(DEFAULT_STATE)


def save_state(state: dict[str, Any]) -> None:
    state["last_run_at"] = datetime.now(timezone.utc).isoformat()
    with STATE_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def load_segments() -> list[dict[str, Any]]:
    if SEGS_FILE.exists():
        with SEGS_FILE.open(encoding="utf-8") as f:
            return json.load(f)
    raise FileNotFoundError(f"Segments file not found: {SEGS_FILE}")


def load_seen_ids() -> set[str]:
    seen: set[str] = set()
    if not JSONL_FILE.exists():
        return seen
    with JSONL_FILE.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                pid = obj.get("apollo_person_id")
                if pid:
                    seen.add(pid)
            except json.JSONDecodeError:
                pass
    return seen


def append_jsonl(record: dict[str, Any]) -> None:
    with JSONL_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def save_summary(summary: dict[str, Any]) -> None:
    with SUMMARY_FILE.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)


# ── Main prospecting loop ─────────────────────────────────────────────────────


def run_prospector(api_key: str, credit_limit: int, dry_run: bool) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    logger = setup_logging(LOG_FILE)

    if dry_run:
        emit("[DRY RUN] No credits will be consumed, no contacts created")

    segments = load_segments()
    state = load_state()

    # Initialize started_at on first real run
    if state.get("started_at") is None and not dry_run:
        state["started_at"] = datetime.now(timezone.utc).isoformat()

    # Override credit_limit from CLI if provided
    if credit_limit != state.get("credit_limit", 1400):
        state["credit_limit"] = credit_limit
    credit_limit = state["credit_limit"]

    seen_ids = load_seen_ids()
    emit(
        f"[RESUME] seg={state['segment_index']} page={state['page']} "
        f"credits={state['credits_used']}/{credit_limit} "
        f"seen={len(seen_ids)} IDs"
    )
    logger.info(
        "Resume: seg=%d page=%d credits=%d/%d seen=%d",
        state["segment_index"], state["page"],
        state["credits_used"], credit_limit, len(seen_ids),
    )

    if state.get("status") == "done" or state["credits_used"] >= credit_limit:
        emit(
            f"[COMPLETE] {state['credits_used']}/{credit_limit} credits | "
            f"{state['contacts_created']} contacts created"
        )
        return

    # Verify key is live
    try:
        profile = _call_with_backoff(get_profile, logger, api_key)
        logged_in = profile.get("is_logged_in", False)
        emit(f"[AUTH] Apollo key valid — logged_in={logged_in}")
    except Exception as exc:
        emit(f"[WARN] Could not verify Apollo key: {exc}")

    segment_summaries: dict[str, Any] = {}

    for seg_idx in range(state["segment_index"], len(segments)):
        segment = segments[seg_idx]
        seg_name: str = segment["name"]
        seg_max: int = segment.get("max_credits", 100)
        seg_credits_already: int = state["segment_credits"].get(seg_name, 0)

        if state["credits_used"] >= credit_limit:
            emit(f"[DONE] Credit limit {credit_limit} reached — stopping")
            state["status"] = "done"
            save_state(state)
            break

        if seg_credits_already >= seg_max:
            emit(f"[SKIP SEG] {seg_name} already at {seg_credits_already}/{seg_max} credits")
            if seg_idx == state["segment_index"]:
                state["segment_index"] += 1
                state["page"] = 1
                save_state(state)
            continue

        credits_remaining_seg = seg_max - seg_credits_already
        emit(
            f"[SEGMENT {seg_idx + 1}/{len(segments)}] {seg_name} | "
            f"{seg_credits_already}/{seg_max} credits used | "
            f"{credits_remaining_seg} remaining in segment"
        )
        logger.info("=== Segment: %s (already %d/%d) ===", seg_name, seg_credits_already, seg_max)

        seg_created_this_run = 0
        seg_skipped_this_run = 0

        # Start from saved page for current segment, page 1 for subsequent
        start_page = state["page"] if seg_idx == state["segment_index"] else 1

        page = start_page
        seg_done = False

        while not seg_done:
            seg_credits_now = state["segment_credits"].get(seg_name, 0)
            if seg_credits_now >= seg_max:
                emit(f"[SEGMENT DONE] {seg_name} | {seg_credits_now}/{seg_max} credits")
                seg_done = True
                break

            if state["credits_used"] >= credit_limit:
                emit("[DONE] Credit limit reached mid-segment")
                state["status"] = "done"
                seg_done = True
                break

            try:
                results = _call_with_backoff(
                    search_people, logger, api_key, segment, page
                )
            except ApolloError as exc:
                emit(f"[ERROR] Search failed for {seg_name} page {page}: {exc}")
                logger.error("Search error: %s", exc)
                break

            people: list[dict[str, Any]] = results.get("people", [])
            if not people:
                emit(f"[SEGMENT DONE] {seg_name} | no more results on page {page}")
                seg_done = True
                break

            emit(
                f"[SEARCH] {seg_name} page={page} | "
                f"{len(people)} results | "
                f"seg={state['segment_credits'].get(seg_name, 0)}/{seg_max} | "
                f"total={state['credits_used']}/{credit_limit}"
            )
            logger.info("Page %d: %d people for %s", page, len(people), seg_name)

            for person in people:
                seg_credits_now = state["segment_credits"].get(seg_name, 0)
                if seg_credits_now >= seg_max:
                    seg_done = True
                    break
                if state["credits_used"] >= credit_limit:
                    state["status"] = "done"
                    seg_done = True
                    break

                apollo_id: str = person.get("id", "")
                if not apollo_id or apollo_id in seen_ids:
                    continue

                # Enrich (costs 1 credit)
                time.sleep(ENRICHMENT_DELAY)
                try:
                    enriched = _call_with_backoff(enrich_person, logger, api_key, apollo_id)
                except ApolloError as exc:
                    emit(f"[ERROR] Enrich failed {apollo_id}: {exc}")
                    logger.error("Enrich error: %s", exc)
                    continue

                if enriched is None:
                    seen_ids.add(apollo_id)
                    logger.debug("Enrich returned None for %s", apollo_id)
                    continue

                seen_ids.add(apollo_id)
                if not dry_run:
                    state["credits_used"] += 1
                    state["segment_credits"][seg_name] = (
                        state["segment_credits"].get(seg_name, 0) + 1
                    )

                # Periodic progress checkpoint
                if state["credits_used"] > 0 and state["credits_used"] % CREDITS_CHECK_EVERY == 0:
                    emit(
                        f"[CHECKPOINT] {state['credits_used']}/{credit_limit} credits used | "
                        f"{state['contacts_created']} contacts created"
                    )

                # Vet
                keep, reason = vet_person(enriched, segment)

                first_name: str = enriched.get("first_name") or person.get("first_name") or ""
                last_name: str = enriched.get("last_name") or person.get("last_name") or ""
                email: str = enriched.get("email") or ""
                personal_emails: list[str] = enriched.get("personal_emails") or []
                title: str = enriched.get("title") or person.get("title") or ""
                org: dict[str, Any] = enriched.get("organization") or {}
                org_name: str = (
                    org.get("name") or enriched.get("organization_name") or ""
                )
                website: str = org.get("website_url") or ""
                city: str = enriched.get("city") or ""
                us_state: str = enriched.get("state") or ""
                location_str = ", ".join(filter(None, [city, us_state]))

                # Route to appropriate persona list
                apollo_list = route_to_list(title)

                if not keep:
                    seg_skipped_this_run += 1
                    state["contacts_skipped"] += 1
                    emit(
                        f"[SKIP-VET] {first_name} {last_name} | {reason} | "
                        f"credit {state['credits_used']}/{credit_limit}"
                    )
                    append_jsonl({
                        "apollo_person_id": apollo_id,
                        "apollo_contact_id": None,
                        "first_name": first_name,
                        "last_name": last_name,
                        "email": email,
                        "personal_emails": personal_emails,
                        "title": title,
                        "organization_name": org_name,
                        "apollo_list": apollo_list,
                        "segment": seg_name,
                        "tier": segment.get("tier", "B"),
                        "batch_tag": BATCH_TAG,
                        "vetted": False,
                        "skip_reason": reason,
                        "enriched_at": datetime.now(timezone.utc).isoformat(),
                    })
                    continue

                # Create in Apollo CRM
                contact_payload: dict[str, Any] = {
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email or (personal_emails[0] if personal_emails else ""),
                    "title": title,
                    "organization_name": org_name,
                    "website_url": website,
                    "present_raw_address": location_str,
                    "label_names": [apollo_list],
                    "run_dedupe": True,
                }

                try:
                    contact_id = _call_with_backoff(
                        create_contact, logger, api_key, contact_payload, dry_run
                    )
                except ApolloError as exc:
                    emit(f"[ERROR] Create failed {first_name} {last_name}: {exc}")
                    logger.error("Create error: %s", exc)
                    contact_id = None

                state["contacts_created"] += 1
                seg_created_this_run += 1

                append_jsonl({
                    "apollo_person_id": apollo_id,
                    "apollo_contact_id": contact_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "personal_emails": personal_emails,
                    "title": title,
                    "organization_name": org_name,
                    "apollo_list": apollo_list,
                    "segment": seg_name,
                    "tier": segment.get("tier", "B"),
                    "batch_tag": BATCH_TAG,
                    "vetted": True,
                    "skip_reason": None,
                    "enriched_at": datetime.now(timezone.utc).isoformat(),
                })

                emit(
                    f"[CREATE] {first_name} {last_name} | {title} | {org_name} | "
                    f"{email or (personal_emails[0] if personal_emails else 'no-email')} | "
                    f"list={apollo_list} | credit {state['credits_used']}/{credit_limit}"
                )
                logger.info(
                    "Created: %s %s | %s | %s | list=%s | id=%s",
                    first_name, last_name, org_name, email, apollo_list, contact_id,
                )
                time.sleep(CREATE_DELAY)

            # Save state after each page
            state["segment_index"] = seg_idx
            state["page"] = page + 1
            save_state(state)

            if not seg_done:
                page += 1

        # Segment complete — advance
        final_seg_credits = state["segment_credits"].get(seg_name, 0)
        segment_summaries[seg_name] = {
            "tier": segment.get("tier", "B"),
            "created_this_run": seg_created_this_run,
            "skipped_this_run": seg_skipped_this_run,
            "credits_total": final_seg_credits,
        }
        save_summary(segment_summaries)

        emit(
            f"[SEGMENT DONE] {seg_name} | "
            f"+{seg_created_this_run} created this run | "
            f"{final_seg_credits}/{seg_max} credits total"
        )
        logger.info(
            "Segment complete: %s — +%d created, %d credits total",
            seg_name, seg_created_this_run, final_seg_credits,
        )

        # Advance to next segment
        state["segment_index"] = seg_idx + 1
        state["page"] = 1
        save_state(state)

        if state.get("status") == "done":
            break

        if seg_idx < len(segments) - 1 and state["credits_used"] < credit_limit:
            emit(f"[COOLDOWN] {SEGMENT_COOLDOWN}s before next segment")
            time.sleep(SEGMENT_COOLDOWN)

    if state["segment_index"] >= len(segments):
        state["status"] = "done"
        save_state(state)

    emit(
        f"[DONE] Run complete | "
        f"{state['credits_used']}/{credit_limit} credits | "
        f"{state['contacts_created']} contacts created"
    )
    logger.info(
        "Run complete: %d/%d credits, %d contacts",
        state["credits_used"], credit_limit, state["contacts_created"],
    )
    save_summary(segment_summaries)


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="GrantPipe Apollo nonprofit prospecting script")
    parser.add_argument("--api-key", required=True, help="Apollo API key")
    parser.add_argument(
        "--credit-limit",
        type=int,
        default=1400,
        help="Total enrichment credits to spend (default: 1400)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Search and vet but do not create contacts or consume credits",
    )
    args = parser.parse_args()

    run_prospector(
        api_key=args.api_key,
        credit_limit=args.credit_limit,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
