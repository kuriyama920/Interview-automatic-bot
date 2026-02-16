"""Instagram アップローダー - instagrapi"""

from __future__ import annotations

from pathlib import Path

from instagrapi import Client

from src.config import app_config, ig_config
from src.logger import logger
from src.types import PostContent, UploadResult


class InstagramUploader:
    """instagrapi を使った Instagram Reels への動画投稿"""

    def __init__(self) -> None:
        self._client = Client()
        self._client.delay_range = [1, 3]
        self._authenticated = False

        # プロキシ設定
        if app_config.proxy_url:
            self._client.set_proxy(app_config.proxy_url)
            logger.info(f"Instagram: プロキシ使用 {app_config.proxy_url}")

    def _ensure_auth(self) -> None:
        if self._authenticated:
            return

        session_path = Path(ig_config.session_path)

        if session_path.exists():
            try:
                logger.info("Instagram: セッションから認証を復元中...")
                self._client.load_settings(str(session_path))
                self._client.login(ig_config.username, ig_config.password)
                self._authenticated = True
                logger.info("Instagram: セッション認証成功")
                return
            except Exception as e:
                logger.warning(f"Instagram: セッション復元失敗 - {e}. 再ログインします。")
                session_path.unlink(missing_ok=True)

        if not all([ig_config.username, ig_config.password]):
            raise ValueError(
                "INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD が .env に未設定です"
            )

        logger.info("Instagram: ログイン中...")
        self._client.login(ig_config.username, ig_config.password)
        self._client.dump_settings(str(session_path))
        self._authenticated = True
        logger.info("Instagram: ログイン成功、セッションを保存しました")

    def upload(self, content: PostContent) -> UploadResult:
        try:
            self._ensure_auth()

            # キャプション組み立て
            hashtag_str = " ".join(
                f"#{h}" if not h.startswith("#") else h
                for h in content.hashtags
            )
            caption = f"{content.description}\n\n{hashtag_str}".strip()

            # Reels としてアップロード
            logger.info(f"Instagram: Reels アップロード中... {content.video_path}")
            media = self._client.clip_upload(
                path=Path(content.video_path),
                caption=caption,
            )

            url = f"https://www.instagram.com/reel/{media.code}/"
            logger.info(f"Instagram: 投稿成功 {url}")

            # セッション更新
            self._client.dump_settings(str(ig_config.session_path))

            return UploadResult(platform="instagram", success=True, url=url)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Instagram: 投稿失敗 - {error_msg}")
            return UploadResult(
                platform="instagram", success=False, error=error_msg
            )

    def validate(self) -> bool:
        try:
            self._ensure_auth()
            user_info = self._client.account_info()
            logger.info(f"Instagram: 認証OK @{user_info.username}")
            return True
        except Exception as e:
            logger.error(f"Instagram: 認証エラー - {e}")
            return False


def upload_to_instagram(content: PostContent) -> UploadResult:
    """同期ラッパー"""
    uploader = InstagramUploader()
    return uploader.upload(content)


def validate_instagram() -> bool:
    """認証確認"""
    uploader = InstagramUploader()
    return uploader.validate()
