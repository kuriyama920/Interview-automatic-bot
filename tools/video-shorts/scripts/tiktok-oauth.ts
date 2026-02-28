/**
 * TikTok OAuth Helper Script
 *
 * Step 1: Run this script to get the authorization URL
 *   npx tsx scripts/tiktok-oauth.ts authorize
 *
 * Step 2: After authorization, exchange the code for an access token
 *   npx tsx scripts/tiktok-oauth.ts token <AUTH_CODE>
 */

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || ''
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || ''
const REDIRECT_URI = 'https://interviewbot.app/auth/tiktok/callback'

async function getAuthorizationUrl() {
  const scope = 'user.info.basic,video.upload,video.publish'
  const state = Math.random().toString(36).substring(7)

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', CLIENT_KEY)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('state', state)

  console.log('\n=== TikTok OAuth Authorization ===\n')
  console.log('Open this URL in your browser:\n')
  console.log(url.toString())
  console.log('\nAfter authorization, you will be redirected to the callback URL.')
  console.log('Copy the "code" parameter from the URL and run:\n')
  console.log(`  npx tsx scripts/tiktok-oauth.ts token <AUTH_CODE>\n`)
}

async function exchangeCodeForToken(code: string) {
  console.log('\n=== Exchanging code for access token ===\n')

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  })

  const data = await response.json()

  if (data.access_token) {
    console.log('Access Token obtained successfully!\n')
    console.log('access_token:', data.access_token)
    console.log('refresh_token:', data.refresh_token)
    console.log('expires_in:', data.expires_in, 'seconds')
    console.log('open_id:', data.open_id)
    console.log('\nSave the access_token as TIKTOK_ACCESS_TOKEN environment variable.')
  } else {
    console.error('Error:', JSON.stringify(data, null, 2))
  }
}

async function refreshAccessToken(refreshToken: string) {
  console.log('\n=== Refreshing access token ===\n')

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()

  if (data.access_token) {
    console.log('Token refreshed successfully!\n')
    console.log('access_token:', data.access_token)
    console.log('refresh_token:', data.refresh_token)
    console.log('expires_in:', data.expires_in, 'seconds')
  } else {
    console.error('Error:', JSON.stringify(data, null, 2))
  }
}

const command = process.argv[2]
const arg = process.argv[3]

switch (command) {
  case 'authorize':
    getAuthorizationUrl()
    break
  case 'token':
    if (!arg) {
      console.error('Usage: npx tsx scripts/tiktok-oauth.ts token <AUTH_CODE>')
      process.exit(1)
    }
    exchangeCodeForToken(arg)
    break
  case 'refresh':
    if (!arg) {
      console.error('Usage: npx tsx scripts/tiktok-oauth.ts refresh <REFRESH_TOKEN>')
      process.exit(1)
    }
    refreshAccessToken(arg)
    break
  default:
    console.log('Usage:')
    console.log('  npx tsx scripts/tiktok-oauth.ts authorize              # Get auth URL')
    console.log('  npx tsx scripts/tiktok-oauth.ts token <AUTH_CODE>      # Exchange code')
    console.log('  npx tsx scripts/tiktok-oauth.ts refresh <REFRESH_TOKEN> # Refresh token')
}
