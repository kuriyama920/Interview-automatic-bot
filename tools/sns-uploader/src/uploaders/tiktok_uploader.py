"""TikTok アップローダー - tiktok-uploader (Playwright)"""

from __future__ import annotations

from pathlib import Path

from src.config import app_config, tiktok_config
from src.logger import logger
from src.types import PostContent, UploadResult

COOKIES_PATH = Path("sessions") / "tiktok_cookies.txt"


class TikTokUploader:
    """tiktok-uploader を使った TikTok への動画投稿

    注意:
    - 初回実行時にブラウザが開き、手動ログインが必要
    - Cookieファイルがない場合もブラウザ経由で認証される
    """

    def upload(self, content: PostContent) -> UploadResult:
        try:
            from tiktok_uploader.upload import upload_video

            # ハッシュタグを説明文に含める
            hashtag_str = " ".join(
                f"#{h.lstrip('#')}" for h in content.hashtags
            )
            description = f"{content.description}\n\n{hashtag_str}".strip()

            logger.info(f"TikTok: 動画アップロード中... {content.video_path}")

            kwargs: dict = {
                "filename": content.video_path,
                "description": description,
                "headless": False,
                "browser": "chrome",
            }

            # Cookieファイルがある場合はセッション再利用
            if COOKIES_PATH.exists():
                kwargs["cookies"] = str(COOKIES_PATH)
                logger.info("TikTok: Cookieファイルからセッション復元")

            # プロキシ対応
            if app_config.proxy_url:
                kwargs["proxy"] = {"server": app_config.proxy_url}
                logger.info(f"TikTok: プロキシ使用 {app_config.proxy_url}")

            failed = upload_video(**kwargs)

            if not failed:
                logger.info("TikTok: 投稿成功")
                return UploadResult(platform="tiktok", success=True)

            error_msg = f"投稿失敗: {failed}"
            logger.error(f"TikTok: {error_msg}")
            return UploadResult(
                platform="tiktok", success=False, error=error_msg
            )

        except Exception as e:
            error_msg = str(e)
            logger.error(f"TikTok: 投稿失敗 - {error_msg}")
            return UploadResult(
                platform="tiktok", success=False, error=error_msg
            )


def upload_to_tiktok(content: PostContent) -> UploadResult:
    """同期ラッパー"""
    uploader = TikTokUploader()
    return uploader.upload(content)
