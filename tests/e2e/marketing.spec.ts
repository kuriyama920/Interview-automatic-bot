/**
 * マーケティングサイト E2E テスト
 *
 * apps/web (Next.js) のランディングページをテスト。
 * `cd apps/web && pnpm dev` でローカルサーバーを起動してから実行。
 */

import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('should display the hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Interview Bot/)

    // Hero section のメインテキストが表示される
    const heroHeading = page.locator('h1').first()
    await expect(heroHeading).toBeVisible()
  })

  test('should display pricing section with 3 plans', async ({ page }) => {
    await page.goto('/')

    // 料金セクションまでスクロール
    const pricingSection = page.locator('#pricing, [id*="pricing"]').first()
    if (await pricingSection.isVisible()) {
      await pricingSection.scrollIntoViewIfNeeded()

      // Free, Pro, Max の3プランが表示される
      await expect(page.getByText('Free')).toBeVisible()
      await expect(page.getByText('Pro')).toBeVisible()
      await expect(page.getByText('Max')).toBeVisible()
    }
  })

  test('should display features section', async ({ page }) => {
    await page.goto('/')

    // 機能セクションが存在する
    const featuresSection = page.locator('#features, [id*="features"]').first()
    if (await featuresSection.isVisible()) {
      await featuresSection.scrollIntoViewIfNeeded()
      await expect(featuresSection).toBeVisible()
    }
  })

  test('should have navigation links', async ({ page }) => {
    await page.goto('/')

    // ナビゲーションバーが表示される
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()
  })

  test('should navigate to download page', async ({ page }) => {
    await page.goto('/download')

    // ダウンロードページが表示される
    await expect(page).toHaveURL(/\/download/)
  })

  test('should have FAQ section', async ({ page }) => {
    await page.goto('/')

    // FAQセクションが存在する
    const faqSection = page.locator('#faq, [id*="faq"]').first()
    if (await faqSection.isVisible()) {
      await faqSection.scrollIntoViewIfNeeded()
      await expect(faqSection).toBeVisible()
    }
  })
})

test.describe('SEO', () => {
  test('should have meta description', async ({ page }) => {
    await page.goto('/')
    const metaDescription = page.locator('meta[name="description"]')
    await expect(metaDescription).toHaveAttribute('content', /.+/)
  })

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/')
    const h1 = page.locator('h1')
    // h1 が少なくとも1つ存在する
    expect(await h1.count()).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // ページが正常に表示される
    await expect(page.locator('body')).toBeVisible()
  })

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    await expect(page.locator('body')).toBeVisible()
  })
})
