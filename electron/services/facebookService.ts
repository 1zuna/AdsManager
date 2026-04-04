import axios from 'axios'

const FB_API_VERSION = 'v24.0'
const FB_API_BASE = `https://graph.facebook.com/${FB_API_VERSION}`

export class FacebookService {
  /**
   * Verifies a token is valid by calling /me.
   * Returns the app user name on success, throws on failure.
   */
  async validateToken(token: string): Promise<string> {
    const res = await axios.get<{ name: string }>(`${FB_API_BASE}/me`, {
      params: { access_token: token, fields: 'name' },
      timeout: 10_000,
    })
    return res.data.name
  }

  /**
   * Sets the spend cap for a single ad account.
   * POST https://graph.facebook.com/v24.0/act_{id}?spend_cap={cents}&access_token={token}
   * Facebook API expects the amount in cents (USD * 100).
   *
   * @param accountId - with or without "act_" prefix; will normalise
   * @param dailyBudgetUSD - dollar amount (e.g. 150.50)
   * @param token - Facebook Marketing API access token
   */
  async setSpendingLimit(
    accountId: string,
    dailyBudgetUSD: number,
    token: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Normalise account ID
    const normalised = accountId.startsWith('act_') ? accountId : `act_${accountId}`
    // FB API uses whole cents
    const spendCap = Math.round(dailyBudgetUSD * 100)

    try {
      await axios.post(
        `${FB_API_BASE}/${normalised}`,
        null,
        {
          params: {
            access_token: token,
            spend_cap: spendCap,
          },
          timeout: 15_000,
        },
      )
      return { success: true }
    } catch (err: unknown) {
      const message = extractFbError(err)
      return { success: false, error: message }
    }
  }
}

function extractFbError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string; code?: number } } | undefined
    if (data?.error?.message) return `FB API ${data.error.code ?? ''}: ${data.error.message}`
    if (err.code === 'ECONNABORTED') return 'Request timed out'
    return err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}
