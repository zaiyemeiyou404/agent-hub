"""Missing service configuration must not fall back to official hosts."""

from pathlib import Path

import pytest

import app.config as config_module
from app.config import config
from app.service_endpoints import ConfigurationRequired, DEV_API_BASE, DEV_WEB_BASE, contains_official_host, resolve_service_url
from app.services.analytics import analytics_enabled


def test_missing_and_illegal_urls_are_configuration_required():
    with pytest.raises(ConfigurationRequired):
        resolve_service_url(None, "api")
    with pytest.raises(ConfigurationRequired):
        resolve_service_url("http://example.com", "web")
    with pytest.raises(ConfigurationRequired):
        resolve_service_url(DEV_API_BASE, "api", dev_loopback=False)


def test_explicit_dev_loopback_is_limited_to_the_local_contract():
    assert resolve_service_url(DEV_API_BASE, "api", dev_loopback=True) == DEV_API_BASE
    assert resolve_service_url(DEV_API_BASE, "auth", dev_loopback=True) == DEV_API_BASE
    assert resolve_service_url(DEV_WEB_BASE, "web", dev_loopback=True) == DEV_WEB_BASE
    with pytest.raises(ConfigurationRequired):
        resolve_service_url("http://127.0.0.1:3001", "web", dev_loopback=True)


def test_default_config_does_not_name_an_official_service():
    source = Path(config_module.__file__).read_text(encoding="utf-8")
    for expression in (
        'os.environ.get("PUBLIC_API_BASE", "")',
        'os.environ.get("FRONTEND_BASE_URL", "")',
        'os.environ.get("ACCOUNT_API_URL", "")',
        'os.environ.get("YUMI_BASE_URL", "")',
        'os.environ.get("CAMPAIGN_GATEWAY_URL", "")',
        'os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "")',
        'os.environ.get("POSTHOG_API_KEY", "")',
        'os.environ.get("POSTHOG_HOST", "")',
        'os.environ.get("FIREBASE_WEB_API_KEY", "")',
        'os.environ.get("ANALYTICS_ENABLED", "0")',
        'os.environ.get("YUMI_ENABLED", "false")',
    ):
        assert expression in source
    for value in (
        config.PUBLIC_API_BASE,
        config.FRONTEND_BASE_URL,
        config.ACCOUNT_API_URL,
        config.YUMI_BASE_URL,
        config.CAMPAIGN_GATEWAY_URL,
        config.GOOGLE_OAUTH_REDIRECT_URI,
        config.POSTHOG_API_KEY,
        config.POSTHOG_HOST,
        config.FIREBASE_WEB_API_KEY,
    ):
        assert not contains_official_host(value)
    assert analytics_enabled() is False
