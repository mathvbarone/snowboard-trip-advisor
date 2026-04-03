export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'snowboard-trip-advisor-research/0.1' },
  })

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${String(response.status)}`)
  }

  return await response.text()
}
