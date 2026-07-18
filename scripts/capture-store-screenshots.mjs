import { chromium } from 'playwright';

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:8080';
const outputDir = 'public/screenshots';

const mobile = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 };
const tablet = { viewport: { width: 600, height: 960 }, deviceScaleFactor: 2 };

const captures = [
  ['phone-dashboard.png', '/', mobile],
  ['phone-charts.png', '/?group=metals', mobile],
  ['phone-portfolio.png', '/portfolio', mobile],
  ['phone-news.png', '/daily-brief', mobile],
  ['phone-comparison.png', '/market-screener', mobile],
  ['tablet-dashboard.png', '/', tablet],
  ['tablet-analysis.png', '/pro-analytics', tablet],
];
const selectedFile = process.env.SCREENSHOT_FILE;
const selectedCaptures = selectedFile
  ? captures.filter(([fileName]) => fileName === selectedFile)
  : captures;

if (selectedCaptures.length === 0) {
  throw new Error(`Unknown screenshot file: ${selectedFile}`);
}

const browser = await chromium.launch({ headless: true });

try {
  for (const [fileName, path, device, prepare] of selectedCaptures) {
    const context = await browser.newContext({
      ...device,
      colorScheme: 'dark',
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const page = await context.newPage();
    // Live market polling keeps network connections open, so waiting for
    // "networkidle" can stall a capture indefinitely.
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    // Do not publish a loading state as a store asset. Market data may take a
    // few seconds to arrive from the edge function, especially on a cold start.
    await page.waitForFunction(
      () => document.querySelectorAll('.animate-pulse').length === 0,
      { timeout: 15_000 },
    ).catch(() => {});
    if (prepare) {
      await prepare(page);
      await page.waitForTimeout(1_000);
    }
    await page.screenshot({ path: `${outputDir}/${fileName}` });
    await context.close();
  }
} finally {
  await browser.close();
}
