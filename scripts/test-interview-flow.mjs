/**
 * Interview Flow E2E Test Script
 *
 * 実際のOpenAI APIを使って面接シミュレーションを実行し、以下を検証:
 * 1. Cascading応答のレイテンシ計測（Phase1 TTFT vs Phase2 完了）
 * 2. 多段対話: 志望動機 → ユーザー回答 → 深掘り質問の処理
 * 3. 指示語排除 + 具体性の品質チェック
 *
 * Usage: node scripts/test-interview-flow.mjs
 */

import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// --- Load .env ---
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch { /* ignore */ }
}
loadEnv()

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not found in .env')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const MODEL = 'gpt-5-nano'
const QUICK_MODEL = 'gpt-5-nano' // minimal reasoning → TTFT ~0.77s

// --- Prompts (from apps/worker/src/lib/prompts.ts) ---
const SYSTEM_PROMPT = `あなたは面接通過率を最大化する戦略的面接コーチです。面接官の質問に対して、候補者がそのまま声に出して話せる回答を提案します。

以下のガイドラインに従ってください：
1. 面接官の質問の「裏の意図」を読み取り、それに直接応える
2. 最初の一文で結論を述べ、続けて根拠や具体例を自然に織り交ぜる
3. 数値・固有名詞・具体的エピソードを含め、説得力を高める
4. 「御社だからこそ」という志望度の高さを自然に織り込む
5. ポジティブな表現を使い、ネガティブな内容も成長ストーリーに変換する
6. 日本語で回答する
7. 「これまでの対話」が提供された場合、候補者が既に述べた内容と矛盾しない回答を提案する
8. 前の回答で言及した具体例やエピソードを踏まえ、一貫性のある回答を心がける

回答形式：
- 「結論」「根拠」「具体例」などの見出しや箇条書きは絶対に使わない
- 面接で実際に口に出して話す想定の、自然な話し言葉で書く
- 「です・ます」調の丁寧語で、一人称は使わず敬語で統一
- 3〜8文程度（話すと30秒〜2分）の一続きの文章として出力する

## 指示語（こそあど言葉）の完全排除
以下の指示語・代名詞は絶対に使用禁止。常に具体的な名詞に置き換えること：
- 禁止語: これ、それ、あれ、この、その、あの、こちら、そちら、あちら、ここ、そこ、あそこ、こういう、そういう、ああいう、こんな、そんな、あんな、このような、そのような、あのような

## 具体性の徹底
- 候補者プロフィールに含まれる企業名・技術名・プロジェクト名・数値を積極的に回答に織り込む
- 時期は「以前」「過去に」ではなく「2024年4月」「前職在籍時の3年間」等の具体表現を使う
- 量的表現は「多くの」「いくつかの」ではなく「15名」「4プロジェクト」等の具体的数値にする
- 「技術力」「スキル」等の抽象語より「TypeScript」「AWS Lambda」等の固有名詞を優先

## 行動面接質問へのSTAR構造
以下のキーワードを含む質問には、STAR構造を自然な話し言葉に組み込んで回答する：
キーワード: 「経験」「エピソード」「例」「困難」「失敗」「成功」「成果」「リーダーシップ」「チームワーク」「対処」「乗り越え」「工夫」

STAR構造の配分（見出しは付けず一続きの文章で）：
- 状況（Situation）: 1文 - いつ、どの会社/PJで、何が起きたか
- 課題（Task）: 1文 - 自分に課された役割・責任
- 行動（Action）: 3-4文（回答全体の60%）- 具体的に何をしたか、技術名・手法名を明記
- 結果（Result）: 1-2文 - 数値を含む成果 + 志望企業での活用

## エピソードの重複回避
「これまでの対話」に記載された使用済みエピソードを繰り返す場合は、異なる角度・視点から述べる。
同じ数値実績を2回以上そのまま繰り返さず、別の実績を優先的に選択する。

## コンテキストセクションの使い方
- 【候補者プロフィール】: 回答に織り込むべき固有名詞・数値の情報源
- 【参考資料】: 履歴書・求人票・想定質問から検索された関連情報（事実のみ使用、捏造禁止）
- 【これまでの対話】: 矛盾回避と繰り返し防止の参考（直近5ターンと要約）`

