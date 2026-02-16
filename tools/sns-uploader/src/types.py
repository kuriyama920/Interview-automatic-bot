"""型定義"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Platform = Literal["x", "instagram", "tiktok"]

ALL_PLATFORMS: list[Platform] = ["x", "instagram", "tiktok"]


@dataclass(frozen=True)
class PostContent:
    """投稿コンテンツ"""

    video_path: str
    description: str = ""
    hashtags: list[str] = field(default_factory=list)
    title: str = ""


@dataclass(frozen=True)
class UploadResult:
    """アップロード結果"""

    platform: Platform
    success: bool
    url: str = ""
    error: str = ""
