const GITHUB_OWNER = 'kuriyama920'
const GITHUB_REPO = 'Interview-automatic-bot'

export interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

export interface ReleaseInfo {
  tag_name: string
  name: string
  published_at: string
  body: string
  html_url: string
  assets: ReleaseAsset[]
}

function isValidAsset(asset: unknown): asset is { name: string; size: number; browser_download_url: string } {
  if (typeof asset !== 'object' || asset === null) return false
  const a = asset as Record<string, unknown>
  return typeof a.name === 'string' && typeof a.size === 'number' && typeof a.browser_download_url === 'string'
}

function isValidRelease(data: unknown): data is {
  tag_name: string; name: string; published_at: string; body: string; html_url: string; assets: unknown[]
} {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.tag_name === 'string' &&
    typeof d.name === 'string' &&
    typeof d.published_at === 'string' &&
    typeof d.html_url === 'string' &&
    Array.isArray(d.assets)
  )
}

export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
        next: { revalidate: 3600 },
      }
    )

    if (!res.ok) {
      console.error(`GitHub API responded with status ${res.status}`)
      return null
    }

    const data: unknown = await res.json()

    if (!isValidRelease(data)) {
      console.error('GitHub API returned unexpected release format')
      return null
    }

    return {
      tag_name: data.tag_name,
      name: data.name,
      published_at: data.published_at,
      body: data.body ?? '',
      html_url: data.html_url,
      assets: data.assets.filter(isValidAsset),
    }
  } catch (error) {
    console.error('Failed to fetch GitHub release:', error)
    return null
  }
}

export function findInstallerAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((a) => a.name.includes('Setup') && a.name.endsWith('.exe'))
}

export function findPortableAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((a) => a.name.includes('Portable') && a.name.endsWith('.exe'))
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
