import { createClient } from '@supabase/supabase-js'

// Supabase admin client — uses service role key, never exposed to browser
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export interface AuthUser {
  id: string
  email: string
}

/**
 * Validates the Bearer token from an Authorization header using Supabase Auth.
 * Throws if the token is missing, malformed, or invalid.
 */
export async function getUser(authHeader: string | undefined): Promise<AuthUser> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return { id: user.id, email: user.email! }
}
