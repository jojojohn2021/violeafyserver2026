import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { adminAuth, adminDb, adminStorage } from "./firebase-admin";
import multer from 'multer';
import crypto from "crypto";
import {
  calculateCommissionPreviewInternal,
  processOrderCommissionsAuthoritative,
  refundOrderCommissionsAuthoritative,
} from "./src/services/commissionEngine";
import { OperationsService } from "./src/services/operationsService";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Multer setup for multipart/form-data uploads (in-memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const allowedUploadRoots = ['products/', 'banners/', 'attachments/', 'users/', 'reviews/', 'categories/'];
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function requireAuthenticatedRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    await adminAuth.verifyIdToken(authorization.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

function assertNoLegacyMedia(value: unknown, path = 'payload'): void {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.trim().toLowerCase().startsWith('data:')) {
      throw new Error(`Base64 media is not accepted in ${path}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLegacyMedia(item, `${path}[${index}]`));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === 'picture') throw new Error(`The obsolete picture field is not accepted in ${path}`);
    assertNoLegacyMedia(item, `${path}.${key}`);
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

let dbId = (process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "").trim();
if (!dbId && process.env.FIREBASE_CONFIG) {
  try {
    const parsedConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    if (parsedConfig.firestoreDatabaseId) dbId = parsedConfig.firestoreDatabaseId.trim();
  } catch (error) {
    console.warn("[VIO-FIRESTORE] Unable to parse FIREBASE_CONFIG.", error);
  }
}

if (!dbId) {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (configData.firestoreDatabaseId) dbId = configData.firestoreDatabaseId.trim();
    } catch (error) {
      console.warn("[VIO-FIRESTORE] Unable to read firebase-applet-config.json.", error);
    }
  }
}

if (!dbId) dbId = "violeafydb";

const memoryCollections = [
  "leads",
  "deals",
  "tasks",
  "calendar_events",
  "products",
  "customers",
  "campaigns",
  "whatsapp_messages",
  "whatsapp_sequences",
  "referrals",
  "audit_logs",
  "users",
  "payouts",
  "sales_orders",
  "brand_config",
  "referral_chains",
  "chain_histories",
  "commission_transactions",
  "commission_rules",
  "product_level_commissions",
  "performance_levels",
  "partner_performances",
  "influencers",
  "influencer_campaigns",
  "influencer_collaborations",
  "influencer_dispatches",
  "influencer_payments",
  "influencer_contents",
  "shopping_carts",
  "wishlists",
  "product_reviews",
  "customer_delivery_addresses",
  "coupons",
  "order_delivery_tracking",
  "order_delivery_requests",
  "order_refunds",
  "payments",
  "payment_gateway_settings",
  "delivery_charges",
  "role_permissions",
  "formatinvoice",
  "product_categories",
  "order_fulfilment",
  "order_packing",
  "order_shipments",
  "order_delivery",
  "order_returns",
  "order_operation_history",
  "order_brand_assignments",
  "payment_reminders",
];

const inMemoryDb: Record<string, any[]> = {};
for (const key of memoryCollections) {
  inMemoryDb[key] = [];
}

const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK === "true";
let dbError: string | null = null;

async function verifyDbConnection(): Promise<boolean> {
  if (!adminDb) {
    dbError = "Firebase Admin SDK not initialized";
    return false;
  }

  try {
    await adminDb.collection("_health").doc("ping").set(
      { timestamp: new Date().toISOString(), status: "OK", dbId },
      { merge: true }
    );
    dbError = null;
    return true;
  } catch (error: any) {
    dbError = error?.message || String(error);
    console.warn("[VIO-FIRESTORE] Health check failed:", error);
    return false;
  }
}

async function getCollectionDocs(collection: string): Promise<any[]> {
  if (adminDb) {
    try {
      const snapshot = await adminDb.collection(collection).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error: any) {
      dbError = error?.message || String(error);
      console.error(`[VIO-FIRESTORE] Read failed for collection ${collection}:`, error);
    }
  }

  if (allowMemoryFallback) {
    console.warn(`[VIO-FIRESTORE] Memory fallback read for collection ${collection}`);
    return inMemoryDb[collection] || [];
  }

  throw new Error(`Failed to read collection ${collection}: ${dbError || "Firestore connection unavailable"}`);
}

function sanitizeFirestorePayload(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeFirestorePayload);
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        clean[key] = sanitizeFirestorePayload(val);
      }
    }
    return clean;
  }
  return obj;
}

async function saveCollectionDoc(collection: string, item: any): Promise<void> {
  assertNoLegacyMedia(item);
  const id = String(item.id || item._id || Date.now());

  if (adminDb) {
    try {
      const payload = sanitizeFirestorePayload({ ...item });
      delete payload.id;
      delete payload._id;
      await adminDb.collection(collection).doc(id).set(payload, { merge: true });
      return;
    } catch (error: any) {
      dbError = error?.message || String(error);
      console.error(`[VIO-FIRESTORE] Write failed for collection ${collection}:`, error);
    }
  }

  if (allowMemoryFallback) {
    console.warn(`[VIO-FIRESTORE] Memory fallback write for collection ${collection}`);
    const list = inMemoryDb[collection] || [];
    const payload = sanitizeFirestorePayload({ ...item, id });
    const index = list.findIndex((entry) => String(entry.id) === id);
    if (index >= 0) list[index] = payload; else list.unshift(payload);
    inMemoryDb[collection] = list;
    return;
  }

  throw new Error(`Failed to save document to ${collection}: ${dbError || "Firestore connection unavailable"}`);
}

async function deleteCollectionDoc(collection: string, id: string): Promise<void> {
  if (adminDb) {
    try {
      await adminDb.collection(collection).doc(String(id)).delete();
      return;
    } catch (error: any) {
      dbError = error?.message || String(error);
      console.error(`[VIO-FIRESTORE] Delete failed for collection ${collection}:`, error);
    }
  }

  if (allowMemoryFallback) {
    console.warn(`[VIO-FIRESTORE] Memory fallback delete for collection ${collection}`);
    inMemoryDb[collection] = (inMemoryDb[collection] || []).filter((entry) => String(entry.id) !== String(id));
    return;
  }

  throw new Error(`Failed to delete document from ${collection}: ${dbError || "Firestore connection unavailable"}`);
}

app.post("/api/referral-ai-suggestions", async (req, res) => {
  const { partnerName, kpis, periodGaps, productGaps } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ suggestions: [
      "Setup your GEMINI_API_KEY in Settings > Secrets to unlock live AI recommendations.",
      "Review product gaps and prioritize outreach to the highest-potential partners.",
      "Use concise incentives to improve referral partner engagement.",
      "Monitor your top performers and reinforce the best-performing offers."
    ]});
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a referral marketing growth expert. Provide 4 direct, measurable actions for ${partnerName} based on KPIs=${JSON.stringify(kpis)}, periodGaps=${JSON.stringify(periodGaps)}, productGaps=${JSON.stringify(productGaps)}.`;
    const response = await ai.models.generateContent({ model: "gemini-3.5-flash", contents: prompt });
    let text = (response.text || "").trim();
    if (text.startsWith("```json")) text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    if (text.startsWith("```")) text = text.replace(/^```/, "").replace(/```$/, "");

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return res.json({ suggestions: parsed.slice(0, 4) });
    } catch {}

    const lines = text.split(/\r?\n/).map((line) => line.replace(/^[-*\d\.\s"\[\]]+/, "").trim()).filter(Boolean).slice(0, 4);
    if (lines.length) return res.json({ suggestions: lines });

    return res.json({ suggestions: [
      "Focus on closing the top 2 product gaps to increase partner commissions quickly.",
      "Prioritize partners with the strongest pipeline for rapid referrals.",
      "Use targeted WhatsApp follow-ups for warm leads this week.",
      "Review quarterly performance targets and refine outreach accordingly."
    ]});
  } catch (error: any) {
    console.error("[VIO-AI] Referral suggestions error:", error);
    return res.status(500).json({ error: error?.message || "Failed to generate AI suggestions" });
  }
});

app.post("/api/influencer-ai-assistant", async (req, res) => {
  const { action, productName, campaignGoal, influencers, campaignName, captionTone } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ success: true, result: "Setup your GEMINI_API_KEY in Settings > Secrets to unlock live influencer AI recommendations." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    let prompt = "";
    if (action === "recommend_influencers") {
      prompt = `Recommend the best influencers for ${productName} with goal ${campaignGoal} from this list: ${JSON.stringify(influencers || [])}`;
    } else if (action === "write_brief") {
      prompt = `Write a campaign brief for ${campaignName || "a new launch"} promoting ${productName} with goal ${campaignGoal}.`;
    } else {
      prompt = `Write 3 captions in a ${captionTone || "creative"} tone for ${productName} with goal ${campaignGoal}.`;
    }
    const response = await ai.models.generateContent({ model: "gemini-3.5-flash", contents: prompt });
    return res.json({ success: true, result: response.text || "No response from AI model." });
  } catch (error: any) {
    console.error("[VIO-AI] Influencer AI helper error:", error);
    return res.status(500).json({ error: error?.message || "Failed to generate influencer AI response" });
  }
});

app.post("/api/auth/verify-token", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: "Missing idToken parameter" });

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return res.json({ success: true, uid: decodedToken.uid, email: decodedToken.email });
  } catch (error: any) {
    console.error("[VIO-AUTH] Failed to verify ID token with Firebase Admin SDK:", error);
    return res.status(401).json({ error: error?.message || "Invalid or expired Firebase authentication token" });
  }
});

