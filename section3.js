// 6
Prompt:
`
You are a medical data extraction assistant.
Your job is to extract ONLY the information explicitly stated by the patient.
Do NOT diagnose, infer, or add any medical interpretation.
Return ONLY a valid JSON object with no explanation, no markdown, no extra text.

Schema:
{
  "symptoms": [
    {
      "description": "string — exact symptom as described",
      "duration": "string — how long (if mentioned)",
      "onset": "string — when it started (if mentioned)"
    }
  ],
  "food_intake": ["string — food/drink mentioned"],
  "notes": "string — any other relevant info stated by patient"
}

Rules:
- If information is not mentioned use null
- Do NOT add fields not in schema
- Do NOT suggest possible diseases or causes
- Do NOT say things like "may indicate" or "possibly"

Patient statement:
"ปวดท้องบิดๆ มา 2 ชั่วโมง กินส้มตำปูปลาร้ามา"
`
// วิธีป้องกัน ai หลอน
// 1. กำหนด JSON Schema ตายตัว
// 2. บอกตรงๆ ว่า Do NOT diagnose / Do NOT infer
// 3. ถ้าไม่มีข้อมูล ใส่ null
// 4. ตรวจ JSON match schema จริง for reject

// 7
`
───────────────────────────────────────────────────────
                    Doctor / Pharmacist UI                
              กรอกรายการยาที่ต้องการตรวจสอบ              
───────────────────────────────────────────────────────
                        │ POST /check-interaction
                        ▼
───────────────────────────────────────────────────────
                   Drug Interaction API                   
                      (Backend Service)                   
──────┬────────────────────────────────┬───────────────
       │                                │
       ▼                                ▼
─────────────                 ───────────────────
Drug DB                       AI Model        
(PostgreSQL)                  (LLM / ML Model (Sklearn))                                                 
- drug_id                     รับ context จาก DB  
- name                        วิเคราะห์ปฏิกิริยา  
- group                       ส่งคืน confidence  
- interactions              
─────────────                 ───────────────────
       │                                │
       └──────────────|─────────────────┘
                      ▼
──────────────────────────────────────────────────────
Confidence Scoring Layer                                                                       
confidence ≥ 0.85 → Safe to show                     
confidence 0.60-0.84 → Show with Warning             
confidence < 0.60 → Block → Human Review             
──────────────────────────────────────────────────────
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
   ─────────────────       ─────────────────────
     แสดงผลแพทย์            Human-in-the-loop   
     พร้อม source           ส่งต่อเภสัชกร/      
     จาก DB                 แพทย์ review  
   ─────────────────       ─────────────────────
`
// Human-in-the-loop Design
// เมื่อ AI ไม่มั่นใจ (confidence < 0.60)
`
AI ตรวจพบปฏิกิริยา แต่ไม่มั่นใจ
           |
ระบบ Block การสั่งยาอัตโนมัติ
           |
แจ้งเตือนแพทย์: "ต้องการการยืนยันจากผู้เชี่ยวชาญ"
           |
ส่ง Request - เภสัชกร / แพทย์
           |
    ผู้เชี่ยวชาญ Review
      /          \
  ปลอดภัย      อันตราย
      |              |
 อนุมัติ          Block พร้อม
 บันทึก          แจ้งเหตุผล
 ลง DB         กลับแพทย์
`

// AI มั่นใจสูง ≥ 0.85แสดงผลพร้อม source อ้างอิงจาก DB  
// AI มั่นใจปานกลางแสดงผลพร้อม Warning ให้แพทย์ตัดสินใจ  
// AI ไม่มั่นใจBlock + ส่ง Human Review ทันที
// ยาใหม่ไม่มีใน DB Block ทุกกรณี + แจ้งเภสัชกรเพิ่ม DB ระบบ 
// AI ล่มFallback ใช้ Rule-based จาก DB อย่างเดียว