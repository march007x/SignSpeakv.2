/* ==========================================================================
   detection-engine.js — เครื่องยนต์ตัดสินท่า
   --------------------------------------------------------------------------
   แก้ปัญหาที่เหลือของโค้ดเดิม:

   เดิม: targetVocab.detect(landmarks) → true/false เฟรมเดียวก็ผ่าน
   ใหม่: ให้คะแนนทุกท่าในคลัง แล้วท่าเป้าหมายต้อง
         (1) ได้คะแนนถึงเกณฑ์
         (2) เป็นอันดับ 1 และชนะอันดับ 2 ด้วยระยะห่างที่กำหนด
         (3) ทำค้างไว้ต่อเนื่องหลายเฟรม โดยมือต้องนิ่ง
         (4) ผ่านด่านคุณภาพของภาพ
         (5) ไม่อยู่ในช่วง cooldown หลังเพิ่งผ่านท่าก่อนหน้า

   ข้อ (2) คือตัวแก้ปัญหาท่าทับซ้อนกัน — เดิมท่า "สวัสดี" เช็คแค่ 4 นิ้วขึ้น
   ทำให้ท่า "ห้า" "สี่" "เกือบแล้ว" ผ่านเป็น "สวัสดี" ไปด้วยทั้งหมด
   ========================================================================== */

class SignDetector {
  constructor() {
    this.vocabulary = [];
    this.targetId = null;

    /* ประวัติผลการตัดสินย้อนหลัง ใช้บังคับให้ค้างท่า */
    this.history = [];

    /* ประวัติตำแหน่งมือ ใช้ตรวจท่าที่มีการเคลื่อนไหว */
    this.motionTrail = [];

    this.cooldownUntil = 0;
    this.lastPassedId = null;
  }

  setVocabulary(list) {
    this.vocabulary = list || [];
    this.reset();
  }

  setTarget(id) {
    if (this.targetId !== id) {
      this.targetId = id;
      this.reset();
    }
  }

  reset() {
    this.history = [];
    this.motionTrail = [];
  }

  getTarget() {
    return this.vocabulary.find((v) => v.id === this.targetId) || null;
  }

