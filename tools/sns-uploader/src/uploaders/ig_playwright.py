"""Instagram アップローダー - Playwright ブラウザ自動化

instagrapi が IP ブラックリストで使えない場合のフォールバック。
ブラウザ経由で Instagram にログイン・投稿する。
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from src.config import app_config, ig_config
from src.logger import logger
from src.types import PostContent, UploadResult

STORAGE_STATE_PATH = Path(ig_config.session_path).parent / "ig_state.json"


class InstagramPlaywrightUploader:
    """Playwright を使った Instagram Reels への動画投稿"""

    async def _get_browser(self):
        from playwright.async_api import async_playwright

        pw = await async_playwright().start()

        launch_args: dict = {
            "headless": False,
            "args": ["--disable-blink-features=AutomationControlled"],
        }
        if app_config.proxy_url:
            launch_args["proxy"] = {"server": app_config.proxy_url}
            logger.info(f"Instagram: プロキシ使用 {app_config.proxy_url}")

        browser = await pw.chromium.launch(**launch_args)
        return pw, browser

    async def _get_context(self, browser):
        desktop_ua = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )

        if STORAGE_STATE_PATH.exists():
            logger.info("Instagram: 保存済みセッションから復元中...")
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

    async def _login(self, page) -> bool:
        """Instagram にログイン"""
        ss_dir = Path("screenshots")
        ss_dir.mkdir(exist_ok=True)

        logger.info("Instagram: ログインページに移動中...")
        await page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(5000)
        await page.screenshot(path=str(ss_dir / "ig_login_01_page.png"))

        # Cookie ダイアログを閉じる
        for text in ["Allow", "Allow all cookies", "Accept", "すべて許可"]:
            cookie_btn = page.locator(f"button:has-text('{text}')")
            if await cookie_btn.count() > 0:
                await cookie_btn.first.click()
                logger.info(f"Instagram: Cookie許可 ({text})")
                await page.wait_for_timeout(1000)
                break

        # ユーザー名入力
        username_input = page.locator('input[name="username"]')
        if await username_input.count() == 0:
            # 代替セレクタ
            username_input = page.locator('input[aria-label="Phone number, username, or email"]').first
        if await username_input.count() == 0:
            username_input = page.locator('input[type="text"]').first

        await username_input.wait_for(state="visible", timeout=15000)
        await username_input.fill(ig_config.username)
        logger.info("Instagram: ユーザー名入力完了")
        await page.wait_for_timeout(500)

        # パスワード入力
        password_input = page.locator('input[name="password"]')
        if await password_input.count() == 0:
            password_input = page.locator('input[type="password"]').first
        await password_input.fill(ig_config.password)
        logger.info("Instagram: パスワード入力完了")
        await page.wait_for_timeout(500)

        await page.screenshot(path=str(ss_dir / "ig_login_02_filled.png"))

        # ログインボタン - 多数のセレクタを試す
        login_selectors = [
            'button[type="submit"]',
            'button:has-text("Log in")',
            'button:has-text("Log In")',
            'button:has-text("ログイン")',
            'div[role="button"]:has-text("ログイン")',
            'div[role="button"]:has-text("Log in")',
        ]
        clicked_login = False
        for sel in login_selectors:
            btn = page.locator(sel)
            cnt = await btn.count()
            if cnt > 0:
                await btn.first.click()
                logger.info(f"Instagram: ログインボタンクリック ({sel}, count={cnt})")
                clicked_login = True
                break

        if not clicked_login:
            # パスワードフィールドにフォーカスしてEnter
            logger.info("Instagram: ログインボタンなし - パスワード欄からEnter")
            await password_input.click()
            await page.wait_for_timeout(300)
            await page.keyboard.press("Enter")
            clicked_login = True

        await page.wait_for_timeout(8000)
        await page.screenshot(path=str(ss_dir / "ig_login_03_after.png"))

        # 「後で」ダイアログ処理
        for text in ["Not Now", "Not now", "後で"]:
            not_now_btn = page.locator(f"button:has-text('{text}')")
            if await not_now_btn.count() > 0:
                await not_now_btn.first.click()
                logger.info(f"Instagram: ダイアログ閉じ ({text})")
                await page.wait_for_timeout(2000)

        # ログイン成功確認
        if "login" not in page.url:
            logger.info("Instagram: ログイン成功")
            return True

        await page.screenshot(path=str(ss_dir / "ig_login_04_still_login.png"))

        # 手動ログイン待機
        logger.info("Instagram: 自動ログイン失敗 - 90秒以内に手動でログインしてください...")
        for _ in range(18):
            await page.wait_for_timeout(5000)
            if "login" not in page.url:
                logger.info("Instagram: 手動ログイン確認")
                return True

        logger.error("Instagram: ログインタイムアウト")
        return False

    async def _screenshot(self, page, name: str):
        """デバッグ用スクリーンショット"""
        ss_dir = Path("screenshots")
        ss_dir.mkdir(exist_ok=True)
        path = ss_dir / f"ig_{name}.png"
        await page.screenshot(path=str(path))
        logger.info(f"Instagram: スクリーンショット → {path}")

    async def upload(self, content: PostContent) -> UploadResult:
        pw = None
        browser = None
        try:
            pw, browser = await self._get_browser()
            context, has_session = await self._get_context(browser)
            page = await context.new_page()

            if has_session:
                await page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(3000)
                if "login" in page.url:
                    logger.warning("Instagram: セッション期限切れ、再ログインします")
                    has_session = False

            if not has_session:
                success = await self._login(page)
                if not success:
                    return UploadResult(platform="instagram", success=False, error="ログイン失敗")
                await context.storage_state(path=str(STORAGE_STATE_PATH))
                logger.info(f"Instagram: セッション保存 → {STORAGE_STATE_PATH}")

            # ホームページへ
            await page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(3000)

            # ダイアログ（「ログイン情報を保存」等）を閉じる
            for dismiss_text in ["後で", "Not Now", "Not now", "情報を保存"]:
                dismiss_btn = page.locator(f"button:has-text('{dismiss_text}')")
                if await dismiss_btn.count() == 0:
                    dismiss_btn = page.locator(f"div[role='button']:has-text('{dismiss_text}')")
                if await dismiss_btn.count() > 0:
                    await dismiss_btn.first.click()
                    logger.info(f"Instagram: ダイアログ閉じ ({dismiss_text})")
                    await page.wait_for_timeout(2000)
                    break

            # 通知ダイアログも閉じる
            for dismiss_text in ["後で", "Not Now", "Not now"]:
                dismiss_btn = page.locator(f"button:has-text('{dismiss_text}')")
                if await dismiss_btn.count() == 0:
                    dismiss_btn = page.locator(f"div[role='button']:has-text('{dismiss_text}')")
                if await dismiss_btn.count() > 0:
                    await dismiss_btn.first.click()
                    logger.info(f"Instagram: 通知ダイアログ閉じ ({dismiss_text})")
                    await page.wait_for_timeout(2000)
                    break

            await self._screenshot(page, "01_home")

            # Step 1: サイドバーの「新しい投稿」(+アイコン)をクリック → サブメニュー展開
            create_icon_selectors = [
                'svg[aria-label="新しい投稿"]',
                'svg[aria-label="新規投稿"]',
                'svg[aria-label="New post"]',
                'svg[aria-label="作成"]',
                'svg[aria-label="Create"]',
            ]
            clicked_create_icon = False
            for sel in create_icon_selectors:
                btn = page.locator(sel)
                if await btn.count() > 0:
                    await btn.first.click()
                    logger.info(f"Instagram: 作成アイコンクリック ({sel})")
                    clicked_create_icon = True
                    await page.wait_for_timeout(3000)
                    break

            if not clicked_create_icon:
                logger.warning("Instagram: 作成アイコンが見つかりません")
                await self._screenshot(page, "01b_no_create_icon")
                return UploadResult(
                    platform="instagram", success=False,
                    error="作成アイコンが見つかりません",
                )

            # Step 2: サブメニューの「投稿」項目をクリック → モーダルオープン
            # svg[aria-label="投稿"] の祖先 <a> タグをクリック
            submenu_selectors = [
                'svg[aria-label="投稿"]',
                'svg[aria-label="Post"]',
            ]
            clicked_submenu = False
            for sel in submenu_selectors:
                svg = page.locator(sel)
                if await svg.count() > 0:
                    # 祖先の <a> タグを取得してクリック
                    ancestor_a = svg.locator("xpath=ancestor::a[1]")
                    if await ancestor_a.count() > 0:
                        await ancestor_a.click()
                        logger.info(f"Instagram: サブメニュー「投稿」ancestor <a> クリック ({sel})")
                    else:
                        await svg.first.click()
                        logger.info(f"Instagram: サブメニュー「投稿」SVG直接クリック ({sel})")
                    clicked_submenu = True
                    await page.wait_for_timeout(5000)
                    break

            if not clicked_submenu:
                logger.warning("Instagram: サブメニュー「投稿」が見つかりません")
                await self._screenshot(page, "01c_no_submenu")
                return UploadResult(
                    platform="instagram", success=False,
                    error="サブメニュー「投稿」が見つかりません",
                )

            await self._screenshot(page, "02_after_create")

            video_path = Path(content.video_path).resolve()
            logger.info(f"Instagram: 動画選択中... {video_path}")

            # モーダルが開いているか確認（role="dialog"）
            dialog = page.locator('[role="dialog"]')
            if await dialog.count() == 0:
                logger.warning("Instagram: モーダルが開いていません")
                await self._screenshot(page, "02b_no_dialog")
                return UploadResult(
                    platform="instagram", success=False,
                    error="投稿モーダルが開きません",
                )
            logger.info("Instagram: 投稿モーダル確認OK")

            # 方法1: input[type="file"] を直接使用
            file_input = page.locator('input[type="file"]').first
            if await file_input.count() > 0:
                await file_input.set_input_files(str(video_path))
                logger.info("Instagram: ファイル選択完了（input直接）")
            else:
                # 方法2: 「コンピューターから選択」ボタン経由
                select_btn_texts = [
                    "コンピューターから選択",
                    "Select from computer",
                    "Select From Computer",
                ]
                clicked_select = False
                for btn_text in select_btn_texts:
                    for tag in ["button", "div[role='button']"]:
                        sel_btn = page.locator(f"{tag}:has-text('{btn_text}')")
                        if await sel_btn.count() > 0:
                            logger.info(f"Instagram: '{btn_text}' ボタン経由")
                            async with page.expect_file_chooser(timeout=10000) as fc_info:
                                await sel_btn.first.click()
                            fc = await fc_info.value
                            await fc.set_files(str(video_path))
                            clicked_select = True
                            break
                    if clicked_select:
                        break

                if not clicked_select:
                    await self._screenshot(page, "02c_no_file_input")
                    return UploadResult(
                        platform="instagram", success=False,
                        error="ファイル選択方法が見つかりません",
                    )

            # 動画処理の待機
            await page.wait_for_timeout(10000)

            await self._screenshot(page, "03_file_selected")

            # 「次へ」ボタンを3回クリック（crop → filter → caption）
            for step in range(3):
                next_btn = None
                for text in ["Next", "次へ"]:
                    candidate = page.locator(f"button:has-text('{text}')")
                    if await candidate.count() > 0:
                        next_btn = candidate.first
                        break
                    # div ボタンの場合
                    candidate = page.locator(f"div[role='button']:has-text('{text}')")
                    if await candidate.count() > 0:
                        next_btn = candidate.first
                        break

                if next_btn:
                    await next_btn.click()
                    logger.info(f"Instagram: 次へボタンクリック (step {step + 1})")
                    await page.wait_for_timeout(3000)
                else:
                    logger.info(f"Instagram: 次へボタンなし (step {step + 1})")
                    break

            await self._screenshot(page, "04_caption_page")

            # キャプション入力
            hashtag_str = " ".join(
                f"#{h}" if not h.startswith("#") else h
                for h in content.hashtags
            )
            caption = f"{content.description}\n\n{hashtag_str}".strip()

            caption_selectors = [
                '[aria-label="Write a caption..."]',
                '[aria-label="キャプションを入力..."]',
                '[contenteditable="true"]',
                'textarea',
            ]
            caption_entered = False
            for sel in caption_selectors:
                el = page.locator(sel).first
                if await el.count() > 0:
                    await el.click()
                    await page.keyboard.type(caption, delay=15)
                    logger.info(f"Instagram: キャプション入力完了 ({sel})")
                    caption_entered = True
                    await page.wait_for_timeout(1000)
                    break

            if not caption_entered:
                logger.warning("Instagram: キャプション入力フィールドが見つかりません")

            await self._screenshot(page, "05_caption_entered")

            # シェアボタン
            share_clicked = False
            for text in ["Share", "シェア"]:
                btn = page.locator(f"button:has-text('{text}')")
                if await btn.count() > 0:
                    try:
                        await btn.first.click(timeout=5000)
                    except Exception:
                        await btn.first.dispatch_event("click")
                    logger.info(f"Instagram: シェアボタンクリック ({text})")
                    share_clicked = True
                    break
                # div ボタン
                btn = page.locator(f"div[role='button']:has-text('{text}')")
                if await btn.count() > 0:
                    try:
                        await btn.first.click(timeout=5000)
                    except Exception:
                        await btn.first.dispatch_event("click")
                    logger.info(f"Instagram: シェアボタンクリック div ({text})")
                    share_clicked = True
                    break

            if not share_clicked:
                await self._screenshot(page, "05b_no_share_btn")
                return UploadResult(
                    platform="instagram", success=False,
                    error="シェアボタンが見つかりません",
                )

            # 投稿完了待ち
            await page.wait_for_timeout(15000)
            await self._screenshot(page, "06_after_share")

            # セッション保存
            await context.storage_state(path=str(STORAGE_STATE_PATH))

            logger.info("Instagram: 投稿成功")
            return UploadResult(platform="instagram", success=True, url="https://www.instagram.com")

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Instagram: 投稿失敗 - {error_msg}")
            return UploadResult(platform="instagram", success=False, error=error_msg)
        finally:
            if browser:
                await browser.close()
            if pw:
                await pw.stop()

    async def validate(self) -> bool:
        if not STORAGE_STATE_PATH.exists():
            logger.info("Instagram: セッションなし")
            return False

        pw = None
        browser = None
        try:
            pw, browser = await self._get_browser()
            context, _ = await self._get_context(browser)
            page = await context.new_page()
            await page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(3000)
            logged_in = "login" not in page.url
            if logged_in:
                logger.info("Instagram: 認証OK")
            else:
                logger.info("Instagram: 認証NG - セッション期限切れ")
            return logged_in
        except Exception as e:
            logger.error(f"Instagram: 認証エラー - {e}")
            return False
        finally:
            if browser:
                await browser.close()
            if pw:
                await pw.stop()


def upload_to_ig_playwright(content: PostContent) -> UploadResult:
    """同期ラッパー"""
    uploader = InstagramPlaywrightUploader()
    return asyncio.run(uploader.upload(content))


def validate_ig_playwright() -> bool:
    """認証確認の同期ラッパー"""
    uploader = InstagramPlaywrightUploader()
    return asyncio.run(uploader.validate())
