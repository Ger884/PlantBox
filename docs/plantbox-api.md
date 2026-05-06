# PlantBox API Usage

เอกสารนี้อธิบายวิธีใช้งาน dashboard และ API สำหรับให้ Raspberry Pi ส่งข้อมูล sensor ขึ้นเว็บกลาง

## ภาพรวมการทำงาน

1. เปิดหน้า dashboard
2. กด `เพิ่มเครื่อง`
3. ตั้งชื่อเครื่อง เช่น `PlantBox แปลง A`
4. ระบบจะสร้าง `boxId` และ `token`
5. บันทึก token ลง Raspberry Pi ของเครื่องนั้น
6. Raspberry Pi ส่งค่า sensor ไปที่ `POST /api/plantbox/readings`
7. Dashboard จะแสดง card ของเครื่องทันทีหลังเพิ่ม และอัปเดตค่าอัตโนมัติเมื่อมีข้อมูลส่งเข้ามา

## Base URL

ตอน local development:

```txt
http://localhost:3000
```

ตอน deploy จริง:

```txt
https://your-domain.com
```

ตัวอย่างด้านล่างใช้ `https://your-domain.com` ให้เปลี่ยนเป็น domain จริงของเว็บ

## Dashboard

เปิดหน้าเว็บหลัก:

```txt
GET /
```

บนหน้า dashboard:

- `เพิ่มเครื่อง`: สร้างเครื่องใหม่และออก token
- card ของเครื่องจะแสดงทันที แม้ยังไม่มีข้อมูล sensor
- menu จุดสามจุดใน card ใช้จัดการเครื่อง
- `คัดลอก token`: copy token ของเครื่องซ้ำได้
- `โค้ดสำหรับเครื่องนี้`: เปิดโค้ด C++ ที่ใส่ URL และ token ของเครื่องไว้แล้ว
- `ออก token ใหม่`: token เดิมใช้ไม่ได้ทันที
- `ลบเครื่อง`: ลบเครื่องและ readings ของเครื่องนั้น

token จะแสดงตอนสร้างเครื่อง และสามารถ copy ซ้ำได้จาก menu ของ card เครื่องนั้น

## 1. สร้างเครื่องใหม่

```http
POST /api/plantbox/devices
Content-Type: application/json
```

Request:

```json
{
  "name": "PlantBox แปลง A"
}
```

curl:

```bash
curl -X POST "https://your-domain.com/api/plantbox/devices" \
  -H "Content-Type: application/json" \
  -d '{"name":"PlantBox แปลง A"}'
```

Response:

```json
{
  "device": {
    "id": "box-mou58wf6-b6b541",
    "name": "PlantBox แปลง A",
    "tokenPreview": "pb_abc...xyz123",
    "createdAt": "2026-05-06T14:00:00.000Z",
    "updatedAt": "2026-05-06T14:00:00.000Z",
    "lastSeenAt": null
  },
  "token": "pb_full_token_shown_once"
}
```

ให้เอา `token` ไปใส่ใน Raspberry Pi ของเครื่องนี้ หรือใช้เมนู `โค้ดสำหรับเครื่องนี้` ใน dashboard เพื่อ copy โค้ด C++ ที่เติม token ให้แล้ว

## 2. ดูรายการเครื่อง

```http
GET /api/plantbox/devices
```

curl:

```bash
curl "https://your-domain.com/api/plantbox/devices"
```

Response:

```json
{
  "devices": [
    {
      "id": "box-mou58wf6-b6b541",
      "name": "PlantBox แปลง A",
      "tokenPreview": "pb_abc...xyz123",
      "createdAt": "2026-05-06T14:00:00.000Z",
      "updatedAt": "2026-05-06T14:00:00.000Z",
      "lastSeenAt": "2026-05-06T14:05:00.000Z"
    }
  ]
}
```

## 3. ส่งค่า sensor จาก Raspberry Pi

```http
POST /api/plantbox/readings
Content-Type: application/json
Authorization: Bearer <DEVICE_TOKEN>
```

Request:

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

curl:

```bash
curl -X POST "https://your-domain.com/api/plantbox/readings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pb_full_token_shown_once" \
  -d '{"ip":"192.168.1.20","temp":28.4,"hum":67,"ec":1200,"ph":6.7,"n":14,"p":8,"k":12}'
```

Response success:

```json
{
  "ok": true,
  "reading": {
    "id": "reading-id",
    "receivedAt": "2026-05-06T14:05:00.000Z",
    "boxId": "box-mou58wf6-b6b541",
    "boxName": "PlantBox แปลง A",
    "ip": "192.168.1.20",
    "recordedAt": "2026-05-06T14:05:00.000Z",
    "metrics": {
      "temperature": 28.4,
      "humidity": 67,
      "ph": 6.7,
      "ec": 1200,
      "nitrogen": 14,
      "phosphorus": 8,
      "potassium": 12
    }
  }
}
```

Response token ผิด:

```json
{
  "error": "Unauthorized device token"
}
```

สำคัญ: ไม่ต้องส่ง `boxId` จาก Raspberry Pi เพราะ server จะระบุเครื่องจาก token เอง

## Field ที่รองรับ

API รองรับชื่อ field แบบสั้นจากระบบเดิม:

