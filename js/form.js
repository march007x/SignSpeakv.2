/* ==========================================================================
   form.js — ส่งแบบสอบถามและรีวิว
   --------------------------------------------------------------------------
   ต่างจากโค้ดเดิมตรงไหน

   เดิม: fetch(..., { mode: "no-cors" })
         โหมดนี้ทำให้เบราว์เซอร์ "ยิงแล้วไม่สนใจคำตอบ" อ่าน response ไม่ได้เลย
         ถ้าเซิร์ฟเวอร์ตอบ error ก็ไม่มีใครรู้ ข้อมูลหายเงียบๆ
         และ URL ของ Apps Script เปิดอยู่ในโค้ดฝั่งผู้ใช้ ใครก็ยิงข้อมูลขยะได้

   ใหม่: ส่งเข้า /api/submit ซึ่งเป็นโค้ดฝั่งเซิร์ฟเวอร์ของเราเอง
         อ่านผลลัพธ์ได้จริง แจ้งผู้ใช้ได้เมื่อผิดพลาด
         และกุญแจของฐานข้อมูลไม่มีวันโผล่ในเบราว์เซอร์
   ========================================================================== */

(function () {
  "use strict";

  /* เวลาที่หน้าเว็บถูกเปิด — ใช้ตรวจว่ากรอกเร็วผิดปกติแบบบอทหรือไม่ */
  const pageOpenedAt = Date.now();

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setMsg(text, kind) {
    const el = document.getElementById("formMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "form-msg" + (kind ? " form-msg--" + kind : "");
  }

  /* ------------------------------------------------------------------
     ส่งข้อมูลไปยัง API ของเราเอง
     ------------------------------------------------------------------ */
  async function submit(kind, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.api.timeoutMs);

    try {
      const res = await fetch(CONFIG.api.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: kind,
          payload: payload,
          consentVersion: CONFIG.api.consentVersion,
          /* ข้อมูลกันบอท ไม่ได้ใช้ระบุตัวตน */
          elapsedMs: Date.now() - pageOpenedAt,
          trap: val("website")
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        return { ok: false, error: info.error || "ส่งข้อมูลไม่สำเร็จ" };
      }
      return { ok: true };

    } catch (e) {
      clearTimeout(timer);
      return {
        ok: false,
        error: e.name === "AbortError"
          ? "เซิร์ฟเวอร์ตอบช้าเกินไป"
          : "เชื่อมต่อไม่ได้ ลองตรวจสอบอินเทอร์เน็ต"
      };
    }
  }

  /* ------------------------------------------------------------------
     แบบสอบถามก่อนเริ่มใช้งาน
     ------------------------------------------------------------------ */
  const onboarding = document.getElementById("onboarding");
  if (onboarding) {
    onboarding.addEventListener("submit", async function (e) {
      e.preventDefault();

      const btn = document.getElementById("submitBtn");
      const consent = document.getElementById("consent");

      /* ตรวจฝั่งผู้ใช้ก่อน เพื่อบอกได้เร็วและชัด */
      if (!val("role") || !val("level") || !val("goal")) {
        setMsg("กรุณาตอบข้อที่มีเครื่องหมาย * ให้ครบก่อนครับ", "bad");
        return;
      }
      if (!consent.checked) {
        setMsg("กรุณาติ๊กยอมรับการเก็บข้อมูลก่อนเริ่มใช้งาน", "bad");
        consent.focus();
        return;
      }

      btn.disabled = true;
      btn.textContent = "กำลังส่ง...";
      setMsg("");

      const result = await submit("onboarding", {
        role: val("role"),
        ageRange: val("age"),
        level: val("level"),
        goal: val("goal"),
        reason: val("reason").slice(0, 500),
        referral: val("referral"),
        /* บริบทของอุปกรณ์ ใช้แก้ปัญหาเวลาผู้ใช้แจ้งว่ากล้องไม่ทำงาน
           ไม่มีข้อมูลที่ระบุตัวบุคคล */
        screen: window.innerWidth + "x" + window.innerHeight,
        lang: navigator.language || ""
      });

      /* ไม่ว่าส่งสำเร็จหรือไม่ ผู้ใช้ต้องได้เข้าไปฝึก
         การเก็บสถิติต้องไม่มาขวางการใช้งานจริง */
      if (!result.ok) {
        setMsg("บันทึกคำตอบไม่สำเร็จ (" + result.error + ") แต่พาคุณเข้าหน้าฝึกได้เลย", "bad");
        setTimeout(() => (window.location.href = "practice.html"), 1800);
        return;
      }

      setMsg("บันทึกแล้ว กำลังพาไปหน้าฝึก...", "ok");
      setTimeout(() => (window.location.href = "practice.html"), 600);
    });
  }

  /* ------------------------------------------------------------------
     ฟอร์มรีวิวหลังใช้งาน
     ------------------------------------------------------------------ */
  const review = document.getElementById("reviewForm");
  if (review) {
    review.addEventListener("submit", async function (e) {
      e.preventDefault();

      const btn = document.getElementById("reviewBtn");
      if (!val("rating")) {
        setMsg("กรุณาเลือกระดับความพึงพอใจก่อนครับ", "bad");
        return;
      }

      btn.disabled = true;
      btn.textContent = "กำลังส่ง...";

      const result = await submit("review", {
        rating: Number(val("rating")),
        accuracy: val("accuracy"),
        difficulty: val("difficulty"),
        feedback: val("feedback").slice(0, 1000)
      });

      if (!result.ok) {
        setMsg("ส่งไม่สำเร็จ: " + result.error + " — ลองใหม่อีกครั้งได้ครับ", "bad");
        btn.disabled = false;
        btn.textContent = "ส่งความคิดเห็น";
        return;
      }

      setMsg("ขอบคุณสำหรับความคิดเห็นครับ", "ok");
      review.reset();
      btn.textContent = "ส่งเรียบร้อยแล้ว";
    });
  }
})();
