export type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  NODE_ENV: string
  RESEND_API_KEY: string
  RESEND_FROM: string
  FRONTEND_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  BREVO_API_KEY: string
}

export type Variables = {
  user: Record<string, unknown>
  member: Record<string, unknown>
}

export type HonoEnv = {
  Bindings: Bindings
  Variables: Variables
}