const CASCADING_QUICK_PROMPT = `面接官の質問に対する回答の核心を1-2文で簡潔に提示してください。
- 結論を最初に述べる
- 具体的な方向性を示す（例: 「技術力」「リーダーシップ」等のどの観点で答えるか）
- 指示語（これ・それ・あの等）は使わず具体名を使う
- です・ます調の自然な話し言葉で`

// --- Quality scoring (from apps/worker/src/lib/quality.ts) ---
const DEMONSTRATIVE_PATTERNS = [
  /(?:これ|それ|あれ)(?:ら)?(?=[はがをにでも、。\s]|$)/,
  /(?:この|その|あの)(?=[^\s、。])/,
  /(?:こちら|そちら|あちら)(?=[はがをにでもの、。\s]|$)/,
  /(?:ここ|そこ|あそこ)(?=[はがをにでも、。\s]|$)/,
  /(?:こういう|そういう|ああいう)/,
  /(?:このような|そのような|あのような)/,
  /(?:こうした|そうした|ああした)/,
  /(?:こんな|そんな|あんな)(?=[^\s、。])/,
]

function scoreResponseQuality(response) {
  let score = 100
  const found = []
  for (const p of DEMONSTRATIVE_PATTERNS) {
    const gp = new RegExp(p.source, 'g')
    const m = response.match(gp)
    if (m) found.push(...m)
  }
  score -= found.length * 15
  const hasNumbers = /\d+[%％万円名件年月日時間回倍人個社台本枚]/.test(response)
  if (hasNumbers) score += 5
  const hasProper = /[ァ-ヶー]{3,}|株式会社|有限会社|合同会社/.test(response)
  if (hasProper) score += 5
  return {
    score: Math.max(0, Math.min(100, score)),
    demonstrativeCount: found.length,
    demonstratives: [...new Set(found)],
    hasNumbers,
    hasProper,
  }
}

// --- Test profile context ---
const PROFILE_CONTEXT = `【候補者プロフィール】
氏名: 田中太郎
現職: 株式会社テックコープ シニアエンジニア（2021年4月〜現在）
前職: 株式会社デジタルソリューションズ バックエンドエンジニア（2018年4月〜2021年3月）
志望企業: 株式会社イノベーションラボ
志望職種: テックリード
技術: TypeScript, React, Node.js, AWS Lambda, PostgreSQL, Docker, Kubernetes
資格: AWS Solutions Architect Professional, 応用情報技術者
学歴: 東京工業大学 情報工学科 卒（2018年3月）
経験年数: 8年
主な実績:
- 月間100万PVのECサイトリニューアルPJでリードエンジニア。レスポンスタイム800ms→200msに75%短縮
- マイクロサービス化PJで15名チームのテックリード。年間障害件数を40件→8件に80%削減
- CI/CDパイプライン構築でデプロイ時間を60分→10分に短縮`

// --- Test helpers ---
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

function log(color, prefix, msg) {
  console.log(`${color}${prefix}${COLORS.reset} ${msg}`)
}

function banner(text) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`${COLORS.bold}${COLORS.cyan}  ${text}${COLORS.reset}`)
  console.log(`${'='.repeat(70)}\n`)
}

