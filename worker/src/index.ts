import './instrument'
import express, { Request, Response } from 'express'
import * as Sentry from '@sentry/node'
import { runPipeline, runDeliver, runRemix } from './pipeline'

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
    Sentry.captureException(err, { extra: { projectId, job: 'pipeline' } })
    console.error('Unhandled pipeline error', { projectId, error: err })
  })
})

// ── Deliver trigger ───────────────────────────────────────────────────────────

app.post('/deliver', (req: Request, res: Response) => {
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

  // Respond immediately — deliver runs in the background
  res.json({ ok: true, projectId })

  runDeliver(projectId).catch((err: unknown) => {
    Sentry.captureException(err, { extra: { projectId, job: 'deliver' } })
    console.error('Unhandled deliver error', { projectId, error: err })
  })
})

// ── Remix trigger ─────────────────────────────────────────────────────────────

app.post('/remix', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization

  if (!WORKER_SECRET || authHeader !== `Bearer ${WORKER_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body = req.body as { projectId?: unknown; segmentOrder?: unknown }
  const { projectId, segmentOrder } = body

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' })
    return
  }

  if (!Array.isArray(segmentOrder) || segmentOrder.some((id) => typeof id !== 'string')) {
    res.status(400).json({ error: 'segmentOrder must be an array of strings' })
    return
  }

  // Respond immediately — remix runs in the background
  res.json({ ok: true, projectId })

  runRemix(projectId, segmentOrder as string[]).catch((err: unknown) => {
    Sentry.captureException(err, { extra: { projectId, job: 'remix' } })
    console.error('Unhandled remix error', { projectId, error: err })
  })
})

// ── Sentry error handler (must be after all routes) ───────────────────────────

Sentry.setupExpressErrorHandler(app)

// ── Start server ──────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`Dubtube worker listening on port ${port}`)
})
