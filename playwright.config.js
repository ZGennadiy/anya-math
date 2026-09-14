import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:45000,fullyParallel:true,retries:process.env.CI?1:0,
  reporter:process.env.CI?[['line'],['html',{open:'never'}]]:'list',
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
  projects:[
    {name:'chromium',testIgnore:'**/mobile.spec.js',use:{...devices['Desktop Chrome']}},
    {name:'firefox',testIgnore:'**/mobile.spec.js',use:{...devices['Desktop Firefox']}},
    {name:'webkit',testIgnore:'**/mobile.spec.js',use:{...devices['Desktop Safari']}},
    {name:'android',testMatch:'**/mobile.spec.js',use:{...devices['Pixel 7']}},
    {name:'iphone',testMatch:'**/mobile.spec.js',use:{...devices['iPhone 13']}},
  ],
});