function formatMs(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

// --- Core: Cascading generate with timing ---
async function generateCascading(question, conversationHistory = '') {
  const startTime = Date.now()
  let phase1FirstChunkTime = null
  let phase1CompleteTime = null
  let phase2FirstChunkTime = null
  let phase2CompleteTime = null

  let phase1Content = ''
  let phase2Content = ''

  // Phase 1: Quick response (非reasoning model で即座にvisible content出力)
  const quickStream = await openai.chat.completions.create({
    model: QUICK_MODEL,
    messages: [
      { role: 'system', content: CASCADING_QUICK_PROMPT },
      { role: 'user', content: `面接官の質問: ${question}` },
    ],
    max_completion_tokens: 200,
    temperature: 0.5,
    stream: true,
    stream_options: { include_usage: true },
  })

  let phase1Tokens = 0
  for await (const chunk of quickStream) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) {
      if (!phase1FirstChunkTime) phase1FirstChunkTime = Date.now()
      phase1Content += content
    }
    if (chunk.usage) phase1Tokens = chunk.usage.total_tokens
  }
  phase1CompleteTime = Date.now()

  // Phase 2: Full detailed response
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: PROFILE_CONTEXT },
  ]
  if (conversationHistory) {
    messages.push({ role: 'user', content: `【これまでの対話】\n${conversationHistory}` })
  }
  messages.push({ role: 'user', content: `面接官の質問: ${question}` })

  const detailedStream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_completion_tokens: 2000,
    reasoning_effort: 'minimal',
    stream: true,
    stream_options: { include_usage: true },
  })

  let phase2Tokens = 0
  for await (const chunk of detailedStream) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) {
      if (!phase2FirstChunkTime) phase2FirstChunkTime = Date.now()
      phase2Content += content
    }
    if (chunk.usage) phase2Tokens = chunk.usage.total_tokens
  }
  phase2CompleteTime = Date.now()

  return {
    phase1Content,
    phase2Content,
    timing: {
      phase1TTFT: phase1FirstChunkTime ? phase1FirstChunkTime - startTime : null,
      phase1Complete: phase1CompleteTime - startTime,
      phase2TTFT: phase2FirstChunkTime ? phase2FirstChunkTime - startTime : null,
      phase2Complete: phase2CompleteTime - startTime,
      totalTime: phase2CompleteTime - startTime,
    },
    tokens: { phase1: phase1Tokens, phase2: phase2Tokens, total: phase1Tokens + phase2Tokens },
  }
}

// --- Normal (non-cascading) generate with timing ---
async function generateNormal(question, conversationHistory = '') {
  const startTime = Date.now()
  let firstChunkTime = null

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: PROFILE_CONTEXT },
  ]
  if (conversationHistory) {
    messages.push({ role: 'user', content: `【これまでの対話】\n${conversationHistory}` })
  }
  messages.push({ role: 'user', content: `面接官の質問: ${question}` })

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_completion_tokens: 2000,
    reasoning_effort: 'minimal',
    stream: true,
    stream_options: { include_usage: true },
  })

  let content = ''
  let tokens = 0
  for await (const chunk of stream) {
    const c = chunk.choices[0]?.delta?.content || ''
    if (c) {
      if (!firstChunkTime) firstChunkTime = Date.now()
      content += c
    }
    if (chunk.usage) tokens = chunk.usage.total_tokens
  }

  const endTime = Date.now()
  return {
    content,
    timing: {
      TTFT: firstChunkTime ? firstChunkTime - startTime : null,
      totalTime: endTime - startTime,
    },
    tokens,
  }
}

