-- ==========================================================================
-- Sign Speak — โครงสร้างฐานข้อมูล Supabase
-- --------------------------------------------------------------------------
-- วิธีใช้:
--   1. เข้า supabase.com สร้างโปรเจกต์ใหม่
--   2. เปิดเมนู SQL Editor
--   3. คัดลอกทั้งไฟล์นี้ไปวาง แล้วกด Run
--
-- หลักการออกแบบ:
--   ไม่มีคอลัมน์ใดที่ระบุตัวบุคคลได้ ไม่มีชื่อ ไม่มีอีเมล ไม่มี IP ดิบ
--   Row Level Security เปิดไว้แต่ไม่มี policy ใดๆ เลย
--   ซึ่งใน PostgreSQL แปลว่า "ปฏิเสธทุกการเข้าถึง" เป็นค่าตั้งต้น
--   จึงเขียนได้เฉพาะผ่าน service_role key ที่อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
-- ==========================================================================
 
create extension if not exists "pgcrypto";
 
-- --------------------------------------------------------------------------
-- ตารางหลัก
-- --------------------------------------------------------------------------
create table if not exists public.responses (
  id               uuid primary key default gen_random_uuid(),
  submitted_at     timestamptz not null default now(),
 
  -- ประเภทข้อมูล: แบบสอบถามก่อนใช้ / รีวิว / สถิติการฝึก
  kind             text not null
                   check (kind in ('onboarding', 'review', 'practice')),
 
  -- คำตอบทั้งหมด เก็บเป็น JSON เพื่อให้เพิ่มคำถามใหม่ได้โดยไม่ต้องแก้ตาราง
  -- โค้ดฝั่งเซิร์ฟเวอร์ตรวจสอบและกรองค่าทุกตัวก่อนบันทึกแล้ว
  payload          jsonb not null,
 
  -- ค่าแฮชทางเดียวของ IP ใช้จำกัดจำนวนครั้งการส่งเท่านั้น
  -- แปลงกลับเป็น IP เดิมไม่ได้ เพราะผสม salt ลับที่อยู่ฝั่งเซิร์ฟเวอร์
  ip_hash          text,
 
  -- เวอร์ชันของข้อความยินยอมที่ผู้ใช้เห็นตอนกดส่ง
  consent_version  text not null default 'unknown',
 
  -- กันข้อมูลบวมจากการส่งค่าที่ใหญ่ผิดปกติ
  constraint payload_size check (pg_column_size(payload) < 16384)
);
 
comment on table public.responses is
  'คำตอบแบบสอบถามและสถิติการใช้งานแบบไม่ระบุตัวตนของ Sign Speak';
comment on column public.responses.ip_hash is
  'SHA-256 ของ IP ผสม salt ลับ ใช้จำกัดอัตราการส่งเท่านั้น ไม่ใช่ข้อมูลระบุตัวตน';
 
-- --------------------------------------------------------------------------
-- ดัชนี
-- --------------------------------------------------------------------------
 
-- ใช้ตอนนับว่า IP นี้ส่งมากี่ครั้งแล้วในช่วงเวลาที่กำหนด
create index if not exists responses_rate_idx
  on public.responses (ip_hash, submitted_at desc);
 
-- ใช้ตอนดึงข้อมูลมาวิเคราะห์
create index if not exists responses_kind_time_idx
  on public.responses (kind, submitted_at desc);
 
-- --------------------------------------------------------------------------
-- ความปลอดภัย: ปฏิเสธทุกอย่างเป็นค่าตั้งต้น
-- --------------------------------------------------------------------------
alter table public.responses enable row level security;
alter table public.responses force row level security;
 
-- ไม่สร้าง policy ใดๆ ทั้งสิ้น = anon key และ authenticated key
-- ทั้งอ่านและเขียนไม่ได้เลย แม้จะรู้ URL และ anon key ก็ทำอะไรไม่ได้
-- มีแต่ service_role key ที่อยู่ในตัวแปรสภาพแวดล้อมบน Vercel เท่านั้นที่เขียนได้
 
-- เพิกถอนสิทธิ์ระดับตารางออกจาก role สาธารณะให้แน่ใจอีกชั้น
revoke all on public.responses from anon, authenticated;
 
-- --------------------------------------------------------------------------
-- มุมมองสำหรับดูสรุป (เรียกจากแผงควบคุม Supabase เท่านั้น)
-- --------------------------------------------------------------------------
 
-- ท่าไหนที่คนทำแล้วไม่ผ่านบ่อยที่สุด
-- ใช้หาว่าเกณฑ์ของท่าไหนเข้มเกินไป แล้วเอาไปปรับใน js/config.js
create or replace view public.v_hard_signs as
select
  s->>'id'                                as sign_id,
  count(*)                                as sessions,
  sum((s->>'frames')::bigint)             as total_frames,
  sum((s->>'passes')::bigint)             as total_passes,
  round(
    sum((s->>'passes')::numeric)
    / nullif(sum((s->>'frames')::numeric), 0) * 1000, 2
  )                                       as passes_per_1000_frames
from public.responses r,
     lateral jsonb_array_elements(r.payload->'perSign') as s
where r.kind = 'practice'
group by 1
order by passes_per_1000_frames asc nulls first;
 
-- ภาพรวมผู้ใช้
create or replace view public.v_audience as
select
  payload->>'role'   as role,
  payload->>'level'  as level,
  payload->>'goal'   as goal,
  count(*)           as people
from public.responses
where kind = 'onboarding'
group by 1, 2, 3
order by people desc;
 
-- คะแนนความพึงพอใจและปัญหาที่พบ
create or replace view public.v_feedback as
select
  submitted_at,
  (payload->>'rating')::int as rating,
  payload->>'accuracy'      as accuracy_issue,
  payload->>'difficulty'    as hard_signs,
  payload->>'feedback'      as comment
from public.responses
where kind = 'review'
order by submitted_at desc;
 
-- --------------------------------------------------------------------------
-- ความปลอดภัยของ view: ป้องกันไม่ให้ view หลีกเลี่ยง RLS ของตารางหลัก
-- --------------------------------------------------------------------------
-- ปกติ view จะรันด้วยสิทธิ์ของ "เจ้าของ view" (ซึ่งไม่โดน RLS บล็อก)
-- ต้องตั้ง security_invoker = on เพื่อให้ view รันด้วยสิทธิ์ของ "คนที่เรียก" แทน
-- ทำให้ RLS แบบปฏิเสธทุกอย่างของตาราง responses มีผลกับ view ทั้ง 3 นี้ด้วย
alter view public.v_hard_signs set (security_invoker = on);
alter view public.v_audience   set (security_invoker = on);
alter view public.v_feedback   set (security_invoker = on);
 
-- เพิกถอนสิทธิ์เข้าถึง view จาก role สาธารณะอีกชั้นหนึ่ง (กันสองชั้น)
revoke all on public.v_hard_signs from anon, authenticated;
revoke all on public.v_audience   from anon, authenticated;
revoke all on public.v_feedback   from anon, authenticated;
 
-- --------------------------------------------------------------------------
-- การลบข้อมูลเก่า (เก็บไม่เกิน 24 เดือน ตามที่แจ้งไว้ในหน้า Privacy)
-- --------------------------------------------------------------------------
-- รันคำสั่งนี้เป็นระยะ หรือตั้ง Scheduled Function ใน Supabase ให้รันเดือนละครั้ง
--
--   delete from public.responses
--   where submitted_at < now() - interval '24 months';