app.get("/api/mongo-status", async (req, res) => {
  const healthy = await verifyDbConnection();
  return res.json({ connected: healthy, database: dbId, provider: "Firestore Admin SDK", error: dbError, mode: healthy ? "Firestore Native" : allowMemoryFallback ? "Memory Fallback" : "Disconnected" });
});

app.get("/api/db-verify", async (req, res) => {
  const healthy = await verifyDbConnection();
  const requiredCollections = memoryCollections;

  if (healthy) {
    try {
      const docId = `verify_ping_${Date.now()}`;
      await saveCollectionDoc("audit_logs", { id: docId, status: "DB_VERIFICATION_PING", timestamp: new Date().toISOString() });
      const found = (await getCollectionDocs("audit_logs")).find((entry) => entry.id === docId);
      if (found) {
        return res.json({ connected: true, database: dbId, mode: "Firestore Native", writeVerified: true, requiredCollections });
      }
    } catch (error: any) {
      console.warn("[VIO-FIRESTORE] DB verify write/read failed:", error);
    }
  }

  if (allowMemoryFallback) {
    return res.json({ connected: false, database: dbId, mode: "Memory Fallback", writeVerified: true, requiredCollections });
  }

  return res.json({ connected: false, database: dbId, mode: "Disconnected", error: dbError, requiredCollections });
});

async function setDefaultFormatInvoice(id: string): Promise<void> {
  if (adminDb) {
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(adminDb.collection("formatinvoice"));
      if (!snapshot.docs.some(document => document.id === id)) {
        throw new Error(`Format invoice '${id}' was not found.`);
      }
      snapshot.docs.forEach(document => {
        transaction.update(document.ref, { defaultSelection: document.id === id });
      });
    });
    return;
  }

  if (!allowMemoryFallback) throw new Error("Firestore connection unavailable");
  const records = inMemoryDb.formatinvoice || [];
  if (!records.some(record => String(record.id) === id)) throw new Error(`Format invoice '${id}' was not found.`);
  inMemoryDb.formatinvoice = records.map(record => ({ ...record, defaultSelection: String(record.id) === id }));
}

app.get("/api/formatinvoice", async (req, res) => {
  try {
    return res.json({ success: true, docs: await getCollectionDocs("formatinvoice") });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch invoice formats" });
  }
});

app.get("/api/formatinvoice/default", async (req, res) => {
  try {
    const doc = (await getCollectionDocs("formatinvoice")).find(record => record.defaultSelection === true);
    return res.json({ success: true, doc: doc || null });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch default invoice format" });
  }
});

app.post("/api/formatinvoice", async (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.companyName || '').trim() || !String(body.addressess || '').trim()) {
      return res.status(400).json({ error: "companyName and addressess are required" });
    }
    const item = { ...body, id: String(body.id || `format_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`), defaultSelection: body.defaultSelection === true };
    await saveCollectionDoc("formatinvoice", item);
    if (item.defaultSelection) await setDefaultFormatInvoice(item.id);
    return res.json({ success: true, item });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to create invoice format" });
  }
});

app.patch("/api/formatinvoice/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await saveCollectionDoc("formatinvoice", { ...req.body, id });
    if (req.body?.defaultSelection === true) await setDefaultFormatInvoice(id);
    const item = (await getCollectionDocs("formatinvoice")).find(record => String(record.id) === id);
    return res.json({ success: true, item });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to update invoice format" });
  }
});

app.put("/api/formatinvoice/:id/default", async (req, res) => {
  try {
    await setDefaultFormatInvoice(String(req.params.id));
    const item = (await getCollectionDocs("formatinvoice")).find(record => String(record.id) === String(req.params.id));
    return res.json({ success: true, item });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to set default invoice format" });
  }
});

app.get("/api/db/:col", async (req, res) => {
  try {
    const docs = await getCollectionDocs(req.params.col);
    return res.json({ success: true, docs });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch collection" });
  }
});

app.get("/api/db/:col/:id", async (req, res) => {
  try {
    const docs = await getCollectionDocs(req.params.col);
    const doc = docs.find((entry) => String(entry.id) === String(req.params.id));
    if (!doc) return res.status(404).json({ error: `Document ${req.params.id} not found in ${req.params.col}` });
    return res.json({ success: true, doc });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch document" });
  }
});

app.post("/api/db/:col", async (req, res) => {
  try {
    await saveCollectionDoc(req.params.col, req.body);
    return res.json({ success: true, item: req.body });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to save document" });
  }
});

app.post('/api/uploads', requireAuthenticatedRequest, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const storagePath = String(req.body?.storagePath || '').trim();
    if (!file) return res.status(400).json({ error: 'Missing file' });
    if (!storagePath || storagePath.includes('..') || !allowedUploadRoots.some(root => storagePath.startsWith(root))) {
      return res.status(400).json({ error: 'Invalid Storage path' });
    }
    if (!allowedImageTypes.has(file.mimetype) && !file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    if (file.mimetype.startsWith('video/') && file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'Video file exceeds the 50MB limit' });
    }
    if (file.mimetype.startsWith('image/') && file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image file exceeds the 10MB limit' });
    }

    const fileRef = adminStorage.bucket().file(storagePath);
    await fileRef.save(file.buffer, { metadata: { contentType: file.mimetype } });
    const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    const [downloadUrl] = await fileRef.getSignedUrl({ action: 'read', expires });
    return res.json({
      success: true,
      file: {
        downloadUrl,
        storagePath,
        fileName: file.originalname,
        contentType: file.mimetype,
        fileSize: file.size,
      },
    });
  } catch (error: any) {
    console.error('[API] /api/uploads error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to upload file' });
  }
});

app.delete("/api/db/:col/:id", async (req, res) => {
  try {
    await deleteCollectionDoc(req.params.col, req.params.id);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to delete document" });
  }
});

// Product-specific multipart upload endpoint
app.post('/api/products', requireAuthenticatedRequest, upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const body = req.body || {};
    const productId = String(body.id || body.productId || Date.now());

    const payload: any = { ...body, id: productId };
    if (file) {
        const storagePath = `products/${productId}/main.jpg`;
      const bucket = adminStorage.bucket();
      const fileRef = bucket.file(storagePath);
      const stream = fileRef.createWriteStream({
        metadata: { contentType: file.mimetype },
      });

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
        stream.end(file.buffer);
      });

      // Generate a long-lived signed URL for download access
      const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000); // 10 years
      const [signedUrl] = await fileRef.getSignedUrl({ action: 'read', expires });

      payload.imageUrl = signedUrl;
      payload.storagePath = storagePath;
    }

    await saveCollectionDoc('products', payload);
    return res.json({ success: true, product: payload });
  } catch (error: any) {
    console.error('[API] /api/products error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to create product' });
  }
});

// Product image update (replace main image)
app.put('/api/products/:id/image', requireAuthenticatedRequest, upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const productId = req.params.id;
    if (!productId) return res.status(400).json({ error: 'Missing product id in path' });
    if (!file) return res.status(400).json({ error: 'Missing image file' });

    const storagePath = `products/${productId}/main.jpg`;
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);
    const stream = fileRef.createWriteStream({ metadata: { contentType: file.mimetype } });

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(file.buffer);
    });

    const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    const [signedUrl] = await fileRef.getSignedUrl({ action: 'read', expires });

    // Update product document with new imageUrl and storagePath
    const updated = { id: productId, imageUrl: signedUrl, storagePath };
    await saveCollectionDoc('products', updated);

    return res.json({ success: true, product: updated });
  } catch (error: any) {
    console.error('[API] PUT /api/products/:id/image error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to update product image' });
  }
});

