/* ==========================================================================
   vocab-asl.js — คลังท่า ASL (American Sign Language)
   --------------------------------------------------------------------------
   ทำไมถึงเริ่มที่ ASL:
   ภาษามือไทยอยู่ในตระกูลภาษาเดียวกับ ASL เกิดจากการที่นักการศึกษาที่ฝึกจาก
   อเมริกานำ ASL เข้ามาในโรงเรียนคนหูหนวกไทยช่วงทศวรรษ 1950 แล้วผสมกับ
   ภาษามือพื้นถิ่น ชุด handshape พื้นฐานจึงร่วมกันเป็นส่วนใหญ่
   การทำ ASL ให้แม่นจึงเป็นฐานที่ใช้ต่อกับ ThSL ได้จริง

   วิธีอ่านพิกัดในไฟล์นี้ (ระบบพิกัดของฝ่ามือ หน่วย = 1 เท่าของขนาดมือ):
     จุดกำเนิด = ข้อมือ
     +y = ไปทางปลายนิ้ว        (โคนนิ้วกลางอยู่ที่ y = 1.0)
     +x = ไปทางนิ้วโป้ง        (โคนนิ้วชี้ ≈ +0.42, โคนนิ้วก้อย ≈ -0.55)
     +z = ทิศที่ฝ่ามือหันไป    (นิ้วที่พับเข้าหาฝ่ามือจะมี z เป็นบวก)
   ========================================================================== */

/* ---------- ตัวช่วยเขียนเงื่อนไข ---------- */

/* ทุกนิ้วในรายการต้องพับ — ใช้ min เพราะถ้ามีนิ้วเดียวที่เหยียดอยู่ ท่าก็ผิดแล้ว */
function allFolded(names, hint, weight) {
  return {
    name: "folded:" + names.join(","),
    weight: weight === undefined ? 1.4 : weight,
    required: true,
    hint: hint,
    test: (f) => Math.min(...names.map((n) => f.down(n)))
  };
}

/* ทุกนิ้วในรายการต้องเหยียด */
function allExtended(names, hint, weight) {
  return {
    name: "extended:" + names.join(","),
    weight: weight === undefined ? 1.4 : weight,
    required: true,
    hint: hint,
    test: (f) => Math.min(...names.map((n) => f.up(n)))
  };
}

/* นิ้วอยู่ในสภาพ "งอครึ่ง" — ใช้กับตัว C, O, X ที่ไม่เหยียดสุดและไม่พับสุด */
function halfCurled(names, target, hint, weight) {
  return {
    name: "curled:" + names.join(","),
    weight: weight === undefined ? 1.2 : weight,
    hint: hint,
    test: (f) =>
      Math.min(...names.map((n) => near(f.fingers[n].straightness, target, 0.20)))
  };
}

/* ปลายนิ้วสองนิ้วแตะกัน */
function tipsTouch(a, b, hint, weight) {
  return {
    name: "touch",
    weight: weight === undefined ? 1.5 : weight,
    required: true,
    hint: hint,
    test: (f) => f.touch(a, b, 0.30)
  };
}

/* ปลายนิ้วโป้งอยู่ตรงตำแหน่งที่กำหนดในพิกัดฝ่ามือ */
function thumbTipAt(x, y, tol, hint, weight) {
  return {
    name: "thumb-pos",
    weight: weight === undefined ? 1.3 : weight,
    hint: hint,
    test: (f) => {
      const t = f.pts[4];
      return near(t.x, x, tol) * 0.5 + near(t.y, y, tol) * 0.5;
    }
  };
}

/* ทิศที่ปลายนิ้วชี้ไป */
function pointing(dir, hint, weight, required) {
  return {
    name: "direction",
    weight: weight === undefined ? 1.2 : weight,
    required: required === true,
    hint: hint,
    test: (f) =>
      dir === "up" ? f.pointsUp() : dir === "down" ? f.pointsDown() : f.pointsSideways()
  };
}

/* นิ้วชี้กับนิ้วกลางชิดกันหรือกางออก */
function fingerGap(mode, hint) {
  return {
    name: "gap",
    weight: 1.3,
    hint: hint,
    test: (f) => {
      const gap = f.spread("index", "middle");
      return mode === "together" ? 1 - ramp(gap, 0.30, 0.60) : ramp(gap, 0.38, 0.72);
    }
  };
}

/* ---------- โครงสร้างท่าหนึ่งท่า ---------- */
function sign(o) {
  return {
    id: o.id,
    set: o.set || "asl",
    group: o.group,
    label: o.label,
    title: o.title,
    instruction: o.instruction,
    shape: o.shape,               // ใช้วาดแผนผังท่า
    aliasGroup: o.aliasGroup || null,
    hands: o.hands || 1,
    motion: o.motion || null,
    note: o.note || null,
    checks: o.checks
  };
}

