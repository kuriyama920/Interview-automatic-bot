"""TikTok セッション設定 - Playwright経由でログインしCookieを保存

tiktok-uploader ライブラリが必要とする cookies.txt (Netscape形式) を生成する。
1. ブラウザでTikTokログインページを開く
2. 手動でログイン（90秒以内）
3. Cookieを Netscape形式で保存
"""
import asyncio
import sys
sys.path.insert(0, ".")

from pathlib import Path
from src.config import tiktok_config

COOKIES_PATH = Path("sessions") / "tiktok_cookies.txt"
STORAGE_STATE_PATH = Path("sessions") / "tiktok_state.json"


def cookies_to_netscape(cookies: list[dict]) -> str:
    """Playwright Cookie を Netscape cookies.txt 形式に変換"""
    lines = ["# Netscape HTTP Cookie File", ""]
    for c in cookies:
        domain = c.get("domain", "")
        # ドメインの先頭が . でない場合は追加
        if not domain.startswith("."):
            domain = "." + domain
        flag = "TRUE"  # domain wide
        path = c.get("path", "/")
        secure = "TRUE" if c.get("secure", False) else "FALSE"
        expiry = str(int(c.get("expires", 0)))
        name = c.get("name", "")
        value = c.get("value", "")
        lines.append(f"{domain}\t{flag}\t{path}\t{secure}\t{expiry}\t{name}\t{value}")
    return "\n".join(lines)


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

    # 既存セッションがあれば復元
    if STORAGE_STATE_PATH.exists():
        print("[INFO] 既存セッションから復元中...")
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

    # TikTokログインページへ
    print("[1] TikTok ログインページを開いています...")
    await page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(3000)

    # ログイン済みチェック
    current_url = page.url
    if "login" not in current_url and "tiktok.com" in current_url:
        print("[INFO] 既にログイン済みです!")
    else:
        print("[2] ブラウザでTikTokにログインしてください（90秒以内）")
        print("    - メール/ユーザー名でログイン推奨")
        print("    - CAPTCHA対応も手動で行ってください")
        print()

        # ログイン完了を待つ
        for i in range(18):  # 90秒
            await page.wait_for_timeout(5000)
            url = page.url
            if "login" not in url:
                print(f"[OK] ログイン確認 (URL: {url})")
                break
            remaining = 90 - (i + 1) * 5
            print(f"    待機中... 残り {remaining}秒")
        else:
            print("[ERROR] ログインタイムアウト")
            await browser.close()
            await pw.stop()
            return

    await page.wait_for_timeout(3000)

    # Cookie取得
    cookies = await context.cookies()
    print(f"\n[3] Cookie取得: {len(cookies)}件")

    # sessionid確認
    session_cookie = next(
        (c for c in cookies if c["name"] == "sessionid"), None
    )
    if session_cookie:
        print(f"    sessionid: {session_cookie['value'][:20]}...")
    else:
        print("    [WARNING] sessionid Cookie が見つかりません")

    # Netscape形式で保存
    COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    netscape_content = cookies_to_netscape(cookies)
    COOKIES_PATH.write_text(netscape_content, encoding="utf-8")
    print(f"[4] Cookie保存: {COOKIES_PATH}")

    # Storage state も保存（Playwright用）
    await context.storage_state(path=str(STORAGE_STATE_PATH))
    print(f"[5] セッション保存: {STORAGE_STATE_PATH}")

    await browser.close()
    await pw.stop()
    print("\n[完了] TikTok セッション設定が完了しました")


asyncio.run(main())