app.post("/api/payment/test-connection", async (req, res) => {
  try {
    const { merchant_key, merchant_salt, environment } = req.body || {};
    const key = String(merchant_key || "").trim();

    // merchant_salt arrives base64-encoded from the client; fall back to the raw value if decoding fails
    let salt = String(merchant_salt || "").trim();
    try {
      const decoded = Buffer.from(salt, "base64").toString("utf-8");
      if (decoded) salt = decoded;
    } catch {
      // keep raw salt value
    }

    if (!key || !salt) {
      return res.status(400).json({ success: false, error: "Merchant key and salt are required" });
    }

    const dummyTxnId = `verify_${Date.now()}`;
    const hash = crypto.createHash("sha512").update(`${key}|verify_payment|${dummyTxnId}|${salt}`).digest("hex");
    const payuUrl = environment === "Production"
      ? "https://info.payu.in/merchant/postservice.php?form=2"
      : "https://test.payu.in/merchant/postservice.php?form=2";

    const payuResponse = await fetch(payuUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, command: "verify_payment", var1: dummyTxnId, hash }).toString(),
    });

    const rawText = await payuResponse.text();
    let data: any = null;
    try { data = JSON.parse(rawText); } catch { data = null; }

    if (!payuResponse.ok || !data) {
      return res.json({ success: false, error: `Could not reach PayU (HTTP ${payuResponse.status}). Check the environment and network connectivity.` });
    }

    // PayU returns "Invalid Hash" both for a genuine key/salt mismatch and for accounts that
    // haven't enabled Webservice API access in the PayU dashboard, so surface actionable guidance.
    if (data.status === 0 && /invalid hash/i.test(data.msg || "")) {
      return res.json({
        success: false,
        error: `PayU: ${data.msg} — double-check the Merchant Salt matches your PayU dashboard exactly, and confirm "Webservice API" access is enabled for this merchant account.`
      });
    }

    const authFailurePattern = /invalid key|authentication fail|merchant.*not found|invalid request/i;
    if (data.status === 0 && authFailurePattern.test(data.msg || "")) {
      return res.json({ success: false, error: `PayU: ${data.msg || "Invalid merchant key"}` });
    }

    return res.json({ success: true, message: "Merchant credentials verified with PayU" });
  } catch (error: any) {
    console.error("[API] /api/payment/test-connection error:", error);
    return res.status(502).json({ success: false, error: error?.message || "Unable to reach the PayU gateway" });
  }
});

// ==========================================
// REFERRAL & COMMISSION ENGINE (ROLLING 5-LEVEL)
// ==========================================