  /* ------------------------------------------------------------------
     update — เรียกทุกเฟรมของวิดีโอ
     hands : array ของ frame จาก buildHandFrame (0, 1 หรือ 2 มือ)
     now   : Date.now()
     ------------------------------------------------------------------ */
  update(hands, now) {
    const target = this.getTarget();
    const out = {
      passed: false,
      status: "waiting",
      message: "",
      progress: 0,
      score: 0,
      winnerId: null,
      checks: []
    };

    if (!target) {
      out.message = "ยังไม่ได้เลือกท่าที่จะฝึก";
      return out;
    }

    /* ---- ด่าน 0: ต้องมีมือครบตามที่ท่านั้นต้องการ ---- */
    const needHands = target.hands || 1;
    if (!hands || hands.length < needHands) {
      this.history = [];
      this.motionTrail = [];
      out.status = "no-hand";
      out.message =
        needHands === 2 ? "ยกมือทั้งสองข้างเข้ามาในกรอบภาพ" : "ยกมือเข้ามาในกรอบภาพ";
      return out;
    }

    /* เรียงมือตามขนาด มือที่ใหญ่กว่า/ชัดกว่าเป็นมือหลัก */
    const sorted = hands.slice().sort((a, b) => b.frame.scale - a.frame.scale);
    const primary = sorted[0];
    const secondary = sorted[1] || null;

    /* ---- ด่าน 1: คุณภาพของภาพ ---- */
    const q = checkQuality(primary.frame, primary.score);
    if (!q.ok) {
      this.history = [];
      out.status = "low-quality";
      out.message = q.reason;
      return out;
    }

    /* ---- บันทึกเส้นทางการเคลื่อนไหว ---- */
    this.motionTrail.push({
      t: now,
      p: primary.frame.palmCenter,
      scale: primary.frame.scale
    });
    if (this.motionTrail.length > CONFIG.motion.historyFrames) {
      this.motionTrail.shift();
    }

    /* ---- ด่าน 2: ให้คะแนนทุกท่าในคลัง แล้วหาผู้ชนะ ---- */
    const ctx = {
      primary: primary.frame,
      secondary: secondary ? secondary.frame : null,
      trail: this.motionTrail
    };

    /* มือเดินทางไปไกลแค่ไหนในช่วงที่ผ่านมา (หน่วย: เท่าของขนาดมือ) */
    const travel = pathTravel(this.motionTrail);

    const scored = [];
    for (const item of this.vocabulary) {
      /* ท่าสองมือ ข้ามไปถ้าตอนนี้มีมือเดียว */
      if ((item.hands || 1) === 2 && !secondary) continue;

      const r = scoreSign(item, ctx);

      /* ท่าที่ต้องมีการเคลื่อนไหว ต้องไม่ชนะท่านิ่งด้วยรูปมืออย่างเดียว
         เช่น ASL ตัว Z ใช้รูปมือเดียวกับเลข 1 ต่างกันแค่ต้องวาดตัว Z ในอากาศ
         ถ้าไม่กดคะแนนไว้ การชูนิ้วชี้เฉยๆ จะถูกอ่านเป็นตัว Z เสมอ */
      if (item.motion) {
        const moving = ramp(travel, CONFIG.motion.minTravel * 0.5, CONFIG.motion.minTravel);
        r.score *= 0.55 + 0.45 * moving;
      }

      scored.push({ item, score: r.score, checks: r.checks });
    }
    scored.sort((a, b) => b.score - a.score);

    /* ท่าบางคู่ในภาษามือเป็น "ท่าเดียวกันจริงๆ" ตามหลักภาษา
       เช่น ASL ตัว V กับเลข 2 ใช้มือเหมือนกันเป๊ะ แยกด้วยบริบทเท่านั้น
       ระบบจึงต้องไม่หักคะแนนกันเอง ไม่งั้นผู้ใช้จะทำถูกแต่ผ่านไม่ได้เลย */
    const sameGroup = (a, b) =>
      a.aliasGroup && b.aliasGroup && a.aliasGroup === b.aliasGroup;

    const winner = scored[0] || null;
    const runnerUp =
      scored.find((s) => s.item.id !== target.id && !sameGroup(s.item, target)) || null;
    const targetResult = scored.find((s) => s.item.id === target.id);

    out.winnerId = winner ? winner.item.id : null;
    out.score = targetResult ? targetResult.score : 0;
    out.checks = targetResult ? targetResult.checks : [];

    /* ---- ด่าน 3: cooldown หลังเพิ่งผ่านท่าก่อนหน้า ----
       โค้ดเดิมเปลี่ยนคำถัดไปทันทีแล้ว reset isCorrectState = false
       ขณะที่มือยังค้างท่าเดิมอยู่ ทำให้ผ่านรัวๆ เป็นลูกโซ่               */
    if (now < this.cooldownUntil) {
      out.status = "cooldown";
      out.message = "เตรียมท่าถัดไป...";
      out.progress = 0;
      return out;
    }

    /* ---- ด่าน 4: ท่าเป้าหมายต้องเป็นอันดับ 1 และชนะขาด ---- */
    const isWinner =
      winner && (winner.item.id === target.id || sameGroup(winner.item, target));
    const margin = runnerUp ? out.score - runnerUp.score : 1;
    const scoreOk = out.score >= CONFIG.detection.minScore;
    const marginOk = !runnerUp || margin >= CONFIG.detection.winMargin;
    const frameOk = isWinner && scoreOk && marginOk;

    /* ---- ด่าน 5: ต้องค้างท่าต่อเนื่อง และมือต้องนิ่ง ---- */
    this.history.push({
      ok: frameOk,
      t: now,
      tips: FINGER_NAMES.map((n) => primary.frame.fingers[n].tip)
    });
    if (this.history.length > CONFIG.detection.windowFrames) {
      this.history.shift();
    }

    const okCount = this.history.filter((h) => h.ok).length;
    const jitter = computeJitter(this.history);
    const steady = jitter <= CONFIG.detection.maxJitter;

    out.progress = Math.min(1, okCount / CONFIG.detection.holdFrames);

    /* ---- ตัดสิน ---- */
    if (okCount >= CONFIG.detection.holdFrames && steady) {
      /* ท่าที่มีการเคลื่อนไหว ต้องผ่านการตรวจเส้นทางด้วย */
      if (target.motion) {
        const mv = matchMotion(target.motion, this.motionTrail);
        if (!mv.ok) {
          out.status = "need-motion";
          out.message = mv.hint || target.motion.hint || "ทำการเคลื่อนไหวตามตัวอย่าง";
          return out;
        }
      }

      this.cooldownUntil = now + CONFIG.detection.cooldownMs;
      this.lastPassedId = target.id;
      this.reset();
      out.passed = true;
      out.status = "correct";
      out.message = "ถูกต้อง";
      out.progress = 1;
      return out;
    }

    /* ---- ยังไม่ผ่าน: บอกให้ชัดว่าเพราะอะไร ---- */
    if (frameOk && !steady) {
      out.status = "unsteady";
      out.message = "ท่าถูกแล้ว ค้างมือให้นิ่งอีกนิด";
    } else if (frameOk) {
      out.status = "holding";
      out.message = "ค้างไว้แบบนี้...";
    } else if (isWinner && scoreOk && !marginOk) {
      out.status = "ambiguous";
      out.message = runnerUp
        ? `ท่ายังคล้ายกับ "${runnerUp.item.label}" อยู่ ทำให้ชัดเจนขึ้น`
        : "ทำท่าให้ชัดเจนขึ้น";
    } else {
      out.status = "adjusting";
      const failed = out.checks
        .filter((c) => c.score < 0.55 && c.hint)
        .sort((a, b) => a.score - b.score)
        .slice(0, 2)
        .map((c) => c.hint);
      out.message = failed.length ? failed.join(" · ") : "ปรับท่าตามตัวอย่างด้านข้าง";
    }

    return out;
  }
}

