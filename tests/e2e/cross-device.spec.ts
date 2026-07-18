import { test, expect, devices } from '@playwright/test'

// Test configuration for different devices
const deviceTests = [
  { name: 'Desktop Chrome', device: devices['Desktop Chrome'] },
  { name: 'Desktop Firefox', device: devices['Desktop Firefox'] },
  { name: 'Desktop Safari', device: devices['Desktop Safari'] },
  { name: 'iPhone 13', device: devices['iPhone 13'] },
  { name: 'iPhone 13 Pro', device: devices['iPhone 13 Pro'] },
  { name: 'iPad Pro', device: devices['iPad Pro'] },
  { name: 'Samsung Galaxy S21', device: devices['Galaxy S21'] },
  { name: 'Pixel 5', device: devices['Pixel 5'] },
]

deviceTests.forEach(({ name, device }) => {
  test.describe(`Cross-Device Tests - ${name}`, () => {
    test.use({ ...device })

    test('should render correctly on device', async ({ page }) => {
      await page.goto('/')
      
      // Wait for page to load
      await page.waitForSelector('[data-testid="dashboard-content"]')
      
      // Take screenshot for visual comparison
      await expect(page).toHaveScreenshot(`${name.toLowerCase().replace(' ', '-')}-dashboard.png`)
      
      // Check responsive navigation
      const isMobile = device.viewport!.width < 768
      
      if (isMobile) {
        // Check mobile menu
        const mobileMenu = page.locator('[data-testid="mobile-menu-trigger"]')
        await expect(mobileMenu).toBeVisible()
        
        await mobileMenu.click()
        const nav = page.locator('[data-testid="mobile-navigation"]')
        await expect(nav).toBeVisible()
      } else {
        // Check desktop navigation
        const desktopNav = page.locator('[data-testid="desktop-navigation"]')
        await expect(desktopNav).toBeVisible()
      }
    })

    test('should handle touch interactions correctly', async ({ page }) => {
      if (!device.hasTouch) {
        test.skip('Device does not support touch')
      }

      await page.goto('/')
      await page.waitForSelector('[data-testid="dashboard-content"]')
      
      // Test swipe gestures on commodity cards
      const commodityCard = page.locator('[data-testid="commodity-card"]').first()
      await expect(commodityCard).toBeVisible()
      
      // Simulate swipe gesture
      const box = await commodityCard.boundingBox()
      if (box) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
        
        // Check if card shows expected interaction
        const cardDetails = page.locator('[data-testid="commodity-details"]')
        await expect(cardDetails).toBeVisible({ timeout: 5000 })
      }
    })

    test('should maintain performance on device', async ({ page }) => {
      // Monitor performance metrics
      await page.goto('/')
      
      const performanceMetrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return {
          loadTime: navigation.loadEventEnd - navigation.loadEventStart,
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
          firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
        }
      })

      // Assert performance thresholds based on device type
      const isMobile = device.viewport!.width < 768
      const maxLoadTime = isMobile ? 5000 : 3000 // Mobile gets more time
      
      expect(performanceMetrics.loadTime).toBeLessThan(maxLoadTime)
      expect(performanceMetrics.firstContentfulPaint).toBeLessThan(2000)
    })

    test('should be accessible on device', async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('[data-testid="dashboard-content"]')
      
      // Run accessibility checks
      const accessibilityViolations = await page.evaluate(() => {
        const violations: string[] = []
        
        // Check for missing alt attributes
        const images = document.querySelectorAll('img')
        images.forEach((img, index) => {
          if (!img.hasAttribute('alt')) {
            violations.push(`Image ${index} missing alt attribute`)
          }
        })
        
        // Check for proper heading hierarchy
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
        let lastLevel = 0
        headings.forEach((heading, index) => {
          const level = parseInt(heading.tagName.charAt(1))
          if (level > lastLevel + 1) {
            violations.push(`Heading level skip at element ${index}`)
          }
          lastLevel = level
        })
        
        // Check for proper form labels
        const inputs = document.querySelectorAll('input, textarea, select')
        inputs.forEach((input, index) => {
          const hasLabel = input.hasAttribute('aria-label') || 
                          input.hasAttribute('aria-labelledby') ||
                          document.querySelector(`label[for="${input.id}"]`)
          
          if (!hasLabel) {
            violations.push(`Input ${index} missing label`)
          }
        })
        
        return violations
      })
      
      expect(accessibilityViolations).toHaveLength(0)
    })
  })
})

// Viewport-specific tests
test.describe('Responsive Design Tests', () => {
  const viewports = [
    { name: 'Mobile Portrait', width: 375, height: 667 },
    { name: 'Mobile Landscape', width: 667, height: 375 },
    { name: 'Tablet Portrait', width: 768, height: 1024 },
    { name: 'Tablet Landscape', width: 1024, height: 768 },
    { name: 'Desktop Small', width: 1280, height: 720 },
    { name: 'Desktop Large', width: 1920, height: 1080 },
    { name: 'Ultra Wide', width: 2560, height: 1440 },
  ]

  viewports.forEach(({ name, width, height }) => {
    test(`should adapt layout for ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.waitForSelector('[data-testid="dashboard-content"]')
      
      // Check layout adaptation
      const container = page.locator('[data-testid="main-container"]')
      const containerBox = await container.boundingBox()
      
      expect(containerBox?.width).toBeLessThanOrEqual(width)
      
      // Take screenshot for visual regression testing
      await expect(page).toHaveScreenshot(`${name.toLowerCase().replace(' ', '-')}.png`)
    })
  })
})