/* ==========================================================================
   engine.test.js — ชุดทดสอบเครื่องยนต์ตรวจจับ
   --------------------------------------------------------------------------
   รันด้วย:  node test/engine.test.js
   ไม่ต้องลงไลบรารีอะไรเพิ่ม ใช้ Node ล้วนๆ

   ทดสอบอะไรบ้าง:
     1. ไฟล์ทุกไฟล์เขียนถูกไวยากรณ์
     2. ค่าที่วัดได้ไม่เปลี่ยนเมื่อมืออยู่ใกล้หรือไกลกล้อง  ← บั๊กหลักของโค้ดเดิม
     3. ค่าที่วัดได้ไม่เปลี่ยนเมื่อเอียงมือ                ← บั๊กเรื่องเทียบแกน y
     4. มือซ้ายกับมือขวาให้ค่าเดียวกัน
     5. เฟรมเดียวไม่ทำให้ผ่าน ต้องค้างท่าจริง            ← บั๊กเฟรมเดียวก็ผ่าน
     6. ด่านคุณภาพปฏิเสธมือที่ไกลหรือใกล้เกินไป
     7. คลังท่าไม่มี id ซ้ำ และทุกท่าเขียนครบถ้วน
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const FILES = [
  "js/config.js",
  "js/hand-frame.js",
  "js/detection-engine.js",
  "js/hand-diagram.js",
  "js/vocab-asl.js",
  "js/vocab-thsl.js"
];

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log("  ok    " + name);
  } else {
    fail++;
    failures.push(name + (detail ? "  → " + detail : ""));
    console.log("  FAIL  " + name + (detail ? "  → " + detail : ""));
  }
}

function section(t) {
  console.log("\n" + t);
  console.log("-".repeat(t.length));
}

/* ==========================================================================
   1. โหลดไฟล์ทั้งหมดเข้า context เดียวกัน (เหมือนที่เบราว์เซอร์ทำ)
   ========================================================================== */
section("1. ไวยากรณ์และการโหลดไฟล์");

const ctx = vm.createContext({ console, Math, Date, JSON, isFinite, Number, Array, Object, String });

for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  try {
    vm.runInContext(src, ctx, { filename: rel });
    check("โหลด " + rel, true);
  } catch (e) {
    check("โหลด " + rel, false, e.message);
  }
}

if (fail > 0) {
  console.log("\nโหลดไฟล์ไม่ผ่าน หยุดการทดสอบ");
  process.exit(1);
}

/* ตัวแปรที่ประกาศด้วย const/class ไม่ได้กลายเป็น property ของ global โดยอัตโนมัติ
   จึงต้องดึงออกมาให้สคริปต์ทดสอบเข้าถึงได้ */
vm.runInContext(
  "globalThis.CONFIG = CONFIG;" +
  "globalThis.SignDetector = SignDetector;" +
  "globalThis.ASL_VOCABULARY = ASL_VOCABULARY;" +
  "globalThis.ASL_ALPHABET = ASL_ALPHABET;" +
  "globalThis.ASL_NUMBERS = ASL_NUMBERS;" +
  "globalThis.THSL_VOCABULARY = THSL_VOCABULARY;" +
  "globalThis.THSL_ENTRIES = THSL_ENTRIES;" +
  "globalThis.FINGER_NAMES = FINGER_NAMES;" +
  "globalThis.LM = LM;" +
  "globalThis.scoreSign = scoreSign;",
  ctx, { filename: "expose.js" }
);

/* ==========================================================================
   2. เครื่องสร้างมือจำลอง
   --------------------------------------------------------------------------
   สร้างพิกัด landmark 21 จุดจากค่า "ความงอ" ของแต่ละนิ้ว
   แล้วแปลงเข้าสู่พิกัดภาพ โดยกำหนดขนาด ตำแหน่ง และมุมเอียงได้
   ใช้พิสูจน์ว่าเครื่องยนต์ให้ค่าเดิมไม่ว่ามือจะใกล้ ไกล หรือเอียง
   ========================================================================== */
