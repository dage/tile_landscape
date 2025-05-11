// run-visual-test.ts
import puppeteer, { Browser } from 'puppeteer';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url'; // Import for ES Module __dirname equivalent

// ES Module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VITE_SERVER_URL = 'http://localhost:5173'; // Default Vite port
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
const CURRENT_SCREENSHOT_PATH = path.resolve(SCREENSHOT_DIR, 'current.png');
const TIMEOUT_MS = 30000; // 30 seconds for server start and page load

async function startViteServer(): Promise<ChildProcess> {
  console.log('Starting Vite dev server...');
  const serverProcess = spawn('npm', ['run', 'dev'], { stdio: 'pipe' }); // Changed to pipe to capture output

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('Vite server start timed out.');
      serverProcess.kill();
      reject(new Error('Vite server start timed out.'));
    }, TIMEOUT_MS);

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(`Vite server: ${output.trim()}`);
      if (output.includes('Local:') && output.includes(VITE_SERVER_URL)) {
        clearTimeout(timeout);
        console.log('Vite dev server started successfully.');
        resolve(serverProcess);
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(`Vite server stderr: ${errorOutput.trim()}`);
      // We might not want to reject immediately on any stderr,
      // as Vite sometimes outputs warnings or non-fatal errors here.
      // The timeout and stdout check are more reliable for successful start.
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      console.error('Failed to start Vite server process:', err);
      reject(err);
    });

    serverProcess.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        // Only reject if it closes unexpectedly *before* resolving
        console.error(`Vite server process exited with code ${code}`);
        // reject(new Error(`Vite server process exited with code ${code}`));
      }
    });
  });
}

async function runTest() {
  let browser: Browser | undefined;
  let viteServer: ChildProcess | undefined;

  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    console.log(`Screenshots will be saved to: ${SCREENSHOT_DIR}`);

    viteServer = await startViteServer();

    console.log('Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: true, // Run headless for automation
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Common args for CI environments
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 }); // Set a consistent viewport

    console.log(`Navigating to ${VITE_SERVER_URL}...`);
    await page.goto(VITE_SERVER_URL, {
      waitUntil: 'networkidle0',
      timeout: TIMEOUT_MS,
    });

    console.log('Waiting for canvas element...');
    try {
      await page.waitForSelector('canvas', { timeout: 10000 }); // Wait for canvas to appear
      console.log('Canvas found.');
    } catch (e) {
      console.warn(
        'Canvas element not found within timeout. Taking screenshot anyway.'
      );
      // You might want to throw an error here if canvas is essential
    }

    console.log(
      `Taking screenshot and saving to ${CURRENT_SCREENSHOT_PATH}...`
    );
    await page.screenshot({ path: CURRENT_SCREENSHOT_PATH });
    console.log('Screenshot saved successfully.');
    console.log(
      `\nVisual test completed. Compare ${CURRENT_SCREENSHOT_PATH} with your baseline.`
    );
  } catch (error) {
    console.error('Error during visual test:', error);
    throw error; // Re-throw to indicate failure
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
    if (viteServer) {
      console.log('Stopping Vite dev server...');
      viteServer.kill();
    }
  }
}

runTest()
  .then(() => console.log('Test script finished.'))
  .catch(() => {
    console.error('Test script failed.');
    process.exit(1); // Exit with error code if test fails
  });
