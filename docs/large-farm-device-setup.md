# Large Farm Device Setup

เอกสารนี้เป็นแนวทางทำให้การติดตั้ง PlantBox หลายเครื่องง่ายขึ้น โดยไม่ต้องแก้โค้ดหรือใส่ token ทีละเครื่องด้วยมือ เหมาะกับฟาร์มที่มีหลายสิบหรือหลายร้อยเครื่อง

## ปัญหาของวิธี manual token

วิธีปัจจุบันคือ:

1. เพิ่มเครื่องใน dashboard
2. ระบบสร้าง token
3. เอา token ไปใส่ Raspberry Pi ของเครื่องนั้น
4. เครื่องใช้ token นี้ส่งข้อมูลเข้า API

วิธีนี้ใช้ง่ายสำหรับเครื่องจำนวนน้อย แต่ถ้ามีหลายเครื่องจะมีปัญหา:

- ต้อง copy token ทีละเครื่อง
- มีโอกาสใส่ token ผิดเครื่อง
- ทีมติดตั้งหน้างานต้องยุ่งกับ config มากเกินไป
- rotate token หรือเปลี่ยนเครื่องทำได้ช้า
- scale เป็นหลายฟาร์ม/หลายโซนยาก

## แนวทางที่ง่ายกว่า

ให้เปลี่ยนจาก manual token เป็น provisioning flow

แนวคิดคือ:

```txt
เครื่องเปิดครั้งแรก
-> เครื่องรู้ serial ของตัวเอง
-> ถ้ายังไม่มี deviceToken
-> เครื่องเรียก provisioning API
-> server สร้างหรือ claim เครื่อง
-> server คืน deviceToken
-> เครื่องบันทึก token ลง config
-> หลังจากนั้นส่ง readings ตามปกติ
```

## 1. ใช้ serial number ถาวร

ทุกเครื่องควรมี serial number ถาวร เช่น:

```txt
PB-000001
PB-000002
PB-000003
```

serial นี้ควรอยู่ใน:

- สติกเกอร์บนตัวเครื่อง
- ไฟล์ config ใน Raspberry Pi
- QR code บนเครื่อง
- dashboard/device registry

ตัวอย่าง config เริ่มต้น:

```json
{
  "serial": "PB-000001",
  "serverUrl": "https://plantbox.example.com"
}
```

## 2. ใช้ config file แทนการ hardcode

ฝั่ง Raspberry Pi ไม่ควร hardcode token ใน source code

ควรอ่านจากไฟล์ เช่น:

```txt
/etc/plantbox/config.json
```

ตัวอย่างหลัง provision สำเร็จ:

```json
{
  "serial": "PB-000001",
  "serverUrl": "https://plantbox.example.com",
  "deviceToken": "pb_xxxxxxxxxxxxxxxxx"
}
```

ถ้าไม่มี `deviceToken` ให้เครื่องเข้าสู่ provisioning flow อัตโนมัติ

## 3. Provisioning API

เพิ่ม endpoint สำหรับให้เครื่องขอ token ครั้งแรก:

```http
POST /api/plantbox/provision
Content-Type: application/json
Authorization: Bearer <FACTORY_TOKEN>
```

Request:

```json
{
  "serial": "PB-000001",
  "name": "PlantBox แปลง A-01",
  "zone": "A"
}
```

Response:

```json
{
  "device": {
    "id": "box_xxxxx",
    "serial": "PB-000001",
    "name": "PlantBox แปลง A-01",
    "zone": "A"
  },
  "deviceToken": "pb_xxxxxxxxxxxxxxxxx"
}
```

หลังจากได้ `deviceToken` แล้ว Raspberry Pi ต้องบันทึกลง config file

## 4. Factory token

`FACTORY_TOKEN` คือ token กลางที่ใช้เฉพาะตอน provision เครื่องใหม่

ตัวอย่าง:

```bash
PLANTBOX_FACTORY_TOKEN="factory_xxxxxxxxx"
```

ข้อควรระวัง:

- ใช้เฉพาะขั้นตอนติดตั้งครั้งแรก
- ไม่ควรใช้ส่ง readings
- ถ้าหลุดควร rotate ได้
- ใน production อาจแยก factory token ต่อฟาร์มหรือ batch

