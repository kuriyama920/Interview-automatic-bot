"""X (Twitter) アップローダー - Playwright ブラウザ自動化

twikit が X の内部API変更 (404) で使えないため、
Playwright でブラウザを操作して投稿する。
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from src.config import app_config, x_config
from src.logger import logger
from src.types import PostContent, UploadResult

STORAGE_STATE_PATH = Path(x_config.cookies_path).parent / "x_state.json"


class XPlaywrightUploader:
    """Playwright を使った X (Twitter) への動画投稿"""

    async def _get_browser(self):
        from playwright.async_api import async_playwright

        pw = await async_playwright().start()

        launch_args: dict = {
            "headless": False,
            "args": ["--disable-blink-features=AutomationControlled"],
        }
        if app_config.proxy_url:
            launch_args["proxy"] = {"server": app_config.proxy_url}
            logger.info(f"X: プロキシ使用 {app_config.proxy_url}")

        browser = await pw.chromium.launch(**launch_args)
        return pw, browser

    async def _get_context(self, browser):
        if STORAGE_STATE_PATH.exists():
            logger.info("X: 保存済みセッションから復元中...")
            context = await browser.new_context(
                storage_state=str(STORAGE_STATE_PATH),
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
            return context, True

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        return context, False

    async def _login(self, page) -> bool:
        """X にログイン"""
        logger.info("X: ログインページに移動中...")
        await page.goto("https://x.com/i/flow/login", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2000)

        # ユーザー名入力
        username_input = page.locator('input[autocomplete="username"]')
        await username_input.fill(x_config.username)
        await page.wait_for_timeout(500)

        # 次へボタン
        next_btn = page.get_by_role("button", name="Next")
        if await next_btn.count() > 0:
            await next_btn.click()
        else:
            await page.keyboard.press("Enter")
        await page.wait_for_timeout(2000)

        # メール確認が求められる場合
        email_input = page.locator('input[data-testid="ocfEnterTextTextInput"]')
        if await email_input.count() > 0:
            logger.info("X: メール認証が要求されました")
            await email_input.fill(x_config.email)
            next_btn2 = page.get_by_role("button", name="Next")
            if await next_btn2.count() > 0:
                await next_btn2.click()
            await page.wait_for_timeout(2000)

        # パスワード入力
        password_input = page.locator('input[type="password"]')
        if await password_input.count() > 0:
            await password_input.fill(x_config.password)
            await page.wait_for_timeout(500)

            login_btn = page.locator('[data-testid="LoginForm_Login_Button"]')
            if await login_btn.count() > 0:
                await login_btn.click()
            else:
                await page.keyboard.press("Enter")

        await page.wait_for_timeout(5000)

        # ログイン成功確認
        if "home" in page.url or "compose" in page.url:
            logger.info("X: ログイン成功")
            return True

        # ホームに直接移動して確認
        await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        logged_in = "login" not in page.url
        if logged_in:
            logger.info("X: ログイン成功")
        else:
            logger.error("X: ログイン失敗 - 手動でログインしてください")
            # 手動ログイン待機（60秒）
            logger.info("X: 60秒以内に手動でログインしてください...")
            for i in range(12):
                await page.wait_for_timeout(5000)
                if "login" not in page.url:
                    logger.info("X: 手動ログイン確認")
                    return True
            logger.error("X: ログインタイムアウト")

        return logged_in

    async def _screenshot(self, page, name: str):
        """デバッグ用スクリーンショット"""
        ss_dir = Path("screenshots")
        ss_dir.mkdir(exist_ok=True)
        path = ss_dir / f"x_{name}.png"
        await page.screenshot(path=str(path))
        logger.info(f"X: スクリーンショット → {path}")

    async def upload(self, content: PostContent) -> UploadResult:
        pw = None
        browser = None
        try:
            pw, browser = await self._get_browser()
            context, has_session = await self._get_context(browser)
            page = await context.new_page()

            if has_session:
                await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(3000)
                if "login" in page.url:
                    logger.warning("X: セッション期限切れ、再ログインします")
                    has_session = False

            if not has_session:
                success = await self._login(page)
                if not success:
                    return UploadResult(platform="x", success=False, error="ログイン失敗")
                await context.storage_state(path=str(STORAGE_STATE_PATH))
                logger.info(f"X: セッション保存 → {STORAGE_STATE_PATH}")

            # compose/post で投稿（.first で複数要素対応）
            await page.goto("https://x.com/compose/post", wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(3000)
            await self._screenshot(page, "01_compose")

            # ツイートボックス
            tweet_box = page.locator('[data-testid="tweetTextarea_0"]').first
            if await tweet_box.count() == 0:
                # フォールバック: ホームから
                logger.info("X: compose/post でテキストボックスなし、ホームへ")
                await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(3000)
                tweet_box = page.locator('[data-testid="tweetTextarea_0"]').first

            await tweet_box.wait_for(state="visible", timeout=15000)
            logger.info("X: テキストボックス発見")

            # テキスト入力
            hashtag_str = " ".join(
                f"#{h}" if not h.startswith("#") else h
                for h in content.hashtags[:5]
            )
            text = f"{content.description}\n\n{hashtag_str}".strip()[:280]

            await tweet_box.click()
            await page.keyboard.type(text, delay=20)
            await page.wait_for_timeout(1000)
            await self._screenshot(page, "02_text_entered")
            logger.info(f"X: テキスト入力完了 ({len(text)}文字)")

            # 動画ファイル添付
            video_path = Path(content.video_path).resolve()
            logger.info(f"X: 動画添付中... {video_path}")

            file_input = page.locator('input[type="file"]').first
            if await file_input.count() == 0:
                await self._screenshot(page, "02b_no_file_input")
                return UploadResult(platform="x", success=False, error="ファイル入力が見つかりません")

            await file_input.set_input_files(str(video_path))
            await page.wait_for_timeout(3000)
            await self._screenshot(page, "03_file_attached")

            # 動画アップロード完了待ち（最大180秒）
            logger.info("X: 動画アップロード待機中...")
            post_btn = page.locator('[data-testid="tweetButton"]').first
            uploaded = False
            for i in range(36):
                await page.wait_for_timeout(5000)
                if await post_btn.count() > 0:
                    is_disabled = await post_btn.get_attribute("aria-disabled")
                    logger.info(f"X: 投稿ボタン状態 [{(i + 1) * 5}秒] disabled={is_disabled}")
                    if is_disabled != "true":
                        logger.info(f"X: 動画アップロード完了（{(i + 1) * 5}秒）")
                        uploaded = True
                        break
                else:
                    logger.info(f"X: 投稿ボタン未発見 [{(i + 1) * 5}秒]")

            await self._screenshot(page, "04_before_post")

            if not uploaded:
                logger.warning("X: 動画アップロードタイムアウト - 投稿試行")

            # 投稿ボタンクリック（overlay が遮るため dispatch_event を使用）
            try:
                await post_btn.click(timeout=5000)
            except Exception:
                logger.info("X: 通常クリック失敗、JS dispatch で再試行")
                await post_btn.dispatch_event("click")
            logger.info("X: 投稿ボタンクリック")

            await page.wait_for_timeout(8000)
            await self._screenshot(page, "05_after_post")

            # セッション保存
            await context.storage_state(path=str(STORAGE_STATE_PATH))

            logger.info("X: 投稿成功")
            return UploadResult(platform="x", success=True, url="https://x.com")

        except Exception as e:
            error_msg = str(e)
            logger.error(f"X: 投稿失敗 - {error_msg}")
            return UploadResult(platform="x", success=False, error=error_msg)
        finally:
            if browser:
                await browser.close()
            if pw:
                await pw.stop()

    async def validate(self) -> bool:
        if not STORAGE_STATE_PATH.exists():
            logger.info("X: セッションなし")
            return False

        pw = None
        browser = None
        try:
            pw, browser = await self._get_browser()
            context = await browser.new_context(
                storage_state=str(STORAGE_STATE_PATH),
            )
            page = await context.new_page()
            await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(3000)
            logged_in = "login" not in page.url
            if logged_in:
                logger.info("X: 認証OK")
            else:
                logger.info("X: 認証NG - セッション期限切れ")
            return logged_in
        except Exception as e:
            logger.error(f"X: 認証エラー - {e}")
            return False
        finally:
            if browser:
                await browser.close()
            if pw:
                await pw.stop()


def upload_to_x_playwright(content: PostContent) -> UploadResult:
    """同期ラッパー"""
    uploader = XPlaywrightUploader()
    return asyncio.run(uploader.upload(content))


def validate_x_playwright() -> bool:
    """認証確認の同期ラッパー"""
    uploader = XPlaywrightUploader()
    return asyncio.run(uploader.validate())