/* ==========================================================================
   scoreSign — ให้คะแนนท่าหนึ่งท่า
   --------------------------------------------------------------------------
   คะแนนรวม = ค่าเฉลี่ยถ่วงน้ำหนักของทุกเงื่อนไข
   ถ้ามีเงื่อนไขที่ตั้ง required: true แล้วไม่ผ่าน คะแนนรวมจะถูกกดลงอย่างแรง
   ========================================================================== */
function scoreSign(item, ctx) {
  const checks = [];
  let total = 0;
  let weightSum = 0;
  let hardFail = false;

  for (const check of item.checks) {
    let s;
    try {
      s = check.test(ctx.primary, ctx);
    } catch (e) {
      s = 0;
    }
    s = typeof s === "number" && isFinite(s) ? Math.max(0, Math.min(1, s)) : 0;

    const w = check.weight === undefined ? 1 : check.weight;
    total += s * w;
    weightSum += w;

    if (check.required && s < 0.4) hardFail = true;

    checks.push({ name: check.name, score: s, hint: check.hint, weight: w });
  }

  let score = weightSum > 0 ? total / weightSum : 0;
  if (hardFail) score *= 0.35;

  return { score, checks };
}

/* ==========================================================================
   computeJitter — มือนิ่งแค่ไหน
   --------------------------------------------------------------------------
   วัดจากการขยับของปลายนิ้วทั้ง 5 ในพิกัดฝ่ามือ (ไม่สนใจว่ามือจะเลื่อนไปไหน
   สนใจแค่ว่า "รูปทรงของมือ" นิ่งหรือไม่)
   ========================================================================== */
