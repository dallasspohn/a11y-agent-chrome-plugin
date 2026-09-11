import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/extension.spec.js',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
});