#!/usr/bin/env python3
"""Evaluate generated meeting summaries against synthetic ground truth."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

SECTIONS = [
    "## Overview",
    "## Key Points",
    "## Decisions Made",
    "## Action Items",
]


def tokenize_significant(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9']+", text.lower())
    return [w for w in words if len(w) > 4]


def keyword_match_ratio(text: str, keywords: Iterable[str]) -> float:
    normalized = text.lower()
    keywords = list(dict.fromkeys(k for k in keywords if k))
    if not keywords:
        return 1.0
    found = sum(1 for keyword in keywords if keyword in normalized)
    return found / len(keywords)


def score_action_items(summary_text: str, ground_truth: dict) -> tuple[float, list[tuple[bool, dict, float]]]:
    items = ground_truth.get("action_items", [])
    if not items:
        return 100.0, []

    details: list[tuple[bool, dict, float]] = []
    found_count = 0

    summary_lower = summary_text.lower()

    for item in items:
        person = str(item.get("person", "")).strip()
        task = str(item.get("task", "")).strip()

        person_match = False
        if person:
            person_match = f"@{person.lower()}" in summary_lower or person.lower() in summary_lower

        task_keywords = tokenize_significant(task)
        task_ratio = keyword_match_ratio(summary_text, task_keywords)

        matched = person_match and task_ratio >= 0.5
        if matched:
            found_count += 1

        details.append((matched, item, task_ratio))

    return (found_count / len(items)) * 100.0, details


def score_phrase_list(summary_text: str, phrases: Iterable[str]) -> tuple[float, list[tuple[bool, str, float]]]:
    phrases = list(phrases)
    if not phrases:
        return 100.0, []

    results: list[tuple[bool, str, float]] = []
    found_count = 0

    for phrase in phrases:
        keywords = tokenize_significant(phrase)
        ratio = keyword_match_ratio(summary_text, keywords)
        matched = ratio >= 0.5
        if matched:
            found_count += 1
        results.append((matched, phrase, ratio))

    return (found_count / len(phrases)) * 100.0, results


def check_structure(summary_text: str) -> tuple[bool, list[str], bool]:
    missing_sections = [section for section in SECTIONS if section not in summary_text]
    title_present = any(line.strip().startswith("TITLE:") for line in summary_text.splitlines())
    structure_ok = not missing_sections and title_present
    return structure_ok, missing_sections, title_present


def print_action_details(details: list[tuple[bool, dict, float]]) -> None:
    print("\nAction Items:")
    for matched, item, ratio in details:
        status = "FOUND" if matched else "MISSING"
        person = item.get("person", "?")
        task = item.get("task", "")
        deadline = item.get("deadline")
        if deadline:
            print(f"- [{status}] @{person}: {task} (deadline: {deadline}) [task keyword ratio: {ratio:.2f}]")
        else:
            print(f"- [{status}] @{person}: {task} [task keyword ratio: {ratio:.2f}]")


def print_phrase_details(header: str, details: list[tuple[bool, str, float]]) -> None:
    print(f"\n{header}:")
    for matched, phrase, ratio in details:
        status = "FOUND" if matched else "MISSING"
        print(f"- [{status}] {phrase} [keyword ratio: {ratio:.2f}]")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="evaluate.py",
        description="Score a summary against synthetic meeting ground truth.",
    )
    parser.add_argument("summary", nargs="?", help="Path to generated summary markdown file")
    parser.add_argument("ground_truth", nargs="?", help="Path to ground truth JSON file")
    args = parser.parse_args(argv)

    if args.summary is None or args.ground_truth is None:
        parser.print_help()
        sys.exit(0)

    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    summary_path = Path(args.summary)
    gt_path = Path(args.ground_truth)

    if not summary_path.exists():
        print(f"ERROR: summary file not found: {summary_path}", file=sys.stderr)
        return 1
    if not gt_path.exists():
        print(f"ERROR: ground truth file not found: {gt_path}", file=sys.stderr)
        return 1

    summary_text = summary_path.read_text(encoding="utf-8")
    ground_truth = json.loads(gt_path.read_text(encoding="utf-8"))

    structure_ok, missing_sections, title_present = check_structure(summary_text)
    action_pct, action_details = score_action_items(summary_text, ground_truth)
    decision_pct, decision_details = score_phrase_list(summary_text, ground_truth.get("decisions", []))
    key_point_pct, key_point_details = score_phrase_list(summary_text, ground_truth.get("key_points_must_include", []))

    print(f"Summary file: {summary_path}")
    print(f"Ground truth: {gt_path}")
    print(f"Action items completeness: {action_pct:.1f}%")
    print(f"Decisions completeness: {decision_pct:.1f}%")
    print(f"Key points completeness: {key_point_pct:.1f}%")
    print(f"Title present: {'YES' if title_present else 'NO'}")
    print(f"All sections present: {'YES' if not missing_sections else 'NO'}")
    if missing_sections:
        print("Missing sections:")
        for section in missing_sections:
            print(f"- {section}")

    print_action_details(action_details)
    print_phrase_details("Decisions", decision_details)
    print_phrase_details("Key Points", key_point_details)

    passed = action_pct == 100.0 and decision_pct == 100.0 and structure_ok
    print(f"\nFinal verdict: {'PASS' if passed else 'FAIL'}")

    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
