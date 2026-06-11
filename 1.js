// 1
// Emergency (E) ต้องมาก่อน Normal (N) เสมอ
// ถ้าอยู่กลุ่มเดียวกัน ให้ดู Severity Score (1–10) ใครคะแนนสูงกว่าได้รับการรักษาก่อน
// Wait-Time Factor: หากผู้ป่วยกลุ่ม Normal รอเกิน 60 นาที ให้ขยับ Priority ขึ้นมาเทียบเท่า Emergency ชั่วคราว
function getUrgentPatient(queue, currentTime) {
  const scored = queue.map(patient => {
    const waitMinutes = (currentTime - patient.arrivedAt) / 60000;
    const effectiveType =
      patient.type === 'N' && waitMinutes > 60 ? 'E' : patient.type;

    return { ...patient, effectiveType, waitMinutes };
  });

  scored.sort((a, b) => {
    if (a.effectiveType !== b.effectiveType) {
      return a.effectiveType === 'E' ? -1 : 1;
    }
    return b.severityScore - a.severityScore;
  });

  return scored[0]; 
}
// Time Complexity
// .map() คำนวณ effectiveType O(n)
// .sort() เรียงลำดับ O(nlogn)

// 2
// จงเขียน SQL เพื่อหา "รายชื่อแพทย์ที่ว่าง" ในวันที่ 19 มีนาคม 2026 ช่วงเวลา 10:00–11:00 น. โดยมีเงื่อนไข:
// แพทย์ต้องไม่มีนัดที่ status = 'confirmed' ในช่วงเวลาดังกล่าว
// ต้องไม่แสดงแพทย์ที่อยู่ในระหว่าง "พักกะ" (ตรวจสอบจากตาราง doctor_shifts)
// รองรับกรณีนัดหมายก่อนหน้ากินเวลาล้นมา (Overlap) ถึงช่วง 10:00 น.
`
SELECT d.doctor_id, d.name
FROM doctors d
WHERE

  -- เงื่อนไข 1: ไม่มีนัด confirmed ที่ overlap กับ 10:00-11:00
  NOT EXISTS (
    SELECT 1
    FROM appointments a
    WHERE a.doctor_id = d.doctor_id
      AND a.status = 'confirmed'
      AND a.start_time < '2026-03-19 11:00:00'  -- นัดยังไม่จบก่อน 11:00
      AND a.end_time   > '2026-03-19 10:00:00'  -- นัดเริ่มก่อน 10:00 จบหลัง 10:00 (Overlap)
  )

  -- เงื่อนไข 2: ไม่อยู่ในช่วงพักกะ
  AND NOT EXISTS (
    SELECT 1
    FROM doctor_shifts ds
    WHERE ds.doctor_id = d.doctor_id
      AND ds.shift_date = '2026-03-19'
      AND ds.is_break = TRUE
      AND ds.break_start < '2026-03-19 11:00:00'
      AND ds.break_end   > '2026-03-19 10:00:00'
  ); 
`
// เงื่อนไข Overlap:
// นัดชนกัน = นัดเริ่มก่อน 11:00 AND นัดจบหลัง 10:00
// ครอบคลุมทุกกรณี เช่น นัด 09:30–10:30 ที่ล้นมาถึง 10:00 ด้วย

// 3
async function claimInsurance(patientId, treatmentCost) {

  if (!Number.isInteger(patientId) || treatmentCost <= 0) {
    throw new Error('Invalid input');
  }

  const client = await db.getClient(); 

  try {
    await client.query('BEGIN'); // เริ่ม Transaction
    const result = await client.query(
      'SELECT insurance_limit FROM patients WHERE id = $1 FOR UPDATE', 
      [patientId]  // Parameterized Query
    );

    if (result.rows.length === 0) {
      throw new Error('Patient not found');
    }

    const currentLimit = result.rows[0].insurance_limit;

    if (currentLimit < treatmentCost) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'Insufficient insurance limit' };
    }

    // หักวงเงิน
    await client.query(
      'UPDATE patients SET insurance_limit = insurance_limit - $1 WHERE id = $2',
      [treatmentCost, patientId]
    );

    await client.query('COMMIT'); 
    return { success: true };

  } catch (err) {
    await client.query('ROLLBACK'); 
    throw err;

  } finally {
    client.release(); 
  }
}

// SQL Injection ใช้ template string ${patientId} ตรงๆ
// Parameterized Query

// Race Condition อ่าน limit พร้อมกัน 2 เครื่อง ทั้งคู่ผ่าน แล้วหักซ้ำ
// ใช้ BEGIN / COMMIT / ROLLBACK Transaction