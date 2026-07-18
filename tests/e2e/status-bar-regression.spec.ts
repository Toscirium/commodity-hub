import { test, expect, Page } from '@playwright/test'

/**
 * Multi-device scroll regression for the Android-native top bar.
 *
 * Verifies, on six representative Android viewports, that:
 *   1. The header is truly pinned (same viewport Y at every scroll position).
 *   2. The simulated status-bar region stays opaque — no page content ever
 *      renders underneath Android's overlaid status bar.
 *
 * The native chrome is simulated by adding the `capacitor-native` class on
 * <html> (which activates the production CSS path) and overlaying the page
 * with a translucent fixed bar at the top representing the OS status bar.
 */

type Device = { name: string; width: number; height: number; statusBar: number }

const ANDROID_DEVICES: Device[] = [
  { name: 'Pixel 7',     width: 412, height: 915, statusBar: 32 },
  { name: 'Pixel Fold',  width: 673, height: 841, statusBar: 30 },
  { name: 'Galaxy S22',  width: 360, height: 780, statusBar: 40 },
  { name: 'Galaxy A14',  width: 360, height: 800, statusBar: 28 },
  { name: 'OnePlus Nord',width: 412, height: 919, statusBar: 36 },
  { name: 'Small 360',   width: 360, height: 640, statusBar: 24 },
]

const SCROLL_POSITIONS = [0, 200, 600, 1500, 99999] as const

async function enableNativeAndStatusBar(page: Page, statusBar: number) {
  await page.evaluate((inset) => {
    document.documentElement.classList.add('capacitor-native')
    const existing = document.getElementById('__test_status_bar')
    if (existing) existing.remove()
    const bar = document.createElement('div')
    bar.id = '__test_status_bar'
    bar.setAttribute(
      'style',
      `position:fixed;top:0;left:0;right:0;height:${inset}px;` +
        `background:rgba(255,0,0,0.5);z-index:2147483647;pointer-events:none;`,
    )
    document.body.appendChild(bar)
  }, statusBar)
  // Give layout a tick to settle after toggling the class.
  await page.waitForTimeout(150)
}

test.describe('Android status-bar regression', () => {
  for (const device of ANDROID_DEVICES) {
    test(`${device.name} (${device.width}x${device.height}, status=${device.statusBar}px) keeps header pinned and status bar clean`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      })
      const page = await context.newPage()
      try {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await enableNativeAndStatusBar(page, device.statusBar)

        // Wait for the top bar to appear (Dashboard may still be loading).
        await page.waitForSelector('.app-top-bar h1', { timeout: 15_000 })

        const samples: Array<{ sy: number; titleTop: number; headerTop: number }> = []
        for (const sy of SCROLL_POSITIONS) {
          await page.evaluate((y) => window.scrollTo(0, y), sy)
          await page.waitForTimeout(120)
          const m = await page.evaluate(() => {
            const h1 = document.querySelector('.app-top-bar h1') as HTMLElement | null
            const hdr = document.querySelector('.app-top-bar') as HTMLElement | null
            return {
              sy: window.scrollY,
              titleTop: h1 ? h1.getBoundingClientRect().top : NaN,
              headerTop: hdr ? hdr.getBoundingClientRect().top : NaN,
            }
          })
          samples.push(m)
        }

        // 1) Header is pinned: titleTop is identical (within 0.5px) across all samples.
        const titleTops = samples.map((s) => s.titleTop)
        const minTop = Math.min(...titleTops)
        const maxTop = Math.max(...titleTops)
        expect(
          maxTop - minTop,
          `Title moved while scrolling on ${device.name}: ${JSON.stringify(samples)}`,
        ).toBeLessThanOrEqual(0.5)

        // 2) Title sits below the simulated status bar at all times.
        expect(
          minTop,
          `Title overlaps status bar on ${device.name}: titleTop=${minTop}, statusBar=${device.statusBar}`,
        ).toBeGreaterThanOrEqual(device.statusBar)

        // 3) Header is positioned at the very top of the viewport (fixed at top:0).
        for (const s of samples) {
          expect(
            Math.abs(s.headerTop),
            `Header drifted from top:0 on ${device.name} at sy=${s.sy}`,
          ).toBeLessThanOrEqual(0.5)
        }
      } finally {
        await context.close()
      }
    })
  }
})