section("2. สร้างมือจำลอง");

const MCP = {
  thumb:  [0.30, 0.15, 0.02],
  index:  [0.42, 0.93, 0],
  middle: [0.00, 1.00, 0],
  ring:   [-0.30, 0.92, 0],
  pinky:  [-0.55, 0.80, 0]
};
const SEG = {
  thumb:  [0.32, 0.30, 0.26],
  index:  [0.50, 0.30, 0.24],
  middle: [0.55, 0.33, 0.26],
  ring:   [0.50, 0.31, 0.24],
  pinky:  [0.40, 0.24, 0.20]
};
const SPREAD = { thumb: 1.15, index: 0.16, middle: 0.0, ring: -0.14, pinky: -0.30 };

/* นิ้วโป้งมีโครงสร้างต่างจากนิ้วอื่น พับแล้วจะเคลื่อนเข้าหากลางฝ่ามือ
   ไม่ใช่แค่งอลงตรงๆ จึงจำลองด้วยการไล่ระดับระหว่างท่ากางสุดกับท่าพับสุด */
const THUMB_OPEN   = [[0.30,0.15,0.02],[0.60,0.40,0.02],[0.85,0.68,0.02],[1.05,0.92,0.02]];
const THUMB_FOLDED = [[0.30,0.15,0.02],[0.52,0.42,0.12],[0.46,0.74,0.30],[0.22,0.88,0.38]];

function buildThumb(curl) {
  const t = Math.max(0, Math.min(1, curl));
  return THUMB_OPEN.map((p, i) =>
    p.map((v, k) => v + (THUMB_FOLDED[i][k] - v) * t));
}

/* curl 0 = เหยียดตรง, 1 = พับสุด */
function buildFinger(name, curl) {
  if (name === "thumb") return buildThumb(curl);
  const [bx, by, bz] = MCP[name];
  const segs = SEG[name];
  const lean = SPREAD[name];

  /* ทิศเริ่มต้นของนิ้ว: ชี้ขึ้น (+Y) เอียงออกด้านข้างเล็กน้อย */
  let dir = { x: lean, y: 1, z: 0 };
  const L = Math.hypot(dir.x, dir.y, dir.z);
  dir = { x: dir.x / L, y: dir.y / L, z: dir.z / L };

  /* นิ้วโป้งกางออกด้านข้างมากกว่านิ้วอื่น */
  if (name === "thumb") dir = { x: 0.82, y: 0.57, z: 0 };

  const angles = [curl * 1.40, curl * 1.75, curl * 1.20]; // เรเดียน
  const out = [[bx, by, bz]];

  let p = { x: bx, y: by, z: bz };
  let acc = 0;

  for (let i = 0; i < 3; i++) {
    acc += angles[i];
    /* หมุนทิศของนิ้วให้โค้งเข้าหาฝ่ามือ (ไปทาง +Z) */
    const c = Math.cos(acc), s = Math.sin(acc);
    const d = {
      x: dir.x,
      y: dir.y * c - dir.z * s,
      z: dir.y * s + dir.z * c
    };
    p = { x: p.x + d.x * segs[i], y: p.y + d.y * segs[i], z: p.z + d.z * segs[i] };
    out.push([p.x, p.y, p.z]);
  }
  return out;
}

/* curls = {thumb, index, middle, ring, pinky} ค่า 0..1
   opts  = { scale, cx, cy, rollDeg, aspect, mirror }                        */
