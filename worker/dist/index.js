"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./instrument");
const express_1 = __importDefault(require("express"));
const Sentry = __importStar(require("@sentry/node"));
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
        Sentry.captureException(err, { extra: { projectId, job: 'pipeline' } });
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
        Sentry.captureException(err, { extra: { projectId, job: 'deliver' } });
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
        Sentry.captureException(err, { extra: { projectId, job: 'remix' } });
        console.error('Unhandled remix error', { projectId, error: err });
    });
});
// ── Sentry error handler (must be after all routes) ───────────────────────────
Sentry.setupExpressErrorHandler(app);
// ── Start server ──────────────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
    console.log(`Dubtube worker listening on port ${port}`);
});
