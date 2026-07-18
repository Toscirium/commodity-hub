import { test, expect, Page } from '@playwright/test'

class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/')
  }

  async waitForLoad() {
    await this.page.waitForSelector('[data-testid="dashboard-content"]')
  }

  async getCommodityCards() {
    return this.page.locator('[data-testid="commodity-card"]')
  }

  async searchCommodity(symbol: string) {
    await this.page.fill('[data-testid="search-input"]', symbol)
    await this.page.keyboard.press('Enter')
  }

  async addToPortfolio(symbol: string, quantity: number) {
    await this.page.locator(`[data-testid="commodity-card"][data-symbol="${symbol}"]`).click()
    await this.page.locator('[data-testid="add-to-portfolio"]').click()
    await this.page.fill('[data-testid="quantity-input"]', quantity.toString())
    await this.page.locator('[data-testid="confirm-add"]').click()
  }

  async getPortfolioValue() {
    return this.page.locator('[data-testid="portfolio-total-value"]').textContent()
  }
}

test.describe('Dashboard E2E Tests', () => {
  let dashboardPage: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page)
    await dashboardPage.goto()
  })

  test('should load dashboard successfully', async () => {
    await dashboardPage.waitForLoad()
    await expect(dashboardPage.page.locator('h1')).toContainText('Commodity Hub')
  })

  test('should display commodity cards', async () => {
    await dashboardPage.waitForLoad()
    const commodityCards = await dashboardPage.getCommodityCards()
    await expect(commodityCards).toHaveCountGreaterThan(0)
  })

  test('should search for commodities', async () => {
    await dashboardPage.waitForLoad()
    await dashboardPage.searchCommodity('GOLD')
    
    const searchResults = dashboardPage.page.locator('[data-testid="search-results"]')
    await expect(searchResults).toBeVisible()
    
    const goldCard = dashboardPage.page.locator('[data-testid="commodity-card"][data-symbol="GOLD"]')
    await expect(goldCard).toBeVisible()
  })

  test('should add commodity to portfolio', async () => {
    await dashboardPage.waitForLoad()
    
    // Add GOLD to portfolio
    await dashboardPage.addToPortfolio('GOLD', 10)
    
    // Check portfolio was updated
    const portfolioValue = await dashboardPage.getPortfolioValue()
    expect(portfolioValue).not.toBe('$0.00')
  })

  test('should navigate between pages', async ({ page }) => {
    await dashboardPage.goto()
    
    // Navigate to portfolio page
    await page.locator('[data-testid="nav-portfolio"]').click()
    await expect(page).toHaveURL(/.*portfolio/)
    
    // Navigate to watchlists
    await page.locator('[data-testid="nav-watchlists"]').click()
    await expect(page).toHaveURL(/.*watchlists/)
    
    // Navigate back to dashboard
    await page.locator('[data-testid="nav-dashboard"]').click()
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('should handle offline mode', async ({ page, context }) => {
    await dashboardPage.goto()
    await dashboardPage.waitForLoad()
    
    // Go offline
    await context.setOffline(true)
    
    // Check offline indicator appears
    const offlineIndicator = page.locator('[data-testid="offline-indicator"]')
    await expect(offlineIndicator).toBeVisible()
    
    // Go back online
    await context.setOffline(false)
    
    // Check offline indicator disappears
    await expect(offlineIndicator).not.toBeVisible()
  })
})