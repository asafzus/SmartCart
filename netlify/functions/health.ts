import type { Handler } from '@netlify/functions'

// Health check endpoint — GET /api/health
export const handler: Handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', app: 'SmartCart' }),
  }
}
