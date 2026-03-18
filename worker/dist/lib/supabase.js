"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseAdmin = getSupabaseAdmin;
const supabase_js_1 = require("@supabase/supabase-js");
let client = null;
function getSupabaseAdmin() {
    if (client)
        return client;
    // Support both the plain SUPABASE_URL and the Next.js NEXT_PUBLIC_ prefixed version
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url)
        throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    if (!key)
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    client = (0, supabase_js_1.createClient)(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return client;
}
