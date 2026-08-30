/* ==========================================================================
   api/submit.js — จุดรับข้อมูลฝั่งเซิร์ฟเวอร์ (Vercel Serverless Function)
   --------------------------------------------------------------------------
   ไฟล์นี้รันบนเซิร์ฟเวอร์ของ Vercel ไม่ใช่ในเบราว์เซอร์ผู้ใช้
   จึงเป็นที่เดียวที่กุญแจฐานข้อมูลอยู่ได้อย่างปลอดภัย

   ไม่ต้อง npm install อะไรทั้งสิ้น — ใช้เฉพาะของที่ Node มีมาให้อยู่แล้ว

   ตัวแปรสภาพแวดล้อมที่ต้องตั้งใน Vercel (Settings → Environment Variables)
     SUPABASE_URL              เช่น https://xxxxxxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY กุญแจ service_role จาก Supabase
     IP_HASH_SALT              ข้อความสุ่มยาวๆ ที่คุณตั้งเอง อย่าให้ใครรู้

   ห้ามเอาค่าเหล่านี้ไปใส่ในไฟล์ใดๆ ที่ push ขึ้น GitHub เด็ดขาด
   ========================================================================== */

const { createHash } = require("node:crypto");

/* ---------- ขีดจำกัด ---------- */
const MAX_BODY_BYTES = 12 * 1024;      // 12 KB พอเหลือเฟือสำหรับแบบสอบถาม
const RATE_WINDOW_MIN = 10;            // ดูย้อนหลังกี่นาที
const RATE_MAX_PER_WINDOW = 8;         // ส่งได้กี่ครั้งในช่วงนั้น
const MIN_FORM_FILL_MS = 3000;         // กรอกเร็วกว่านี้ = น่าจะเป็นบอท

/* ---------- ค่าที่อนุญาต (allowlist) ----------
   ค่าที่ไม่อยู่ในรายการนี้จะถูกปฏิเสธ ไม่ใช่แค่กรองทิ้ง
   ป้องกันไม่ให้มีใครยัดข้อความอะไรก็ได้เข้าฐานข้อมูล                     */
const ENUMS = {
  role: ["deaf_hoh", "family", "teacher", "student", "general"],
  ageRange: ["", "under18", "18-24", "25-34", "35-49", "50-64", "65plus"],
  level: ["none", "few", "basic", "fluent"],
  goal: ["family_comm", "work", "volunteer", "curiosity"],
  referral: ["", "social", "friend", "search", "school", "hospital", "other"],
  accuracy: ["", "good", "too_strict", "too_loose", "unstable"]
};

/* ==========================================================================
   ตัวช่วย
   ========================================================================== */

/* ตัดอักขระควบคุมทิ้ง และจำกัดความยาว
   อักขระควบคุมคือสิ่งที่ใช้ก่อกวนการแสดงผลและ log ได้ */
function cleanText(value, maxLen) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLen);
}

function pickEnum(value, allowed) {
  const v = typeof value === "string" ? value : "";
  return allowed.includes(v) ? v : null;
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i < min || i > max ? null : i;
}

/* แฮชหมายเลข IP แบบทางเดียว — แปลงกลับเป็น IP เดิมไม่ได้
   ใช้เพื่อจำกัดจำนวนครั้งการส่งเท่านั้น */
function hashIp(ip, salt) {
  return createHash("sha256").update(salt + "|" + ip).digest("hex").slice(0, 32);
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || "0.0.0.0";
}

function fail(res, status, message) {
  /* ข้อความ error ต้องไม่เปิดเผยรายละเอียดภายในระบบ */
  return res.status(status).json({ ok: false, error: message });
}

/* ==========================================================================
   ตรวจสอบเนื้อหาแต่ละประเภท
   ========================================================================== */
function validate(kind, payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { error: "รูปแบบข้อมูลไม่ถูกต้อง" };
  }

  if (kind === "onboarding") {
    const role = pickEnum(payload.role, ENUMS.role);
    const level = pickEnum(payload.level, ENUMS.level);
    const goal = pickEnum(payload.goal, ENUMS.goal);
    if (!role || !level || !goal) return { error: "ตอบไม่ครบทุกข้อที่จำเป็น" };

    const ageRange = pickEnum(payload.ageRange, ENUMS.ageRange);
    const referral = pickEnum(payload.referral, ENUMS.referral);
    if (ageRange === null || referral === null) return { error: "ค่าที่เลือกไม่ถูกต้อง" };

    return {
      data: {
        role, level, goal, ageRange, referral,
        reason: cleanText(payload.reason, 500),
        screen: /^\d{1,5}x\d{1,5}$/.test(payload.screen || "") ? payload.screen : "",
        lang: cleanText(payload.lang, 12)
      }
    };
  }

  if (kind === "review") {
    const rating = clampInt(payload.rating, 1, 5);
    if (rating === null) return { error: "คะแนนไม่ถูกต้อง" };

    const accuracy = pickEnum(payload.accuracy, ENUMS.accuracy);
    if (accuracy === null) return { error: "ค่าที่เลือกไม่ถูกต้อง" };

    return {
      data: {
        rating, accuracy,
        difficulty: cleanText(payload.difficulty, 120),
        feedback: cleanText(payload.feedback, 1000)
      }
    };
  }

  if (kind === "practice") {
    const durationSec = clampInt(payload.durationSec, 0, 86400);
    const signsSeen = clampInt(payload.signsSeen, 0, 10000);
    const signsPassed = clampInt(payload.signsPassed, 0, 10000);
    if (durationSec === null || signsSeen === null || signsPassed === null) {
      return { error: "ข้อมูลสถิติไม่ถูกต้อง" };
    }

    const perSign = Array.isArray(payload.perSign)
      ? payload.perSign.slice(0, 20).map((s) => ({
          id: cleanText(s && s.id, 40),
          frames: clampInt(s && s.frames, 0, 1e6) || 0,
          passes: clampInt(s && s.passes, 0, 1e4) || 0
        }))
      : [];

    return { data: { durationSec, signsSeen, signsPassed, perSign } };
  }

  return { error: "ประเภทข้อมูลไม่ถูกต้อง" };
}

