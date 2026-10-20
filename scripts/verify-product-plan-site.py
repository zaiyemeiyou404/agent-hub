#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
source = repo / "docs/plans/2026-10-20-agenthub-mobile-desktop-product-plan.md"
site = repo / ".site/product-plan/index.html"

errors: list[str] = []
text = source.read_text(encoding="utf-8")

required = [
    "v2.0（可行性与实施基线）",
    "可行性结论",
    "详细工作分解结构（WBS）",
    "RACI 与决策机制",
    "安全威胁模型与隐私基线",
    "Linux 生产架构、SLO 与灾备",
    "本计划的 Linux 发布与维护",
]
for marker in required:
    if marker not in text:
        errors.append(f"missing required section: {marker}")

# Reject common credential shapes and URL-carried secrets. Example placeholders are allowed.
secret_patterns = {
    "URL token": r"[?&](?:token|api_key|key|secret)=[^*\s\])]+",
    "OpenAI-style key": r"\bsk-[A-Za-z0-9_-]{20,}\b",
    "GitHub-style token": r"\bgh[pousr]_[A-Za-z0-9]{20,}\b",
    "AWS access key": r"\bAKIA[0-9A-Z]{16}\b",
    "Bearer token": r"Bearer\s+[A-Za-z0-9._~+/-]{20,}",
}
for name, pattern in secret_patterns.items():
    if re.search(pattern, text, re.IGNORECASE):
        errors.append(f"possible {name} in source")

if not site.is_file():
    errors.append(f"built site missing: {site}")
else:
    html = site.read_text(encoding="utf-8")
    for marker in ("AgentHub 移动端与桌面端产品化项目计划书", "可行性结论", "Linux 生产架构"):
        if marker not in html:
            errors.append(f"built HTML missing marker: {marker}")

if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    raise SystemExit(1)

print(f"Verified source and static site: {source} -> {site}")
