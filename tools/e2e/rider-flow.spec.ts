/**
 * Playwright E2E — Rider Flow
 * Requires: local dev stack running (docker compose up + all services)
 * Run: npx playwright test tools/e2e/
 */
import { test, expect } from '@playwright/test'

const RIDER_URL = process.env.RIDER_URL ?? 'http://localhost:3000'
const TEST_PHONE = '9999999999'
const DEV_OTP = '000000'

test.describe('Rider Journey', () => {
  test('Login with OTP', async ({ page }) => {
    await page.goto(`${RIDER_URL}/login`)
    await expect(page.locator('h1')).toContainText('RideApp')

    await page.fill('input[type="tel"]', TEST_PHONE)
    await page.click('button[type="submit"]')

    // OTP page
    await page.waitForURL('**/verify-otp**')
    const inputs = page.locator('input[type="text"]')
    for (let i = 0; i < 6; i++) {
      await inputs.nth(i).fill(DEV_OTP[i])
    }

    // Should redirect to home
    await page.waitForURL('**/home**', { timeout: 10000 })
    await expect(page.locator('text=Where to?')).toBeVisible()
  })

  test('Home page shows map', async ({ page }) => {
    // Login first
    await page.goto(`${RIDER_URL}/login`)
    await page.fill('input[type="tel"]', TEST_PHONE)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/verify-otp**')
    const inputs = page.locator('input[type="text"]')
    for (let i = 0; i < 6; i++) await inputs.nth(i).fill(DEV_OTP[i])
    await page.waitForURL('**/home**')

    // Map should be visible
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Where to?')).toBeVisible()
  })

  test('Booking sheet opens', async ({ page }) => {
    await page.goto(`${RIDER_URL}/login`)
    await page.fill('input[type="tel"]', TEST_PHONE)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/verify-otp**')
    const inputs = page.locator('input[type="text"]')
    for (let i = 0; i < 6; i++) await inputs.nth(i).fill(DEV_OTP[i])
    await page.waitForURL('**/home**')

    await page.click('button:has-text("Where to?")')
    await expect(page.locator('text=Book a Ride')).toBeVisible()
    await expect(page.locator('text=Bike')).toBeVisible()
    await expect(page.locator('text=Auto')).toBeVisible()
    await expect(page.locator('text=Cab')).toBeVisible()
  })

  test('Navigate to history', async ({ page }) => {
    await page.goto(`${RIDER_URL}/login`)
    await page.fill('input[type="tel"]', TEST_PHONE)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/verify-otp**')
    const inputs = page.locator('input[type="text"]')
    for (let i = 0; i < 6; i++) await inputs.nth(i).fill(DEV_OTP[i])
    await page.waitForURL('**/home**')

    await page.goto(`${RIDER_URL}/history`)
    await expect(page.locator('h1:has-text("Ride History")')).toBeVisible()
  })

  test('Navigate to wallet', async ({ page }) => {
    await page.goto(`${RIDER_URL}/login`)
    await page.fill('input[type="tel"]', TEST_PHONE)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/verify-otp**')
    const inputs = page.locator('input[type="text"]')
    for (let i = 0; i < 6; i++) await inputs.nth(i).fill(DEV_OTP[i])
    await page.waitForURL('**/home**')

    await page.goto(`${RIDER_URL}/wallet`)
    await expect(page.locator('h1:has-text("Wallet")')).toBeVisible()
    await expect(page.locator('text=Available Balance')).toBeVisible()
  })

  test('PWA manifest is accessible', async ({ page }) => {
    const res = await page.goto(`${RIDER_URL}/manifest.json`)
    expect(res?.status()).toBe(200)
    const manifest = await res?.json()
    expect(manifest.name).toBe('RideApp')
    expect(manifest.display).toBe('standalone')
  })
})
