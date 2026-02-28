'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CallbackContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ color: '#ef4444' }}>Authorization Failed</h1>
        <p>Error: {error}</p>
        {errorDescription && <p>Details: {errorDescription}</p>}
      </div>
    )
  }

  if (code) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ color: '#22c55e' }}>Authorization Successful</h1>
        <p>Your authorization code:</p>
        <code style={{
          display: 'block',
          padding: '1rem',
          background: '#f1f5f9',
          borderRadius: '0.5rem',
          wordBreak: 'break-all',
          fontSize: '0.875rem',
        }}>
          {code}
        </code>
        <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
          Copy this code and use it to obtain your access token.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>TikTok Authorization</h1>
      <p>Waiting for authorization...</p>
    </div>
  )
}

export default function TikTokCallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <CallbackContent />
    </Suspense>
  )
}
