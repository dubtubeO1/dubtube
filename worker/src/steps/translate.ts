function getDeepLEndpoint(): string {
  // Free-tier keys end with ':fx' and use the api-free subdomain
  const key = process.env.DEEPL_API_KEY ?? ''
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

/**
 * Map our canonical DeepL source codes to what the DeepL v2 API accepts.
 * Source language is more lenient — most codes work as-is uppercase.
 */
function mapSourceLang(code: string): string {
  const upper = code.toUpperCase()
  // DeepL accepts 'PT' as source (covers both variants)
  // For ZH, source can be 'ZH' (they auto-detect simplified vs traditional)
  return upper
}

/**
 * Map our canonical DeepL target codes to what the DeepL v2 API requires.
 * Some targets need region variants.
 */
function mapTargetLang(code: string): string {
  const upper = code.toUpperCase()
  if (upper === 'EN') return 'EN-US'
  if (upper === 'PT') return 'PT-PT'
  return upper
}

/**
 * Translate an array of text segments.
 * Sends all texts in one API call (DeepL supports arrays up to 50 items).
 * For large segment counts, batches of 50 are used.
 */
export async function translateSegments(
  texts: string[],
  sourceLang: string | null,
  targetLang: string,
): Promise<string[]> {
  const apiKey = process.env.DEEPL_API_KEY
  if (!apiKey) throw new Error('Missing DEEPL_API_KEY')
  if (texts.length === 0) return []

  const BATCH_SIZE = 50
  const results: string[] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)

    const body: Record<string, unknown> = {
      text: batch,
      target_lang: mapTargetLang(targetLang),
    }
    if (sourceLang) {
      body.source_lang = mapSourceLang(sourceLang)
    }

    const response = await fetch(getDeepLEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`DeepL API error ${response.status}: ${errText}`)
    }

    const data = (await response.json()) as {
      translations: Array<{ text: string }>
    }

    results.push(...data.translations.map((t) => t.text))
  }

  return results
}
