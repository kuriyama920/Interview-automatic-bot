"""X (Twitter) アップローダー - Twikit"""

from __future__ import annotations

import asyncio
import ssl
from pathlib import Path

import httpx
from twikit import Client

from src.config import app_config, x_config
from src.logger import logger
from src.types import PostContent, UploadResult


def _create_ssl_client() -> Client:
    """SSL証明書問題を回避し、プロキシ対応の Twikit Client を作成"""
    try:
        import certifi

        ssl_context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ssl_context = True  # type: ignore[assignment]

    http_kwargs: dict = {"verify": ssl_context}

    if app_config.proxy_url:
        http_kwargs["proxy"] = app_config.proxy_url
        logger.info(f"X: プロキシ使用 {app_config.proxy_url}")

    try:
        client = Client("ja", http_client=httpx.AsyncClient(**http_kwargs))
    except Exception:
        client = Client("ja")
    return client


class XUploader:
    """Twikit を使った X (Twitter) への動画投稿"""

    def __init__(self) -> None:
        self._client = _create_ssl_client()
        self._authenticated = False

    async def _ensure_auth(self) -> None:
        if self._authenticated:
            return

        cookies_path = Path(x_config.cookies_path)

        if cookies_path.exists():
            try:
                logger.info("X: Cookie から認証を復元中...")
                self._client.load_cookies(str(cookies_path))
                self._authenticated = True
                logger.info("X: Cookie 認証成功")
                return
            except Exception as e:
                logger.warning(f"X: Cookie が無効です - {e}. 再ログインします。")
                cookies_path.unlink(missing_ok=True)

        if not all([x_config.username, x_config.email, x_config.password]):
            raise ValueError(
                "X_USERNAME, X_EMAIL, X_PASSWORD が .env に未設定です"
            )

        logger.info("X: ログイン中...")
        await self._client.login(
            auth_info_1=x_config.username,
            auth_info_2=x_config.email,
            password=x_config.password,
        )
        self._client.save_cookies(str(cookies_path))
        self._authenticated = True
        logger.info("X: ログイン成功、Cookie を保存しました")

    async def upload(self, content: PostContent) -> UploadResult:
        try:
            await self._ensure_auth()

            # メディアアップロード
            logger.info(f"X: 動画アップロード中... {content.video_path}")
            media_ids = [await self._client.upload_media(content.video_path)]

            # ツイートテキスト組み立て
            hashtag_str = " ".join(
                f"#{h}" if not h.startswith("#") else h
                for h in content.hashtags[:5]
            )
            text = f"{content.description}\n\n{hashtag_str}".strip()[:280]

            # 投稿
            tweet = await self._client.create_tweet(
                text=text,
                media_ids=media_ids,
            )

            tweet_id = tweet.id if hasattr(tweet, "id") else "unknown"
            url = f"https://x.com/i/status/{tweet_id}"

            logger.info(f"X: 投稿成功 {url}")
            return UploadResult(platform="x", success=True, url=url)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"X: 投稿失敗 - {error_msg}")
            return UploadResult(platform="x", success=False, error=error_msg)

    async def validate(self) -> bool:
        try:
            await self._ensure_auth()
            user = await self._client.user()
            logger.info(f"X: 認証OK @{user.screen_name}")
            return True
        except Exception as e:
            logger.error(f"X: 認証エラー - {e}")
            return False


def upload_to_x(content: PostContent) -> UploadResult:
    """同期ラッパー"""
    uploader = XUploader()
    return asyncio.run(uploader.upload(content))


def validate_x() -> bool:
    """認証確認の同期ラッパー"""
    uploader = XUploader()
    return asyncio.run(uploader.validate())