function makeHand(curls, opts) {
  const o = Object.assign(
    { scale: 0.16, cx: 0.5, cy: 0.5, rollDeg: 0, aspect: 4 / 3, mirror: false },
    opts || {}
  );

  const chains = {
    thumb: buildFinger("thumb", curls.thumb),
    index: buildFinger("index", curls.index),
    middle: buildFinger("middle", curls.middle),
    ring: buildFinger("ring", curls.ring),
    pinky: buildFinger("pinky", curls.pinky)
  };

  /* เรียงตามลำดับ landmark ของ MediaPipe: 0 ข้อมือ แล้ว 4 จุดต่อนิ้ว */
  const handSpace = [[0, 0, 0]];
  ["thumb", "index", "middle", "ring", "pinky"].forEach((n) => {
    chains[n].forEach((p) => handSpace.push(p));
  });

  const th = (o.rollDeg * Math.PI) / 180;
  const cs = Math.cos(th), sn = Math.sin(th);

  return handSpace.map(([X, Y, Z]) => {
    /* หมุนรอบแกนกล้อง (เอียงมือ) */
    const rx = X * cs - Y * sn;
    const ry = X * sn + Y * cs;

    /* แปลงเป็นพิกัดภาพ: y ในภาพเพิ่มลงล่าง จึงต้องกลับเครื่องหมาย
       และ x ต้องหารด้วย aspect เพราะ buildHandFrame จะคูณกลับ */
    let x = o.cx + (rx * o.scale) / o.aspect;
    const y = o.cy - ry * o.scale;
    const z = (Z * o.scale) / o.aspect;

    if (o.mirror) x = 1 - x;
    return { x, y, z };
  });
}

const OPEN  = { thumb: 0.05, index: 0.02, middle: 0.02, ring: 0.02, pinky: 0.02 };
const FIST  = { thumb: 0.85, index: 0.95, middle: 0.95, ring: 0.95, pinky: 0.95 };
const POINT = { thumb: 0.85, index: 0.02, middle: 0.95, ring: 0.95, pinky: 0.95 };

function frameOf(curls, opts) {
  const lms = makeHand(curls, opts);
  return ctx.buildHandFrame(lms, "Right", {
    aspect: 4 / 3,
    mirrorInput: (opts && opts.mirror) || false
  });
}

const base = frameOf(OPEN, {});
check("สร้างมือจำลองได้", base !== null);
check("นิ้วเหยียดได้ค่าความตรงใกล้ 1.0",
  base.fingers.index.straightness > 0.95,
  "ได้ " + base.fingers.index.straightness.toFixed(3));

const fistFrame = frameOf(FIST, {});
check("นิ้วพับได้ค่าความตรงต่ำกว่าเกณฑ์พับ",
  fistFrame.fingers.index.straightness < ctx.CONFIG.finger.foldedBelow,
  "ได้ " + fistFrame.fingers.index.straightness.toFixed(3));

check("มือเปิด: ทุกนิ้วอ่านว่า extended",
  ["index", "middle", "ring", "pinky"].every((n) => base.fingers[n].state === "extended"));
check("กำปั้น: ทุกนิ้วอ่านว่า folded",
  ["index", "middle", "ring", "pinky"].every((n) => fistFrame.fingers[n].state === "folded"));

/* ==========================================================================
   3. ค่าคงที่ไม่ว่าจะใกล้หรือไกลกล้อง  ← นี่คือบั๊กหลักของโค้ดเดิม
   ========================================================================== */
section("3. ยืนใกล้หรือไกลกล้อง ต้องได้ค่าเท่ากัน");

const near_ = frameOf(POINT, { scale: 0.28 });   // มือใกล้กล้อง มือใหญ่
const far_  = frameOf(POINT, { scale: 0.09 });   // มือไกลกล้อง มือเล็ก

check("ขนาดมือที่วัดได้ต่างกันจริง (การทดสอบมีความหมาย)",
  near_.scale / far_.scale > 2.5,
  "ใกล้ " + near_.scale.toFixed(3) + " / ไกล " + far_.scale.toFixed(3));

for (const n of ["thumb", "index", "middle", "ring", "pinky"]) {
  const d = Math.abs(near_.fingers[n].straightness - far_.fingers[n].straightness);
  check("นิ้ว" + n + ": ค่าความตรงไม่เปลี่ยนตามระยะ", d < 0.02, "ต่างกัน " + d.toFixed(4));
}

