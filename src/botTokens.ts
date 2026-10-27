import type { AiSession } from './aiSearch'

export type BotScope = 'library:read' | 'sources:manage' | 'playlists:manage' | 'channels:manage' | 'inference'
export interface BotTokenInfo { id: string; name: string; scopes: BotScope[]; createdAt: number; expiresAt: number; revoked: boolean }

async function request<T>(session: AiSession, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${session.endpoint}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', headers: { Authorization: `Bearer ${session.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(response.status === 403 ? 'Your session cannot manage bot tokens.' : `Bot token request failed (HTTP ${response.status}).`)
  return response.json() as Promise<T>
}

export async function listBotTokens(session: AiSession): Promise<BotTokenInfo[]> { const result = await request<{ tokens?: unknown }>(session, '/v1/bot-tokens'); if (!Array.isArray(result.tokens)) throw new Error('The server does not support agent tokens.'); return result.tokens as BotTokenInfo[] }
export async function createBotToken(session: AiSession, name: string, scopes: BotScope[], days: number): Promise<{ id: string; token: string; expiresAt: number }> { return request(session, '/v1/bot-tokens', { name, scopes, days }) }
export async function revokeBotToken(session: AiSession, id: string): Promise<void> { await request(session, '/v1/bot-tokens/revoke', { id }) }