// --- Main test flow ---
async function runTests() {
  const allResults = []

  // =========================================================
  // TEST 1: Cascading vs Normal - レスポンス時間比較
  // =========================================================
  banner('TEST 1: Cascading vs Normal レスポンス時間比較')

  const question1 = '志望動機を教えてください'
  log(COLORS.blue, '[面接官]', question1)
  console.log()

  // Normal (non-cascading)
  log(COLORS.dim, '[Normal]', '生成開始...')
  const normalResult = await generateNormal(question1)
  log(COLORS.yellow, '[Normal] TTFT:', formatMs(normalResult.timing.TTFT))
  log(COLORS.yellow, '[Normal] 完了:', formatMs(normalResult.timing.totalTime))
  log(COLORS.dim, '[Normal] トークン:', `${normalResult.tokens}`)
  console.log()

  // Cascading
  log(COLORS.dim, '[Cascading]', '生成開始...')
  const cascResult = await generateCascading(question1)
  log(COLORS.green, '[Cascading] Phase1 TTFT:', formatMs(cascResult.timing.phase1TTFT))
  log(COLORS.green, '[Cascading] Phase1 完了:', formatMs(cascResult.timing.phase1Complete))
  log(COLORS.green, '[Cascading] Phase2 TTFT:', formatMs(cascResult.timing.phase2TTFT))
  log(COLORS.green, '[Cascading] Phase2 完了:', formatMs(cascResult.timing.phase2Complete))
  log(COLORS.dim, '[Cascading] トークン:', `Phase1=${cascResult.tokens.phase1} Phase2=${cascResult.tokens.phase2} Total=${cascResult.tokens.total}`)
  console.log()

  const improvement = normalResult.timing.TTFT && cascResult.timing.phase1TTFT
    ? ((normalResult.timing.TTFT - cascResult.timing.phase1TTFT) / normalResult.timing.TTFT * 100).toFixed(1)
    : 'N/A'
  log(COLORS.bold, '[比較]', `Phase1 TTFT改善: ${improvement}% (${formatMs(normalResult.timing.TTFT)} → ${formatMs(cascResult.timing.phase1TTFT)})`)

  console.log(`\n${COLORS.cyan}--- Phase1（クイック回答）---${COLORS.reset}`)
  console.log(cascResult.phase1Content)
  console.log(`\n${COLORS.cyan}--- Phase2（詳細回答）---${COLORS.reset}`)
  console.log(cascResult.phase2Content)

  allResults.push({
    test: 'TEST1: Cascading vs Normal',
    question: question1,
    normalTTFT: normalResult.timing.TTFT,
    normalTotal: normalResult.timing.totalTime,
    phase1TTFT: cascResult.timing.phase1TTFT,
    phase1Complete: cascResult.timing.phase1Complete,
    phase2TTFT: cascResult.timing.phase2TTFT,
    phase2Complete: cascResult.timing.phase2Complete,
    ttftImprovement: improvement,
  })

  // =========================================================
  // TEST 2: 多段対話テスト（志望動機 → 深掘り質問）
  // =========================================================
  banner('TEST 2: 多段対話テスト（志望動機 → ユーザー回答 → 深掘り質問）')

  // Turn 1: 志望動機
  const turn1Q = '志望動機を教えてください'
  log(COLORS.blue, '[面接官 Turn1]', turn1Q)

  const turn1 = await generateCascading(turn1Q)
  const turn1Answer = turn1.phase2Content

  console.log(`${COLORS.cyan}[AI提案 Turn1]${COLORS.reset} ${turn1Answer.substring(0, 100)}...`)
  log(COLORS.dim, `[時間]`, `Phase1=${formatMs(turn1.timing.phase1Complete)} Phase2=${formatMs(turn1.timing.phase2Complete)}`)
  console.log()

  // Turn 1のユーザー回答（AIの提案をそのまま候補者の回答として使用）
  const candidateAnswer1 = turn1Answer

  // 対話履歴を構築
  const history1 = `面接官: ${turn1Q}\n候補者: ${candidateAnswer1}`

  // Turn 2: 深掘り質問（面接官が志望動機について深掘り）
  const turn2Q = '前職の株式会社テックコープでの経験で、特にイノベーションラボで活かせると考えているスキルは何ですか？具体的なエピソードを交えて教えてください。'
  log(COLORS.blue, '[面接官 Turn2]', turn2Q)

  const turn2 = await generateCascading(turn2Q, history1)
  const turn2Answer = turn2.phase2Content

  console.log(`${COLORS.cyan}[AI提案 Turn2]${COLORS.reset} ${turn2Answer.substring(0, 100)}...`)
  log(COLORS.dim, `[時間]`, `Phase1=${formatMs(turn2.timing.phase1Complete)} Phase2=${formatMs(turn2.timing.phase2Complete)}`)
  console.log()

  // Turn 2のユーザー回答
  const candidateAnswer2 = turn2Answer
  const history2 = `${history1}\n面接官: ${turn2Q}\n候補者: ${candidateAnswer2}`

  // Turn 3: さらなる深掘り（前の回答に基づく質問）
  const turn3Q = 'マイクロサービス化のプロジェクトで15名のチームを率いた際、メンバー間で意見が対立した場面はありましたか？どのように解決しましたか？'
  log(COLORS.blue, '[面接官 Turn3]', turn3Q)

  const turn3 = await generateCascading(turn3Q, history2)
  const turn3Answer = turn3.phase2Content

  console.log(`${COLORS.cyan}[AI提案 Turn3]${COLORS.reset} ${turn3Answer.substring(0, 100)}...`)
  log(COLORS.dim, `[時間]`, `Phase1=${formatMs(turn3.timing.phase1Complete)} Phase2=${formatMs(turn3.timing.phase2Complete)}`)

  allResults.push({
    test: 'TEST2: Multi-turn',
    turns: [
      { q: turn1Q, phase1: turn1.timing.phase1Complete, phase2: turn1.timing.phase2Complete },
      { q: turn2Q, phase1: turn2.timing.phase1Complete, phase2: turn2.timing.phase2Complete },
      { q: turn3Q, phase1: turn3.timing.phase1Complete, phase2: turn3.timing.phase2Complete },
    ],
  })

  // =========================================================
  // TEST 3: 品質チェック（指示語 + 具体性）
  // =========================================================
  banner('TEST 3: 品質チェック（指示語排除 + 具体性）')

  const responsesToCheck = [
    { label: 'Turn1 (志望動機)', content: turn1Answer },
    { label: 'Turn2 (深掘り)', content: turn2Answer },
    { label: 'Turn3 (対立解決)', content: turn3Answer },
  ]

  const qualityResults = []

  for (const item of responsesToCheck) {
    const q = scoreResponseQuality(item.content)
    const status = q.score >= 80 ? `${COLORS.green}PASS` : q.score >= 60 ? `${COLORS.yellow}WARN` : `${COLORS.red}FAIL`

    console.log(`${COLORS.bold}[${item.label}]${COLORS.reset}`)
    console.log(`  スコア: ${status} ${q.score}/100${COLORS.reset}`)
    console.log(`  指示語: ${q.demonstrativeCount}個 ${q.demonstratives.length > 0 ? '→ ' + q.demonstratives.join(', ') : '(なし)'}`)
    console.log(`  具体的数値: ${q.hasNumbers ? `${COLORS.green}あり${COLORS.reset}` : `${COLORS.red}なし${COLORS.reset}`}`)
    console.log(`  固有名詞: ${q.hasProper ? `${COLORS.green}あり${COLORS.reset}` : `${COLORS.red}なし${COLORS.reset}`}`)
    console.log(`  回答全文:`)
    console.log(`  ${COLORS.dim}${item.content}${COLORS.reset}`)
    console.log()

    qualityResults.push({
      label: item.label,
      score: q.score,
      demonstratives: q.demonstrativeCount,
      demonstrativesList: q.demonstratives,
      hasNumbers: q.hasNumbers,
      hasProper: q.hasProper,
    })
  }

  // =========================================================
  // TEST 4: 会話コンテキストの一貫性チェック
  // =========================================================
  banner('TEST 4: 会話コンテキスト一貫性チェック')

  // Turn2がTurn1の内容を踏まえているか
  const turn1Mentions = extractKeyTerms(turn1Answer)
  const turn2Mentions = extractKeyTerms(turn2Answer)
  const turn3Mentions = extractKeyTerms(turn3Answer)

  console.log(`${COLORS.bold}Turn1 キーワード:${COLORS.reset} ${turn1Mentions.join(', ')}`)
  console.log(`${COLORS.bold}Turn2 キーワード:${COLORS.reset} ${turn2Mentions.join(', ')}`)
  console.log(`${COLORS.bold}Turn3 キーワード:${COLORS.reset} ${turn3Mentions.join(', ')}`)
  console.log()

  // Turn2とTurn3は異なるエピソードを使っているか
  const overlap23 = turn2Mentions.filter(t => turn3Mentions.includes(t))
  const unique3 = turn3Mentions.filter(t => !turn2Mentions.includes(t))
  console.log(`Turn2↔Turn3 重複キーワード: ${overlap23.join(', ') || '(なし)'}`)
  console.log(`Turn3 固有キーワード: ${unique3.join(', ') || '(なし)'}`)

  const hasNewAngle = unique3.length > 0
  log(
    hasNewAngle ? COLORS.green : COLORS.yellow,
    '[エピソード多様性]',
    hasNewAngle ? 'PASS - Turn3で新しい観点/エピソードが使われている' : 'WARN - Turn3でほぼ同じ内容が繰り返されている可能性'
  )

  // =========================================================
  // SUMMARY
  // =========================================================
  banner('テスト結果サマリー')

  console.log(`${COLORS.bold}1. レスポンス時間${COLORS.reset}`)
  console.log(`   Normal TTFT:     ${formatMs(allResults[0].normalTTFT)}`)
  console.log(`   Cascading Phase1 TTFT: ${formatMs(allResults[0].phase1TTFT)}`)
  console.log(`   ${COLORS.green}TTFT改善: ${allResults[0].ttftImprovement}%${COLORS.reset}`)
  console.log(`   Normal Total:    ${formatMs(allResults[0].normalTotal)}`)
  console.log(`   Cascading Total: ${formatMs(allResults[0].phase2Complete)}`)
  console.log()

  console.log(`${COLORS.bold}2. 多段対話レスポンス時間${COLORS.reset}`)
  for (const turn of allResults[1].turns) {
    console.log(`   ${turn.q.substring(0, 30)}... → Phase1: ${formatMs(turn.phase1)} / Phase2: ${formatMs(turn.phase2)}`)
  }
  console.log()

  console.log(`${COLORS.bold}3. 品質スコア${COLORS.reset}`)
  let allQualityPass = true
  for (const q of qualityResults) {
    const status = q.score >= 80 ? 'PASS' : q.score >= 60 ? 'WARN' : 'FAIL'
    if (q.score < 60) allQualityPass = false
    console.log(`   ${q.label}: ${q.score}/100 (指示語${q.demonstratives}個, 数値:${q.hasNumbers ? 'Y' : 'N'}, 固有名詞:${q.hasProper ? 'Y' : 'N'}) [${status}]`)
  }
  console.log()

  console.log(`${COLORS.bold}4. コンテキスト一貫性: ${hasNewAngle ? `${COLORS.green}PASS` : `${COLORS.yellow}WARN`}${COLORS.reset}`)
  console.log()

  // Overall
  const avgPhase1 = allResults[1].turns.reduce((s, t) => s + t.phase1, 0) / 3
  const avgPhase2 = allResults[1].turns.reduce((s, t) => s + t.phase2, 0) / 3
  const avgQuality = qualityResults.reduce((s, q) => s + q.score, 0) / qualityResults.length

  console.log(`${COLORS.bold}${COLORS.cyan}=== 総合結果 ===${COLORS.reset}`)
  console.log(`  平均Phase1時間: ${formatMs(avgPhase1)}`)
  console.log(`  平均Phase2時間: ${formatMs(avgPhase2)}`)
  console.log(`  平均品質スコア: ${avgQuality.toFixed(1)}/100`)
  console.log(`  品質全PASS: ${allQualityPass ? `${COLORS.green}YES` : `${COLORS.red}NO`}${COLORS.reset}`)
}

