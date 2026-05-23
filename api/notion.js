// api/notion.js — Vercel Serverless Function (проксі)
// Токен Notion НІКОЛИ не потрапляє в браузер

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const TOKEN = process.env.NOTION_TOKEN
  if (!TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN не налаштований у Vercel' })

  const { path, method = 'POST', body } = req.body || {}
  if (!path) return res.status(400).json({ error: 'path is required' })

  try {
    const r = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message })
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
