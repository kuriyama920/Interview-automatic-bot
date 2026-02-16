"""TikTok アップロードページのDOM調査

Playwright で TikTok にアクセスし、ログイン→アップロードページの構造を調べる。
手動ログイン用に120秒の猶予を設ける。
"""
import asyncio
import sys
sys.path.insert(0, ".")

from pathlib import Path

STORAGE_STATE_PATH = Path("sessions") / "tiktok_state.json"
SS_DIR = Path("screenshots")
SS_DIR.mkdir(exist_ok=True)


async def main():
    from playwright.async_api import async_playwright

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=False,
        args=["--disable-blink-features=AutomationControlled"],
    )

    desktop_ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )

    # 既存セッションチェック
    if STORAGE_STATE_PATH.exists():
        print("[INFO] 既存セッションから復元...")
        context = await browser.new_context(
            storage_state=str(STORAGE_STATE_PATH),
            viewport={"width": 1280, "height": 900},
            user_agent=desktop_ua,
        )
    else:
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=desktop_ua,
        )

    page = await context.new_page()

    # TikTokホームページ → ログイン確認
    print("[1] TikTok を開いています...")
    await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(5000)
    await page.screenshot(path=str(SS_DIR / "tiktok_01_home.png"))

    # ログイン状態チェック
    # TikTokのログイン状態は upload ページに行って確認が確実
    print("[2] アップロードページに移動...")
    await page.goto("https://www.tiktok.com/upload", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(5000)
    await page.screenshot(path=str(SS_DIR / "tiktok_02_upload.png"))

    current_url = page.url
    print(f"    URL: {current_url}")

    if "login" in current_url:
        print("[3] ログインが必要です。ブラウザで手動ログインしてください（120秒）")
        print("    - メール/パスワードまたはソーシャルログインを使用")
        print("    - CAPTCHAは手動で解決してください")
        print()

        for i in range(24):  # 120秒
            await page.wait_for_timeout(5000)
            url = page.url
            if "login" not in url:
                print(f"[OK] ログイン確認 (URL: {url})")
                # セッション保存
                await context.storage_state(path=str(STORAGE_STATE_PATH))
                print(f"[INFO] セッション保存: {STORAGE_STATE_PATH}")
                break
            remaining = 120 - (i + 1) * 5
            print(f"    待機中... 残り {remaining}秒")
        else:
            print("[ERROR] ログインタイムアウト")
            await browser.close()
            await pw.stop()
            return

        # ログイン後、アップロードページへ再移動
        await page.goto("https://www.tiktok.com/upload", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(5000)
    else:
        print("[OK] ログイン済み")
        # セッション保存
        await context.storage_state(path=str(STORAGE_STATE_PATH))

    await page.screenshot(path=str(SS_DIR / "tiktok_03_upload_page.png"))
    print(f"    URL: {page.url}")

    # DOM調査
    print("\n[4] DOM調査:")

    # file input
    file_inputs = await page.locator('input[type="file"]').count()
    print(f"    input[type='file']: {file_inputs}")

    # ボタン一覧
    buttons = await page.evaluate("""
        () => {
            const btns = document.querySelectorAll('button, [role="button"]');
            return Array.from(btns).slice(0, 20).map(b => ({
                tag: b.tagName,
                role: b.getAttribute('role'),
                text: b.textContent?.trim().substring(0, 50),
                className: (b.className || '').toString().substring(0, 80),
            }));
        }
    """)
    print("    ボタン:")
    for b in buttons:
        print(f"      {b.get('tag')} [{b.get('role', '-')}]: '{b.get('text', '')}'")

    # テキストエリア
    textareas = await page.evaluate("""
        () => {
            const tas = document.querySelectorAll('textarea, [contenteditable], input[type="text"]');
            return Array.from(tas).slice(0, 10).map(t => ({
                tag: t.tagName,
                placeholder: t.getAttribute('placeholder'),
                ariaLabel: t.getAttribute('aria-label'),
                name: t.getAttribute('name'),
            }));
        }
    """)
    print("    テキスト入力:")
    for t in textareas:
        print(f"      {t}")

    await page.screenshot(path=str(SS_DIR / "tiktok_04_final.png"))

    print(f"\n[完了] スクリーンショット:")
    for f in SS_DIR.glob("tiktok_*.png"):
        print(f"  {f}")

    # Cookie保存 (Netscape形式)
    cookies = await context.cookies()
    session_cookie = next((c for c in cookies if c["name"] == "sessionid"), None)
    if session_cookie:
        print(f"\n[Cookie] sessionid: {session_cookie['value'][:20]}...")

        # Netscape形式で保存
        cookies_path = Path("sessions") / "tiktok_cookies.txt"
        lines = ["# Netscape HTTP Cookie File", ""]
        for c in cookies:
            domain = c.get("domain", "")
            if not domain.startswith("."):
                domain = "." + domain
            lines.append(
                f"{domain}\tTRUE\t{c.get('path', '/')}\t"
                f"{'TRUE' if c.get('secure', False) else 'FALSE'}\t"
                f"{int(c.get('expires', 0))}\t{c['name']}\t{c['value']}"
            )
        cookies_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"[Cookie] 保存: {cookies_path}")

    await browser.close()
    await pw.stop()


asyncio.run(main())
