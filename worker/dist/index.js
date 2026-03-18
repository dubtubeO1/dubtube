"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pipeline_1 = require("./pipeline");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const WORKER_SECRET = process.env.WORKER_SECRET;
// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'dubtube-worker' });
});
// ── Pipeline trigger ──────────────────────────────────────────────────────────
app.post('/process', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!WORKER_SECRET || authHeader !== `Bearer ${WORKER_SECRET}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const body = req.body;
    const { projectId } = body;
    if (!projectId || typeof projectId !== 'string') {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    // Respond immediately — pipeline runs in the background
    res.json({ ok: true, projectId });
    (0, pipeline_1.runPipeline)(projectId).catch((err) => {
        console.error('Unhandled pipeline error', { projectId, error: err });
    });
});
// ── Deliver trigger ───────────────────────────────────────────────────────────
app.post('/deliver', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!WORKER_SECRET || authHeader !== `Bearer ${WORKER_SECRET}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const body = req.body;
    const { projectId } = body;
    if (!projectId || typeof projectId !== 'string') {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    // Respond immediately — deliver runs in the background
    res.json({ ok: true, projectId });
    (0, pipeline_1.runDeliver)(projectId).catch((err) => {
        console.error('Unhandled deliver error', { projectId, error: err });
    });
});
// ── Remix trigger ─────────────────────────────────────────────────────────────
app.post('/remix', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!WORKER_SECRET || authHeader !== `Bearer ${WORKER_SECRET}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const body = req.body;
    const { projectId, segmentOrder } = body;
    if (!projectId || typeof projectId !== 'string') {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    if (!Array.isArray(segmentOrder) || segmentOrder.some((id) => typeof id !== 'string')) {
        res.status(400).json({ error: 'segmentOrder must be an array of strings' });
        return;
    }
    // Respond immediately — remix runs in the background
    res.json({ ok: true, projectId });
    (0, pipeline_1.runRemix)(projectId, segmentOrder).catch((err) => {
        console.error('Unhandled remix error', { projectId, error: err });
    });
});
// ── Start server ──────────────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
    console.log(`Dubtube worker listening on port ${port}`);
});
