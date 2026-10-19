#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
workflow = ROOT / ".github/workflows/agent-hub-images.yml"
compose = ROOT / "workspace/docker-compose.agent-hub.images.yml"
docs = ROOT / "AGENT_HUB.md"

assert workflow.exists(), "GHCR build workflow is missing"
assert compose.exists(), "prebuilt-image Compose file is missing"

workflow_text = workflow.read_text()
compose_text = compose.read_text()
docs_text = docs.read_text()

for permission in ("contents: read", "packages: write", "id-token: write", "attestations: write"):
    assert permission in workflow_text, f"missing least-privilege workflow permission: {permission}"

uses = re.findall(r"^\s*uses:\s*([^\s]+)", workflow_text, re.MULTILINE)
assert uses, "workflow does not use any actions"
for action in uses:
    ref = action.rsplit("@", 1)[-1]
    assert re.fullmatch(r"[0-9a-f]{40}", ref), f"action is not pinned to a full commit SHA: {action}"

for image in ("agent-hub-backend", "agent-hub-frontend"):
    assert image in workflow_text, f"workflow does not publish {image}"
    assert image in compose_text, f"Compose does not consume {image}"

assert "branches: [develop]" not in workflow_text, "image workflow must be testable from feature branches"
assert ":develop" not in workflow_text, "published images must use immutable commit tags only"
assert "github.sha" in workflow_text, "workflow does not tag images by commit SHA"
assert "smoke:" in workflow_text, "workflow does not verify the published images"
assert "needs: build" in workflow_text, "image smoke test is not ordered after publication"
assert "docker-compose.agent-hub.images.yml" in workflow_text, "image smoke test does not use the no-build Compose file"
assert "scripts/agent-hub-smoke.cjs" in workflow_text, "image smoke test does not exercise agent messaging and files"
assert "if: always()" in workflow_text, "image smoke test does not guarantee cleanup"

assert "build:" not in compose_text, "prebuilt-image Compose must not build on the server"
assert "AGENT_HUB_IMAGE_TAG" in compose_text, "Compose images are not pinned by an explicit tag"
assert "127.0.0.1:${API_PORT:-8000}:8000" in compose_text
assert "127.0.0.1:${WEB_PORT:-3000}:3000" in compose_text
assert "ghcr.io/" in compose_text
assert "zaiyemeiyou404" in compose_text
assert "docker compose" in docs_text and "docker-compose.agent-hub.images.yml" in docs_text

print("Agent Hub GHCR configuration checks passed")
