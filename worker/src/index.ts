import express, { Request, Response } from 'express'
import { runPipeline } from './pipeline'

const app = express()
app.use(express.json())

const WORKER_SECRET = process.env.WORKER_SECRET

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'dubtube-worker' })
})

// ── Pipeline trigger ──────────────────────────────────────────────────────────

app.post('/process', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization

  if (!WORKER_SECRET || authHeader !== `Bearer ${WORKER_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body = req.body as { projectId?: unknown }
  const { projectId } = body

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' })
    return
  }

  // Respond immediately — pipeline runs in the background
  res.json({ ok: true, projectId })

  runPipeline(projectId).catch((err: unknown) => {
    console.error('Unhandled pipeline error', { projectId, error: err })
  })
})

// ── Start server ──────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`Dubtube worker listening on port ${port}`)
})
