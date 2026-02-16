"""TikTok アップローダー - Playwright ブラウザ自動化

tiktok-uploader ライブラリの認証問題を回避するため、
X / Instagram と同様に Playwright で直接ブラウザ操作する。
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from src.config import app_config, tiktok_config
from src.logger import logger
from src.types import PostContent, UploadResult

STORAGE_STATE_PATH = Path(tiktok_config.session_path)


class TikTokPlaywrightUploader:
    """Playwright を使った TikTok への動画投稿"""

    async def _get_browser(self):
        from playwright.async_api import async_playwright

        pw = await async_playwright().start()
        launch_args: dict = {
            "headless": False,
            "args": ["--disable-blink-features=AutomationControlled"],
        }
        if app_config.proxy_url:
            launch_args["proxy"] = {"server": app_config.proxy_url}
            logger.info(f"TikTok: プロキシ使用 {app_config.proxy_url}")

        browser = await pw.chromium.launch(**launch_args)
        return pw, browser

    async def _get_context(self, browser):
        desktop_ua = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )

        if STORAGE_STATE_PATH.exists():
            logger.info("TikTok: 保存済みセッションから復元中...")
            context = await browser.new_context(
                storage_state=str(STORAGE_STATE_PATH),
                viewport={"width": 1280, "height": 900},
                user_agent=desktop_ua,
            )
            return context, True

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=desktop_ua,
        )
        return context, False

    async def _screenshot(self, page, name: str):
        ss_dir = Path("screenshots")
        ss_dir.mkdir(exist_ok=True)
        path = ss_dir / f"tiktok_{name}.png"
        await page.screenshot(path=str(path))
        logger.info(f"TikTok: スクリーンショット → {path}")

    async def _login(self, page) -> bool:
        """TikTok にメール/パスワードでログイン"""
        logger.info("TikTok: ログインページに移動中...")
        await page.goto(
            "https://www.tiktok.com/login/phone-or-email/email",
            wait_until="domcontentloaded",
            timeout=60000,
        )
        await page.wait_for_timeout(5000)
        await self._screenshot(page, "login_01_page")

        # ログイン方式選択ページの場合: 「電話番号/メール/ユーザー名を使う」をクリック
        email_login_selectors = [
            'a:has-text("電話番号/メール/ユーザー名を使う")',
            'div:has-text("電話番号/メール/ユーザー名を使う")',
            'a:has-text("Use phone / email / username")',
        ]
        for sel in email_login_selectors:
            btn = page.locator(sel).first
            if await btn.count() > 0:
                await btn.click()
                logger.info(f"TikTok: メールログイン選択 ({sel})")
                await page.wait_for_timeout(3000)
                break

        # 「メールアドレスまたはユーザー名でログイン」リンクがある場合
        email_tab_selectors = [
            'a:has-text("メールアドレスまたはユーザー名でログイン")',
            'a:has-text("Log in with email or username")',
            'a:has-text("メール")',
        ]
        for sel in email_tab_selectors:
            link = page.locator(sel).first
            if await link.count() > 0:
                await link.click()
                logger.info(f"TikTok: メールタブ切替 ({sel})")
                await page.wait_for_timeout(2000)
                break

        await self._screenshot(page, "login_02_email_form")

        # メール入力
        email_input = page.locator('input[name="username"]').first
        if await email_input.count() == 0:
            email_input = page.locator('input[type="text"]').first
        if await email_input.count() == 0:
            email_input = page.locator('input[placeholder*="メール"]').first
        if await email_input.count() == 0:
            email_input = page.locator('input[placeholder*="email"]').first

        if await email_input.count() > 0:
            await email_input.click()
            await email_input.fill(tiktok_config.username)
            logger.info("TikTok: メール入力完了")
        else:
            logger.warning("TikTok: メール入力フィールドが見つかりません")
            await self._screenshot(page, "login_02b_no_email")

        await page.wait_for_timeout(500)

        # パスワード入力
        password_input = page.locator('input[type="password"]').first
        if await password_input.count() > 0:
            await password_input.click()
            await password_input.fill(tiktok_config.password)
            logger.info("TikTok: パスワード入力完了")
        else:
            logger.warning("TikTok: パスワード入力フィールドが見つかりません")

        await page.wait_for_timeout(500)
        await self._screenshot(page, "login_03_filled")

        # ログインボタン
        login_selectors = [
            'button[type="submit"]',
            'button:has-text("ログイン")',
            'button:has-text("Log in")',
            'div[role="button"]:has-text("ログイン")',
        ]
        clicked_login = False
        for sel in login_selectors:
            btn = page.locator(sel).first
            if await btn.count() > 0:
                await btn.click()
                logger.info(f"TikTok: ログインボタンクリック ({sel})")
                clicked_login = True
                break

        if not clicked_login:
            await page.keyboard.press("Enter")
            logger.info("TikTok: Enterキーでログイン試行")

        await page.wait_for_timeout(10000)
        await self._screenshot(page, "login_04_after")

        # CAPTCHA待ち + ログイン確認
        if "login" in page.url:
            logger.info("TikTok: CAPTCHAまたは追加認証が必要かもしれません - 90秒待機します")
            for i in range(18):
                await page.wait_for_timeout(5000)
                if "login" not in page.url:
                    logger.info("TikTok: ログイン確認")
                    return True
                remaining = 90 - (i + 1) * 5
                logger.info(f"TikTok: ログイン待機中... 残り{remaining}秒")

            logger.error("TikTok: ログインタイムアウト")
            await self._screenshot(page, "login_05_timeout")
            return False

        logger.info("TikTok: ログイン成功")
        return True

    async def upload(self, content: PostContent) -> UploadResult:
        pw = None
        browser = None
        try:
            pw, browser = await self._get_browser()
            context, has_session = await self._get_context(browser)
            page = await context.new_page()

            # セッション確認
            if has_session:
                await page.goto(
                    "https://www.tiktok.com/upload",
                    wait_until="domcontentloaded",
                    timeout=60000,
                )
                await page.wait_for_timeout(5000)
                if "login" in page.url:
                    logger.warning("TikTok: セッション期限切れ、再ログイン")
                    has_session = False

            if not has_session:
                success = await self._login(page)
                if not success:
                    return UploadResult(
                        platform="tiktok", success=False, error="ログイン失敗"
                    )
                await context.storage_state(path=str(STORAGE_STATE_PATH))
                logger.info(f"TikTok: セッション保存 → {STORAGE_STATE_PATH}")

            # アップロードページへ
            await page.goto(
                "https://www.tiktok.com/upload",
                wait_until="domcontentloaded",
                timeout=60000,
            )
            await page.wait_for_timeout(5000)
            await self._screenshot(page, "01_upload_page")

            # iframe 内にアップロードUIがある場合
            # TikTok Creator Center はiframeを使うことがある
            upload_frame = page
            iframe_locator = page.frame_locator("iframe")
            # メインページで file input を探す
            file_input = page.locator('input[type="file"]').first
            if await file_input.count() == 0:
                # iframe内を探す
                try:
                    iframe_file = iframe_locator.locator('input[type="file"]').first
                    # iframe内にあるか確認（タイムアウト短め）
                    await iframe_file.wait_for(state="attached", timeout=5000)
                    file_input = iframe_file
                    logger.info("TikTok: iframe内のfile inputを使用")
                except Exception:
                    pass

            if await file_input.count() == 0:
                # 「ファイルを選択」ボタンを探す
                select_btn_texts = [
                    "ファイルを選択",
                    "Select file",
                    "動画を選択",
                    "Select video",
                ]
                for text in select_btn_texts:
                    btn = page.locator(f"button:has-text('{text}')").first
                    if await btn.count() > 0:
                        logger.info(f"TikTok: '{text}' ボタン経由")
                        async with page.expect_file_chooser(timeout=10000) as fc_info:
                            await btn.click()
                        fc = await fc_info.value
                        video_path = Path(content.video_path).resolve()
                        await fc.set_files(str(video_path))
                        break
                else:
                    await self._screenshot(page, "01b_no_file_input")
                    logger.error("TikTok: ファイル入力が見つかりません")
                    return UploadResult(
                        platform="tiktok",
                        success=False,
                        error="ファイル入力が見つかりません",
                    )
            else:
                video_path = Path(content.video_path).resolve()
                await file_input.set_input_files(str(video_path))
                logger.info(f"TikTok: ファイル選択完了 {video_path}")

            # アップロード処理待ち（動画の処理に時間がかかる）
            logger.info("TikTok: 動画アップロード・処理待ち...")
            await page.wait_for_timeout(15000)
            await self._screenshot(page, "02_after_upload")

            # キャプション入力
            hashtag_str = " ".join(
                f"#{h.lstrip('#')}" for h in content.hashtags
            )
            caption = f"{content.description} {hashtag_str}".strip()

            # TikTokのキャプション入力: contenteditable div を探す
            caption_selectors = [
                '[contenteditable="true"]',
                '[data-placeholder*="キャプション"]',
                '[data-placeholder*="caption"]',
                '.public-DraftEditor-content',
                'div[role="textbox"]',
            ]
            caption_entered = False
            for sel in caption_selectors:
                el = page.locator(sel).first
                if await el.count() > 0:
                    await el.click()
                    # 既存テキストを選択して上書き
                    await page.keyboard.press("Control+A")
                    await page.wait_for_timeout(200)
                    await page.keyboard.type(caption, delay=15)
                    logger.info(f"TikTok: キャプション入力完了 ({sel})")
                    caption_entered = True
                    break

            if not caption_entered:
                logger.warning("TikTok: キャプション入力欄が見つかりません")

            await page.wait_for_timeout(2000)
            await self._screenshot(page, "03_caption")

            # 「投稿」ボタン
            post_btn_texts = [
                "投稿",
                "Post",
                "公開",
                "Publish",
            ]
            clicked_post = False
            for text in post_btn_texts:
                btn = page.locator(f"button:has-text('{text}')").first
                if await btn.count() > 0:
                    # ボタンが有効になるまで待つ
                    for _ in range(12):  # 最大60秒
                        is_disabled = await btn.get_attribute("disabled")
                        aria_disabled = await btn.get_attribute("aria-disabled")
                        if is_disabled is None and aria_disabled != "true":
                            break
                        logger.info("TikTok: 投稿ボタン待ち（処理中）...")
                        await page.wait_for_timeout(5000)

                    try:
                        await btn.click(timeout=5000)
                    except Exception:
                        await btn.dispatch_event("click")
                    logger.info(f"TikTok: 投稿ボタンクリック ({text})")
                    clicked_post = True
                    break

            if not clicked_post:
                await self._screenshot(page, "03b_no_post_btn")
                return UploadResult(
                    platform="tiktok",
                    success=False,
                    error="投稿ボタンが見つかりません",
                )

            # 投稿完了待ち
            logger.info("TikTok: 投稿処理中...")
            await page.wait_for_timeout(15000)
            await self._screenshot(page, "04_after_post")

            # セッション保存
            await context.storage_state(path=str(STORAGE_STATE_PATH))

            logger.info("TikTok: 投稿成功")
            return UploadResult(platform="tiktok", success=True)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"TikTok: 投稿失敗 - {error_msg}")
            return UploadResult(platform="tiktok", success=False, error=error_msg)
        finally:
            if browser:
                await browser.close()
            if pw:
                await pw.stop()

    async def validate(self) -> bool:
        if not STORAGE_STATE_PATH.exists():
            return False

        pw = None
        browser = None
        try:
            pw, browser = await self._get_browser()
            context, _ = await self._get_context(browser)
            page = await context.new_page()
            await page.goto(
                "https://www.tiktok.com/upload",
                wait_until="domcontentloaded",
                timeout=60000,
            )
            await page.wait_for_timeout(5000)
            logged_in = "login" not in page.url
            if logged_in:
                logger.info("TikTok: 認証OK")
            else:
                logger.info("TikTok: 認証NG - セッション期限切れ")
            return logged_in
        except Exception as e:
            logger.error(f"TikTok: 認証エラー - {e}")
            return False
        finally:
            if browser:
                await browser.close()
            if pw:
                await pw.stop()


def upload_to_tiktok_playwright(content: PostContent) -> UploadResult:
    """同期ラッパー"""
    uploader = TikTokPlaywrightUploader()
    return asyncio.run(uploader.upload(content))
