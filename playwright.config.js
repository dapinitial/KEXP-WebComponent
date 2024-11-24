const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 60000, // Global test timeout
  use: {
    headless: true, // Run in headless mode
    baseURL: 'http://localhost:5173', // Base URL for your app
    viewport: { width: 1280, height: 720 }, // Default viewport size
    ignoreHTTPSErrors: true, // Ignore HTTPS errors if needed
  },
  retries: 1, // Number of retries for flaky tests
  testDir: './tests', // Directory containing test files
});