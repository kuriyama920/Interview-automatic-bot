"""TikTok Playwright 投稿テスト"""
import asyncio
import sys
sys.path.insert(0, ".")

from src.types import PostContent
from src.uploaders.tiktok_playwright import TikTokPlaywrightUploader

content = PostContent(
    video_path=r"C:\dev\Interview-automatic-bot\tools\video-shorts\output\feature-highlight-1771147104710.mp4",
    description="AI面接アシスタント - リアルタイムで最適な回答を提案",
    hashtags=["InterviewBot", "AI面接", "転職活動"],
)

async def main():
    uploader = TikTokPlaywrightUploader()
    result = await uploader.upload(content)
    print(f"\n=== 結果 ===")
    print(f"Platform: {result.platform}")
    print(f"Success: {result.success}")
    print(f"URL: {result.url}")
    print(f"Error: {result.error}")

asyncio.run(main())
