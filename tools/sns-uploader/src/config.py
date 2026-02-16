"""設定・環境変数管理"""

from __future__ import annotations

import os
import ssl
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# .env 読み込み
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)

# Windows SSL 証明書問題の修正
try:
    import certifi

    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

SESSIONS_DIR = Path(__file__).resolve().parent.parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


@dataclass(frozen=True)
class XConfig:
    username: str = _env("X_USERNAME")
    email: str = _env("X_EMAIL")
    password: str = _env("X_PASSWORD")
    cookies_path: str = str(SESSIONS_DIR / "x_cookies.json")


@dataclass(frozen=True)
class InstagramConfig:
    username: str = _env("INSTAGRAM_USERNAME")
    password: str = _env("INSTAGRAM_PASSWORD")
    session_path: str = str(SESSIONS_DIR / "ig_session.json")


@dataclass(frozen=True)
class TikTokConfig:
    username: str = _env("TIKTOK_USERNAME")
    password: str = _env("TIKTOK_PASSWORD")
    session_path: str = str(SESSIONS_DIR / "tiktok_state.json")


@dataclass(frozen=True)
class AppConfig:
    video_dir: str = _env("VIDEO_DIR", "../video-shorts/output")
    log_level: str = _env("LOG_LEVEL", "INFO")
    post_delay_seconds: int = int(_env("POST_DELAY_SECONDS", "30"))
    proxy_url: str = _env("PROXY_URL")

    @property
    def proxy_dict(self) -> dict[str, str] | None:
        """requests / instagrapi 用プロキシ辞書"""
        if not self.proxy_url:
            return None
        return {
            "http": self.proxy_url,
            "https": self.proxy_url,
        }


x_config = XConfig()
ig_config = InstagramConfig()
tiktok_config = TikTokConfig()
app_config = AppConfig()
