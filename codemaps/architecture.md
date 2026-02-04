# Architecture Codemap

> Freshness: 2026-02-04 | Auto-generated

## Overview

Electron + React デスクトップアプリケーション。リアルタイム音声認識とAI回答生成を提供。

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ STTService  │  │ AIService   │  │ ContextService      │ │
│  │ (Deepgram)  │  │ (OpenAI)    │  │ (Embeddings+Storage)│ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│  ┌──────┴────────────────┴─────────────────────┴──────────┐ │
│  │                    IPC Handlers                        │ │
│  └────────────────────────┬───────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────┘
                            │ contextBridge
                     ┌──────┴──────┐
                     │   PRELOAD   │
                     └──────┬──────┘
                            │ window.electron.*
┌───────────────────────────┼─────────────────────────────────┐
│                     RENDERER PROCESS                        │
│  ┌────────────────────────┴───────────────────────────────┐ │
│  │                      App.tsx                           │ │
│  │  ┌─────────────┬──────────────────┬──────────────────┐ │ │
│  │  │ Documents   │  Transcripts     │  AI Responses    │ │ │
│  │  │ Panel       │  (Questions)     │  (Suggestions)   │ │ │
│  │  └─────────────┴──────────────────┴──────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Process Communication

### IPC Channels

| Channel | Type | Direction | Purpose |
|---------|------|-----------|---------|
| `stt:start` | invoke | R→M | WebSocket接続開始 |
| `stt:stop` | invoke | R→M | WebSocket切断 |
| `stt:audio` | send | R→M | 音声バッファ送信 |
| `stt:transcript` | event | M→R | 文字起こし結果 |
| `ai:init` | invoke | R→M | OpenAI初期化 |
| `ai:generateStream` | invoke | R→M | ストリーム生成開始 |
| `ai:chunk` | event | M→R | トークンチャンク |
| `ai:complete` | event | M→R | 生成完了 |
| `document:upload` | invoke | R→M | ドキュメント追加 |
| `document:list` | invoke | R→M | 一覧取得 |

## Data Flow

### Recording & Transcription

```
Microphone → AudioContext → Resample(16kHz) → Int16 PCM
    ↓
stt:audio → Main Process → Deepgram WebSocket
    ↓
stt:transcript ← Deepgram (interim/final)
    ↓
useSTT hook → UI update
```

### AI Response Generation

```
Final transcript → ai:generateStream
    ↓
ContextService → getRelevantContext (semantic search)
    ↓
AIService → OpenAI API (stream)
    ↓
ai:chunk → UI (real-time) → ai:complete
```

## Key Files

| File | Purpose |
|------|---------|
| [src/main/index.ts](src/main/index.ts) | Electronエントリーポイント |
| [src/main/ipc.ts](src/main/ipc.ts) | 全IPCハンドラー |
| [src/preload/index.ts](src/preload/index.ts) | contextBridge API |
| [src/renderer/src/App.tsx](src/renderer/src/App.tsx) | メインUI |
