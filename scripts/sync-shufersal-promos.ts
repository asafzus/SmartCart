// Load .env.local when running locally (not in CI)
if (!process.env.CI) { try { process.loadEnvFile('.env.local') } catch {} }

import handler from '../netlify/functions/sync-shufersal-promos.ts'
await handler()
