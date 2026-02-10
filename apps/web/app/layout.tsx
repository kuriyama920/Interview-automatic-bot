import type { Metadata } from 'next'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import './globals.css'

export const metadata: Metadata = {
  title: 'InterviewBot - AIリアルタイム面接支援アプリ',
  description:
    'リアルタイム音声認識とAIが面接をサポート。音声を即座に文字起こしし、最適な回答を提案するWindows向けデスクトップアプリです。',
  keywords: ['面接', 'AI', '音声認識', 'リアルタイム', '面接対策', 'デスクトップアプリ', 'Windows'],
  openGraph: {
    title: 'InterviewBot - AIリアルタイム面接支援アプリ',
    description: 'リアルタイム音声認識とAIが面接をサポート。音声を即座に文字起こしし、最適な回答を提案。',
    type: 'website',
    locale: 'ja_JP',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InterviewBot - AIリアルタイム面接支援アプリ',
    description: 'リアルタイム音声認識とAIが面接をサポート。',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="font-sans">
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
