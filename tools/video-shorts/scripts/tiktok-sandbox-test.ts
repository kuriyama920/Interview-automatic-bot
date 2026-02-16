/**
 * TikTok Sandbox Test - Upload a test video
 *
 * Usage:
 *   TIKTOK_ACCESS_TOKEN=<token> npx tsx scripts/tiktok-sandbox-test.ts <video_path>
 */

import * as fs from 'fs'
import * as path from 'path'

const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || ''
const API_BASE = 'https://open.tiktokapis.com'

async function initializeUpload(videoSize: number) {
  console.log('Step 1: Initializing video upload...')

  const response = await fetch(`${API_BASE}/v2/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  })

  const data = await response.json()
  console.log('Init response:', JSON.stringify(data, null, 2))

  if (data.error?.code !== 'ok') {
    throw new Error(`Init failed: ${data.error?.message || JSON.stringify(data)}`)
  }

  return {
    publishId: data.data.publish_id,
    uploadUrl: data.data.upload_url,
  }
}

async function uploadVideo(uploadUrl: string, videoBuffer: Buffer) {
  console.log('Step 2: Uploading video file...')
  console.log(`  File size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`)

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
    body: videoBuffer,
  })

  console.log(`  Upload status: ${response.status}`)

  if (response.status !== 200 && response.status !== 201) {
    const text = await response.text()
    throw new Error(`Upload failed: ${response.status} ${text}`)
  }

  console.log('  Upload successful!')
}

async function publishVideo(publishId: string, title: string) {
  console.log('Step 3: Publishing video...')

  const response = await fetch(`${API_BASE}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: title,
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 0,
      },
    }),
  })

  const data = await response.json()
  console.log('Publish response:', JSON.stringify(data, null, 2))
  return data
}

async function checkStatus(publishId: string) {
  console.log('Step 4: Checking publish status...')

  const response = await fetch(`${API_BASE}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      publish_id: publishId,
    }),
  })

  const data = await response.json()
  console.log('Status:', JSON.stringify(data, null, 2))
  return data
}

async function verifyCredentials() {
  console.log('Verifying credentials...')

  const response = await fetch(`${API_BASE}/v2/user/info/?fields=open_id,display_name,avatar_url`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
  })

  const data = await response.json()
  console.log('User info:', JSON.stringify(data, null, 2))
  return data
}

async function main() {
  const videoPath = process.argv[2]

  if (!ACCESS_TOKEN) {
    console.error('Error: TIKTOK_ACCESS_TOKEN environment variable is required')
    process.exit(1)
  }

  // Verify credentials first
  await verifyCredentials()
  console.log('')

  if (!videoPath) {
    console.log('No video path provided. Credentials verified successfully.')
    console.log('\nUsage: npx tsx scripts/tiktok-sandbox-test.ts <video_path>')
    return
  }

  const fullPath = path.resolve(videoPath)

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: File not found: ${fullPath}`)
    process.exit(1)
  }

  const videoBuffer = fs.readFileSync(fullPath)
  console.log(`\nUploading: ${fullPath}`)
  console.log(`Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB\n`)

  try {
    // Step 1: Initialize
    const { publishId, uploadUrl } = await initializeUpload(videoBuffer.length)

    // Step 2: Upload
    await uploadVideo(uploadUrl, videoBuffer)

    // Step 3: Publish
    const title = 'InterviewBot - AI Interview Assistant #interviewbot #ai #interview'
    await publishVideo(publishId, title)

    // Step 4: Check status
    await new Promise(resolve => setTimeout(resolve, 3000))
    await checkStatus(publishId)

    console.log('\n=== Test complete! ===')
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
