"""初回セッション取得スクリプト

各プラットフォームにログインしてセッション/Cookieを保存する。
Windows の PowerShell またはコマンドプロンプトから実行:
  venv\Scripts\python.exe setup_sessions.py [x|instagram|tiktok|all]

プロキシを使用する場合:
  .env に PROXY_URL=http://user:pass@host:port を設定
"""

from __future__ import annotations

import asyncio
import os
import ssl
import sys
from pathlib import Path

# SSL 修正
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SESSIONS_DIR = Path(__file__).parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)

PROXY_URL = os.getenv("PROXY_URL", "")


async def setup_x() -> None:
    """X (Twitter) - Twikit でログインし Cookie を保存"""
    print("\n=== X (Twitter) セットアップ ===")
    try:
        import httpx
        from twikit import Client

        username = os.getenv("X_USERNAME", "")
        email = os.getenv("X_EMAIL", "")
        password = os.getenv("X_PASSWORD", "")

        if not all([username, email, password]):
            print("X: .env に X_USERNAME, X_EMAIL, X_PASSWORD を設定してください")
            return

        # SSL + プロキシ設定
        http_kwargs: dict = {}
        try:
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            http_kwargs["verify"] = ssl_context
        except Exception:
            pass

        if PROXY_URL:
            http_kwargs["proxy"] = PROXY_URL
            print(f"X: プロキシ使用 {PROXY_URL}")

        print(f"X: @{username} でログイン中...")
        if http_kwargs:
            client = Client("ja", http_client=httpx.AsyncClient(**http_kwargs))
        else:
            client = Client("ja")

        await client.login(
            auth_info_1=username,
            auth_info_2=email,
            password=password,
        )

        cookies_path = str(SESSIONS_DIR / "x_cookies.json")
        client.save_cookies(cookies_path)
        print(f"X: Cookie 保存完了 → {cookies_path}")

    except Exception as e:
        print(f"X: エラー - {e}")


def setup_instagram() -> None:
    """Instagram - instagrapi でログインしセッションを保存"""
    print("\n=== Instagram セットアップ ===")
    try:
        from instagrapi import Client

        username = os.getenv("INSTAGRAM_USERNAME", "")
        password = os.getenv("INSTAGRAM_PASSWORD", "")

        if not all([username, password]):
            print("Instagram: .env に INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD を設定してください")
            return

        cl = Client()
        cl.delay_range = [1, 3]

        # プロキシ設定
        if PROXY_URL:
            cl.set_proxy(PROXY_URL)
            print(f"Instagram: プロキシ使用 {PROXY_URL}")

        print(f"Instagram: {username} でログイン中...")
        cl.login(username, password)

        session_path = str(SESSIONS_DIR / "ig_session.json")
        cl.dump_settings(session_path)
        print(f"Instagram: セッション保存完了 → {session_path}")

        info = cl.account_info()
        print(f"Instagram: 認証OK @{info.username}")

    except Exception as e:
        print(f"Instagram: エラー - {e}")


def setup_tiktok() -> None:
    """TikTok - tiktokautouploader は初回ブラウザログインが必要"""
    print("\n=== TikTok セットアップ ===")
    print("TikTok: tiktokautouploader は初回投稿時にブラウザが開きます。")
    print("TikTok: その際に手動でログインしてください。")
    print("TikTok: セッションは自動的に保存されます。")

    if PROXY_URL:
        print(f"TikTok: プロキシ設定あり {PROXY_URL}")
        print("TikTok: 初回投稿時に自動的にプロキシが適用されます。")


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else "all"

    if PROXY_URL:
        print(f"\nプロキシ: {PROXY_URL}")
    else:
        print("\nプロキシ: 未設定（直接接続）")

    if target in ("x", "all"):
        asyncio.run(setup_x())

    if target in ("instagram", "ig", "all"):
        setup_instagram()

    if target in ("tiktok", "tk", "all"):
        setup_tiktok()

    print("\n=== セットアップ完了 ===")


if __name__ == "__main__":
    main()
