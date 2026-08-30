/* ==========================================================================
   hand-frame.js — ระบบพิกัดมือ และการสกัดฟีเจอร์
   --------------------------------------------------------------------------
   หัวใจของการแก้ปัญหา "แค่มือเข้ากล้องก็ขึ้นว่าถูก"

   ปัญหาของโค้ดเดิม: วัดระยะเป็นสัดส่วนของ "ทั้งเฟรม" เช่น < 0.07
   พอยืนไกลกล้อง มือเล็กลง ทุกจุดบนมืออยู่ห่างกันไม่ถึง 0.07 หมด
   → เงื่อนไข "โป้งจิ้มชี้" กลายเป็นจริงตลอดเวลา

   วิธีแก้: แปลงทุกอย่างเข้าสู่ "ระบบพิกัดของมือเอง" ก่อน
     - หารด้วยขนาดมือ  → ยืนใกล้/ไกล ได้ค่าเท่ากัน
     - หมุนตามแนวฝ่ามือ → เอียงมือ/หันมือ ได้ค่าเท่ากัน
     - มือซ้ายพลิกเป็นมือขวา → เขียนกฎชุดเดียวใช้ได้ทั้งสองมือ
   ========================================================================== */

/* ดัชนีจุด landmark ของ MediaPipe Hands (21 จุด)
   0 = ข้อมือ
   1-4   โป้ง  (CMC, MCP, IP, TIP)
   5-8   ชี้   (MCP, PIP, DIP, TIP)
   9-12  กลาง
   13-16 นาง
   17-20 ก้อย                                                            */
const LM = {
  WRIST: 0,
  THUMB: { cmc: 1, mcp: 2, ip: 3, tip: 4 },
  INDEX: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  MIDDLE: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  RING: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  PINKY: { mcp: 17, pip: 18, dip: 19, tip: 20 }
};

const FINGER_NAMES = ["thumb", "index", "middle", "ring", "pinky"];

const FINGER_CHAIN = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20]
};

