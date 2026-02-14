/**
 * 面接でよく聞かれる質問20個のMP3音声を生成するスクリプト
 * OpenAI TTS API (tts-1) を使用
 *
 * Usage: node scripts/generate-interview-questions-audio.mjs
 */
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { config } from 'dotenv'
import OpenAI from 'openai'

config()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const QUESTIONS = [
  { id: 1, text: '自己紹介をお願いします。' },
  { id: 2, text: '志望動機を教えてください。' },
  { id: 3, text: 'あなたの強みは何ですか？' },
  { id: 4, text: 'あなたの弱みは何ですか？' },
  { id: 5, text: '前職を退職した理由を教えてください。' },
  { id: 6, text: '5年後、10年後のキャリアプランを教えてください。' },
  { id: 7, text: 'これまでの仕事で最も困難だったことは何ですか？' },
  { id: 8, text: 'チームで働く上で大切にしていることは何ですか？' },
  { id: 9, text: 'リーダーシップを発揮した経験を教えてください。' },
  { id: 10, text: 'ストレスにどのように対処していますか？' },
  { id: 11, text: '当社について知っていることを教えてください。' },
  { id: 12, text: '入社後、どのように貢献できると考えていますか？' },
  { id: 13, text: '失敗した経験とそこから学んだことを教えてください。' },
  { id: 14, text: '仕事をする上でのモチベーションは何ですか？' },
  { id: 15, text: '他社の選考状況を教えてください。' },
  { id: 16, text: '希望する年収はどのくらいですか？' },
  { id: 17, text: '残業や休日出勤についてどのようにお考えですか？' },
  { id: 18, text: 'マネジメント経験はありますか？' },
  { id: 19, text: '最近関心を持っているニュースやトレンドはありますか？' },
  { id: 20, text: '最後に何か質問はありますか？' },
]

const OUTPUT_DIR = 'audio'

async function generateAudio(question) {
  const filename = `q${String(question.id).padStart(2, '0')}-interview-question.mp3`
  const filepath = `${OUTPUT_DIR}/${filename}`

  if (existsSync(filepath)) {
    console.log(`[SKIP] ${filename} already exists`)
    return
  }

  console.log(`[GEN] Q${question.id}: ${question.text}`)

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',
    input: question.text,
    response_format: 'mp3',
  })

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(filepath, buffer)
  console.log(`[OK]  ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`)
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set in .env')
    process.exit(1)
  }

  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
  }

  console.log(`Generating ${QUESTIONS.length} interview question audio files...`)
  console.log(`Output: ${OUTPUT_DIR}/\n`)

  for (const question of QUESTIONS) {
    await generateAudio(question)
  }

  console.log('\nDone!')
}

main().catch(console.error)