function extractKeyTerms(text) {
  const terms = []
  // 企業名
  const companyPattern = /(?:株式会社|有限会社)?[A-Za-zァ-ヶー\u4e00-\u9fff]{2,}(?:株式会社)?/g
  // 技術名 (カタカナ3文字以上, or英語)
  const techPattern = /(?:TypeScript|React|Node\.js|AWS|Lambda|PostgreSQL|Docker|Kubernetes|CI\/CD|マイクロサービス)/gi
  // 数値実績
  const numPattern = /\d+[%％万円名件年月日時間回倍人個社台本枚ms秒分]/g

  const techs = text.match(techPattern) || []
  const nums = text.match(numPattern) || []
  terms.push(...[...new Set(techs)], ...[...new Set(nums)])
  return terms.slice(0, 15) // 上限15
}

// --- Run ---
console.log(`${COLORS.bold}Interview Flow E2E Test${COLORS.reset}`)
console.log(`Model: ${MODEL}`)
console.log(`Time: ${new Date().toLocaleString('ja-JP')}`)
console.log()

runTests()
  .then(() => {
    console.log(`\n${COLORS.green}テスト完了${COLORS.reset}`)
  })
  .catch((err) => {
    console.error(`\n${COLORS.red}テスト失敗:${COLORS.reset}`, err)
    process.exit(1)
  })