async function ensureDefaultCommissionRules() {
  try {
    const rules = await getCollectionDocs("commission_rules");
    const defaultRules = rules.filter((r: any) => !r.product_id && !r.partner_id && r.source === "Default");
    if (defaultRules.length === 0) {
      const initialDefaults = [
        { id: "rule_default_l1", level: 1, commission_type: "Percentage", commission_value: 10, source: "Default", status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "rule_default_l2", level: 2, commission_type: "Percentage", commission_value: 8, source: "Default", status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "rule_default_l3", level: 3, commission_type: "Percentage", commission_value: 6, source: "Default", status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "rule_default_l4", level: 4, commission_type: "Percentage", commission_value: 4, source: "Default", status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "rule_default_l5", level: 5, commission_type: "Percentage", commission_value: 2, source: "Default", status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];
      for (const rule of initialDefaults) {
        await saveCollectionDoc("commission_rules", rule);
      }
    }
  } catch (err) {
    console.warn("[COMMISSION] Failed to seed default rules:", err);
  }
}

async function ensureDefaultPartnerLevels() {
  try {
    const levels = await getCollectionDocs("performance_levels");
    if (levels.length === 0) {
      const initialLevels = [
        { id: "level_bronze", level_name: "Bronze", sales_amount: 0, sales_period: "Monthly", bonus_commission: 0, status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "level_silver", level_name: "Silver", sales_amount: 50000, sales_period: "Monthly", bonus_commission: 2, status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "level_gold", level_name: "Gold", sales_amount: 200000, sales_period: "Monthly", bonus_commission: 5, status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "level_platinum", level_name: "Platinum", sales_amount: 500000, sales_period: "Monthly", bonus_commission: 8, status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: "level_diamond", level_name: "Diamond", sales_amount: 1000000, sales_period: "Monthly", bonus_commission: 10, status: "Active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];
      for (const lvl of initialLevels) {
        await saveCollectionDoc("performance_levels", lvl);
      }
    }
  } catch (err) {
    console.warn("[COMMISSION] Failed to seed partner levels:", err);
  }
}

// Seeding functions called after server is listening

async function resolveEffectiveCommissionRate(productId: string, beneficiaryPartnerId: string, level: number): Promise<{ rate: number; ruleId: string; source: string }> {
  const rules = await getCollectionDocs("commission_rules");
  const activeRules = rules.filter((r: any) => r.status === "Active" && Number(r.level) === level);

  // 1. Partner + Product Override
  const partnerProductOverride = activeRules.find((r: any) => r.partner_id === beneficiaryPartnerId && r.product_id === productId);
  if (partnerProductOverride) {
    return { rate: Number(partnerProductOverride.commission_value), ruleId: partnerProductOverride.id, source: "Partner Override" };
  }

  // 2. Product Level Rule
  const productRule = activeRules.find((r: any) => r.product_id === productId && (!r.partner_id || r.partner_id === null));
  if (productRule) {
    return { rate: Number(productRule.commission_value), ruleId: productRule.id, source: "Product Rule" };
  }

  // 3. System Default Rule
  const defaultRule = activeRules.find((r: any) => (!r.product_id || r.product_id === null) && (!r.partner_id || r.partner_id === null) && r.source === "Default");
  if (defaultRule) {
    return { rate: Number(defaultRule.commission_value), ruleId: defaultRule.id, source: "System Default" };
  }

  const fallbackRates: Record<number, number> = { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 };
  return { rate: fallbackRates[level] || 0, ruleId: "system_fallback", source: "System Default Fallback" };
}

async function evaluatePartnerLevel(partnerId: string) {
  try {
    const referrals = await getCollectionDocs("referrals");
    const partner = referrals.find((r: any) => r.id === partnerId || r.referralId === partnerId);
    if (!partner) return;

    const orders = await getCollectionDocs("sales_orders");
    const partnerOrders = orders.filter((o: any) => 
      o.referralCode === partner.referralId || 
      o.customerId === partner.id
    );

    const totalSales = partnerOrders.reduce((sum: number, o: any) => sum + Number(o.totalValue || 0), 0);

    const levels = await getCollectionDocs("performance_levels");
    const activeLevels = levels
      .filter((l: any) => l.status === "Active")
      .sort((a: any, b: any) => Number(b.sales_amount) - Number(a.sales_amount));

    const qualifiedLevel = activeLevels.find((l: any) => totalSales >= Number(l.sales_amount));

    if (qualifiedLevel && partner.partnerLevelId !== qualifiedLevel.id) {
      await saveCollectionDoc("referrals", {
        ...partner,
        totalSales,
        partnerLevelId: qualifiedLevel.id,
        partnerLevelName: qualifiedLevel.level_name
      });
    }
  } catch (err) {
    console.warn("[COMMISSION] Partner level qualification error:", err);
  }
}

async function processOrderCommissionsInternal(orderId: string, processedByAdminId?: string): Promise<{ success: boolean; count: number; transactions: any[]; totalCommissionPosted?: number; error?: string }> {
  return processOrderCommissionsAuthoritative(orderId, processedByAdminId, getCollectionDocs, saveCollectionDoc);
}

async function refundOrderCommissionsInternal(orderId: string, reason: string = "Order Refunded", processedByAdminId?: string): Promise<{ success: boolean; reversedCount: number; error?: string }> {
  return refundOrderCommissionsAuthoritative(orderId, reason, processedByAdminId, getCollectionDocs, saveCollectionDoc);
}

app.get("/api/admin/referral-partners", async (req, res) => {
  try {
    const customers = await getCollectionDocs("customers");
    const referrals = await getCollectionDocs("referrals");
    const users = await getCollectionDocs("users");

    const adminUserIds = new Set(users.map((u: any) => String(u.id)));
    const adminUserEmails = new Set(users.map((u: any) => String(u.email || "").toLowerCase()).filter(Boolean));
    const adminUserMobiles = new Set(users.map((u: any) => String(u.mobileNumber || "").replace(/\D/g, "")).filter(Boolean));

    // CUSTOMERS table is single source of truth for referral identity
    const customerPartners = customers.map((c: any) => {
      const legacy = referrals.find((r: any) => r.id === c.id || r.referralId === c.referralCode || (r.mobileNumber && c.mobileNumber && r.mobileNumber.replace(/\D/g, "") === c.mobileNumber.replace(/\D/g, "")));
      return {
        id: c.id,
        referralId: c.referralCode || c.customerId || `REF-${c.id}`,
        name: c.name || "Unnamed Customer",
        mobileNumber: c.mobileNumber || "",
        email: c.email || "",
        address: c.address || "",
        status: c.status || legacy?.status || "Active",
        referredById: c.referredById || legacy?.referredById || legacy?.parentId,
        partnerLevelId: c.partnerLevelId || legacy?.partnerLevelId,
        partnerLevelName: c.partnerLevelName || legacy?.partnerLevelName,
        totalSales: c.totalSales || legacy?.totalSales || c.totalSpent || 0,
        commissionEarned: c.commissionEarned || legacy?.commissionEarned || 0,
        commissionPayable: c.commissionPayable || legacy?.commissionPayable || 0,
        commissionPaid: c.commissionPaid || legacy?.commissionPaid || 0,
      };
    });

    // Exclude administrative users from legacy referrals
    const extraLegacy = referrals.filter((r: any) => {
      if (customers.some((c: any) => c.id === r.id)) return false;
      if (adminUserIds.has(String(r.id)) || adminUserIds.has(String(r.userId))) return false;
      if (r.email && adminUserEmails.has(String(r.email).toLowerCase())) return false;
      if (r.mobileNumber && adminUserMobiles.has(String(r.mobileNumber).replace(/\D/g, ""))) return false;
      return true;
    });

    return res.json({ success: true, partners: [...customerPartners, ...extraLegacy] });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch referral partners" });
  }
});

app.get("/api/admin/referral-partners/:id", async (req, res) => {
  try {
    const customers = await getCollectionDocs("customers");
    const referrals = await getCollectionDocs("referrals");

    const customer = customers.find((c: any) => c.id === req.params.id || c.customerId === req.params.id || c.referralCode === req.params.id);
    if (customer) {
      const legacy = referrals.find((r: any) => r.id === customer.id);
      const partner = {
        id: customer.id,
        referralId: customer.referralCode || customer.customerId || `REF-${customer.id}`,
        name: customer.name || "Unnamed Customer",
        mobileNumber: customer.mobileNumber || "",
        email: customer.email || "",
        address: customer.address || "",
        status: customer.status || legacy?.status || "Active",
        referredById: customer.referredById || legacy?.referredById || legacy?.parentId,
        partnerLevelId: customer.partnerLevelId || legacy?.partnerLevelId,
        partnerLevelName: customer.partnerLevelName || legacy?.partnerLevelName,
        totalSales: customer.totalSales || legacy?.totalSales || customer.totalSpent || 0,
        commissionEarned: customer.commissionEarned || legacy?.commissionEarned || 0,
        commissionPayable: customer.commissionPayable || legacy?.commissionPayable || 0,
        commissionPaid: customer.commissionPaid || legacy?.commissionPaid || 0,
      };
      return res.json({ success: true, partner });
    }

    const partner = referrals.find((r: any) => r.id === req.params.id || r.referralId === req.params.id);
    if (!partner) return res.status(404).json({ error: "Referral partner not found" });
    return res.json({ success: true, partner });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch partner" });
  }
});

app.get("/api/admin/partner-levels", async (req, res) => {
  try {
    const levels = await getCollectionDocs("performance_levels");
    return res.json({ success: true, levels });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch partner levels" });
  }
});

app.post("/api/admin/partner-levels", async (req, res) => {
  try {
    const { level_name, sales_amount, sales_period, bonus_commission, status } = req.body;
    if (!level_name) return res.status(400).json({ error: "level_name is required" });
    const id = `level_${Date.now()}`;
    const payload = {
      id,
      level_name: String(level_name).trim(),
      sales_amount: Number(sales_amount || 0),
      sales_period: sales_period || "Monthly",
      bonus_commission: Number(bonus_commission || 0),
      status: status || "Active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await saveCollectionDoc("performance_levels", payload);
    return res.json({ success: true, partnerLevel: payload });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to create partner level" });
  }
});

app.put("/api/admin/partner-levels/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const existing = (await getCollectionDocs("performance_levels")).find((l: any) => l.id === id);
    if (!existing) return res.status(404).json({ error: "Partner level not found" });

    const updated = {
      ...existing,
      ...req.body,
      id,
      updated_at: new Date().toISOString()
    };
    await saveCollectionDoc("performance_levels", updated);
    return res.json({ success: true, partnerLevel: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update partner level" });
  }
});

app.patch("/api/admin/partner-levels/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    const existing = (await getCollectionDocs("performance_levels")).find((l: any) => l.id === id);
    if (!existing) return res.status(404).json({ error: "Partner level not found" });

    const updated = { ...existing, status, updated_at: new Date().toISOString() };
    await saveCollectionDoc("performance_levels", updated);
    return res.json({ success: true, partnerLevel: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update partner level status" });
  }
});

app.get("/api/admin/commission-rules", async (req, res) => {
  try {
    const rules = await getCollectionDocs("commission_rules");
    return res.json({ success: true, rules });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch commission rules" });
  }
});

app.post("/api/admin/commission-rules", async (req, res) => {
  try {
    const { product_id, partner_id, level, commission_type, commission_value, source, status } = req.body;
    if (!level || Number(level) < 1 || Number(level) > 5) {
      return res.status(400).json({ error: "Level must be between 1 and 5" });
    }
    const id = `rule_${Date.now()}`;
    const payload = {
      id,
      product_id: product_id || null,
      partner_id: partner_id || null,
      level: Number(level),
      commission_type: commission_type || "Percentage",
      commission_value: Number(commission_value || 0),
      source: source || (partner_id ? "Partner" : product_id ? "Product" : "Default"),
      status: status || "Active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await saveCollectionDoc("commission_rules", payload);
    return res.json({ success: true, rule: payload });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to create commission rule" });
  }
});

app.put("/api/admin/commission-rules/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const existing = (await getCollectionDocs("commission_rules")).find((r: any) => r.id === id);
    if (!existing) return res.status(404).json({ error: "Commission rule not found" });

    const updated = {
      ...existing,
      ...req.body,
      id,
      updated_at: new Date().toISOString()
    };
    await saveCollectionDoc("commission_rules", updated);
    return res.json({ success: true, rule: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update commission rule" });
  }
});

app.patch("/api/admin/commission-rules/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    const existing = (await getCollectionDocs("commission_rules")).find((r: any) => r.id === id);
    if (!existing) return res.status(404).json({ error: "Commission rule not found" });

    const updated = { ...existing, status, updated_at: new Date().toISOString() };
    await saveCollectionDoc("commission_rules", updated);
    return res.json({ success: true, rule: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update commission rule status" });
  }
});

app.get("/api/admin/products/:id/commission-rules", async (req, res) => {
  try {
    const productId = req.params.id;
    const rules = await getCollectionDocs("commission_rules");
    const productRules = rules.filter((r: any) => r.product_id === productId);
    return res.json({ success: true, productId, rules: productRules });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch product commission rules" });
  }
});

app.put("/api/admin/products/:id/commission-rules", async (req, res) => {
  try {
    const productId = req.params.id;
    const { levels } = req.body;
    if (!levels || typeof levels !== "object") {
      return res.status(400).json({ error: "levels map is required" });
    }

    const rules = await getCollectionDocs("commission_rules");
    const savedRules: any[] = [];

    for (let lvl = 1; lvl <= 5; lvl++) {
      if (levels[lvl] !== undefined) {
        const existing = rules.find((r: any) => r.product_id === productId && Number(r.level) === lvl && (!r.partner_id || r.partner_id === null));
        const val = Number(levels[lvl]);
        if (existing) {
          const updated = { ...existing, commission_value: val, updated_at: new Date().toISOString() };
          await saveCollectionDoc("commission_rules", updated);
          savedRules.push(updated);
        } else {
          const created = {
            id: `rule_prod_${productId}_l${lvl}`,
            product_id: productId,
            partner_id: null,
            level: lvl,
            commission_type: "Percentage",
            commission_value: val,
            source: "Product",
            status: "Active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await saveCollectionDoc("commission_rules", created);
          savedRules.push(created);
        }
      }
    }
    return res.json({ success: true, productId, rules: savedRules });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update product commission rules" });
  }
});

app.get("/api/admin/partners/:id/commission-overrides", async (req, res) => {
  try {
    const partnerId = req.params.id;
    const rules = await getCollectionDocs("commission_rules");
    const overrides = rules.filter((r: any) => r.partner_id === partnerId);
    return res.json({ success: true, partnerId, overrides });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch partner overrides" });
  }
});

app.put("/api/admin/partners/:id/commission-overrides", async (req, res) => {
  try {
    const partnerId = req.params.id;
    const { product_id, level, commission_value, status } = req.body;
    if (!product_id || !level) {
      return res.status(400).json({ error: "product_id and level are required" });
    }

    const rules = await getCollectionDocs("commission_rules");
    const existing = rules.find((r: any) => r.partner_id === partnerId && r.product_id === product_id && Number(r.level) === Number(level));

    if (existing) {
      const updated = {
        ...existing,
        commission_value: Number(commission_value),
        status: status || existing.status,
        updated_at: new Date().toISOString()
      };
      await saveCollectionDoc("commission_rules", updated);
      return res.json({ success: true, override: updated });
    } else {
      const created = {
        id: `rule_override_${partnerId}_${product_id}_l${level}`,
        partner_id: partnerId,
        product_id,
        level: Number(level),
        commission_type: "Percentage",
        commission_value: Number(commission_value),
        source: "Partner",
        status: status || "Active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await saveCollectionDoc("commission_rules", created);
      return res.json({ success: true, override: created });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update partner override" });
  }
});

app.get("/api/admin/commission-transactions", async (req, res) => {
  try {
    const txs = await getCollectionDocs("commission_transactions");
    return res.json({ success: true, transactions: txs });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch commission transactions" });
  }
});

app.get("/api/admin/commission-transactions/:id", async (req, res) => {
  try {
    const txs = await getCollectionDocs("commission_transactions");
    const tx = txs.find((t: any) => t.id === req.params.id);
    if (!tx) return res.status(404).json({ error: "Commission transaction not found" });
    return res.json({ success: true, transaction: tx });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch transaction" });
  }
});

app.post("/api/admin/commission-transactions/process-order/:orderId", async (req, res) => {
  const result = await processOrderCommissionsInternal(req.params.orderId);
  if (!result.success && result.error) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

app.post("/api/admin/commission-transactions/refund-order/:orderId", async (req, res) => {
  const reason = req.body?.reason || "Admin triggered refund";
  const result = await refundOrderCommissionsInternal(req.params.orderId, reason);
  return res.json(result);
});

app.patch("/api/admin/commission-transactions/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    const validStatuses = ["PENDING", "CONFIRMED", "PAYABLE", "PAID", "REVERSED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const txs = await getCollectionDocs("commission_transactions");
    const tx = txs.find((t: any) => t.id === id);
    if (!tx) return res.status(404).json({ error: "Commission transaction not found" });

    const updated = {
      ...tx,
      status,
      paid_at: status === "PAID" ? new Date().toISOString() : tx.paid_at,
      confirmed_at: status === "CONFIRMED" ? new Date().toISOString() : tx.confirmed_at
    };
    await saveCollectionDoc("commission_transactions", updated);
    return res.json({ success: true, transaction: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update transaction status" });
  }
});

// ==========================================
// AUTHORITATIVE COMMISSION ENGINE ENDPOINTS
// ==========================================

// 1. Calculate / Preview Commission
app.post("/api/commissions/calculate", async (req, res) => {
  try {
    const result = await calculateCommissionPreviewInternal(req.body, getCollectionDocs);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to calculate commission" });
  }
});

// 2. Post / Process Commission
app.post("/api/commissions/process", async (req, res) => {
  try {
    const { orderId, processedByAdminId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: "orderId is required" });
    }
    const result = await processOrderCommissionsAuthoritative(
      orderId,
      processedByAdminId,
      getCollectionDocs,
      saveCollectionDoc
    );
    if (!result.success && result.error) {
      return res.status(400).json(result);
    }
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to process commission" });
  }
});

// 3. Customer Commission Endpoints (Server-Authoritative Read)
app.get("/api/customers/:customerId/commissions", async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const txs = await getCollectionDocs("commission_transactions");
    const customerCommissions = txs.filter(
      (t: any) =>
        String(t.beneficiary_partner_id) === String(customerId) ||
        String(t.beneficiary_customer_id) === String(customerId)
    );
    return res.json({ success: true, customerId, commissions: customerCommissions });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch customer commissions" });
  }
});

app.get("/api/customers/:customerId/referrals", async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const customers = await getCollectionDocs("customers");
    const referrals = await getCollectionDocs("referrals");
    const all = [...customers, ...referrals];

    const downline = all.filter(
      (c: any) => String(c.referredById || c.parentId || c.sponsorId) === String(customerId)
    );
    return res.json({ success: true, customerId, referrals: downline });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch customer referrals" });
  }
});

app.get("/api/customers/:customerId/earnings", async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const customers = await getCollectionDocs("customers");
    const referrals = await getCollectionDocs("referrals");
    const record =
      customers.find((c: any) => c.id === customerId || c.customerId === customerId) ||
      referrals.find((r: any) => r.id === customerId || r.referralId === customerId);

    if (!record) return res.status(404).json({ error: "Customer not found" });

    return res.json({
      success: true,
      customerId,
      earnings: {
        commissionEarned: Number(record.commissionEarned || 0),
        commissionPayable: Number(record.commissionPayable || 0),
        commissionPaid: Number(record.commissionPaid || 0),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch customer earnings" });
  }
});

// 4. Admin Recalculate Endpoint
app.post("/api/admin/commission-transactions/recalculate", async (req, res) => {
  try {
    const { orderId, processedByAdminId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    // Step 1: Refund/reverse existing commissions for order
    await refundOrderCommissionsAuthoritative(
      orderId,
      "Admin Recalculation",
      processedByAdminId,
      getCollectionDocs,
      saveCollectionDoc
    );

    // Step 2: Re-process order commissions authoritatively
    const result = await processOrderCommissionsAuthoritative(
      orderId,
      processedByAdminId,
      getCollectionDocs,
      saveCollectionDoc
    );

    return res.json({ success: true, orderId, result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Recalculation failed" });
  }
});

// --- ORDER OPERATIONS & FULFILMENT API MODULE ---
const operationsService = new OperationsService({
  getCollectionDocs,
  saveCollectionDoc,
  deleteCollectionDoc,
});

// Helper for extracting Idempotency-Key
function getIdempotencyKey(req: express.Request): string | undefined {
  const key = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];
  return typeof key === "string" ? key : Array.isArray(key) ? key[0] : undefined;
}

// 1. GET /api/operations/orders & /api/v1/operations/orders
const handleGetOperationsOrders = async (req: express.Request, res: express.Response) => {
  try {
    const { paymentStatus, deliveryStatus, fulfilmentStatus, search, limit } = req.query;
    const orders = await operationsService.listOrders({
      paymentStatus: paymentStatus ? String(paymentStatus) : undefined,
      deliveryStatus: deliveryStatus ? String(deliveryStatus) : undefined,
      fulfilmentStatus: fulfilmentStatus ? String(fulfilmentStatus) : undefined,
      search: search ? String(search) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });
    return res.json({ success: true, count: orders.length, orders });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to retrieve operations orders" });
  }
};
app.get("/api/operations/orders", handleGetOperationsOrders);
app.get("/api/v1/operations/orders", handleGetOperationsOrders);

// 2. GET /api/operations/packing/orders & /api/v1/operations/packing/orders
const handleGetPackingOrders = async (req: express.Request, res: express.Response) => {
  try {
    const orders = await operationsService.listOrders();
    const packingOrders = orders.filter(o => o.fulfilmentStatus === 'NOT_STARTED' || o.fulfilmentStatus === 'PACKING');
    return res.json({ success: true, count: packingOrders.length, orders: packingOrders });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to retrieve packing orders" });
  }
};
app.get("/api/operations/packing/orders", handleGetPackingOrders);
app.get("/api/v1/operations/packing/orders", handleGetPackingOrders);

// 3. GET /api/operations/dispatch/orders & /api/v1/operations/dispatch/orders
const handleGetDispatchOrders = async (req: express.Request, res: express.Response) => {
  try {
    const orders = await operationsService.listOrders();
    const dispatchOrders = orders.filter(o => o.fulfilmentStatus === 'PACKED' || o.fulfilmentStatus === 'READY_FOR_DISPATCH');
    return res.json({ success: true, count: dispatchOrders.length, orders: dispatchOrders });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to retrieve dispatch orders" });
  }
};
app.get("/api/operations/dispatch/orders", handleGetDispatchOrders);
app.get("/api/v1/operations/dispatch/orders", handleGetDispatchOrders);

// 4. GET /api/operations/delivery/orders & /api/v1/operations/delivery/orders
const handleGetDeliveryOrders = async (req: express.Request, res: express.Response) => {
  try {
    const orders = await operationsService.listOrders();
    const deliveryOrders = orders.filter(o => o.fulfilmentStatus === 'DISPATCHED' || o.fulfilmentStatus === 'IN_TRANSIT' || o.fulfilmentStatus === 'OUT_FOR_DELIVERY');
    return res.json({ success: true, count: deliveryOrders.length, orders: deliveryOrders });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to retrieve delivery orders" });
  }
};
app.get("/api/operations/delivery/orders", handleGetDeliveryOrders);
app.get("/api/v1/operations/delivery/orders", handleGetDeliveryOrders);

// 5. GET /api/operations/returns & /api/v1/operations/returns
const handleGetReturns = async (req: express.Request, res: express.Response) => {
  try {
    const returns = await getCollectionDocs("order_returns");
    return res.json({ success: true, count: returns.length, returns });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to retrieve returns" });
  }
};
app.get("/api/operations/returns", handleGetReturns);
app.get("/api/v1/operations/returns", handleGetReturns);

// 6. GET /api/operations/orders/:orderId & /api/v1/operations/orders/:orderId
const handleGetOrderDetails = async (req: express.Request, res: express.Response) => {
  try {
    const details = await operationsService.getOrderDetails(req.params.orderId);
    return res.json({ success: true, ...details });
  } catch (error: any) {
    const statusCode = error?.message?.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({ error: error?.message || "Failed to retrieve order details" });
  }
};
app.get("/api/operations/orders/:orderId", handleGetOrderDetails);
app.get("/api/v1/operations/orders/:orderId", handleGetOrderDetails);

// 7. GET /api/operations/orders/:orderId/timeline & /api/v1/operations/orders/:orderId/timeline
const handleGetOrderTimeline = async (req: express.Request, res: express.Response) => {
  try {
    const timeline = await operationsService.getOrderTimeline(req.params.orderId);
    return res.json({ success: true, count: timeline.length, timeline });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to retrieve order timeline" });
  }
};
app.get("/api/operations/orders/:orderId/timeline", handleGetOrderTimeline);
app.get("/api/v1/operations/orders/:orderId/timeline", handleGetOrderTimeline);

// POST /api/operations/orders/:orderId/status & /api/v1/...
const handleUpdateStatus = async (req: express.Request, res: express.Response) => {
  try {
    const { status, updatedBy, notes } = req.body || {};
    if (!status) return res.status(400).json({ error: "status parameter is required" });
    const fulfilment = await operationsService.updateStatusDirectly(req.params.orderId, status, updatedBy, notes, getIdempotencyKey(req));
    return res.json({ success: true, fulfilment });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update status" });
  }
};
app.post("/api/operations/orders/:orderId/status", handleUpdateStatus);
app.post("/api/v1/operations/orders/:orderId/status", handleUpdateStatus);

// 8. POST /api/operations/orders/:orderId/packing/start & /api/v1/...
const handleStartPacking = async (req: express.Request, res: express.Response) => {
  try {
    const { packerId } = req.body || {};
    const packing = await operationsService.startPacking(req.params.orderId, packerId, getIdempotencyKey(req));
    return res.json({ success: true, packing });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to start packing" });
  }
};
app.post("/api/operations/orders/:orderId/packing/start", handleStartPacking);
app.post("/api/v1/operations/orders/:orderId/packing/start", handleStartPacking);

// 9. POST /api/operations/orders/:orderId/packing/complete & /api/v1/...
const handleCompletePacking = async (req: express.Request, res: express.Response) => {
  try {
    const { packerId, notes } = req.body || {};
    const packing = await operationsService.completePacking(req.params.orderId, packerId, notes, getIdempotencyKey(req));
    return res.json({ success: true, packing });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to complete packing" });
  }
};
app.post("/api/operations/orders/:orderId/packing/complete", handleCompletePacking);
app.post("/api/v1/operations/orders/:orderId/packing/complete", handleCompletePacking);

// 10. POST /api/operations/orders/:orderId/brand-owner & /api/v1/...
const handleAssignBrandOwner = async (req: express.Request, res: express.Response) => {
  try {
    const { assignments, assignedBy } = req.body || {};
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: "assignments array is required" });
    }
    const result = await operationsService.assignBrandOwners(req.params.orderId, assignments, assignedBy, getIdempotencyKey(req));
    return res.json({ success: true, brandAssignments: result });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to assign brand owners" });
  }
};
app.post("/api/operations/orders/:orderId/brand-owner", handleAssignBrandOwner);
app.post("/api/v1/operations/orders/:orderId/brand-owner", handleAssignBrandOwner);

// 11. POST /api/operations/orders/:orderId/shipment & /api/v1/...
const handleCreateShipment = async (req: express.Request, res: express.Response) => {
  try {
    const { courierAgency, trackingNumber, expectedDeliveryDate, packageCount, weightKg, baseCharge, handlingCharge, additionalCharge, otherCharge, createdBy } = req.body || {};
    if (!courierAgency || !trackingNumber) {
      return res.status(400).json({ error: "courierAgency and trackingNumber are required" });
    }
    const shipment = await operationsService.createShipment(
      req.params.orderId,
      { courierAgency, trackingNumber, expectedDeliveryDate, packageCount, weightKg, baseCharge, handlingCharge, additionalCharge, otherCharge },
      createdBy,
      getIdempotencyKey(req)
    );
    return res.json({ success: true, shipment });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to create shipment" });
  }
};
app.post("/api/operations/orders/:orderId/shipment", handleCreateShipment);
app.post("/api/v1/operations/orders/:orderId/shipment", handleCreateShipment);

// 12. POST /api/operations/shipments/:shipmentId/dispatch & /api/v1/...
const handleDispatchShipment = async (req: express.Request, res: express.Response) => {
  try {
    const { dispatchedBy } = req.body || {};
    const shipment = await operationsService.dispatchShipment(req.params.shipmentId, dispatchedBy, getIdempotencyKey(req));
    return res.json({ success: true, shipment });
  } catch (error: any) {
    const status = error?.message === "SHIPMENT_ALREADY_DISPATCHED" ? 409 : 400;
    return res.status(status).json({ error: error?.message || "Failed to dispatch shipment" });
  }
};
app.post("/api/operations/shipments/:shipmentId/dispatch", handleDispatchShipment);
app.post("/api/v1/operations/shipments/:shipmentId/dispatch", handleDispatchShipment);

// 13. POST /api/operations/shipments/:shipmentId/delivery & /api/v1/...
const handleRecordDelivery = async (req: express.Request, res: express.Response) => {
  try {
    const { deliveryDate, deliveryTime, recipientName, remarks, proofOfDeliveryUrl, recordedBy } = req.body || {};
    if (!recipientName) {
      return res.status(400).json({ error: "recipientName is required" });
    }
    const delivery = await operationsService.recordDelivery(
      req.params.shipmentId,
      { deliveryDate, deliveryTime, recipientName, remarks, proofOfDeliveryUrl },
      recordedBy,
      getIdempotencyKey(req)
    );
    return res.json({ success: true, delivery });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to record delivery" });
  }
};
app.post("/api/operations/shipments/:shipmentId/delivery", handleRecordDelivery);
app.post("/api/v1/operations/shipments/:shipmentId/delivery", handleRecordDelivery);
app.post("/api/operations/orders/:orderId/delivery", handleRecordDelivery);
app.post("/api/v1/operations/orders/:orderId/delivery", handleRecordDelivery);

// 14. POST /api/operations/orders/:orderId/returns & /api/v1/...
const handleCreateReturn = async (req: express.Request, res: express.Response) => {
  try {
    const { items, reason, notes, requestedBy } = req.body || {};
    const returnRecord = await operationsService.createReturn(
      req.params.orderId,
      { items, reason, notes },
      requestedBy,
      getIdempotencyKey(req)
    );
    return res.json({ success: true, returnRecord });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to create return request" });
  }
};
app.post("/api/operations/orders/:orderId/returns", handleCreateReturn);
app.post("/api/v1/operations/orders/:orderId/returns", handleCreateReturn);

// 15. POST /api/operations/returns/:returnId/reverse-shipment & /api/v1/...
const handleCreateReverseShipment = async (req: express.Request, res: express.Response) => {
  try {
    const { trackingNumber, courierAgency, shippedDate, expectedArrivalDate, remarks, createdBy } = req.body || {};
    if (!trackingNumber || !courierAgency) {
      return res.status(400).json({ error: "trackingNumber and courierAgency are required" });
    }
    const returnRecord = await operationsService.createReverseShipment(
      req.params.returnId,
      { trackingNumber, courierAgency, shippedDate, expectedArrivalDate, remarks },
      createdBy,
      getIdempotencyKey(req)
    );
    return res.json({ success: true, returnRecord });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to create reverse shipment" });
  }
};
app.post("/api/operations/returns/:returnId/reverse-shipment", handleCreateReverseShipment);
app.post("/api/v1/operations/returns/:returnId/reverse-shipment", handleCreateReverseShipment);

// 16. POST /api/operations/returns/:returnId/received & /api/v1/...
const handleConfirmReturnReceived = async (req: express.Request, res: express.Response) => {
  try {
    const { receivedBy } = req.body || {};
    const returnRecord = await operationsService.confirmReturnReceived(req.params.returnId, receivedBy, getIdempotencyKey(req));
    return res.json({ success: true, returnRecord });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to confirm return received" });
  }
};
app.post("/api/operations/returns/:returnId/received", handleConfirmReturnReceived);
app.post("/api/v1/operations/returns/:returnId/received", handleConfirmReturnReceived);

// 17. POST /api/operations/returns/:returnId/resolve & /api/v1/...
const handleResolveReturn = async (req: express.Request, res: express.Response) => {
  try {
    const { resolution, notes, resolvedBy } = req.body || {};
    if (!resolution || !['REFUND', 'REPLACEMENT', 'REJECTED'].includes(resolution)) {
      return res.status(400).json({ error: "valid resolution ('REFUND', 'REPLACEMENT', 'REJECTED') is required" });
    }
    const returnRecord = await operationsService.resolveReturn(req.params.returnId, resolution, notes, resolvedBy, getIdempotencyKey(req));
    return res.json({ success: true, returnRecord });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to resolve return" });
  }
};
app.post("/api/operations/returns/:returnId/resolve", handleResolveReturn);
app.post("/api/v1/operations/returns/:returnId/resolve", handleResolveReturn);

// 18. POST /api/operations/orders/:orderId/payment-reminder & /api/v1/...
const handleSendPaymentReminder = async (req: express.Request, res: express.Response) => {
  try {
    const { sentBy } = req.body || {};
    const reminder = await operationsService.sendPaymentReminder(req.params.orderId, sentBy, getIdempotencyKey(req));
    return res.json({ success: true, reminder });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to send payment reminder" });
  }
};
app.post("/api/operations/orders/:orderId/payment-reminder", handleSendPaymentReminder);
app.post("/api/v1/operations/orders/:orderId/payment-reminder", handleSendPaymentReminder);

// 19. POST /api/operations/orders/:orderId/whatsapp-payment-reminder & /api/v1/...
const handleSendWhatsAppPaymentReminder = async (req: express.Request, res: express.Response) => {
  try {
    const { phoneOverride, sentBy } = req.body || {};
    const reminder = await operationsService.sendWhatsAppPaymentReminder(req.params.orderId, phoneOverride, sentBy, getIdempotencyKey(req));
    return res.json({ success: true, reminder });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to send WhatsApp payment reminder" });
  }
};
app.post("/api/operations/orders/:orderId/whatsapp-payment-reminder", handleSendWhatsAppPaymentReminder);
app.post("/api/v1/operations/orders/:orderId/whatsapp-payment-reminder", handleSendWhatsAppPaymentReminder);

// 20. CATEGORY MASTER API ENDPOINTS (GET, POST, PUT, DELETE) -> violeafydb database
const handleGetCategories = async (req: express.Request, res: express.Response) => {
  try {
    const categories = await getCollectionDocs("product_categories");
    return res.json({ success: true, count: categories.length, docs: categories, categories });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch categories" });
  }
};
app.get("/api/categories", handleGetCategories);
app.get("/api/v1/categories", handleGetCategories);

const handleCreateOrUpdateCategory = async (req: express.Request, res: express.Response) => {
  try {
    const { id, name, description, imageUrl, storagePath } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "Category name is required" });
    }
    const catId = id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const categoryDoc = {
      id: catId,
      name: name.trim(),
      description: description || '',
      imageUrl: imageUrl || '',
      storagePath: storagePath || '',
      updatedAt: new Date().toISOString(),
      ...(id ? {} : { createdAt: new Date().toISOString() })
    };
    await saveCollectionDoc("product_categories", categoryDoc);
    return res.json({ success: true, doc: categoryDoc, category: categoryDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to save category" });
  }
};
app.post("/api/categories", handleCreateOrUpdateCategory);
app.post("/api/v1/categories", handleCreateOrUpdateCategory);

const handleUpdateCategoryById = async (req: express.Request, res: express.Response) => {
  try {
    const catId = req.params.id;
    const { name, description, imageUrl, storagePath } = req.body || {};
    const existingCategories = await getCollectionDocs("product_categories");
    const existing = existingCategories.find((c) => String(c.id) === String(catId));
    
    const categoryDoc = {
      ...(existing || {}),
      ...req.body,
      id: catId,
      name: name ? name.trim() : existing?.name || '',
      updatedAt: new Date().toISOString(),
    };
    await saveCollectionDoc("product_categories", categoryDoc);
    return res.json({ success: true, doc: categoryDoc, category: categoryDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update category" });
  }
};
app.put("/api/categories/:id", handleUpdateCategoryById);
app.put("/api/v1/categories/:id", handleUpdateCategoryById);

const handleDeleteCategoryById = async (req: express.Request, res: express.Response) => {
  try {
    const catId = req.params.id;
    await deleteCollectionDoc("product_categories", catId);
    return res.json({ success: true, message: `Category '${catId}' deleted successfully` });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to delete category" });
  }
};
app.delete("/api/categories/:id", handleDeleteCategoryById);
app.delete("/api/v1/categories/:id", handleDeleteCategoryById);

const handleUploadCategoryPicture = async (req: express.Request, res: express.Response) => {
  try {
    const catId = req.params.id || req.body?.id || req.body?.categoryName;
    const file = req.file;
    const { imageUrl, categoryName } = req.body || {};

    const existingCategories = await getCollectionDocs("product_categories");
    let existing = existingCategories.find((c) => String(c.id) === String(catId) || c.name?.toLowerCase() === String(catId).toLowerCase() || c.name?.toLowerCase() === (categoryName || '').toLowerCase());

    let finalImageUrl = imageUrl || existing?.imageUrl || '';
    let storagePath = existing?.storagePath || `categories/${catId || 'default'}/main.jpg`;

    if (file && adminStorage) {
      try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(storagePath);
        await fileRef.save(file.buffer, {
          metadata: { contentType: file.mimetype || 'image/jpeg' }
        });
        await fileRef.makePublic().catch(() => {});
        finalImageUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      } catch (storageErr) {
        console.warn("[VIO-STORAGE] Storage save failed, falling back to base64 data URL", storageErr);
        const base64 = file.buffer.toString('base64');
        finalImageUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
      }
    } else if (file) {
      const base64 = file.buffer.toString('base64');
      finalImageUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
    }

    const docId = existing?.id || (catId && !catId.includes(' ') ? catId : `cat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    const categoryDoc = {
      ...(existing || {}),
      id: docId,
      name: existing?.name || categoryName || catId || 'New Category',
      imageUrl: finalImageUrl,
      storagePath,
      updatedAt: new Date().toISOString(),
    };

    await saveCollectionDoc("product_categories", categoryDoc);
    return res.json({ success: true, doc: categoryDoc, category: categoryDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to upload category picture" });
  }
};
app.post("/api/categories/:id/picture", upload.single("image"), handleUploadCategoryPicture);
app.post("/api/v1/categories/:id/picture", upload.single("image"), handleUploadCategoryPicture);
app.post("/api/categories/picture", upload.single("image"), handleUploadCategoryPicture);

// 21. BRAND MASTERS API ENDPOINTS (GET, POST, PUT, DELETE, PICTURE) -> violeafydb product_brands
const handleGetBrands = async (req: express.Request, res: express.Response) => {
  try {
    const brands = await getCollectionDocs("product_brands");
    return res.json({ success: true, count: brands.length, docs: brands, brands });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch brands" });
  }
};
app.get("/api/brands", handleGetBrands);
app.get("/api/v1/brands", handleGetBrands);

const handleCreateOrUpdateBrand = async (req: express.Request, res: express.Response) => {
  try {
    const { id, name, owner, description, imageUrl, storagePath } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "Brand name is required" });
    }
    const brandId = id || `brand_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const brandDoc = {
      id: brandId,
      name: name.trim(),
      owner: (owner || 'Generic Owner').trim(),
      description: description || '',
      imageUrl: imageUrl || '',
      storagePath: storagePath || '',
      updatedAt: new Date().toISOString(),
      ...(id ? {} : { createdAt: new Date().toISOString() })
    };
    await saveCollectionDoc("product_brands", brandDoc);
    return res.json({ success: true, doc: brandDoc, brand: brandDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to save brand" });
  }
};
app.post("/api/brands", handleCreateOrUpdateBrand);
app.post("/api/v1/brands", handleCreateOrUpdateBrand);

const handleUpdateBrandById = async (req: express.Request, res: express.Response) => {
  try {
    const brandId = req.params.id;
    const { name, owner, description, imageUrl, storagePath } = req.body || {};
    const existingBrands = await getCollectionDocs("product_brands");
    const existing = existingBrands.find((b) => String(b.id) === String(brandId));

    const brandDoc = {
      ...(existing || {}),
      ...req.body,
      id: brandId,
      name: name ? name.trim() : existing?.name || '',
      owner: owner ? owner.trim() : existing?.owner || 'Generic Owner',
      updatedAt: new Date().toISOString(),
    };
    await saveCollectionDoc("product_brands", brandDoc);
    return res.json({ success: true, doc: brandDoc, brand: brandDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update brand" });
  }
};
app.put("/api/brands/:id", handleUpdateBrandById);
app.put("/api/v1/brands/:id", handleUpdateBrandById);

const handleDeleteBrandById = async (req: express.Request, res: express.Response) => {
  try {
    const brandId = req.params.id;
    await deleteCollectionDoc("product_brands", brandId);
    return res.json({ success: true, message: `Brand '${brandId}' deleted successfully` });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to delete brand" });
  }
};
app.delete("/api/brands/:id", handleDeleteBrandById);
app.delete("/api/v1/brands/:id", handleDeleteBrandById);

const handleUploadBrandPicture = async (req: express.Request, res: express.Response) => {
  try {
    const brandId = req.params.id || req.body?.id || req.body?.brandName;
    const file = req.file;
    const { imageUrl, brandName, owner } = req.body || {};

    const existingBrands = await getCollectionDocs("product_brands");
    let existing = existingBrands.find((b) => String(b.id) === String(brandId) || b.name?.toLowerCase() === String(brandId).toLowerCase() || b.name?.toLowerCase() === (brandName || '').toLowerCase());

    let finalImageUrl = imageUrl || existing?.imageUrl || '';
    let storagePath = existing?.storagePath || `brands/${brandId || 'default'}/main.jpg`;

    if (file && adminStorage) {
      try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(storagePath);
        await fileRef.save(file.buffer, {
          metadata: { contentType: file.mimetype || 'image/jpeg' }
        });
        await fileRef.makePublic().catch(() => {});
        finalImageUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      } catch (storageErr) {
        console.warn("[VIO-STORAGE] Storage save failed, falling back to base64 data URL", storageErr);
        const base64 = file.buffer.toString('base64');
        finalImageUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
      }
    } else if (file) {
      const base64 = file.buffer.toString('base64');
      finalImageUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
    }

    const docId = existing?.id || (brandId && !brandId.includes(' ') ? brandId : `brand_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    const brandDoc = {
      ...(existing || {}),
      id: docId,
      name: existing?.name || brandName || brandId || 'New Brand',
      owner: existing?.owner || owner || 'Generic Owner',
      imageUrl: finalImageUrl,
      storagePath,
      updatedAt: new Date().toISOString(),
    };

    await saveCollectionDoc("product_brands", brandDoc);
    return res.json({ success: true, doc: brandDoc, brand: brandDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to upload brand picture" });
  }
};
app.post("/api/brands/:id/picture", upload.single("image"), handleUploadBrandPicture);
app.post("/api/v1/brands/:id/picture", upload.single("image"), handleUploadBrandPicture);
app.post("/api/brands/picture", upload.single("image"), handleUploadBrandPicture);

// 22. BRAND OWNER MASTERS API ENDPOINTS (GET, POST, PUT, DELETE, PICTURE) -> violeafydb product_brand_owners
const handleGetBrandOwners = async (req: express.Request, res: express.Response) => {
  try {
    const owners = await getCollectionDocs("product_brand_owners");
    return res.json({ success: true, count: owners.length, docs: owners, owners, brandOwners: owners });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch brand owners" });
  }
};
app.get("/api/brand-owners", handleGetBrandOwners);
app.get("/api/v1/brand-owners", handleGetBrandOwners);

const handleCreateOrUpdateBrandOwner = async (req: express.Request, res: express.Response) => {
  try {
    const { id, name, contactPerson, contactEmail, contactPhone, description, imageUrl, storagePath } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "Brand owner name is required" });
    }
    const ownerId = id || `owner_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const ownerDoc = {
      id: ownerId,
      name: name.trim(),
      contactPerson: contactPerson || '',
      contactEmail: contactEmail || '',
      contactPhone: contactPhone || '',
      description: description || '',
      imageUrl: imageUrl || '',
      storagePath: storagePath || '',
      updatedAt: new Date().toISOString(),
      ...(id ? {} : { createdAt: new Date().toISOString() })
    };
    await saveCollectionDoc("product_brand_owners", ownerDoc);
    return res.json({ success: true, doc: ownerDoc, owner: ownerDoc, brandOwner: ownerDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to save brand owner" });
  }
};
app.post("/api/brand-owners", handleCreateOrUpdateBrandOwner);
app.post("/api/v1/brand-owners", handleCreateOrUpdateBrandOwner);

const handleUpdateBrandOwnerById = async (req: express.Request, res: express.Response) => {
  try {
    const ownerId = req.params.id;
    const { name } = req.body || {};
    const existingOwners = await getCollectionDocs("product_brand_owners");
    const existing = existingOwners.find((o) => String(o.id) === String(ownerId));

    const ownerDoc = {
      ...(existing || {}),
      ...req.body,
      id: ownerId,
      name: name ? name.trim() : existing?.name || '',
      updatedAt: new Date().toISOString(),
    };
    await saveCollectionDoc("product_brand_owners", ownerDoc);
    return res.json({ success: true, doc: ownerDoc, owner: ownerDoc, brandOwner: ownerDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update brand owner" });
  }
};
app.put("/api/brand-owners/:id", handleUpdateBrandOwnerById);
app.put("/api/v1/brand-owners/:id", handleUpdateBrandOwnerById);

const handleDeleteBrandOwnerById = async (req: express.Request, res: express.Response) => {
  try {
    const ownerId = req.params.id;
    await deleteCollectionDoc("product_brand_owners", ownerId);
    return res.json({ success: true, message: `Brand owner '${ownerId}' deleted successfully` });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to delete brand owner" });
  }
};
app.delete("/api/brand-owners/:id", handleDeleteBrandOwnerById);
app.delete("/api/v1/brand-owners/:id", handleDeleteBrandOwnerById);

const handleUploadBrandOwnerPicture = async (req: express.Request, res: express.Response) => {
  try {
    const ownerId = req.params.id || req.body?.id || req.body?.ownerName;
    const file = req.file;
    const { imageUrl, ownerName } = req.body || {};

    const existingOwners = await getCollectionDocs("product_brand_owners");
    let existing = existingOwners.find((o) => String(o.id) === String(ownerId) || o.name?.toLowerCase() === String(ownerId).toLowerCase() || o.name?.toLowerCase() === (ownerName || '').toLowerCase());

    let finalImageUrl = imageUrl || existing?.imageUrl || '';
    let storagePath = existing?.storagePath || `brand_owners/${ownerId || 'default'}/main.jpg`;

    if (file && adminStorage) {
      try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(storagePath);
        await fileRef.save(file.buffer, {
          metadata: { contentType: file.mimetype || 'image/jpeg' }
        });
        await fileRef.makePublic().catch(() => {});
        finalImageUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      } catch (storageErr) {
        console.warn("[VIO-STORAGE] Storage save failed, falling back to base64 data URL", storageErr);
        const base64 = file.buffer.toString('base64');
        finalImageUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
      }
    } else if (file) {
      const base64 = file.buffer.toString('base64');
      finalImageUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
    }

    const docId = existing?.id || (ownerId && !ownerId.includes(' ') ? ownerId : `owner_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    const ownerDoc = {
      ...(existing || {}),
      id: docId,
      name: existing?.name || ownerName || ownerId || 'New Brand Owner',
      imageUrl: finalImageUrl,
      storagePath,
      updatedAt: new Date().toISOString(),
    };

    await saveCollectionDoc("product_brand_owners", ownerDoc);
    return res.json({ success: true, doc: ownerDoc, owner: ownerDoc, brandOwner: ownerDoc });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to upload brand owner picture" });
  }
};
app.post("/api/brand-owners/:id/picture", upload.single("image"), handleUploadBrandOwnerPicture);
app.post("/api/v1/brand-owners/:id/picture", upload.single("image"), handleUploadBrandOwnerPicture);
app.post("/api/brand-owners/picture", upload.single("image"), handleUploadBrandOwnerPicture);

// GENERIC DATABASE PROXY ROUTE (Supports BaseRepository proxy fallbacks)
app.get("/api/db/:collection", async (req, res) => {
  try {
    const docs = await getCollectionDocs(req.params.collection);
    return res.json({ success: true, docs });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

app.get("/api/db/:collection/:id", async (req, res) => {
  try {
    const docs = await getCollectionDocs(req.params.collection);
    const doc = docs.find((d) => String(d.id) === String(req.params.id));
    if (!doc) return res.status(404).json({ error: "Document not found" });
    return res.json({ success: true, doc });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/db/:collection", async (req, res) => {
  try {
    await saveCollectionDoc(req.params.collection, req.body);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message });
  }
});

app.delete("/api/db/:collection/:id", async (req, res) => {
  try {
    await deleteCollectionDoc(req.params.collection, req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message });
  }
});

app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
});

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.FIREBASE_CONFIG) ||
    Boolean(process.argv[1]?.includes("dist"));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom"
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      if (req.originalUrl.startsWith("/api")) return next();
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (error: any) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });
  } else {
    const staticPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(staticPath));
    app.get("*", (req, res) => {
      if (req.originalUrl.startsWith("/api")) return res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const HOST = "0.0.0.0";
  app.listen(PORT, HOST, () => {
    console.log(`[SERVER] Running on http://${HOST}:${PORT} (production=${isProduction})`);
    // Run database seeding non-blockingly after listening on port
    void ensureDefaultCommissionRules().catch((err) => console.warn("[COMMISSION] Seeding rules warning:", err));
    void ensureDefaultPartnerLevels().catch((err) => console.warn("[COMMISSION] Seeding levels warning:", err));
  });
}

startServer().catch((error) => console.error("Failed to start server:", error));
