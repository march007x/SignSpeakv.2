/* ==========================================================================
   api.test.js — ทดสอบตรรกะการตรวจสอบข้อมูลของ api/submit.js
   --------------------------------------------------------------------------
   รันด้วย:  node test/api.test.js
   ใช้ฐานข้อมูลจำลอง ไม่ต่อ Supabase จริง จึงรันได้โดยไม่ต้องมีบัญชี
   ========================================================================== */

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.IP_HASH_SALT = "test-salt-1234567890";

let inserted = [];
global.fetch = async (url, opts) => {
  if (opts.method === "GET") return { ok: true, json: async () => [] };
  inserted.push(JSON.parse(opts.body));
  return { ok: true, text: async () => "" };
};

const handler = require("../api/submit.js");

let pass = 0, fail = 0;
const CTRL = String.fromCharCode(7); // อักขระควบคุมที่ต้องถูกตัดทิ้ง

function mockRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

function mockReq(body, method, origin) {
  const headers = { host: "x.vercel.app", "x-forwarded-for": "1.2.3.4" };
  if (origin) headers.origin = origin;
  return { method: method || "POST", headers: headers, body: body };
}

async function t(name, body, expectStatus, expectInsert, method) {
  inserted = [];
  const res = mockRes();
  await handler(mockReq(body, method), res);
  const okStatus = res.statusCode === expectStatus;
  const okInsert = expectInsert === undefined || (inserted.length > 0) === expectInsert;
  if (okStatus && okInsert) {
    pass++; console.log("  ok    " + name);
  } else {
    fail++;
    console.log("  FAIL  " + name + "  → ได้ " + res.statusCode +
      " " + JSON.stringify(res.body) + " บันทึก=" + inserted.length);
  }
}

(async function () {
  console.log("\nทดสอบ api/submit.js");
  console.log("-------------------");

  const good = {
    kind: "onboarding", consentVersion: "2026-08-v1", elapsedMs: 9000,
    payload: {
      role: "family", level: "none", goal: "family_comm", ageRange: "25-34",
      referral: "friend", reason: "อยากคุยกับหลาน", screen: "1920x1080", lang: "th"
    }
  };

  await t("แบบสอบถามที่ถูกต้อง ต้องบันทึกได้", good, 200, true);
  await t("ปฏิเสธเมธอด GET", good, 405, false, "GET");
  await t("ปฏิเสธเมื่อตอบไม่ครบ",
    Object.assign({}, good, { payload: Object.assign({}, good.payload, { role: undefined }) }),
    400, false);
  await t("ปฏิเสธค่าที่ไม่อยู่ในรายการที่อนุญาต (กันการยัดสคริปต์)",
    Object.assign({}, good, {
      payload: Object.assign({}, good.payload, { role: "<script>alert(1)</script>" })
    }), 400, false);
  await t("ปฏิเสธประเภทข้อมูลที่ไม่รู้จัก",
    Object.assign({}, good, { kind: "hacked" }), 400, false);
  await t("กับดักบอท: ตอบ 200 กลับไปแต่ไม่บันทึกจริง",
    Object.assign({}, good, { trap: "spam" }), 200, false);
  await t("กรอกฟอร์มเร็วผิดปกติ: ไม่บันทึก",
    Object.assign({}, good, { elapsedMs: 200 }), 200, false);

  await t("รีวิวที่ถูกต้อง", {
    kind: "review", consentVersion: "2026-08-v1", elapsedMs: 9000,
    payload: { rating: 4, accuracy: "too_strict", difficulty: "M,N", feedback: "ดีครับ" }
  }, 200, true);

  await t("ปฏิเสธคะแนนรีวิวนอกช่วง 1-5", {
    kind: "review", elapsedMs: 9000, payload: { rating: 99, accuracy: "" }
  }, 400, false);

  await t("สถิติการฝึก ไม่ต้องผ่านเกณฑ์เวลากรอกฟอร์ม", {
    kind: "practice",
    payload: {
      durationSec: 120, signsSeen: 5, signsPassed: 3,
      perSign: [{ id: "asl-a", frames: 100, passes: 1 }]
    }
  }, 200, true);

  /* ตัดอักขระควบคุม และจำกัดความยาว */
  inserted = [];
  await handler(mockReq(Object.assign({}, good, {
    payload: Object.assign({}, good.payload, {
      reason: "ปกติ" + CTRL + "อันตราย" + "ก".repeat(900)
    })
  })), mockRes());
  const reason = inserted[0].payload.reason;
  if (reason.indexOf(CTRL) === -1 && reason.length <= 500) {
    pass++; console.log("  ok    ตัดอักขระควบคุมทิ้งและจำกัดความยาวข้อความ");
  } else {
    fail++; console.log("  FAIL  ตัดอักขระควบคุม → ยาว " + reason.length);
  }

  /* IP ต้องถูกแฮช ไม่เก็บดิบ */
  const ipHash = inserted[0].ip_hash;
  if (ipHash && ipHash.indexOf("1.2.3.4") === -1 && ipHash.length === 32) {
    pass++; console.log("  ok    เก็บ IP เป็นค่าแฮช ไม่ใช่หมายเลขจริง");
  } else {
    fail++; console.log("  FAIL  ip_hash = " + ipHash);
  }

  /* ต้องไม่มีฟิลด์แปลกปลอมหลุดเข้าฐานข้อมูล */
  inserted = [];
  await handler(mockReq(Object.assign({}, good, {
    payload: Object.assign({}, good.payload, { evilField: "ควรถูกทิ้ง", isAdmin: true })
  })), mockRes());
  const keys = Object.keys(inserted[0].payload);
  if (keys.indexOf("evilField") === -1 && keys.indexOf("isAdmin") === -1) {
    pass++; console.log("  ok    ฟิลด์ที่ไม่ได้อยู่ในรายการถูกทิ้ง ไม่เข้าฐานข้อมูล");
  } else {
    fail++; console.log("  FAIL  มีฟิลด์แปลกปลอมหลุดเข้าไป: " + keys.join(","));
  }

  /* ปฏิเสธคำขอข้ามโดเมน */
  const res = mockRes();
  await handler(mockReq(good, "POST", "https://evil.example"), res);
  if (res.statusCode === 403) {
    pass++; console.log("  ok    ปฏิเสธคำขอที่มาจากโดเมนอื่น");
  } else {
    fail++; console.log("  FAIL  คำขอข้ามโดเมนได้ status " + res.statusCode);
  }

  /* ขาดตัวแปรสภาพแวดล้อม ต้องไม่ล่ม */
  const saved = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  const res2 = mockRes();
  await handler(mockReq(good), res2);
  process.env.SUPABASE_URL = saved;
  if (res2.statusCode === 503) {
    pass++; console.log("  ok    ตั้งค่าเซิร์ฟเวอร์ไม่ครบ ตอบ 503 อย่างสุภาพ ไม่ล่ม");
  } else {
    fail++; console.log("  FAIL  env ไม่ครบ ได้ status " + res2.statusCode);
  }

  console.log("\n" + "=".repeat(50));
  console.log("ผ่าน " + pass + " ข้อ / ไม่ผ่าน " + fail + " ข้อ");
  console.log("=".repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