## 5. QR code / claim code

สำหรับทีมติดตั้งหน้างาน ควรใช้ QR code เพื่อลดการพิมพ์ผิด

ตัวอย่าง QR content:

```txt
https://plantbox.example.com/setup?serial=PB-000001&claim=8K2D9A
```

หรือใช้ claim code สั้น:

```txt
PB-000001
CLAIM: 8K2D9A
```

flow:

1. เจ้าหน้าที่ scan QR
2. เปิดหน้า setup
3. ตั้งชื่อเครื่อง/โซน/แปลง
4. กด claim
5. เครื่องถูกผูกกับฟาร์ม

## 6. Bulk import

สำหรับฟาร์มใหญ่ ควรเตรียมเครื่องล่วงหน้าด้วย CSV

ตัวอย่าง:

```csv
serial,name,zone
PB-000001,PlantBox A-01,A
PB-000002,PlantBox A-02,A
PB-000003,PlantBox B-01,B
```

dashboard ควรมีฟีเจอร์:

- import CSV
- สร้าง device records ล่วงหน้า
- export QR codes
- ดูสถานะว่าเครื่องไหน provision แล้ว
- ดูเครื่องที่ยังไม่เคยส่งข้อมูล

## 7. Device lifecycle

สถานะที่ควรมี:

```txt
pending     = สร้างไว้แล้ว แต่ยังไม่ provision
claimed     = provision แล้ว แต่ยังไม่เคยส่ง readings
online      = ส่งข้อมูลล่าสุดในเวลาที่กำหนด
stale       = เคยส่งข้อมูล แต่เงียบเกิน threshold
disabled    = ปิดใช้งาน token แล้ว
```

ตัวอย่าง threshold:

```txt
online: lastSeenAt <= 60 seconds
stale:  lastSeenAt > 60 seconds
```

## 8. Readings flow หลัง provision

เมื่อเครื่องมี `deviceToken` แล้ว ให้ส่ง readings แบบเดิม:

```http
POST /api/plantbox/readings
Content-Type: application/json
Authorization: Bearer <DEVICE_TOKEN>
```

Payload:

```json
{
  "ip": "192.168.1.20",
  "temp": 28.4,
  "hum": 67,
  "ec": 1200,
  "ph": 6.7,
  "n": 14,
  "p": 8,
  "k": 12
}
```

server จะระบุเครื่องจาก `DEVICE_TOKEN` เอง ไม่ต้องส่ง `boxId`

## 9. Recommended setup script

ฝั่ง Raspberry Pi ควรมี script เริ่มต้นประมาณนี้:

```txt
load /etc/plantbox/config.json

if deviceToken exists:
  send readings normally
else:
  call /api/plantbox/provision with serial + factory token
  save returned deviceToken to config
  send readings normally
```

## 10. ขั้นที่ควรทำต่อจากระบบปัจจุบัน

ระบบปัจจุบันมี:

- สร้างเครื่องจาก dashboard
- token แยกต่อเครื่อง
- ส่ง readings ด้วย device token
- dashboard แสดงเครื่องทันทีแม้ยังไม่มี readings

ขั้นถัดไปสำหรับฟาร์มใหญ่:

1. เพิ่ม field `serial`, `zone`, `status` ใน device model
2. เพิ่ม `POST /api/plantbox/provision`
3. เพิ่ม `PLANTBOX_FACTORY_TOKEN`
4. เพิ่มหน้า bulk import CSV
5. เพิ่ม QR/claim code สำหรับแต่ละเครื่อง
6. ให้ Raspberry Pi อ่าน/เขียน config file เอง
7. เปลี่ยน storage จากไฟล์ `.data` เป็น database จริง เช่น Postgres หรือ MySQL

## สรุป

สำหรับฟาร์มเล็ก ใช้ manual device token ได้

สำหรับฟาร์มใหญ่ ควรใช้:

- serial number ถาวร
- provisioning API
- config file บน Raspberry Pi
- QR/claim code
- bulk import
- database กลาง

วิธีนี้ทำให้ทีมติดตั้งไม่ต้องแก้โค้ด ไม่ต้อง copy token ยาว ๆ ทีละเครื่อง และจัดการเครื่องจำนวนมากได้ง่ายกว่า
