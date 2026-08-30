/* ==========================================================================
   practice.js — หน้าฝึกภาษามือ: เชื่อม MediaPipe เข้ากับเครื่องยนต์ตรวจจับ
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- อ้างอิง element ---------- */
  const els = {};
  const ID = [
    "webcam", "overlay", "statusPill", "statusText", "progressBar", "progressPct",
    "signTitle", "signInstruction", "signNote", "diagram", "vocabList",
    "setTabs", "camBtn", "camHint", "debugPanel", "debugToggle", "debugBody",
    "successToast", "successText", "sessionScore", "sessionTotal", "thslNotice"
  ];
  ID.forEach((id) => (els[id] = document.getElementById(id)));

  /* ---------- สถานะ ---------- */
  const detector = new SignDetector();
  let activeSet = "alphabet";
  let currentList = [];
  let currentIndex = 0;
  let cameraOn = false;
  let hands = null;
  let camera = null;
  let ctx = null;
  let debugOn = false;

  const stats = {
    startedAt: Date.now(),
    attempts: {},     // signId -> จำนวนเฟรมที่พยายาม
    passes: {},       // signId -> จำนวนครั้งที่ผ่าน
    passed: 0,
    seen: 0
  };

  /* ---------- ชุดคำศัพท์ ---------- */
  function listForSet(set) {
    if (set === "alphabet") return ASL_ALPHABET;
    if (set === "number") return ASL_NUMBERS;
    if (set === "thsl") return THSL_VOCABULARY;
    return ASL_ALPHABET;
  }

  function selectSet(set) {
    activeSet = set;
    currentList = listForSet(set);
    currentIndex = 0;

    /* เครื่องยนต์ต้องรู้จักท่าทั้งหมดในชุด เพื่อเทียบว่าท่าไหนคะแนนสูงสุด
       นี่คือหัวใจของการกันท่าทับซ้อนกัน                                  */
    detector.setVocabulary(currentList);

    els.thslNotice.hidden = set !== "thsl" || currentList.length > 0;

    renderVocabList();
    if (currentList.length) selectSign(0);
    else renderEmptySet();

    document.querySelectorAll("[data-set]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.set === set);
      b.setAttribute("aria-selected", b.dataset.set === set ? "true" : "false");
    });
  }

  function renderEmptySet() {
    els.signTitle.textContent = "ยังไม่มีท่าให้ฝึกในชุดนี้";
    els.signInstruction.textContent =
      "คลังท่าภาษามือไทยยังไม่มีท่าที่ผ่านการตรวจสอบกับแหล่งอ้างอิง";
    els.signNote.hidden = true;
    els.diagram.innerHTML = "";
    detector.setTarget(null);
  }

  function renderVocabList() {
    els.vocabList.innerHTML = "";
    currentList.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = item.label;
      btn.title = item.title;
      btn.setAttribute("aria-label", item.title);
      if (item.motion) btn.classList.add("chip--motion");
      btn.addEventListener("click", () => selectSign(i));
      els.vocabList.appendChild(btn);
    });
    markActiveChip();
  }

  function markActiveChip() {
    Array.from(els.vocabList.children).forEach((c, i) => {
      c.classList.toggle("is-active", i === currentIndex);
    });
  }

  function selectSign(i) {
    currentIndex = i;
    const item = currentList[i];
    if (!item) return;

    detector.setTarget(item.id);
    stats.seen++;

    els.signTitle.textContent = item.title;
    els.signInstruction.textContent = item.instruction;

    if (item.note) {
      els.signNote.textContent = item.note;
      els.signNote.hidden = false;
    } else {
      els.signNote.hidden = true;
    }

    els.diagram.innerHTML = buildHandDiagram(item.shape);
    markActiveChip();
    setProgress(0);
  }

  function nextSign() {
    if (!currentList.length) return;
    selectSign((currentIndex + 1) % currentList.length);
  }

  /* ---------- UI ---------- */
  function setProgress(p) {
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
    els.progressBar.style.width = pct + "%";
    els.progressPct.textContent = pct + "%";
    els.progressBar.parentElement.setAttribute("aria-valuenow", String(pct));
  }

  const STATUS_TONE = {
    "correct": "ok",
    "holding": "ok",
    "unsteady": "warn",
    "ambiguous": "warn",
    "need-motion": "warn",
    "cooldown": "muted",
    "adjusting": "warn",
    "no-hand": "muted",
    "low-quality": "bad",
    "waiting": "muted"
  };

  function setStatus(status, message) {
    const tone = STATUS_TONE[status] || "muted";
    els.statusPill.className = "status status--" + tone;
    els.statusText.textContent = message || "";
  }

  function celebrate(item) {
    stats.passed++;
    stats.passes[item.id] = (stats.passes[item.id] || 0) + 1;
    els.sessionScore.textContent = String(stats.passed);

    els.successText.textContent = "ถูกต้อง — " + item.title;
    els.successToast.hidden = false;
    els.successToast.classList.add("is-visible");

    setTimeout(() => {
      els.successToast.classList.remove("is-visible");
      setTimeout(() => (els.successToast.hidden = true), 250);
      nextSign();
    }, 1300);
  }

  /* ---------- แผงตรวจสอบค่า (สำหรับปรับจูน) ---------- */
  function renderDebug(frames, result) {
    if (!debugOn) return;
    const f = frames[0] ? frames[0].frame : null;
    if (!f) {
      els.debugBody.textContent = "ไม่พบมือ";
      return;
    }

    const rows = [];
    rows.push(["ขนาดมือ (scale)", f.scale.toFixed(3)]);
    rows.push(["มือข้าง", f.hand === "right" ? "ขวา" : "ซ้าย"]);
    rows.push(["จุดหลุดขอบ", String(f.outOfBounds)]);
    rows.push(["คะแนนท่านี้", result.score.toFixed(3)]);
    rows.push(["ท่าที่ระบบเห็น", result.winnerId || "-"]);

    FINGER_NAMES.forEach((n) => {
      const fi = f.fingers[n];
      const th = { thumb: "โป้ง", index: "ชี้", middle: "กลาง", ring: "นาง", pinky: "ก้อย" }[n];
      rows.push([th, fi.straightness.toFixed(3) + "  (" + fi.state + ")"]);
    });

    rows.push(["ปลายโป้ง x,y,z",
      f.pts[4].x.toFixed(2) + ", " + f.pts[4].y.toFixed(2) + ", " + f.pts[4].z.toFixed(2)]);
    rows.push(["ทิศปลายนิ้ว",
      "ขึ้น " + f.pointsUp().toFixed(2) + " / ลง " + f.pointsDown().toFixed(2) +
      " / ข้าง " + f.pointsSideways().toFixed(2)]);

    els.debugBody.innerHTML = rows
      .map((r) => `<div class="dbg-row"><span>${r[0]}</span><b>${r[1]}</b></div>`)
      .join("");

    if (result.checks && result.checks.length) {
      els.debugBody.innerHTML +=
        `<div class="dbg-sep">เงื่อนไขของท่านี้</div>` +
        result.checks
          .map((c) => {
            const cls = c.score >= 0.7 ? "ok" : c.score >= 0.45 ? "warn" : "bad";
            return `<div class="dbg-row dbg-${cls}"><span>${c.name}</span><b>${c.score.toFixed(2)}</b></div>`;
          })
          .join("");
    }
  }

  /* ---------- MediaPipe ---------- */
  function initMediaPipe() {
    ctx = els.overlay.getContext("2d");
    els.overlay.width = CONFIG.mediapipe.cameraWidth;
    els.overlay.height = CONFIG.mediapipe.cameraHeight;

    hands = new Hands({
      locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file
    });

    hands.setOptions({
      maxNumHands: CONFIG.mediapipe.maxNumHands,
      modelComplexity: CONFIG.mediapipe.modelComplexity,
      minDetectionConfidence: CONFIG.mediapipe.minDetectionConfidence,
      minTrackingConfidence: CONFIG.mediapipe.minTrackingConfidence
    });

    hands.onResults(onResults);

    camera = new Camera(els.webcam, {
      onFrame: async () => {
        if (cameraOn) await hands.send({ image: els.webcam });
      },
      width: CONFIG.mediapipe.cameraWidth,
      height: CONFIG.mediapipe.cameraHeight
    });
  }

  function onResults(results) {
    ctx.save();
    ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);

    const lmSets = results.multiHandLandmarks || [];
    const handedness = results.multiHandedness || [];

    /* วาดโครงมือทับวิดีโอ (วิดีโอถูกพลิกด้วย CSS แล้ว canvas ก็พลิกตาม) */
    for (const lms of lmSets) {
      drawConnectors(ctx, lms, HAND_CONNECTIONS, { color: "#5eead4", lineWidth: 3 });
      drawLandmarks(ctx, lms, { color: "#fbbf24", lineWidth: 1, radius: 3 });
    }
    ctx.restore();

    const aspect = els.overlay.width / els.overlay.height;
    const frames = [];

    for (let i = 0; i < lmSets.length; i++) {
      const label = handedness[i] ? handedness[i].label : "Right";
      const score = handedness[i] ? handedness[i].score : 1;
      const frame = buildHandFrame(lmSets[i], label, {
        aspect: aspect,
        mirrorInput: CONFIG.mediapipe.mirrorInput
      });
      if (frame) frames.push({ frame: frame, score: score });
    }

    const target = currentList[currentIndex];
    if (target) stats.attempts[target.id] = (stats.attempts[target.id] || 0) + 1;

    const result = detector.update(frames, Date.now());

    setStatus(result.status, result.message);
    setProgress(result.progress);
    renderDebug(frames, result);

    if (result.passed && target) celebrate(target);
  }

  /* ---------- กล้อง ---------- */
  async function startCamera() {
    try {
      await camera.start();
      cameraOn = true;
      els.camBtn.textContent = "ปิดกล้อง";
      els.camHint.textContent = "ภาพจากกล้องประมวลผลในเครื่องคุณ ไม่ถูกส่งออกไปไหน";
      setStatus("waiting", "กำลังมองหามือ...");
    } catch (e) {
      cameraOn = false;
      setStatus("low-quality",
        "เปิดกล้องไม่ได้ — กรุณาอนุญาตให้เว็บไซต์ใช้กล้องในแถบที่อยู่ของเบราว์เซอร์");
    }
  }

  function stopCamera() {
    cameraOn = false;
    if (camera) camera.stop();
    if (els.webcam.srcObject) {
      els.webcam.srcObject.getTracks().forEach((t) => t.stop());
      els.webcam.srcObject = null;
    }
    if (ctx) ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
    els.camBtn.textContent = "เปิดกล้อง";
    setStatus("waiting", "ปิดกล้องอยู่");
    setProgress(0);
    detector.reset();
  }

  /* ---------- ส่งสถิติแบบไม่ระบุตัวตน ---------- */
  function sendStats() {
    if (stats.passed === 0 && Object.keys(stats.attempts).length === 0) return;

    const hardest = Object.keys(stats.attempts)
      .map((id) => ({
        id: id,
        frames: stats.attempts[id],
        passes: stats.passes[id] || 0
      }))
      .sort((a, b) => b.frames - a.frames)
      .slice(0, 10);

    const body = JSON.stringify({
      kind: "practice",
      payload: {
        durationSec: Math.round((Date.now() - stats.startedAt) / 1000),
        signsSeen: stats.seen,
        signsPassed: stats.passed,
        perSign: hardest
      },
      consentVersion: CONFIG.api.consentVersion
    });

    /* sendBeacon ทำงานได้แม้ผู้ใช้กำลังปิดแท็บ */
    try {
      navigator.sendBeacon(CONFIG.api.endpoint, new Blob([body], { type: "application/json" }));
    } catch (e) { /* ไม่เป็นไร สถิติไม่ใช่สิ่งจำเป็น */ }
  }

  /* ---------- เริ่มทำงาน ---------- */
  function init() {
    initMediaPipe();

    document.querySelectorAll("[data-set]").forEach((btn) => {
      btn.addEventListener("click", () => selectSet(btn.dataset.set));
    });

    els.camBtn.addEventListener("click", () => {
      if (cameraOn) stopCamera();
      else startCamera();
    });

    els.debugToggle.addEventListener("click", () => {
      debugOn = !debugOn;
      els.debugPanel.hidden = !debugOn;
      els.debugToggle.textContent = debugOn ? "ซ่อนค่าตรวจสอบ" : "แสดงค่าตรวจสอบ";
      els.debugToggle.setAttribute("aria-expanded", String(debugOn));
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") nextSign();
      if (e.key === "ArrowLeft") {
        selectSign((currentIndex - 1 + currentList.length) % currentList.length);
      }
    });

    window.addEventListener("pagehide", sendStats);

    selectSet("alphabet");
    els.sessionTotal.textContent = String(ASL_ALPHABET.length);
    startCamera();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
