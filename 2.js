// 4
// จาก Scenario โรงพยาบาล MedCare ที่แพทย์ไม่ทราบประวัติแพ้ยา:
// Data Modeling: ออกแบบตาราง drug_allergies และ prescriptions พร้อมระบุ Database Constraint ที่ป้องกันไม่ให้บันทึกใบสั่งยาหากผู้ป่วยแพ้ยานั้น
// Workflow: อธิบายขั้นตอนเมื่อระบบตรวจพบการแพ้ยา จะ Alert อย่างไร และใครมีสิทธิ์ Override คำเตือน
// Data Modeling
`
ตารางยา
CREATE TABLE drugs (
  drug_id   SERIAL PRIMARY KEY,
  name      VARCHAR(255) NOT NULL,
  drug_group VARCHAR(100)     
);

ตารางประวัติแพ้ยาของผู้ป่วย
CREATE TABLE drug_allergies (
  allergy_id   SERIAL PRIMARY KEY,
  patient_id   INT NOT NULL REFERENCES patients(patient_id),
  drug_id      INT REFERENCES drugs(drug_id),     แพ้ยาตัวนี้โดยตรง
  drug_group   VARCHAR(100),                      หรือแพ้ทั้ง Group
  severity     VARCHAR(20) CHECK (severity IN ('mild','moderate','severe','life-threatening')),
  recorded_by  INT REFERENCES doctors(doctor_id),
  recorded_at  TIMESTAMP DEFAULT NOW(),
  notes        TEXT
);

ตารางใบสั่งยา
CREATE TABLE prescriptions (
  prescription_id SERIAL PRIMARY KEY,
  patient_id      INT NOT NULL REFERENCES patients(patient_id),
  drug_id         INT NOT NULL REFERENCES drugs(drug_id),
  doctor_id       INT NOT NULL REFERENCES doctors(doctor_id),
  prescribed_at   TIMESTAMP DEFAULT NOW(),
  override        BOOLEAN DEFAULT FALSE,            แพทย์ Override คำเตือน
  override_reason TEXT,                             ต้องระบุเหตุผลถ้า Override
  status          VARCHAR(20) DEFAULT 'pending'
);
`
// Database Constraint
// CHECK CONSTRAINT + Function
`
CREATE OR REPLACE FUNCTION check_drug_allergy()
RETURNS TRIGGER AS $$
BEGIN
  ตรวจแพ้ยา
  IF EXISTS (
    SELECT 1 FROM drug_allergies da
    JOIN drugs d ON d.drug_id = NEW.drug_id
    WHERE da.patient_id = NEW.patient_id
      AND (da.drug_id = NEW.drug_id OR da.drug_group = d.drug_group)
  ) AND NEW.override = FALSE THEN
    RAISE EXCEPTION 'ALLERGY_DETECTED: Patient % is allergic to this drug', NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ผูก Trigger กับตาราง prescriptions
CREATE TRIGGER trg_allergy_check
BEFORE INSERT ON prescriptions
FOR EACH ROW EXECUTE FUNCTION check_drug_allergy();
`
// ทุก Override บันทึกลง Audit Log พร้อม timestamp + doctor_id + เหตุผล

// 5
// Doctor Mobile App 
//       |
// > Request ภาพจากระบบ PACS (Picture Archiving and Communication System) ที่เก็บภาพทางการแพทย์ เช่น X-ray, MRI
//       |
// Internal CDN / Edge Cache           
// (nginx หรือ Cloudflare on-premise)      
// ส่ง Thumbnail ก่อน → โหลด Full-res ทีหลัง
//       |
// > Cache Miss 
//       |
// Lab Image Service (API)             
// - ตรวจสิทธิ์ก่อนทุกครั้ง                     
// - สร้าง Signed URL อายุสั้น (15 นาที)         
//       |
// Object Storage                      
// Hot:  MinIO / S3  (ผลใหม่ < 1 ปี)            
// Cold: Tape / Glacier (ผลเก่า > 1 ปี)  

// technical :
// 1. Progressive JPEGโหลดภาพเบลอก่อน ชัดขึ้นเรื่อยๆ แพทย์เห็นภาพเร็วขึ้น
// 2. Thumbnail on-demand ส่ง thumbnail 200KB ก่อน แพทย์กด zoom ค่อยดึง full-res
// 3. HTTP Range Requestดึงเฉพาะส่วนของภาพที่กำลังดูอยู่ ไม่ดึงทั้งหมด
// 4. Internal CDNCache ภาพที่เปิดบ่อยไว้ใกล้ผู้ใช้ในโรงพยาบาล

// PDPA ป้องกันข้อมูลหลุด
// 1. Signed URL อายุสั้น — ลิงก์ภาพหมดอายุใน 15 นาที ส่งให้คนอื่นไม่ได้
// ex.
`
const signedUrl = await storage.getSignedUrl(fileKey, {
   expiresIn: 900, // 15 นาที
   allowedIp: doctorIp // ผูก IP ด้วย
});
`
// 2. Role-Based Access Control (RBAC)

// 3. มาตรการเพิ่มเติม
// เข้ารหัสไฟล์ด้วย AES-256 ทั้งตอนเก็บและส่ง (Encrypt at rest & in transit)
// 4. บันทึก Access Log ทุกครั้งที่มีการเปิดดูภาพ
