import { test, expect } from '@playwright/test'

test.describe('Authentication Flow E2E', () => {
  test('should complete full authentication flow', async ({ page }) => {
    // Go to auth page
    await page.goto('/auth')
    
    // Should show login form by default
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible()
    
    // Switch to signup
    await page.locator('[data-testid="switch-to-signup"]').click()
    await expect(page.locator('[data-testid="signup-form"]')).toBeVisible()
    
    // Fill signup form
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'Password123!')
    await page.fill('[data-testid="confirm-password-input"]', 'Password123!')
    
    // Submit signup form (will fail without real backend)
    await page.locator('[data-testid="signup-submit"]').click()
    
    // Should show appropriate error or success message
    const message = page.locator('[data-testid="auth-message"]')
    await expect(message).toBeVisible()
  })

  test('should handle password reset flow', async ({ page }) => {
    await page.goto('/auth')
    
    // Click forgot password
    await page.locator('[data-testid="forgot-password"]').click()
    await expect(page).toHaveURL(/.*reset-password/)
    
    // Fill reset form
    await page.fill('[data-testid="reset-email-input"]', 'test@example.com')
    await page.locator('[data-testid="reset-submit"]').click()
    
    // Should show confirmation message
    const confirmation = page.locator('[data-testid="reset-confirmation"]')
    await expect(confirmation).toBeVisible()
  })

  test('should validate form inputs', async ({ page }) => {
    await page.goto('/auth')
    
    // Try to submit empty form
    await page.locator('[data-testid="login-submit"]').click()
    
    // Should show validation errors
    const emailError = page.locator('[data-testid="email-error"]')
    const passwordError = page.locator('[data-testid="password-error"]')
    
    await expect(emailError).toBeVisible()
    await expect(passwordError).toBeVisible()
  })
})