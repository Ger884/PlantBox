# แผนทำข้อมูล PlantBox แบบ realtime และใช้งานนอก LAN

## เป้าหมาย

- Raspberry Pi ส่งค่าล่าสุดเข้าระบบกลางผ่าน HTTPS API
- Web client เปิดจากที่ไหนก็ได้ ไม่จำเป็นต้องอยู่ LAN เดียวกับ Raspberry Pi
- Web client อ่านข้อมูลจาก API กลาง ไม่ยิงเข้า IP ของ Raspberry Pi โดยตรง
- หน้า dashboard เห็นค่าล่าสุดโดยไม่ต้อง refresh
- localStorage ใช้เป็น cache ฝั่ง browser สำหรับเปิดหน้าเร็วและ fallback ตอน network หลุด

## API ที่เพิ่มในเว็บนี้

- `POST /api/plantbox/devices` สำหรับสร้างเครื่องใหม่และออก token
- `GET /api/plantbox/devices` สำหรับดูเครื่องที่ลงทะเบียนแล้ว
- `PATCH /api/plantbox/devices/:id` สำหรับ rotate token ของเครื่องนั้น
- `DELETE /api/plantbox/devices/:id` สำหรับลบเครื่องและ readings ของเครื่องนั้น
- `POST /api/plantbox/readings` สำหรับ Raspberry Pi ส่งค่าขึ้น server
- `GET /api/plantbox/boxes` สำหรับหน้า dashboard อ่านค่าล่าสุดของแต่ละกล่อง
- `GET /api/plantbox/readings?boxId=box-1&limit=100` สำหรับดู readings ย้อนหลัง

สร้างเครื่องใหม่:

```bash
curl -X POST "https://your-domain.com/api/plantbox/devices" \
  -H "Content-Type: application/json" \
  -d '{"name":"PlantBox 1"}'
```

API จะคืน `device.id` และ `token` กลับมา ให้บันทึก token ลง Raspberry Pi หรือใช้เมนูใน dashboard เพื่อ copy token/โค้ด C++ สำหรับเครื่องนั้น

ตัวอย่าง payload จาก Raspberry Pi:

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

เวลา Raspberry Pi ส่งข้อมูล ให้ใส่ token ของเครื่องนั้นใน header:

```http
Authorization: Bearer pb_xxxxxxxxxxxxxxxxx
```

เมื่อ backend ได้ token แล้ว จะระบุ `boxId` จาก token เอง จึงไม่ต้องเชื่อ `boxId` ที่ส่งมาจากตัวเครื่อง

## Data model ขั้นแรก

- `boxes`: `id`, `name`, `ip`, `deviceTokenHash`, `createdAt`, `updatedAt`
- `box_readings`: `id`, `boxId`, `temperature`, `humidity`, `ph`, `ec`, `nitrogen`, `phosphorus`, `potassium`, `recordedAt`
- `box_latest_state`: `boxId`, ค่าล่าสุดทุก field, `recordedAt`, `onlineStatus`

## Flow ที่แนะนำ

1. Device ส่งข้อมูลเข้า backend ผ่าน `POST /api/plantbox/readings` หรือ MQTT bridge
2. Backend validate token, normalize payload, บันทึก `box_readings`, แล้ว update `box_latest_state`
3. Backend publish event ไป channel เช่น `box:{boxId}` หรือ `boxes:latest`
4. Dashboard โหลดค่าเริ่มต้นจาก API แล้ว subscribe realtime stream
5. เมื่อ event ใหม่มา ให้ update React state และเขียน latest snapshot ลง localStorage

## ตัวอย่างฝั่ง Raspberry Pi

ถ้าใช้ C++ gateway เดิมที่รับ CSV จาก Serial อยู่แล้ว ให้เปลี่ยนส่วนที่เคย `INSERT INTO soil_data` ในเครื่องเป็นยิง HTTP POST:

```bash
curl -X POST "https://your-domain.com/api/plantbox/readings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pb_xxxxxxxxxxxxxxxxx" \
  -d '{"temp":28.4,"hum":67,"ec":1200,"ph":6.7,"n":14,"p":8,"k":12}'
```

ฝั่ง C++ ใช้ `libcurl` ได้ หรือถ้าอยากเริ่มง่ายให้ gateway เรียก script เช่น Python/Node ที่รับ CSV แล้ว POST JSON ขึ้น server

## Realtime transport

- ระยะเริ่มต้นใช้ polling ทุก 5 วินาทีจาก `GET /api/plantbox/boxes`
- ขยับเป็น Server-Sent Events ถ้า dashboard แค่อ่านข้อมูลอย่างเดียวและต้องการ realtime กว่า polling
- ใช้ WebSocket ถ้าต้องส่งคำสั่งกลับไปที่กล่อง เช่น เปิดปั๊ม, calibrate sensor, reboot
- ถ้ามี MQTT จากอุปกรณ์อยู่แล้ว ให้ใช้ MQTT broker สำหรับ device layer แล้ว bridge เข้า database/realtime channel

## Reliability

- ทุก reading ต้องมี `recordedAt` จาก device หรือ server และควรมี sequence number ถ้า device ทำได้
- ถ้าไม่เห็นข้อมูลใหม่เกิน threshold เช่น 60 วินาที ให้ mark box เป็น stale/offline
- ฝั่ง UI ควรแสดงเวลาล่าสุดจาก server ไม่ใช้เวลาจาก browser เป็น source of truth
- เก็บ raw readings แยกจาก latest state เพื่อให้ทำกราฟย้อนหลังได้

## ขั้น implementation ถัดไป

1. เพิ่ม database และ schema สำหรับ `boxes`, `box_readings`, `box_latest_state`
2. ทำ ingest API สำหรับรับค่าจากกล่อง
3. ทำ API โหลด latest snapshot สำหรับ dashboard
4. เพิ่ม SSE/WebSocket endpoint สำหรับ realtime updates
5. ปรับ dashboard ให้ bootstrap จาก API, fallback localStorage, แล้ว subscribe realtime

ตอนนี้ code ใน repo นี้มี API และ dashboard แบบ polling แล้ว แต่ storage ยังเป็นไฟล์ `.data/plantbox-store.json` สำหรับ dev/local เท่านั้น หาก deploy บน serverless หรือ production ควรเปลี่ยน `lib/plantbox-store.ts` ไปใช้ MySQL/Postgres/Supabase/Neon แทนไฟล์