function computeJitter(history) {
  if (history.length < 4) return 999;

  const recent = history.slice(-Math.min(history.length, 10));
  let sum = 0;
  let count = 0;

  for (let i = 1; i < recent.length; i++) {
    const a = recent[i - 1].tips;
    const b = recent[i].tips;
    for (let k = 0; k < a.length; k++) {
      sum += V.dist(a[k], b[k]);
      count++;
    }
  }
  return count === 0 ? 999 : (sum / count) * 30;
}

/* ==========================================================================
   matchMotion — ตรวจว่าเส้นทางที่มือเดินทาง ตรงกับต้นแบบหรือไม่ (เฟส 3)
   --------------------------------------------------------------------------
   วิธี: ตัดเส้นทางล่าสุดออกมา → normalize ให้เริ่มที่ (0,0) และยาวเท่ากัน
         → เทียบทีละจุดกับต้นแบบ

   template.path : array ของ [x, y] ในระบบที่ผู้ใช้มองเห็น
                   x: + = ขวา,  y: + = ลง
   ========================================================================== */
function matchMotion(template, trail) {
  if (!trail || trail.length < 8) {
    return { ok: false, hint: template.hint };
  }

  /* ระยะทางรวมที่มือเดินทาง (หน่วย: เท่าของขนาดมือ) */
  const travel = pathTravel(trail);
  if (travel < CONFIG.motion.minTravel) {
    return { ok: false, hint: template.hint || "ยังไม่เห็นการเคลื่อนไหว" };
  }

  const actual = resamplePath(trail.map((t) => t.p), template.path.length);
  const wanted = template.path.map((p) => ({ x: p[0], y: p[1], z: 0 }));

  const a = normalizePath(actual);
  const b = normalizePath(wanted);

  let err = 0;
  for (let i = 0; i < a.length; i++) {
    err += V.dist(a[i], b[i]);
  }
  err /= a.length;

  const pathScore = Math.max(0, 1 - err / 0.55);
  return {
    ok: pathScore >= CONFIG.motion.minPathScore,
    score: pathScore,
    hint: template.hint
  };
}

/* ระยะทางรวมที่มือเดินทาง หน่วยเป็น "เท่าของขนาดมือ" */
function pathTravel(trail) {
  if (!trail || trail.length < 2) return 0;
  const scale = trail[trail.length - 1].scale || 0.1;
  let total = 0;
  for (let i = 1; i < trail.length; i++) {
    total += V.dist(trail[i - 1].p, trail[i].p) / scale;
  }
  return total;
}

/* แบ่งเส้นทางใหม่ให้มีจำนวนจุดเท่ากับ n จุด ระยะห่างเท่าๆ กัน */
function resamplePath(points, n) {
  if (points.length <= 1) return new Array(n).fill(points[0] || { x: 0, y: 0, z: 0 });

  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + V.dist(points[i - 1], points[i]));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-9) return new Array(n).fill(points[0]);

  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const span = cum[i] - cum[i - 1];
    const t = span < 1e-9 ? 0 : (target - cum[i - 1]) / span;
    out.push({
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      z: 0
    });
  }
  return out;
}

/* ย้ายเส้นทางให้เริ่มที่จุดกำเนิด แล้วย่อ/ขยายให้ขนาดเท่ากัน
   เพื่อให้เทียบรูปทรงของเส้นทางได้ โดยไม่สนใจว่าทำใหญ่หรือเล็ก */
function normalizePath(points) {
  const p0 = points[0];
  const shifted = points.map((p) => ({ x: p.x - p0.x, y: p.y - p0.y, z: 0 }));

  let maxLen = 0;
  for (const p of shifted) maxLen = Math.max(maxLen, V.len(p));
  if (maxLen < 1e-9) return shifted;

  return shifted.map((p) => ({ x: p.x / maxLen, y: p.y / maxLen, z: 0 }));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SignDetector, scoreSign, matchMotion, resamplePath, normalizePath };
}
