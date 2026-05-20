import type { Config } from '@netlify/functions'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  message: string
  history: Message[]
  listItems?: string[]
  lang?: string
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { message, history = [], listItems = [], lang = 'en' } = body

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500 })
  }

  const languageInstruction = lang === 'he'
    ? 'Always respond in Hebrew (עברית) only, regardless of what language the user writes in.'
    : 'Always respond in English only, regardless of what language the user writes in.'

  const listContext = listItems.length > 0
    ? `\n\nThe user's current shopping list includes: ${listItems.join(', ')}.`
    : ''

  const systemPrompt =
    `You are a cooking and grocery assistant for an Israeli grocery app called SmartCart. ` +
    `Help users with recipe ideas, ingredient suggestions, meal planning, and grocery advice. ` +
    `Only answer questions related to food, cooking, and groceries. ` +
    `If asked about anything else, politely say you can only help with food and grocery topics. ` +
    `${languageInstruction} ` +
    `Keep answers concise and practical.` +
    listContext

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20),
    { role: 'user', content: message },
  ]

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('[chat] Groq error:', groqRes.status, errText)
      return new Response(
        JSON.stringify({ error: 'AI service error', details: groqRes.status }),
        { status: 502 }
      )
    }

    const data: any = await groqRes.json()
    const reply = data.choices?.[0]?.message?.content ?? ''

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[chat] Error:', err.message)
    return new Response(
      JSON.stringify({ error: 'Request failed', details: err.message }),
      { status: 500 }
    )
  }
}

export const config: Config = {
  path: '/api/chat',
}