const dThumbNear = near_.d(4, 8);
const dThumbFar = far_.d(4, 8);
check("ระยะโป้ง-ชี้ ไม่เปลี่ยนตามระยะห่างจากกล้อง",
  Math.abs(dThumbNear - dThumbFar) < 0.03,
  "ใกล้ " + dThumbNear.toFixed(3) + " / ไกล " + dThumbFar.toFixed(3));

/* จำลองบั๊กเดิมโดยตรง
   โค้ดเดิมเช็คว่า "โป้งจิ้มนิ้วชี้" ด้วยระยะในพิกัดภาพดิบ < 0.07
   ซึ่งเป็นสัดส่วนของ "ทั้งเฟรม" ไม่ใช่ของ "มือ"
   ผลคือคำตอบเปลี่ยนไปตามระยะห่างจากกล้อง ทั้งที่ทำท่าเดียวกันเป๊ะ */
function oldIsPinching(lms) {
  return Math.hypot(lms[4].x - lms[8].x, lms[4].y - lms[8].y) < 0.07;
}

const HALF = { thumb: 0.45, index: 0.45, middle: 0.45, ring: 0.45, pinky: 0.45 };
const nearRaw = makeHand(HALF, { scale: 0.28 });
const farRaw  = makeHand(HALF, { scale: 0.09 });

check("โค้ดเดิม: ท่าเดียวกันให้คำตอบต่างกันเมื่อเปลี่ยนระยะ (ยืนยันว่าบั๊กมีจริง)",
  oldIsPinching(nearRaw) !== oldIsPinching(farRaw),
  "ใกล้=" + oldIsPinching(nearRaw) + " ไกล=" + oldIsPinching(farRaw));

const nearNew = frameOf(HALF, { scale: 0.28 }).touch(4, 8, 0.30);
const farNew  = frameOf(HALF, { scale: 0.09 }).touch(4, 8, 0.30);
check("โค้ดใหม่: ท่าเดียวกันให้คำตอบเท่ากันทุกระยะ",
  Math.abs(nearNew - farNew) < 0.02,
  "ใกล้ " + nearNew.toFixed(3) + " / ไกล " + farNew.toFixed(3));

/* ==========================================================================
   4. เอียงมือแล้วค่าต้องไม่เปลี่ยน  ← บั๊กเรื่องเทียบแกน y ตรงๆ
   ========================================================================== */
section("4. เอียงมือ ต้องได้ค่าเท่ากัน");

const upright = frameOf(POINT, { rollDeg: 0 });
const tilted = frameOf(POINT, { rollDeg: 55 });

for (const n of ["index", "middle", "ring", "pinky"]) {
  const d = Math.abs(upright.fingers[n].straightness - tilted.fingers[n].straightness);
  check("นิ้ว" + n + ": เอียงมือ 55 องศาแล้วค่าไม่เปลี่ยน", d < 0.02, "ต่างกัน " + d.toFixed(4));
}
check("เอียงมือแล้วสถานะนิ้วยังเหมือนเดิม",
  ["index", "middle", "ring", "pinky"]
    .every((n) => upright.fingers[n].state === tilted.fingers[n].state));

/* โค้ดเดิมเทียบ tip.y < pip.y ตรงๆ พอเอียงมือมากก็อ่านผิด */
const tiltedRaw = makeHand(POINT, { rollDeg: 100 });
const oldSaysIndexUp = tiltedRaw[8].y < tiltedRaw[6].y;
const newFrame = frameOf(POINT, { rollDeg: 100 });
check("โค้ดใหม่ยังอ่านนิ้วชี้ถูกแม้พลิกมือ 100 องศา",
  newFrame.fingers.index.state === "extended",
  "โค้ดเดิมอ่านว่า " + (oldSaysIndexUp ? "เหยียด" : "พับ") + " (ค่าจริงคือเหยียด)");