/* ==========================================================================
   ASL MANUAL ALPHABET — A ถึง Z
   ========================================================================== */
const ASL_ALPHABET = [

  sign({
    id: "asl-a", group: "alphabet", label: "A", title: "ตัว A",
    instruction: "กำมือ แล้วแนบนิ้วโป้งไว้ข้างนิ้วชี้ ให้โป้งตั้งขึ้นตรงๆ ไม่พาดทับนิ้ว",
    shape: ["ext", "fold", "fold", "fold", "fold"],
    checks: [
      allFolded(["index", "middle", "ring", "pinky"], "พับนิ้วทั้งสี่ให้เป็นกำปั้น"),
      { name: "thumb-straight", weight: 1.2, hint: "เหยียดนิ้วโป้งให้ตรง",
        test: (f) => ramp(f.fingers.thumb.straightness, 0.72, 0.90) },
      { name: "thumb-side", weight: 1.5, required: true,
        hint: "เอานิ้วโป้งไปแนบข้างนิ้วชี้ อย่าพาดทับหน้ากำปั้น",
        test: (f) => ramp(f.pts[4].x, 0.25, 0.60) * (1 - ramp(f.pts[4].z, 0.20, 0.55)) }
    ]
  }),

  sign({
    id: "asl-b", group: "alphabet", label: "B", title: "ตัว B",
    instruction: "เหยียดสี่นิ้วขึ้นตรง ชิดกันสนิท แล้วพับนิ้วโป้งพาดเข้ามาในฝ่ามือ",
    shape: ["fold", "ext", "ext", "ext", "ext"],
    checks: [
      allExtended(["index", "middle", "ring", "pinky"], "เหยียดสี่นิ้วขึ้นให้ตรง"),
      fingerGap("together", "ให้สี่นิ้วชิดติดกัน อย่ากางออก"),
      { name: "thumb-across", weight: 1.4, required: true,
        hint: "พับนิ้วโป้งพาดเข้ามาในฝ่ามือ",
        test: (f) => (1 - ramp(f.pts[4].x, 0.15, 0.50)) * f.down("thumb") },
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.9)
    ]
  }),

  sign({
    id: "asl-c", group: "alphabet", label: "C", title: "ตัว C",
    instruction: "งอทั้งมือเป็นรูปตัว C โดยนิ้วโป้งอยู่ล่าง สี่นิ้วอยู่บน เว้นช่องว่างไว้",
    shape: ["curl", "curl", "curl", "curl", "curl"],
    checks: [
      halfCurled(["index", "middle", "ring", "pinky"], 0.83,
        "งอสี่นิ้วเป็นครึ่งวงกลม อย่าเหยียดตรงและอย่ากำแน่น", 1.6),
      { name: "c-gap", weight: 1.6, required: true,
        hint: "เว้นช่องว่างระหว่างโป้งกับนิ้วชี้ ประมาณหนึ่งข้อนิ้ว",
        test: (f) => near(f.d(4, 8), 0.85, 0.45) },
      { name: "thumb-open", weight: 1.0, hint: "กางนิ้วโป้งออกเป็นส่วนล่างของตัว C",
        test: (f) => ramp(f.fingers.thumb.straightness, 0.65, 0.86) }
    ]
  }),

  sign({
    id: "asl-d", group: "alphabet", label: "D", title: "ตัว D",
    instruction: "ชูนิ้วชี้ขึ้นตรง แล้วเอาปลายนิ้วกลาง นาง ก้อย มาแตะปลายนิ้วโป้งเป็นวงกลม",
    shape: ["curl", "ext", "curl", "curl", "curl"],
    checks: [
      allExtended(["index"], "ชูนิ้วชี้ขึ้นให้ตรง"),
      allFolded(["middle", "ring", "pinky"], "งอนิ้วกลาง นาง ก้อย ลงมา", 1.1),
      tipsTouch(4, 12, "เอาปลายนิ้วกลางมาแตะปลายนิ้วโป้ง"),
      pointing("up", "หันนิ้วชี้ขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-e", group: "alphabet", label: "E", title: "ตัว E",
    instruction: "งอปลายนิ้วทั้งสี่ลงมาแตะปลายนิ้วโป้ง โดยนิ้วโป้งพับพาดอยู่ใต้นิ้วทั้งสี่",
    shape: ["fold", "curl", "curl", "curl", "curl"],
    checks: [
      allFolded(["index", "middle", "ring", "pinky"], "งอสี่นิ้วลงมาให้ปลายนิ้วอยู่ต่ำ"),
      { name: "thumb-under", weight: 1.6, required: true,
        hint: "พับนิ้วโป้งเข้ามาให้อยู่ใต้ปลายนิ้วทั้งสี่",
        test: (f) => {
          const thumbY = f.pts[4].y;
          const tipY = (f.pts[8].y + f.pts[12].y + f.pts[16].y) / 3;
          return f.down("thumb") * ramp(tipY - thumbY, 0.0, 0.35);
        } },
      { name: "tips-level", weight: 1.1, hint: "ให้ปลายนิ้วทั้งสี่อยู่ระดับเดียวกัน",
        test: (f) => {
          const ys = [f.pts[8].y, f.pts[12].y, f.pts[16].y, f.pts[20].y];
          return 1 - ramp(Math.max(...ys) - Math.min(...ys), 0.28, 0.70);
        } }
    ]
  }),

  sign({
    id: "asl-f", group: "alphabet", label: "F", title: "ตัว F (เหมือนเลข 9)",
    aliasGroup: "f9",
    instruction: "เอาปลายนิ้วโป้งกับนิ้วชี้มาแตะกันเป็นวงกลม แล้วเหยียดนิ้วกลาง นาง ก้อย ขึ้น",
    shape: ["curl", "curl", "ext", "ext", "ext"],
    note: "ในภาษามือ ASL ตัว F กับเลข 9 ใช้ท่ามือเหมือนกันทุกประการ แยกด้วยบริบทเท่านั้น",
    checks: [
      tipsTouch(4, 8, "เอาปลายโป้งกับปลายนิ้วชี้มาแตะกัน"),
      allExtended(["middle", "ring", "pinky"], "เหยียดนิ้วกลาง นาง ก้อย ขึ้นให้ตรง"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-g", group: "alphabet", label: "G", title: "ตัว G",
    instruction: "เหยียดนิ้วชี้ออกในแนวนอน แล้วกางนิ้วโป้งออกให้ขนานกับนิ้วชี้ นิ้วอื่นพับเก็บ",
    shape: ["ext", "ext", "fold", "fold", "fold"],
    checks: [
      allExtended(["index"], "เหยียดนิ้วชี้ออกให้ตรง"),
      allFolded(["middle", "ring", "pinky"], "พับนิ้วกลาง นาง ก้อย เก็บ"),
      { name: "thumb-parallel", weight: 1.5, required: true,
        hint: "กางนิ้วโป้งออกให้ขนานกับนิ้วชี้",
        test: (f) => {
          const dot = V.dot(f.fingers.thumb.dir, f.fingers.index.dir);
          return ramp(dot, 0.35, 0.80) * f.up("thumb");
        } },
      pointing("side", "หันนิ้วชี้ไปด้านข้าง ไม่ใช่ชี้ขึ้น", 1.3, true)
    ]
  }),

  sign({
    id: "asl-h", group: "alphabet", label: "H", title: "ตัว H",
    instruction: "เหยียดนิ้วชี้กับนิ้วกลางออกในแนวนอน ชิดติดกัน นิ้วอื่นพับเก็บ",
    shape: ["fold", "ext", "ext", "fold", "fold"],
    checks: [
      allExtended(["index", "middle"], "เหยียดนิ้วชี้กับนิ้วกลางออกให้ตรง"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      fingerGap("together", "ให้นิ้วชี้กับนิ้วกลางชิดติดกัน"),
      pointing("side", "หันปลายนิ้วไปด้านข้าง ไม่ใช่ชี้ขึ้น", 1.3, true)
    ]
  }),

  sign({
    id: "asl-i", group: "alphabet", label: "I", title: "ตัว I",
    instruction: "ชูนิ้วก้อยขึ้นเพียงนิ้วเดียว นิ้วที่เหลือกำเก็บ นิ้วโป้งพาดหน้ากำปั้น",
    shape: ["fold", "fold", "fold", "fold", "ext"],
    checks: [
      allExtended(["pinky"], "ชูนิ้วก้อยขึ้นให้ตรง"),
      allFolded(["index", "middle", "ring"], "กำนิ้วชี้ กลาง นาง เก็บให้หมด"),
      { name: "thumb-in", weight: 1.0, hint: "พับนิ้วโป้งพาดหน้ากำปั้น",
        test: (f) => f.down("thumb") },
      pointing("up", "หันนิ้วก้อยขึ้นด้านบน", 0.9)
    ]
  }),

  sign({
    id: "asl-j", group: "alphabet", label: "J", title: "ตัว J (มีการเคลื่อนไหว)",
    instruction: "ชูนิ้วก้อยขึ้นแบบตัว I แล้วลากมือลงและโค้งไปทางซ้าย วาดเป็นตัว J ในอากาศ",
    shape: ["fold", "fold", "fold", "fold", "ext"],
    note: "ท่านี้ต้องมีการเคลื่อนไหว ค่าเส้นทางต้นแบบยังต้องปรับจูนกับกล้องจริง",
    motion: {
      hint: "ค้างท่าตัว I ไว้ แล้วลากมือลงและโค้งไปทางซ้าย",
      path: [[0, 0], [0.05, 0.35], [0.05, 0.7], [-0.1, 0.95], [-0.4, 1.0], [-0.6, 0.8]]
    },
    checks: [
      allExtended(["pinky"], "ชูนิ้วก้อยขึ้นให้ตรง"),
      allFolded(["index", "middle", "ring"], "กำนิ้วชี้ กลาง นาง เก็บให้หมด")
    ]
  }),

  sign({
    id: "asl-k", group: "alphabet", label: "K", title: "ตัว K",
    instruction: "ชูนิ้วชี้กับนิ้วกลางขึ้นแยกกันเป็นรูปตัว V แล้วสอดนิ้วโป้งเข้าไปแตะโคนนิ้วกลาง",
    shape: ["ext", "ext", "ext", "fold", "fold"],
    checks: [
      allExtended(["index", "middle"], "ชูนิ้วชี้กับนิ้วกลางขึ้นให้ตรง"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      fingerGap("apart", "กางนิ้วชี้กับนิ้วกลางออกจากกัน"),
      { name: "thumb-between", weight: 1.7, required: true,
        hint: "สอดปลายนิ้วโป้งเข้าไปแตะข้อโคนของนิ้วกลาง",
        test: (f) => f.touch(4, 10, 0.42) },
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 1.2)
    ]
  }),

  sign({
    id: "asl-l", group: "alphabet", label: "L", title: "ตัว L",
    instruction: "ชูนิ้วชี้ขึ้นตรง กางนิ้วโป้งออกด้านข้างให้ตั้งฉากกัน เป็นรูปตัว L",
    shape: ["ext", "ext", "fold", "fold", "fold"],
    checks: [
      allExtended(["index", "thumb"], "เหยียดนิ้วชี้และนิ้วโป้งออกให้ตรง"),
      allFolded(["middle", "ring", "pinky"], "พับนิ้วกลาง นาง ก้อย เก็บ"),
      { name: "right-angle", weight: 1.6, required: true,
        hint: "กางนิ้วโป้งกับนิ้วชี้ให้ตั้งฉากกันเป็นมุมฉาก",
        test: (f) => {
          const dot = V.dot(f.fingers.thumb.dir, f.fingers.index.dir);
          return near(dot, 0.0, 0.45);
        } },
      pointing("up", "หันนิ้วชี้ขึ้นด้านบน", 0.9)
    ]
  }),

  sign({
    id: "asl-m", group: "alphabet", label: "M", title: "ตัว M",
    instruction: "กำมือโดยสอดนิ้วโป้งไว้ใต้นิ้วชี้ กลาง และนาง ให้ปลายโป้งโผล่ใกล้นิ้วก้อย",
    shape: ["fold", "fold", "fold", "fold", "fold"],
    checks: [
      allFolded(["index", "middle", "ring", "pinky"], "พับนิ้วทั้งสี่ลงมาคลุมนิ้วโป้ง"),
      { name: "thumb-under-3", weight: 1.8, required: true,
        hint: "สอดนิ้วโป้งเข้าไปใต้สามนิ้ว ให้ปลายโป้งโผล่ทางฝั่งนิ้วก้อย",
        test: (f) => near(f.pts[4].x, -0.28, 0.34) },
      { name: "thumb-folded", weight: 1.0, hint: "พับนิ้วโป้งเก็บ อย่าเหยียดออก",
        test: (f) => f.down("thumb") }
    ]
  }),

  sign({
    id: "asl-n", group: "alphabet", label: "N", title: "ตัว N",
    instruction: "กำมือโดยสอดนิ้วโป้งไว้ใต้นิ้วชี้และนิ้วกลาง ให้ปลายโป้งโผล่ระหว่างนิ้วกลางกับนาง",
    shape: ["fold", "fold", "fold", "fold", "fold"],
    note: "ตัว M กับ N ต่างกันแค่ว่าสอดนิ้วโป้งไว้ใต้กี่นิ้ว (M = สามนิ้ว, N = สองนิ้ว)",
    checks: [
      allFolded(["index", "middle", "ring", "pinky"], "พับนิ้วทั้งสี่ลงมาคลุมนิ้วโป้ง"),
      { name: "thumb-under-2", weight: 1.8, required: true,
        hint: "สอดนิ้วโป้งใต้สองนิ้ว ให้ปลายโป้งอยู่ระหว่างนิ้วกลางกับนิ้วนาง",
        test: (f) => near(f.pts[4].x, 0.02, 0.30) },
      { name: "thumb-folded", weight: 1.0, hint: "พับนิ้วโป้งเก็บ อย่าเหยียดออก",
        test: (f) => f.down("thumb") }
    ]
  }),

  sign({
    id: "asl-o", group: "alphabet", label: "O", title: "ตัว O (เหมือนเลข 0)",
    aliasGroup: "o0",
    instruction: "งอนิ้วทั้งหมดมาบรรจบกับนิ้วโป้ง ให้เป็นวงกลมกลวงตรงกลาง",
    shape: ["curl", "curl", "curl", "curl", "curl"],
    note: "ในภาษามือ ASL ตัว O กับเลข 0 ใช้ท่ามือเหมือนกันทุกประการ",
    checks: [
      tipsTouch(4, 8, "เอาปลายนิ้วชี้มาแตะปลายนิ้วโป้ง"),
      { name: "all-meet", weight: 1.6, required: true,
        hint: "งอนิ้วกลาง นาง ก้อย มาบรรจบกับนิ้วโป้งด้วย",
        test: (f) => Math.min(f.touch(4, 12, 0.42), f.touch(4, 16, 0.55)) },
      halfCurled(["index", "middle"], 0.80, "งอนิ้วเป็นวงกลม อย่าพับจนสุด", 1.0)
    ]
  }),

  sign({
    id: "asl-p", group: "alphabet", label: "P", title: "ตัว P",
    instruction: "ทำท่าเหมือนตัว K แล้วคว่ำมือลง ให้ปลายนิ้วชี้ชี้ลงพื้น",
    shape: ["ext", "ext", "ext", "fold", "fold"],
    checks: [
      allExtended(["index", "middle"], "เหยียดนิ้วชี้กับนิ้วกลางออก"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      { name: "thumb-between", weight: 1.5, required: true,
        hint: "สอดปลายนิ้วโป้งแตะข้อโคนของนิ้วกลาง",
        test: (f) => f.touch(4, 10, 0.42) },
      pointing("down", "คว่ำมือลง ให้ปลายนิ้วชี้ลงพื้น", 1.8, true)
    ]
  }),

  sign({
    id: "asl-q", group: "alphabet", label: "Q", title: "ตัว Q",
    instruction: "ทำท่าเหมือนตัว G แล้วคว่ำมือลง ให้นิ้วชี้กับนิ้วโป้งชี้ลงพื้น",
    shape: ["ext", "ext", "fold", "fold", "fold"],
    checks: [
      allExtended(["index"], "เหยียดนิ้วชี้ออกให้ตรง"),
      allFolded(["middle", "ring", "pinky"], "พับนิ้วกลาง นาง ก้อย เก็บ"),
      { name: "thumb-parallel", weight: 1.4, required: true,
        hint: "กางนิ้วโป้งออกให้ขนานกับนิ้วชี้",
        test: (f) => ramp(V.dot(f.fingers.thumb.dir, f.fingers.index.dir), 0.35, 0.80) },
      pointing("down", "คว่ำมือลง ให้ปลายนิ้วชี้ลงพื้น", 1.8, true)
    ]
  }),

  sign({
    id: "asl-r", group: "alphabet", label: "R", title: "ตัว R",
    instruction: "ชูนิ้วชี้กับนิ้วกลางขึ้น แล้วไขว้นิ้วกลางทับนิ้วชี้",
    shape: ["fold", "ext", "ext", "fold", "fold"],
    checks: [
      allExtended(["index", "middle"], "ชูนิ้วชี้กับนิ้วกลางขึ้นให้ตรง"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      { name: "crossed", weight: 1.9, required: true,
        hint: "ไขว้นิ้วกลางทับนิ้วชี้ ให้สลับข้างกัน",
        test: (f) => ramp(f.pts[12].x - f.pts[8].x, 0.02, 0.24) },
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-s", group: "alphabet", label: "S", title: "ตัว S",
    instruction: "กำหมัดแน่น แล้วพาดนิ้วโป้งทับด้านหน้าของนิ้วทั้งสี่",
    shape: ["fold", "fold", "fold", "fold", "fold"],
    note: "ต่างจากตัว A ตรงที่ตัว A นิ้วโป้งอยู่ข้างกำปั้น แต่ตัว S นิ้วโป้งพาดทับหน้ากำปั้น",
    checks: [
      allFolded(["index", "middle", "ring", "pinky"], "กำหมัดให้แน่น"),
      { name: "thumb-across-front", weight: 1.9, required: true,
        hint: "พาดนิ้วโป้งทับด้านหน้าของกำปั้น ไม่ใช่แนบไว้ข้างๆ",
        test: (f) => ramp(f.pts[4].z, 0.10, 0.45) * (1 - ramp(f.pts[4].x, 0.28, 0.60)) },
      { name: "thumb-folded", weight: 1.0, hint: "พับนิ้วโป้งลงมา",
        test: (f) => f.down("thumb") }
    ]
  }),

  sign({
    id: "asl-t", group: "alphabet", label: "T", title: "ตัว T",
    instruction: "กำมือ แล้วสอดปลายนิ้วโป้งขึ้นมาระหว่างนิ้วชี้กับนิ้วกลาง",
    shape: ["fold", "fold", "fold", "fold", "fold"],
    checks: [
      allFolded(["index", "middle", "ring", "pinky"], "กำมือให้แน่น"),
      { name: "thumb-poke", weight: 1.9, required: true,
        hint: "สอดปลายนิ้วโป้งขึ้นมาระหว่างนิ้วชี้กับนิ้วกลาง",
        test: (f) => near(f.pts[4].x, 0.22, 0.26) * ramp(f.pts[4].y, 0.75, 1.05) }
    ]
  }),

  sign({
    id: "asl-u", group: "alphabet", label: "U", title: "ตัว U",
    instruction: "ชูนิ้วชี้กับนิ้วกลางขึ้นตรง ให้ชิดติดกันสนิท นิ้วอื่นพับเก็บ",
    shape: ["fold", "ext", "ext", "fold", "fold"],
    checks: [
      allExtended(["index", "middle"], "ชูนิ้วชี้กับนิ้วกลางขึ้นให้ตรง"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      fingerGap("together", "ให้นิ้วชี้กับนิ้วกลางชิดติดกัน อย่ากางออก"),
      { name: "not-crossed", weight: 1.2, hint: "อย่าไขว้นิ้ว ให้เรียงชิดกันตรงๆ",
        test: (f) => 1 - ramp(f.pts[12].x - f.pts[8].x, 0.02, 0.20) },
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 1.0)
    ]
  }),

  sign({
    id: "asl-v", group: "alphabet", label: "V", title: "ตัว V (เหมือนเลข 2)",
    aliasGroup: "v2",
    instruction: "ชูนิ้วชี้กับนิ้วกลางขึ้น แล้วกางออกจากกันเป็นรูปตัว V",
    shape: ["fold", "ext", "ext", "fold", "fold"],
    note: "ในภาษามือ ASL ตัว V กับเลข 2 ใช้ท่ามือเหมือนกันทุกประการ",
    checks: [
      allExtended(["index", "middle"], "ชูนิ้วชี้กับนิ้วกลางขึ้นให้ตรง"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      fingerGap("apart", "กางนิ้วชี้กับนิ้วกลางออกจากกันให้เห็นชัด"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 1.0)
    ]
  }),

  sign({
    id: "asl-w", group: "alphabet", label: "W", title: "ตัว W",
    instruction: "ชูนิ้วชี้ กลาง และนาง ขึ้น กางออกจากกัน พับนิ้วก้อยลงและใช้โป้งกดไว้",
    shape: ["fold", "ext", "ext", "ext", "fold"],
    checks: [
      allExtended(["index", "middle", "ring"], "ชูนิ้วชี้ กลาง นาง ขึ้นทั้งสามนิ้ว"),
      allFolded(["pinky"], "พับนิ้วก้อยลง"),
      { name: "thumb-holds-pinky", weight: 1.3, hint: "ใช้นิ้วโป้งกดนิ้วก้อยไว้",
        test: (f) => f.touch(4, 20, 0.50) },
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.9)
    ]
  }),

  sign({
    id: "asl-x", group: "alphabet", label: "X", title: "ตัว X",
    instruction: "งอนิ้วชี้เป็นตะขอ นิ้วที่เหลือกำเก็บ",
    shape: ["fold", "curl", "fold", "fold", "fold"],
    checks: [
      allFolded(["middle", "ring", "pinky"], "กำนิ้วกลาง นาง ก้อย เก็บให้หมด"),
      { name: "index-hook", weight: 1.9, required: true,
        hint: "งอนิ้วชี้เป็นตะขอ อย่าเหยียดตรงและอย่าพับจนสุด",
        test: (f) => near(f.fingers.index.straightness, 0.76, 0.16) },
      { name: "index-above", weight: 1.4, required: true,
        hint: "ให้ปลายนิ้วชี้อยู่สูงกว่านิ้วอื่นอย่างเห็นได้ชัด",
        test: (f) => ramp(f.pts[8].y - f.pts[12].y, 0.10, 0.45) }
    ]
  }),

  sign({
    id: "asl-y", group: "alphabet", label: "Y", title: "ตัว Y",
    instruction: "กางนิ้วโป้งกับนิ้วก้อยออกให้สุด นิ้วชี้ กลาง นาง พับเก็บ",
    shape: ["ext", "fold", "fold", "fold", "ext"],
    checks: [
      allExtended(["thumb", "pinky"], "กางนิ้วโป้งกับนิ้วก้อยออกให้สุด"),
      allFolded(["index", "middle", "ring"], "พับนิ้วชี้ กลาง นาง เก็บให้หมด"),
      { name: "wide", weight: 1.3, hint: "กางโป้งกับก้อยให้ห่างกันมากๆ",
        test: (f) => ramp(f.d(4, 20), 1.5, 2.4) }
    ]
  }),

  sign({
    id: "asl-z", group: "alphabet", label: "Z", title: "ตัว Z (มีการเคลื่อนไหว)",
    instruction: "ชูนิ้วชี้ขึ้น แล้วลากวาดตัว Z ในอากาศ (ขวา → เฉียงลงซ้าย → ขวา)",
    shape: ["fold", "ext", "fold", "fold", "fold"],
    note: "ท่านี้ต้องมีการเคลื่อนไหว ค่าเส้นทางต้นแบบยังต้องปรับจูนกับกล้องจริง",
    motion: {
      hint: "ค้างนิ้วชี้ไว้ แล้ววาดตัว Z: ลากขวา → เฉียงลงซ้าย → ลากขวา",
      path: [[0, 0], [0.5, 0], [1.0, 0], [0.5, 0.5], [0, 1.0], [0.5, 1.0], [1.0, 1.0]]
    },
    checks: [
      allExtended(["index"], "ชูนิ้วชี้ขึ้นให้ตรง"),
      allFolded(["middle", "ring", "pinky"], "พับนิ้วกลาง นาง ก้อย เก็บ")
    ]
  })
];

/* ==========================================================================
   ASL NUMBERS — 0 ถึง 9
   --------------------------------------------------------------------------
   หมายเหตุสำคัญ: เลข 0, 2, 9 ใช้ท่ามือเหมือนตัวอักษร O, V, F ทุกประการ
   ระบบจึงจับให้อยู่กลุ่มเดียวกัน (aliasGroup) เพื่อไม่ให้หักคะแนนกันเอง
   ========================================================================== */
const ASL_NUMBERS = [

  sign({
    id: "asl-0", group: "number", label: "0", title: "เลข 0",
    aliasGroup: "o0",
    instruction: "งอนิ้วทั้งหมดมาบรรจบกับนิ้วโป้ง ให้เป็นวงกลมกลวงตรงกลาง (เหมือนตัว O)",
    shape: ["curl", "curl", "curl", "curl", "curl"],
    checks: [
      tipsTouch(4, 8, "เอาปลายนิ้วชี้มาแตะปลายนิ้วโป้ง"),
      { name: "all-meet", weight: 1.6, required: true,
        hint: "งอนิ้วกลาง นาง ก้อย มาบรรจบกับนิ้วโป้งด้วย",
        test: (f) => Math.min(f.touch(4, 12, 0.42), f.touch(4, 16, 0.55)) },
      halfCurled(["index", "middle"], 0.80, "งอนิ้วเป็นวงกลม อย่าพับจนสุด", 1.0)
    ]
  }),

  sign({
    id: "asl-1", group: "number", label: "1", title: "เลข 1",
    instruction: "ชูนิ้วชี้ขึ้นเพียงนิ้วเดียว นิ้วที่เหลือกำเก็บ นิ้วโป้งพับเข้ามา",
    shape: ["fold", "ext", "fold", "fold", "fold"],
    checks: [
      allExtended(["index"], "ชูนิ้วชี้ขึ้นให้ตรง"),
      allFolded(["middle", "ring", "pinky"], "กำนิ้วกลาง นาง ก้อย เก็บให้หมด"),
      { name: "thumb-in", weight: 1.2, hint: "พับนิ้วโป้งเข้ามา อย่ากางออก",
        test: (f) => f.down("thumb") },
      { name: "no-circle", weight: 1.3, required: true,
        hint: "อย่าเอาปลายโป้งไปแตะนิ้วกลาง (แบบนั้นจะกลายเป็นตัว D)",
        test: (f) => 1 - f.touch(4, 12, 0.30) },
      pointing("up", "หันนิ้วชี้ขึ้นด้านบน", 0.9)
    ]
  }),

  sign({
    id: "asl-2", group: "number", label: "2", title: "เลข 2",
    aliasGroup: "v2",
    instruction: "ชูนิ้วชี้กับนิ้วกลางขึ้น กางออกจากกัน (เหมือนตัว V)",
    shape: ["fold", "ext", "ext", "fold", "fold"],
    checks: [
      allExtended(["index", "middle"], "ชูนิ้วชี้กับนิ้วกลางขึ้นให้ตรง"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      fingerGap("apart", "กางนิ้วชี้กับนิ้วกลางออกจากกัน"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 1.0)
    ]
  }),

  sign({
    id: "asl-3", group: "number", label: "3", title: "เลข 3",
    instruction: "ชูนิ้วโป้ง นิ้วชี้ และนิ้วกลาง ขึ้น พับนิ้วนางกับนิ้วก้อยเก็บ",
    shape: ["ext", "ext", "ext", "fold", "fold"],
    note: "ในภาษามือ ASL เลข 3 ใช้นิ้วโป้ง ชี้ กลาง ไม่ใช่ ชี้ กลาง นาง แบบที่คนไทยชูกัน",
    checks: [
      allExtended(["thumb", "index", "middle"], "ชูนิ้วโป้ง ชี้ กลาง ขึ้นทั้งสามนิ้ว"),
      allFolded(["ring", "pinky"], "พับนิ้วนางกับนิ้วก้อยเก็บ"),
      { name: "thumb-out", weight: 1.3, hint: "กางนิ้วโป้งออกให้เห็นชัด",
        test: (f) => ramp(f.pts[4].x, 0.55, 1.0) }
    ]
  }),

  sign({
    id: "asl-4", group: "number", label: "4", title: "เลข 4",
    instruction: "เหยียดสี่นิ้วขึ้น กางออกจากกันเล็กน้อย แล้วพับนิ้วโป้งพาดฝ่ามือ",
    shape: ["fold", "ext", "ext", "ext", "ext"],
    checks: [
      allExtended(["index", "middle", "ring", "pinky"], "เหยียดสี่นิ้วขึ้นให้ตรง"),
      { name: "thumb-across", weight: 1.6, required: true,
        hint: "พับนิ้วโป้งพาดเข้ามาในฝ่ามือ",
        test: (f) => (1 - ramp(f.pts[4].x, 0.30, 0.70)) * f.down("thumb") },
      fingerGap("apart", "กางสี่นิ้วออกจากกันเล็กน้อย"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-5", group: "number", label: "5", title: "เลข 5",
    instruction: "กางนิ้วทั้งห้าออกให้สุด รวมนิ้วโป้งด้วย",
    shape: ["ext", "ext", "ext", "ext", "ext"],
    checks: [
      allExtended(["thumb", "index", "middle", "ring", "pinky"], "กางนิ้วทั้งห้าออกให้สุด"),
      { name: "thumb-wide", weight: 1.5, required: true,
        hint: "กางนิ้วโป้งออกให้ห่างจากนิ้วชี้ (ถ้าไม่กาง จะกลายเป็นเลข 4)",
        test: (f) => ramp(f.pts[4].x, 0.70, 1.15) },
      fingerGap("apart", "กางนิ้วออกจากกัน อย่าให้ชิดติดกัน"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-6", group: "number", label: "6", title: "เลข 6",
    instruction: "เอาปลายนิ้วก้อยมาแตะปลายนิ้วโป้ง แล้วเหยียดนิ้วชี้ กลาง นาง ขึ้น",
    shape: ["curl", "ext", "ext", "ext", "curl"],
    checks: [
      tipsTouch(4, 20, "เอาปลายนิ้วก้อยมาแตะปลายนิ้วโป้ง"),
      allExtended(["index", "middle", "ring"], "เหยียดนิ้วชี้ กลาง นาง ขึ้นทั้งสามนิ้ว"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-7", group: "number", label: "7", title: "เลข 7",
    instruction: "เอาปลายนิ้วนางมาแตะปลายนิ้วโป้ง แล้วเหยียดนิ้วชี้ กลาง ก้อย ขึ้น",
    shape: ["curl", "ext", "ext", "curl", "ext"],
    checks: [
      tipsTouch(4, 16, "เอาปลายนิ้วนางมาแตะปลายนิ้วโป้ง"),
      allExtended(["index", "middle", "pinky"], "เหยียดนิ้วชี้ กลาง ก้อย ขึ้นทั้งสามนิ้ว"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-8", group: "number", label: "8", title: "เลข 8",
    instruction: "เอาปลายนิ้วกลางมาแตะปลายนิ้วโป้ง แล้วเหยียดนิ้วชี้ นาง ก้อย ขึ้น",
    shape: ["curl", "ext", "curl", "ext", "ext"],
    checks: [
      tipsTouch(4, 12, "เอาปลายนิ้วกลางมาแตะปลายนิ้วโป้ง"),
      allExtended(["index", "ring", "pinky"], "เหยียดนิ้วชี้ นาง ก้อย ขึ้นทั้งสามนิ้ว"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  }),

  sign({
    id: "asl-9", group: "number", label: "9", title: "เลข 9",
    aliasGroup: "f9",
    instruction: "เอาปลายนิ้วชี้มาแตะปลายนิ้วโป้ง แล้วเหยียดนิ้วกลาง นาง ก้อย ขึ้น (เหมือนตัว F)",
    shape: ["curl", "curl", "ext", "ext", "ext"],
    checks: [
      tipsTouch(4, 8, "เอาปลายนิ้วชี้มาแตะปลายนิ้วโป้ง"),
      allExtended(["middle", "ring", "pinky"], "เหยียดนิ้วกลาง นาง ก้อย ขึ้นทั้งสามนิ้ว"),
      pointing("up", "หันปลายนิ้วขึ้นด้านบน", 0.8)
    ]
  })
];

const ASL_VOCABULARY = ASL_ALPHABET.concat(ASL_NUMBERS);

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ASL_ALPHABET, ASL_NUMBERS, ASL_VOCABULARY, sign };
}
