/* ==========================================================================
   hand-diagram.js — วาดแผนผังท่ามือ
   --------------------------------------------------------------------------
   นี่คือ "แผนผัง" ไม่ใช่ภาพถ่ายท่าจริง ใช้ประกอบคำอธิบายข้อความเท่านั้น
   ถ้าอยากให้ผู้ฝึกเห็นท่าชัดเจนกว่านี้ ควรถ่ายภาพหรือวิดีโอท่าจริงมาใส่แทน
   (ดูวิธีในไฟล์ README.md หัวข้อ "การเพิ่มภาพท่าจริง")

   รับ shape = [thumb, index, middle, ring, pinky]
   แต่ละค่าเป็น 'ext' (เหยียด) | 'curl' (งอครึ่ง) | 'fold' (พับเก็บ)
   ========================================================================== */

function buildHandDiagram(shape, opts) {
  const s = shape || ["fold", "fold", "fold", "fold", "fold"];
  const showLabels = opts && opts.labels;

  /* โคนนิ้วแต่ละนิ้วบนฝ่ามือ และทิศที่นิ้วชี้ออกไป */
  const fingers = [
    { key: "thumb", base: [30, 74], dir: [-0.92, -0.38], len: 30, w: 9 },
    { key: "index", base: [46, 60], dir: [-0.18, -1.0], len: 40, w: 9 },
    { key: "middle", base: [60, 57], dir: [0.0, -1.0], len: 45, w: 9 },
    { key: "ring", base: [74, 59], dir: [0.16, -1.0], len: 41, w: 9 },
    { key: "pinky", base: [87, 65], dir: [0.34, -0.94], len: 32, w: 8 }
  ];

  const ratio = { ext: 1.0, curl: 0.62, fold: 0.34 };

  let paths = "";
  let dots = "";

  fingers.forEach((f, i) => {
    const state = s[i] || "fold";
    const k = ratio[state] === undefined ? 0.34 : ratio[state];
    const [bx, by] = f.base;
    const [dx, dy] = f.dir;

    const midLen = f.len * k * 0.55;
    const endLen = f.len * k;

    /* นิ้วที่งอหรือพับ จะโค้งเข้าหาฝ่ามือ ไม่ใช่แค่สั้นลง */
    const bend = state === "ext" ? 0 : state === "curl" ? 9 : 15;

    const mx = bx + dx * midLen + bend * 0.5;
    const my = by + dy * midLen + bend * 0.55;
    const ex = bx + dx * endLen + bend;
    const ey = by + dy * endLen + bend * 1.15;

    const color =
      state === "ext" ? "var(--accent)" : state === "curl" ? "var(--warn)" : "var(--muted)";
    const width = state === "ext" ? f.w : f.w - 1;

    paths += `<path d="M${bx} ${by} Q${mx} ${my} ${ex} ${ey}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    dots += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3" fill="${color}"/>`;

    if (showLabels) {
      dots += `<text x="${ex.toFixed(1)}" y="${(ey - 8).toFixed(1)}" font-size="7" fill="${color}" text-anchor="middle">${i + 1}</text>`;
    }
  });

  return `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="แผนผังท่ามือ">
  <rect x="38" y="55" width="58" height="46" rx="18" fill="var(--panel-2)" stroke="var(--line)" stroke-width="1.5"/>
  ${paths}
  ${dots}
</svg>`;
}

/* คำอธิบายสีของแผนผัง */
const HAND_DIAGRAM_LEGEND = [
  { color: "var(--accent)", text: "เหยียดออก" },
  { color: "var(--warn)", text: "งอครึ่ง" },
  { color: "var(--muted)", text: "พับเก็บ" }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildHandDiagram, HAND_DIAGRAM_LEGEND };
}