/* ==========================================================================
   5. มือซ้ายกับมือขวาต้องให้ค่าเดียวกัน
   ========================================================================== */
section("5. มือซ้ายและมือขวา");

const rightHand = ctx.buildHandFrame(makeHand(POINT, {}), "Right",
  { aspect: 4 / 3, mirrorInput: false });
const leftLms = makeHand(POINT, {}).map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
const leftHand = ctx.buildHandFrame(leftLms, "Left", { aspect: 4 / 3, mirrorInput: false });

check("ระบุมือขวาถูก", rightHand.hand === "right");
check("ระบุมือซ้ายถูก", leftHand.hand === "left");

for (const n of ["index", "middle", "ring", "pinky"]) {
  const d = Math.abs(rightHand.fingers[n].straightness - leftHand.fingers[n].straightness);
  check("นิ้ว" + n + ": มือซ้ายให้ค่าเท่ามือขวา", d < 0.03, "ต่างกัน " + d.toFixed(4));
}
check("ปลายโป้งอยู่ฝั่งเดียวกันหลังปรับให้เป็นมือขวาแล้ว",
  Math.sign(rightHand.pts[4].x) === Math.sign(leftHand.pts[4].x),
  "ขวา " + rightHand.pts[4].x.toFixed(2) + " / ซ้าย " + leftHand.pts[4].x.toFixed(2));

/* ==========================================================================
   6. ด่านคุณภาพ
   ========================================================================== */
section("6. ด่านคุณภาพของภาพ");

check("ปฏิเสธมือที่ไกลเกินไป",
  ctx.checkQuality(frameOf(OPEN, { scale: 0.04 }), 1).ok === false);
check("ปฏิเสธมือที่ใกล้เกินไป",
  ctx.checkQuality(frameOf(OPEN, { scale: 0.50 }), 1).ok === false);
check("ปฏิเสธเมื่อความมั่นใจซ้าย/ขวาต่ำ",
  ctx.checkQuality(frameOf(OPEN, {}), 0.4).ok === false);
check("ยอมรับมือที่อยู่ในระยะเหมาะสม",
  ctx.checkQuality(frameOf(OPEN, { scale: 0.18 }), 0.95).ok === true,
  ctx.checkQuality(frameOf(OPEN, { scale: 0.18 }), 0.95).reason || "");
check("ปฏิเสธเมื่อมือหลุดขอบภาพ",
  ctx.checkQuality(frameOf(OPEN, { scale: 0.20, cx: 0.02, cy: 0.05 }), 1).ok === false);

/* ==========================================================================
   7. ต้องค้างท่า ไม่ใช่เฟรมเดียวก็ผ่าน  ← บั๊กสำคัญของโค้ดเดิม
   ========================================================================== */
section("7. การบังคับให้ค้างท่า");

function runFrames(detector, curls, count, opts) {
  let last = null;
  let passedAt = -1;
  for (let i = 0; i < count; i++) {
    const f = frameOf(curls, opts);
    last = detector.update([{ frame: f, score: 0.98 }], 1000000 + i * 33);
    if (last.passed && passedAt < 0) passedAt = i;
  }
  return { last, passedAt };
}

const det = new ctx.SignDetector();
det.setVocabulary(ctx.ASL_VOCABULARY);

/* ใช้ท่า "เลข 5" (กางห้านิ้วสุด) เป็นท่าทดสอบ เพราะแยกจากท่าอื่นได้ชัดเจนที่สุด
   ไม่ต้องพึ่งตำแหน่งนิ้วโป้งที่มือจำลองยังจำลองได้ไม่แม่นเท่ามือจริง */
det.setTarget("asl-5");

const oneFrame = runFrames(det, OPEN, 1, {});
check("เฟรมเดียวต้องไม่ผ่าน", oneFrame.last.passed === false,
  "สถานะ " + oneFrame.last.status);