| Field | ความหมาย |
| --- | --- |
| `temp` | temperature |
| `hum` | humidity |
| `ec` | electrical conductivity |
| `ph` | pH |
| `n` | nitrogen |
| `p` | phosphorus |
| `k` | potassium |
| `ip` | IP ของ Raspberry Pi หรือ gateway |

API ยังรองรับชื่อเต็มด้วย:

```json
{
  "temperature": 28.4,
  "humidity": 67,
  "ec": 1200,
  "ph": 6.7,
  "nitrogen": 14,
  "phosphorus": 8,
  "potassium": 12
}
```

## 4. ดูค่าล่าสุดของทุกเครื่อง

```http
GET /api/plantbox/boxes
```

curl:

```bash
curl "https://your-domain.com/api/plantbox/boxes"
```

Response:

```json
{
  "boxes": [
    {
      "id": "box-mou58wf6-b6b541",
      "name": "PlantBox แปลง A",
      "ip": "192.168.1.20",
      "updatedAt": "2026-05-06T14:05:00.000Z",
      "metrics": {
        "temperature": 28.4,
        "humidity": 67,
        "ph": 6.7,
        "ec": 1200,
        "nitrogen": 14,
        "phosphorus": 8,
        "potassium": 12
      }
    }
  ],
  "serverTime": "2026-05-06T14:05:01.000Z"
}
```

Dashboard ใช้ endpoint นี้เพื่ออัปเดตค่าทุก 5 วินาที

## 5. ดู readings ย้อนหลัง

```http
GET /api/plantbox/readings?boxId=<BOX_ID>&limit=100
```

curl:

```bash
curl "https://your-domain.com/api/plantbox/readings?boxId=box-mou58wf6-b6b541&limit=100"
```

ถ้าไม่ส่ง `boxId` จะคืน readings ล่าสุดรวมทุกเครื่อง

## 6. ออก token ใหม่

```http
PATCH /api/plantbox/devices/:id
```

curl:

```bash
curl -X PATCH "https://your-domain.com/api/plantbox/devices/box-mou58wf6-b6b541"
```

Response:

```json
{
  "device": {
    "id": "box-mou58wf6-b6b541",
    "name": "PlantBox แปลง A",
    "tokenPreview": "pb_new...token2",
    "createdAt": "2026-05-06T14:00:00.000Z",
    "updatedAt": "2026-05-06T14:10:00.000Z",
    "lastSeenAt": "2026-05-06T14:05:00.000Z"
  },
  "token": "pb_new_full_token_shown_once"
}
```

หลัง rotate token:

- token เดิมใช้ไม่ได้ทันที
- ต้องเอา token ใหม่ไปอัปเดตใน Raspberry Pi

## 7. ลบเครื่อง

```http
DELETE /api/plantbox/devices/:id
```

curl:

```bash
curl -X DELETE "https://your-domain.com/api/plantbox/devices/box-mou58wf6-b6b541"
```

Response:

```json
{
  "ok": true
}
```

การลบเครื่องจะลบ readings ของเครื่องนั้นด้วย

## ตัวอย่าง Python สำหรับ Raspberry Pi

```python
import requests

BASE_URL = "https://your-domain.com"
TOKEN = "pb_full_token_shown_once"

payload = {
    "ip": "192.168.1.20",
    "temp": 28.4,
    "hum": 67,
    "ec": 1200,
    "ph": 6.7,
    "n": 14,
    "p": 8,
    "k": 12,
}

response = requests.post(
    f"{BASE_URL}/api/plantbox/readings",
    json=payload,
    headers={"Authorization": f"Bearer {TOKEN}"},
    timeout=10,
)

response.raise_for_status()
print(response.json())
```

## ตัวอย่าง mapping จาก CSV เดิม

จาก ESP32 เดิมส่ง Serial เป็น:

```txt
temp,hum,ec,ph,n,p,k
```

ถ้าอ่านได้เป็น string:

```txt
28.4,67,1200,6.7,14,8,12
```

ให้แปลงเป็น JSON:

```json
{
  "temp": 28.4,
  "hum": 67,
  "ec": 1200,
  "ph": 6.7,
  "n": 14,
  "p": 8,
  "k": 12
}
```

แล้ว POST ไปที่ `/api/plantbox/readings` พร้อม token ของเครื่องนั้น

## ข้อควรรู้ก่อน deploy จริง

- ตอนนี้ `lib/plantbox-store.ts` ใช้ไฟล์ `.data/plantbox-store.json` เหมาะกับ dev/local
- ถ้าจะ deploy production ควรเปลี่ยน store เป็น MySQL, Postgres, Supabase หรือ Neon
- endpoint จัดการเครื่อง (`/api/plantbox/devices`) ตอนนี้ยังไม่มีระบบ login/admin auth
- endpoint รับ readings ปลอดภัยกว่า เพราะต้องมี token ของเครื่อง
- ตอนนี้ token ถูกเก็บไว้เพื่อให้ dashboard copy ซ้ำและสร้างโค้ดสำเร็จรูปได้ หากใช้ production จริงควรเข้ารหัส token ใน database และป้องกันหน้า dashboard ด้วยระบบ login/admin auth
