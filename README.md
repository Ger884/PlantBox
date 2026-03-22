# 🪴 PlantBox-Local (V.1) 
**โปรเจกต์ระบบตรวจวัดสารอาหารในดินด้วย ESP32 และ Raspberry Pi**

โปรเจกต์นี้เป็นส่วนหนึ่งของวิชาโครงงานครับ พัฒนาขึ้นมาเพื่อช่วยในการวัดค่าสารอาหารในดิน (NPK, pH, EC, Temp, Hum) แบบอัตโนมัติ โดยใช้เซนเซอร์ตัวเดียวแต่ดึงค่าได้ครบ 7 อย่าง แล้วเอามาเก็บข้อมูลไว้ในเครื่อง Raspberry Pi เพื่อดูย้อนหลังครับ

---

### 🚀 การทำงานของระบบ
1. **ESP32:** ทำหน้าที่อ่านค่าจากเซนเซอร์ Soil 7-in-1 ผ่าน RS485 (Modbus RTU) 
2. **Data Transfer:** ส่งข้อมูลจาก ESP32 เข้า Raspberry Pi ผ่านสาย microUSB (Serial Communication)
3. **Raspberry Pi (C++):** ทำหน้าที่เป็น Gateway รับค่าจาก USB มาประมวลผล แล้วบันทึกลงฐานข้อมูล MariaDB ในตัวเครื่อง
4. **Sampling Rate:** ตั้งค่าให้เก็บข้อมูลทุกๆ 5 วินาที (0.2 Hz) เพื่อประหยัดพื้นที่และถนอม SD Card

### 🛠 อุปกรณ์ที่ใช้ (Hardware)
* **บอร์ดประมวลผล:** ESP32 (NodeMCU) และ Raspberry Pi 4 Model B
* **เซนเซอร์:** Soil Sensor 7-in-1 (NPK, pH, EC, Moisture, Temperature)
* **การเชื่อมต่อ:** สาย microUSB, ตัวแปลงสัญญาณ RS485 to TTL
* **เคส:** แผ่นอะคริลิคประกอบเอง

### 💻 ซอฟต์แวร์ที่ใช้ (Software)
* **Language:** C++, SQL
* **Database:** MariaDB (MySQL)

---

### 📂 โครงสร้างโฟลเดอร์
* `arduino.ino` : โค้ดสำหรับ Arduino IDE (อ่านเซนเซอร์ + ส่ง Serial)
* `main.cpp` : โค้ดภาษา C++ สำหรับรับค่าและลง Database
* `database/` : ไฟล์ .sql สำหรับสร้างตาราง (Table Schema)