det.reset();
const fewFrames = runFrames(det, OPEN, 8, {});
check("8 เฟรม (ราว 0.27 วินาที) ยังไม่ผ่าน", fewFrames.passedAt === -1);

det.reset();
const heldLong = runFrames(det, OPEN, 30, {});
check("ค้างครบ 30 เฟรม (ราว 1 วินาที) จึงผ่าน", heldLong.passedAt >= 0,
  "สถานะสุดท้าย " + heldLong.last.status + " คะแนน " + heldLong.last.score.toFixed(3));
check("จำนวนเฟรมที่ต้องใช้ตรงกับที่ตั้งไว้ใน config",
  heldLong.passedAt >= ctx.CONFIG.detection.holdFrames - 1,
  "ผ่านที่เฟรมที่ " + heldLong.passedAt);

/* ทำท่าอื่นขณะเป้าหมายคือเลข 5 ต้องไม่ผ่าน */
det.reset();
det.setTarget("asl-5");
const wrongPose = runFrames(det, FIST, 30, {});
check("ทำกำปั้นขณะเป้าหมายคือเลข 5 ต้องไม่ผ่าน", wrongPose.passedAt === -1,
  "คะแนนที่ได้ " + wrongPose.last.score.toFixed(3));

det.reset();
det.setTarget("asl-5");
const pointPose = runFrames(det, POINT, 30, {});
check("ชูนิ้วชี้ขณะเป้าหมายคือเลข 5 ต้องไม่ผ่าน", pointPose.passedAt === -1,
  "คะแนนที่ได้ " + pointPose.last.score.toFixed(3));

/* cooldown: หลังผ่านแล้วต้องไม่ผ่านซ้ำทันที */
det.reset();
det.setTarget("asl-5");
runFrames(det, OPEN, 30, {});
const immediate = det.update([{ frame: frameOf(OPEN, {}), score: 0.98 }], 1000000 + 30 * 33);
check("หลังผ่านแล้วต้องมีช่วงพักก่อนตรวจท่าถัดไป",
  immediate.passed === false && immediate.status === "cooldown",
  "สถานะ " + immediate.status);

/* มือสั่นแรงต้องไม่ผ่าน */
det.reset();
det.setTarget("asl-5");
let shakyPassed = false;
for (let i = 0; i < 40; i++) {
  const wobble = {
    thumb: OPEN.thumb, index: 0.02 + (i % 2) * 0.30,
    middle: OPEN.middle, ring: OPEN.ring, pinky: OPEN.pinky
  };
  const r = det.update([{ frame: frameOf(wobble, {}), score: 0.98 }], 2000000 + i * 33);
  if (r.passed) shakyPassed = true;
}
check("มือที่ขยับไปมาตลอดต้องไม่ผ่าน", shakyPassed === false);

/* ท่าที่ต้องมีการเคลื่อนไหว ต้องไม่ผ่านด้วยการอยู่นิ่งๆ */
det.reset();
det.setTarget("asl-z");
const staticZ = runFrames(det, POINT, 40, {});
check("ตัว Z ต้องไม่ผ่านถ้าไม่มีการเคลื่อนไหว", staticZ.passedAt === -1,
  "สถานะ " + staticZ.last.status);

/* ทิศทางของมือต้องมีผลจริง: ชูมือขึ้นต้องไม่ถูกอ่านเป็นตัว P หรือ Q */
det.reset();
const upFrame = frameOf(POINT, {});
const allScores = ctx.ASL_VOCABULARY
  .map((v) => ({ label: v.label, s: ctx.scoreSign(v, { primary: upFrame, secondary: null, trail: [] }).score }))
  .sort((a, b) => b.s - a.s);
const pq = allScores.filter((x) => x.label === "P" || x.label === "Q");
check("ชูนิ้วขึ้น ต้องไม่ได้คะแนนสูงสำหรับตัว P และ Q (ซึ่งต้องคว่ำมือลง)",
  pq.every((x) => x.s < ctx.CONFIG.detection.minScore),
  pq.map((x) => x.label + "=" + x.s.toFixed(2)).join(" "));