/* ---------- คณิตศาสตร์เวกเตอร์พื้นฐาน ---------- */
const V = {
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  scale: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  len: (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
  cross: (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }),
  norm: (a) => {
    const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    return l < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
  },
  dist: (a, b) => {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
};

/* คืนค่า 0..1 แบบนุ่มนวล ใช้แทนการตัดสินแบบ true/false แข็งๆ
   value <= a → 0,  value >= b → 1,  ระหว่างนั้นไล่ระดับ                */
function ramp(value, a, b) {
  if (b === a) return value >= b ? 1 : 0;
  const t = (value - a) / (b - a);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* คะแนนสูงสุดเมื่อ value อยู่ใกล้ target, ลดลงเมื่อห่างออกไป */
function near(value, target, tolerance) {
  const d = Math.abs(value - target) / tolerance;
  return d >= 1 ? 0 : 1 - d;
}

/* ==========================================================================
   buildHandFrame — แปลง landmark ดิบ เป็นฟีเจอร์ที่กฎตรวจจับใช้งานได้
   --------------------------------------------------------------------------
   rawLandmarks : array 21 จุด จาก MediaPipe (x,y ในช่วง 0..1)
   handedness   : 'Left' | 'Right' ตามที่ MediaPipe รายงาน
   opts         : { aspect, mirrorInput }
   คืนค่า null ถ้าข้อมูลใช้ไม่ได้
   ========================================================================== */
function buildHandFrame(rawLandmarks, handedness, opts) {
  if (!rawLandmarks || rawLandmarks.length < 21) return null;

  const aspect = (opts && opts.aspect) || 4 / 3;
  const mirrorInput = opts ? opts.mirrorInput !== false : true;

  /* --- ขั้นที่ 1: พลิกภาพให้ตรงกับที่ผู้ใช้เห็น -------------------------
     วิดีโอถูกพลิกด้วย CSS transform: scaleX(-1) เหมือนส่องกระจก
     แต่ landmark ยังเป็นพิกัดกล้องจริง → ต้องพลิกให้ตรงกัน
     (นี่คือบั๊กซ้าย-ขวาสลับของโค้ดเดิม)                                 */
  const flipped = rawLandmarks.map((p) => ({
    x: mirrorInput ? 1 - p.x : p.x,
    y: p.y,
    z: p.z || 0
  }));

  /* MediaPipe ระบุซ้าย/ขวาโดยสมมติว่าภาพถูกพลิกแบบกระจกแล้ว
     เมื่อเราพลิกพิกัดเอง ป้ายกำกับจึงต้องสลับตาม                        */
  let userHand = handedness === "Left" ? "left" : "right";
  if (mirrorInput) userHand = userHand === "left" ? "right" : "left";

  /* --- ขั้นที่ 2: ชดเชยอัตราส่วนภาพ -----------------------------------
     x ถูก normalize ด้วยความกว้าง, y ด้วยความสูง
     ถ้าไม่ชดเชย ระยะทางแนวนอนกับแนวตั้งจะเทียบกันไม่ได้ (บิดเบี้ยว 4:3) */
  const cam = flipped.map((p) => ({
    x: p.x * aspect,
    y: p.y,
    z: p.z * aspect
  }));

  const wrist = cam[LM.WRIST];
  const midMcp = cam[LM.MIDDLE.mcp];

  /* --- ขั้นที่ 3: ขนาดมือ = ระยะข้อมือ → โคนนิ้วกลาง --------------------
     ทุกระยะทางหลังจากนี้จะหารด้วยค่านี้
     ยืนใกล้หรือไกลกล้อง ก็ได้ตัวเลขเดียวกัน                             */
  const scale = V.dist(wrist, midMcp);
  if (scale < 1e-6) return null;

  /* --- ขั้นที่ 4: เลื่อนจุดกำเนิดไปที่ข้อมือ + หารด้วยขนาดมือ ----------- */
  let pts = cam.map((p) => V.scale(V.sub(p, wrist), 1 / scale));

  /* --- ขั้นที่ 5: ทิศทางในพิกัดกล้อง (ก่อนพลิกมือซ้าย) ------------------
     ใช้ตอบคำถามว่า "นิ้วชี้ขึ้นหรือชี้ลง" "ฝ่ามือหันเข้าหรือหันออก"
     ซึ่งเป็นตัวแยก ASL ตัว P กับ K และ Q กับ G                          */
  const pointDir = V.norm(pts[LM.MIDDLE.mcp]);
  const acrossCam = V.norm(V.sub(pts[LM.INDEX.mcp], pts[LM.PINKY.mcp]));
  let palmNormalCam = V.norm(V.cross(pointDir, acrossCam));
  if (userHand === "left") palmNormalCam = V.scale(palmNormalCam, -1);

  /* --- ขั้นที่ 6: พลิกมือซ้ายให้เป็นมือขวา -----------------------------
     ทำให้เขียนกฎตรวจจับชุดเดียว ใช้ได้ทั้งสองมือ ไม่ต้องเขียนซ้ำ         */
  if (userHand === "left") {
    pts = pts.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  }

  /* --- ขั้นที่ 7: สร้างระบบพิกัดของฝ่ามือ แล้วหมุนทุกจุดเข้าไป ----------
     หลังขั้นนี้ ไม่ว่าจะเอียงมือหรือหมุนมือยังไง ค่าที่ได้จะเหมือนเดิม
     +y = ไปทางปลายนิ้ว   +x = ไปทางนิ้วโป้ง   +z = ทิศที่ฝ่ามือหันไป     */
  const yAxis = V.norm(pts[LM.MIDDLE.mcp]);
  const across = V.norm(V.sub(pts[LM.INDEX.mcp], pts[LM.PINKY.mcp]));
  const zAxis = V.norm(V.cross(yAxis, across));
  const xAxis = V.norm(V.cross(zAxis, yAxis));

  const P = pts.map((p) => ({
    x: V.dot(p, xAxis),
    y: V.dot(p, yAxis),
    z: V.dot(p, zAxis)
  }));

  /* --- ขั้นที่ 8: สถานะของแต่ละนิ้ว -----------------------------------
     วัดจาก "ความตรง" = ระยะปลายนิ้วถึงโคนนิ้ว ÷ ความยาวนิ้วจริง
     นิ้วเหยียดตรง ≈ 1.00   นิ้วพับสุด ≈ 0.35
     วิธีนี้ไม่สนใจว่ามือจะหันทางไหน ต่างจากโค้ดเดิมที่เทียบแกน y ตรงๆ   */
  const fingers = {};
  for (const name of FINGER_NAMES) {
    const [a, b, c, d] = FINGER_CHAIN[name];
    const chainLen =
      V.dist(P[a], P[b]) + V.dist(P[b], P[c]) + V.dist(P[c], P[d]);
    const straightness = chainLen < 1e-6 ? 0 : V.dist(P[a], P[d]) / chainLen;

    const isThumb = name === "thumb";
    const hi = isThumb ? CONFIG.finger.thumbExtendedAbove : CONFIG.finger.extendedAbove;
    const lo = isThumb ? CONFIG.finger.thumbFoldedBelow : CONFIG.finger.foldedBelow;

    /* สามสถานะ ไม่ใช่สองสถานะ
       ช่วงกลางคือ "ไม่แน่ใจ" ระบบจะไม่ตัดสิน — นี่คือสิ่งที่โค้ดเดิมไม่มี
       โค้ดเดิมใช้ isDown = !isUp ทำให้ค่าที่ต่างกัน 0.0001 ก็ตัดสินแล้ว */
    let state = "uncertain";
    if (straightness >= hi) state = "extended";
    else if (straightness <= lo) state = "folded";

    fingers[name] = {
      state,
      straightness,
      /* คะแนนแบบต่อเนื่อง 0..1 ใช้ให้คะแนนแทนการตอบ true/false */
      extendedScore: ramp(straightness, lo, hi),
      foldedScore: 1 - ramp(straightness, lo, hi),
      tip: P[d],
      mcp: P[a],
      dir: V.norm(V.sub(P[d], P[a]))
    };
  }

  /* --- ขั้นที่ 9: เกณฑ์คุณภาพ ------------------------------------------ */
  const m = CONFIG.quality.edgeMargin;
  let outOfBounds = 0;
  for (const p of flipped) {
    if (p.x < m || p.x > 1 - m || p.y < m || p.y > 1 - m) outOfBounds++;
  }

  /* ตำแหน่งมือในภาพ (พลิกและชดเชยอัตราส่วนแล้ว)
     ใช้สำหรับตรวจท่าที่มีการเคลื่อนไหว ซึ่งต้องรู้ว่ามือเดินทางไปทางไหน */
  const palmCenter = {
    x: (cam[LM.WRIST].x + cam[LM.INDEX.mcp].x + cam[LM.PINKY.mcp].x) / 3,
    y: (cam[LM.WRIST].y + cam[LM.INDEX.mcp].y + cam[LM.PINKY.mcp].y) / 3,
    z: (cam[LM.WRIST].z + cam[LM.INDEX.mcp].z + cam[LM.PINKY.mcp].z) / 3
  };

  const frame = {
    /* ข้อมูลดิบและพื้นฐาน */
    raw: rawLandmarks,
    pts: P,                    // 21 จุด ในพิกัดฝ่ามือ หารด้วยขนาดมือแล้ว
    scale,                     // ขนาดมือเทียบกับความสูงเฟรม
    hand: userHand,            // 'left' | 'right' ตามมือจริงของผู้ใช้
    fingers,
    outOfBounds,
    worldWrist: cam[LM.WRIST], // ตำแหน่งข้อมือในภาพ
    palmCenter,                // จุดกึ่งกลางฝ่ามือในภาพ

    /* ทิศทางในพิกัดกล้อง (y ยิ่งน้อยยิ่งอยู่สูง) */
    pointDir,                  // นิ้วชี้ไปทางไหนในภาพ
    palmNormal: palmNormalCam, // ฝ่ามือหันไปทางไหน

    /* ---- ตัวช่วยสำหรับเขียนกฎ ---- */

    /* ระยะระหว่างจุดสองจุด หน่วยเป็น "เท่าของขนาดมือ" */
    d(i, j) {
      return V.dist(P[i], P[j]);
    },

    /* ปลายนิ้วสองนิ้วแตะกันไหม (0..1) */
    touch(i, j, tol) {
      return 1 - ramp(V.dist(P[i], P[j]), tol || 0.28, (tol || 0.28) * 2.2);
    },

    /* นิ้วเหยียดหรือพับ คืนคะแนน 0..1 ไม่ใช่ true/false */
    up(name) {
      return fingers[name].extendedScore;
    },
    down(name) {
      return fingers[name].foldedScore;
    },

    /* ทิศที่ปลายนิ้วชี้ไป ในพิกัดกล้อง */
    pointsUp() {
      return ramp(-pointDir.y, 0.35, 0.75);
    },
    pointsDown() {
      return ramp(pointDir.y, 0.35, 0.75);
    },
    pointsSideways() {
      return ramp(Math.abs(pointDir.x), 0.45, 0.8);
    },

    /* ฝ่ามือหันเข้าหากล้อง หรือหันออก
       หมายเหตุ: ค่า z ของ MediaPipe มีความคลาดเคลื่อนสูง
       จึงใช้เป็น "คะแนนเสริม" เท่านั้น ไม่ใช้เป็นเงื่อนไขตัดสินเด็ดขาด  */
    palmFacesCamera() {
      return ramp(-palmNormalCam.z, 0.05, 0.5);
    },
    palmFacesAway() {
      return ramp(palmNormalCam.z, 0.05, 0.5);
    },

    /* ระยะห่างระหว่างนิ้วสองนิ้วที่กางออก (ใช้แยก U กับ V) */
    spread(a, b) {
      const fa = fingers[a], fb = fingers[b];
      return V.dist(fa.tip, fb.tip);
    }
  };

  return frame;
}

/* ==========================================================================
   checkQuality — ปฏิเสธเฟรมที่เชื่อถือไม่ได้ ก่อนจะเอาไปตัดสินท่า
   --------------------------------------------------------------------------
   นี่คือด่านที่โค้ดเดิมไม่มีเลย ทำให้เฟรมที่มือเบลอ/ไกลเกินไป/หลุดขอบ
   ถูกเอาไปตัดสินท่าด้วย ทั้งที่พิกัดยังเชื่อถือไม่ได้
   ========================================================================== */
function checkQuality(frame, handednessScore) {
  if (!frame) return { ok: false, reason: "ไม่พบมือในภาพ" };

  const q = CONFIG.quality;

  if (frame.scale < q.minHandScale) {
    return { ok: false, reason: "มืออยู่ไกลกล้องเกินไป ลองขยับเข้ามาใกล้ขึ้น" };
  }
  if (frame.scale > q.maxHandScale) {
    return { ok: false, reason: "มืออยู่ใกล้กล้องเกินไป ลองถอยออกไปหน่อย" };
  }
  if (frame.outOfBounds > q.maxOutOfBounds) {
    return { ok: false, reason: "มือหลุดออกนอกกรอบภาพ ขยับมือเข้ามากลางจอ" };
  }
  if (handednessScore !== undefined && handednessScore < q.minHandednessScore) {
    return { ok: false, reason: "ภาพไม่ชัดพอ ลองเพิ่มแสงหรือเปลี่ยนพื้นหลัง" };
  }

  return { ok: true, reason: null };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LM, V, ramp, near, buildHandFrame, checkQuality, FINGER_NAMES };
}
