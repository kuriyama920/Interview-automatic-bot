"""SNS 自動投稿 CLI エントリーポイント

使い方:
  # 全プラットフォームに投稿
  python main.py post --video ./output/video.mp4 --description "説明文" --hashtags "面接対策,AI,転職"

  # 特定プラットフォームのみ
  python main.py post --video ./output/video.mp4 --platforms x,instagram

  # 認証状態を確認
  python main.py status

  # 特定プラットフォームの認証確認
  python main.py status --platforms x

  # 既存の video-shorts パイプラインの最新動画を投稿
  python main.py post-latest --platforms x,instagram,tiktok
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from src.logger import logger
from src.orchestrator import post_to_platforms, validate_all
from src.types import Platform, PostContent


def find_latest_video() -> Path | None:
    """video-shorts/output/ から最新の動画ファイルを取得"""
    output_dir = Path(__file__).parent.parent / "video-shorts" / "output"
    if not output_dir.exists():
        return None

    mp4_files = sorted(output_dir.glob("*.mp4"), key=lambda f: f.stat().st_mtime)
    return mp4_files[-1] if mp4_files else None


def cmd_post(args: argparse.Namespace) -> None:
    """投稿コマンド"""
    video_path = Path(args.video)
    if not video_path.exists():
        logger.error(f"動画ファイルが見つかりません: {video_path}")
        sys.exit(1)

    hashtags = [h.strip() for h in args.hashtags.split(",")] if args.hashtags else []
    platforms: list[Platform] = (
        [p.strip() for p in args.platforms.split(",")]
        if args.platforms
        else ["x", "instagram", "tiktok"]
    )

    content = PostContent(
        video_path=str(video_path.resolve()),
        description=args.description or "",
        hashtags=hashtags,
        title=args.title or "",
    )

    results = post_to_platforms(content, platforms)
    failed = [r for r in results if not r.success]
    if failed:
        sys.exit(1)


def cmd_post_latest(args: argparse.Namespace) -> None:
    """最新動画を投稿するコマンド"""
    latest = find_latest_video()
    if latest is None:
        logger.error("video-shorts/output/ に動画が見つかりません")
        sys.exit(1)

    logger.info(f"最新動画: {latest}")

    platforms: list[Platform] = (
        [p.strip() for p in args.platforms.split(",")]
        if args.platforms
        else ["x", "instagram", "tiktok"]
    )
    hashtags = [h.strip() for h in args.hashtags.split(",")] if args.hashtags else [
        "InterviewBot", "面接対策", "AI", "転職", "就活",
    ]

    content = PostContent(
        video_path=str(latest.resolve()),
        description=args.description or "AIリアルタイム面接支援ツール InterviewBot",
        hashtags=hashtags,
        title=args.title or "",
    )

    results = post_to_platforms(content, platforms)
    failed = [r for r in results if not r.success]
    if failed:
        sys.exit(1)


def cmd_status(args: argparse.Namespace) -> None:
    """認証状態確認コマンド"""
    platforms: list[Platform] | None = (
        [p.strip() for p in args.platforms.split(",")]
        if args.platforms
        else None
    )

    print("\nプラットフォーム認証状態:")
    print("-" * 40)

    results = validate_all(platforms)
    for platform, ok in results.items():
        mark = "OK" if ok else "NG"
        print(f"  {platform:<12} {mark}")

    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="InterviewBot SNS 自動投稿ツール"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # post コマンド
    post_parser = subparsers.add_parser("post", help="動画を投稿")
    post_parser.add_argument("--video", "-v", required=True, help="動画ファイルパス")
    post_parser.add_argument("--description", "-d", default="", help="投稿テキスト")
    post_parser.add_argument("--hashtags", default="", help="ハッシュタグ（カンマ区切り）")
    post_parser.add_argument("--title", "-t", default="", help="タイトル")
    post_parser.add_argument(
        "--platforms", "-p", default=None, help="投稿先（カンマ区切り: x,instagram,tiktok）"
    )

    # post-latest コマンド
    latest_parser = subparsers.add_parser(
        "post-latest", help="video-shorts の最新動画を投稿"
    )
    latest_parser.add_argument("--description", "-d", default="", help="投稿テキスト")
    latest_parser.add_argument("--hashtags", default="", help="ハッシュタグ")
    latest_parser.add_argument("--title", "-t", default="", help="タイトル")
    latest_parser.add_argument("--platforms", "-p", default=None, help="投稿先")

    # status コマンド
    status_parser = subparsers.add_parser("status", help="認証状態を確認")
    status_parser.add_argument("--platforms", "-p", default=None, help="確認先")

    args = parser.parse_args()

    if args.command == "post":
        cmd_post(args)
    elif args.command == "post-latest":
        cmd_post_latest(args)
    elif args.command == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()