/* ==========================================================================
   คุยกับ Supabase ผ่าน REST API (ไม่ต้องลงไลบรารี)
   ========================================================================== */
async function supabase(path, options) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return fetch(url + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(options && options.headers)
    }
  });
}

/* นับว่า IP นี้ส่งมากี่ครั้งแล้วในช่วงเวลาที่กำหนด */
async function countRecent(ipHash) {
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000).toISOString();
  const query =
    "responses?select=id&ip_hash=eq." + encodeURIComponent(ipHash) +
    "&submitted_at=gte." + encodeURIComponent(since) +
    "&limit=" + (RATE_MAX_PER_WINDOW + 1);

  const res = await supabase(query, { method: "GET" });
  if (!res.ok) return 0;             // ถ้านับไม่ได้ ไม่บล็อกผู้ใช้จริง
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

/* ==========================================================================
   ตัวจัดการคำขอ
   ========================================================================== */
module.exports = async function handler(req, res) {

  /* ---- 1. รับเฉพาะ POST ---- */
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "รองรับเฉพาะการส่งแบบ POST");
  }

  /* ---- 2. รับเฉพาะคำขอจากเว็บของเราเอง ----
     กันไม่ให้เว็บอื่นเรียก API นี้จากเบราว์เซอร์ผู้ใช้ */
  const origin = req.headers.origin;
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch (e) { originHost = ""; }
    if (originHost !== req.headers.host) {
      return fail(res, 403, "คำขอมาจากแหล่งที่ไม่ได้รับอนุญาต");
    }
  }

  /* ---- 3. ตรวจว่าตั้งค่าเซิร์ฟเวอร์ครบหรือยัง ---- */
  if (!process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.IP_HASH_SALT) {
    console.error("ยังไม่ได้ตั้งค่า environment variables ให้ครบ");
    return fail(res, 503, "ระบบยังไม่พร้อมรับข้อมูล");
  }

  /* ---- 4. อ่าน body พร้อมจำกัดขนาด ---- */
  let body = req.body;
  if (body === undefined || typeof body === "string") {
    try {
      const raw = typeof body === "string" ? body : await readBody(req);
      if (raw.length > MAX_BODY_BYTES) return fail(res, 413, "ข้อมูลยาวเกินไป");
      body = JSON.parse(raw || "{}");
    } catch (e) {
      return fail(res, 400, "อ่านข้อมูลไม่ได้");
    }
  }
  if (typeof body !== "object" || body === null) {
    return fail(res, 400, "รูปแบบข้อมูลไม่ถูกต้อง");
  }

  const kind = typeof body.kind === "string" ? body.kind : "";

  /* ---- 5. กับดักบอท ----
     ช่องนี้ถูกซ่อนด้วย CSS คนจริงมองไม่เห็นจึงไม่มีทางกรอก
     ถ้ามีค่า แปลว่าเป็นสคริปต์ที่กรอกทุกช่องอัตโนมัติ
     ตอบ 200 กลับไปเพื่อไม่ให้ผู้เขียนบอทรู้ว่าถูกจับได้ */
  if (typeof body.trap === "string" && body.trap.length > 0) {
    return res.status(200).json({ ok: true });
  }

  /* ---- 6. กรอกเร็วผิดปกติ ---- */
  if (kind !== "practice") {
    const elapsed = Number(body.elapsedMs);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FORM_FILL_MS) {
      return res.status(200).json({ ok: true });
    }
  }

  /* ---- 7. ตรวจเนื้อหา ---- */
  const checked = validate(kind, body.payload);
  if (checked.error) return fail(res, 400, checked.error);

  const consentVersion = cleanText(body.consentVersion, 32) || "unknown";

  /* ---- 8. จำกัดจำนวนครั้ง ---- */
  const ipHash = hashIp(clientIp(req), process.env.IP_HASH_SALT);
  try {
    const recent = await countRecent(ipHash);
    if (recent >= RATE_MAX_PER_WINDOW) {
      return fail(res, 429, "ส่งข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
    }
  } catch (e) {
    /* ถ้าตรวจไม่ได้ ปล่อยผ่าน ดีกว่าปิดกั้นผู้ใช้จริง */
  }

  /* ---- 9. บันทึกลงฐานข้อมูล ---- */
  try {
    const insert = await supabase("responses", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: kind,
        payload: checked.data,
        ip_hash: ipHash,
        consent_version: consentVersion
      })
    });

    if (!insert.ok) {
      const detail = await insert.text().catch(() => "");
      console.error("บันทึกฐานข้อมูลไม่สำเร็จ:", insert.status, detail.slice(0, 300));
      return fail(res, 502, "บันทึกข้อมูลไม่สำเร็จ");
    }
  } catch (e) {
    console.error("เชื่อมต่อฐานข้อมูลไม่ได้:", e && e.message);
    return fail(res, 502, "บันทึกข้อมูลไม่สำเร็จ");
  }

  return res.status(200).json({ ok: true });
};

/* อ่าน stream ของ request พร้อมตัดทันทีถ้ายาวเกินกำหนด */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
