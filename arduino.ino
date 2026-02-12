// โค้ดสำหรับการทำงานของ ESP32
#include <Arduino.h>

// กำหนดขาสำหรับ Serial2 (ใช้สื่อสาร RS485)
#define RX2 16
#define TX2 17
#define RE_DE_PIN 4  // ขาควบคุมโหมดรับ/ส่งของ RS485

// คำสั่ง Modbus RTU สำหรับอ่านข้อมูลจากเซ็นเซอร์ดิน
byte readCommand[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x07, 0x04, 0x08};
byte values[19]; // อาเรย์เก็บข้อมูลที่ได้รับจากเซ็นเซอร์ (19 ไบต์)

void setup() {
  Serial.begin(115200);  // Serial สำหรับส่งข้อมูลไปคอมพิวเตอร์
  Serial2.begin(4800, SERIAL_8N1, RX2, TX2); // Serial2 สำหรับสื่อสาร RS485 ที่ความเร็ว 4800 baud
  pinMode(RE_DE_PIN, OUTPUT); // ตั้งขา RE/DE เป็นเอาต์พุต
  digitalWrite(RE_DE_PIN, LOW); // ตั้งเป็นโหมดรับข้อมูล (Receive Mode)
  pinMode(2, OUTPUT); // ขา GPIO 2 สำหรับไฟ LED แสดงสถานะ
}

void loop() {
  // 1. ล้างข้อมูลเก่าใน Buffer
  while(Serial2.available()) Serial2.read();

  // 2. ส่งคำสั่งอ่านข้อมูลไปยังเซ็นเซอร์
  digitalWrite(RE_DE_PIN, HIGH); // เปลี่ยนเป็นโหมดส่ง (Transmit Mode)
  delay(10); // รอให้สัญญาณเสถียร
  Serial2.write(readCommand, sizeof(readCommand)); // ส่งคำสั่ง Modbus
  Serial2.flush(); // รอให้ส่งข้อมูลครบก่อน
  digitalWrite(RE_DE_PIN, LOW); // กลับไปโหมดรับข้อมูล (Receive Mode)

  // 3. รอรับข้อมูลจากเซ็นเซอร์ (สูงสุด 1 วินาที)
  unsigned long timeout = millis(); // บันทึกเวลาเริ่มต้น
  while (Serial2.available() < 19 && millis() - timeout < 1000) { delay(10); } // รอจนกว่าจะได้ 19 ไบต์หรือหมดเวลา

  // 4. ประมวลผลข้อมูลที่ได้รับ
  if (Serial2.available() >= 19) {
    // อ่านข้อมูล 19 ไบต์เข้า Array
    for (int i = 0; i < 19; i++) values[i] = Serial2.read();

    // ตรวจสอบว่าเป็น Response ที่ถูกต้องหรือไม่
    if (values[0] == 0x01 && values[1] == 0x03) {
        // แปลงข้อมูลจาก 2 ไบต์เป็นค่าจริง
        float hum  = ((values[3] << 8) | values[4]) / 10.0;  // ความชื้น (หาร 10 เพื่อได้ทศนิยม)
        float temp = ((values[5] << 8) | values[6]) / 10.0;  // อุณหภูมิ
        int ec     = ((values[7] << 8) | values[8]);         // ค่าการนำไฟฟ้า
        float ph   = ((values[9] << 8) | values[10]) / 10.0; // ค่า pH
        int n      = ((values[11] << 8) | values[12]);       // ไนโตรเจน
        int p      = ((values[13] << 8) | values[14]);       // ฟอสฟอรัส
        int k      = ((values[15] << 8) | values[16]);       // โพแทสเซียม

        // ส่งข้อมูลออกทาง Serial ในรูปแบบ CSV
        Serial.print(temp); Serial.print(",");
        Serial.print(hum);  Serial.print(",");
        Serial.print(ec);   Serial.print(",");
        Serial.print(ph);   Serial.print(",");
        Serial.print(n);    Serial.print(",");
        Serial.print(p);    Serial.print(",");
        Serial.println(k);

        // กระพริบไฟ LED เพื่อแสดงว่าอ่านข้อมูลสำเร็จ
        digitalWrite(2, HIGH); delay(100); digitalWrite(2, LOW);
    }
  } else {
    // ถ้าไม่ได้รับข้อมูลหรือหมดเวลา ให้ส่งค่า 0 ทั้งหมด
    Serial.println("0.0,0.0,0,0.0,0,0,0");
  }

  // 5. เข้าสู่โหมด Light Sleep เพื่อประหยัดพลังงาน (5 วินาที)
  Serial.flush(); // รอให้ส่งข้อมูลทาง Serial ครบก่อน
  esp_sleep_enable_timer_wakeup(5000000); // ตั้งเวลาตื่น 5,000,000 microseconds = 5 วินาที
  esp_light_sleep_start(); // เข้าสู่โหมดประหยัดพลังงาน
}