/* ==========================================================================
   8. ความถูกต้องของคลังท่า
   ========================================================================== */
section("8. ตรวจคลังท่า");

const vocab = ctx.ASL_VOCABULARY;
check("มีท่าทั้งหมด 36 ท่า (A-Z และ 0-9)", vocab.length === 36, "พบ " + vocab.length);

const ids = vocab.map((v) => v.id);
check("ไม่มี id ซ้ำกัน", new Set(ids).size === ids.length);

const labels = vocab.map((v) => v.label);
check("ไม่มี label ซ้ำกัน", new Set(labels).size === labels.length);

let missing = [];
for (const v of vocab) {
  if (!v.instruction || v.instruction.length < 10) missing.push(v.label + ":คำอธิบาย");
  if (!v.checks || v.checks.length < 2) missing.push(v.label + ":เงื่อนไข");
  if (!v.shape || v.shape.length !== 5) missing.push(v.label + ":แผนผัง");
  for (const c of (v.checks || [])) {
    if (typeof c.test !== "function") missing.push(v.label + ":test");
    if (!c.hint) missing.push(v.label + ":คำแนะนำ(" + c.name + ")");
  }
}
check("ทุกท่ามีคำอธิบาย เงื่อนไข แผนผัง และคำแนะนำครบ",
  missing.length === 0, missing.slice(0, 5).join(", "));

const motionSigns = vocab.filter((v) => v.motion);
check("ท่าที่มีการเคลื่อนไหวคือ J และ Z",
  motionSigns.length === 2 && motionSigns.every((v) => ["J", "Z"].includes(v.label)),
  motionSigns.map((v) => v.label).join(","));
check("ท่าที่มีการเคลื่อนไหวมีเส้นทางต้นแบบครบ",
  motionSigns.every((v) => Array.isArray(v.motion.path) && v.motion.path.length >= 4));

/* ท่าที่เป็นท่าเดียวกันตามหลักภาษา ต้องอยู่กลุ่มเดียวกัน */
const groups = {};
vocab.forEach((v) => {
  if (v.aliasGroup) (groups[v.aliasGroup] = groups[v.aliasGroup] || []).push(v.label);
});
check("จับคู่ท่าที่เหมือนกันจริงไว้ด้วยกัน (F=9, V=2, O=0)",
  Object.keys(groups).length === 3 &&
  Object.values(groups).every((g) => g.length === 2),
  JSON.stringify(groups));

/* ทุกท่าต้องรันได้โดยไม่ error */
let crashed = [];
for (const v of vocab) {
  try {
    ctx.scoreSign(v, { primary: base, secondary: null, trail: [] });
  } catch (e) {
    crashed.push(v.label + ": " + e.message);
  }
}
check("ทุกท่าคำนวณคะแนนได้โดยไม่เกิดข้อผิดพลาด",
  crashed.length === 0, crashed.slice(0, 3).join(" | "));

/* คลัง ThSL ต้องว่างจนกว่าจะมีการตรวจสอบ */
check("คลังภาษามือไทยยังว่างอยู่ (ยังไม่มีท่าที่ตรวจสอบแล้ว)",
  ctx.THSL_VOCABULARY.length === 0);
check("มีเทมเพลตให้เพิ่มท่าภาษามือไทย", ctx.THSL_ENTRIES.length >= 3);

/* ==========================================================================
   สรุป
   ========================================================================== */
console.log("\n" + "=".repeat(58));
console.log("ผ่าน " + pass + " ข้อ / ไม่ผ่าน " + fail + " ข้อ");
if (fail > 0) {
  console.log("\nรายการที่ไม่ผ่าน:");
  failures.forEach((f) => console.log("  - " + f));
}
console.log("=".repeat(58));
process.exit(fail > 0 ? 1 : 0);
