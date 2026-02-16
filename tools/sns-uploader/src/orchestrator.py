"""全プラットフォーム統合オーケストレーター

Playwright ベースのアップローダーを優先使用。
twikit / instagrapi が動作する環境ではそちらにフォールバック可能。
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from src.config import app_config
from src.logger import logger
from src.types import ALL_PLATFORMS, Platform, PostContent, UploadResult
from src.uploaders.ig_playwright import InstagramPlaywrightUploader
from src.uploaders.tiktok_playwright import TikTokPlaywrightUploader
from src.uploaders.x_playwright import XPlaywrightUploader

# Playwright ベース（IP ブロック回避、API 変更耐性あり）
UPLOADERS: dict[Platform, type] = {
    "x": XPlaywrightUploader,
    "instagram": InstagramPlaywrightUploader,
    "tiktok": TikTokPlaywrightUploader,
}

# 非同期対応プラットフォーム（全て Playwright ベース）
ASYNC_PLATFORMS: set[Platform] = {"x", "instagram", "tiktok"}


def post_to_platforms(
    content: PostContent,
    platforms: list[Platform] | None = None,
) -> list[UploadResult]:
    """複数プラットフォームに順次投稿（BAN対策のため並列不可）"""

    if platforms is None:
        platforms = list(ALL_PLATFORMS)

    # 動画ファイル存在チェック
    video_path = Path(content.video_path)
    if not video_path.exists():
        logger.error(f"動画ファイルが見つかりません: {video_path}")
        return [
            UploadResult(platform=p, success=False, error="動画ファイルが見つかりません")
            for p in platforms
        ]

    results: list[UploadResult] = []
    delay = app_config.post_delay_seconds

    for i, platform in enumerate(platforms):
        logger.info(f"=== [{i + 1}/{len(platforms)}] {platform} に投稿中 ===")

        uploader_cls = UPLOADERS.get(platform)
        if uploader_cls is None:
            results.append(
                UploadResult(
                    platform=platform,
                    success=False,
                    error=f"未対応プラットフォーム: {platform}",
                )
            )
            continue

        uploader = uploader_cls()

        if platform in ASYNC_PLATFORMS:
            result = asyncio.run(uploader.upload(content))
        else:
            result = uploader.upload(content)

        results.append(result)

        # BAN対策: 投稿間にディレイ
        if i < len(platforms) - 1:
            logger.info(f"次の投稿まで {delay}秒 待機...")
            time.sleep(delay)

    # サマリー
    success_count = sum(1 for r in results if r.success)
    logger.info(
        f"=== 投稿完了: {success_count}/{len(results)} 成功 ==="
    )
    for r in results:
        status = "OK" if r.success else f"NG ({r.error})"
        logger.info(f"  {r.platform}: {status} {r.url}")

    return results


def validate_all(
    platforms: list[Platform] | None = None,
) -> dict[Platform, bool]:
    """全プラットフォームの認証状態を確認"""

    if platforms is None:
        platforms = list(ALL_PLATFORMS)

    results: dict[Platform, bool] = {}

    for platform in platforms:
        uploader_cls = UPLOADERS.get(platform)
        if uploader_cls is None:
            results[platform] = False
            continue

        uploader = uploader_cls()

        if not hasattr(uploader, "validate"):
            logger.info(f"{platform}: validate 未対応（初回ブラウザログイン必要）")
            results[platform] = False
            continue

        if platform in ASYNC_PLATFORMS:
            results[platform] = asyncio.run(uploader.validate())
        else:
            results[platform] = uploader.validate()

    return results
