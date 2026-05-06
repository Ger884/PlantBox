# PlantBox

PlantBox เป็นเว็บ dashboard สำหรับรับข้อมูล sensor จากเครื่อง PlantBox/Raspberry Pi ผ่าน API กลาง แล้วแสดงค่าล่าสุดของแต่ละเครื่องบนหน้าเว็บ โดย client ไม่จำเป็นต้องอยู่ LAN เดียวกับตัวเครื่อง

## ความสามารถหลัก

- เพิ่มเครื่อง PlantBox จาก dashboard
- สร้าง token แยกต่อเครื่อง
- แสดง card ของเครื่องทันทีหลังเพิ่ม แม้ยังไม่มีข้อมูล sensor
- รับข้อมูล sensor ผ่าน `POST /api/plantbox/readings`
- แยกข้อมูลตามเครื่องจาก token ไม่ต้องส่ง `boxId` จาก Raspberry Pi
- แสดงค่าล่าสุดแบบ auto refresh ทุก 5 วินาที
- Copy token ซ้ำได้จากเมนูของเครื่อง
- สร้างโค้ด C++ สำเร็จรูปสำหรับ Raspberry Pi โดยเติม URL และ token ให้แล้ว

## Tech Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- shadcn/ui
- react-hook-form
- zod
- Bun

## Requirements

- Bun
- Node.js runtime ที่รองรับ Next.js 16

ติดตั้ง Bun ได้จาก:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Getting Started

ติดตั้ง dependencies:

```bash
bun install
```

รัน development server:

```bash
bun run dev
```

เปิดเว็บ:

```txt
http://localhost:3000
```

Build production:

```bash
bun run build
```

Start production:

```bash
bun run start
```

## วิธีใช้งาน Dashboard

1. เปิดหน้าเว็บหลัก
2. กด `เพิ่มเครื่อง`
3. กรอกชื่อเครื่อง เช่น `PlantBox แปลง A-01`
4. ระบบจะสร้าง token ให้เครื่องนั้น
5. Copy token หรือกด `เปิดโค้ดสำเร็จรูป`
6. นำ token หรือโค้ดไปใช้บน Raspberry Pi
7. เมื่อเครื่องส่งข้อมูลเข้ามา card จะอัปเดตค่าล่าสุดอัตโนมัติ

เมนูจุดสามจุดใน card ใช้สำหรับ:

- คัดลอก token
- เปิดโค้ด C++ สำหรับเครื่องนี้
- ออก token ใหม่
- ลบเครื่อง

## API สำหรับ Raspberry Pi

Endpoint หลักที่เครื่องต้องส่งข้อมูลเข้า:

```http
POST /api/plantbox/readings
Content-Type: application/json
Authorization: Bearer <DEVICE_TOKEN>
```

ตัวอย่าง payload:

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

ตัวอย่าง curl:

```bash
curl -X POST "https://your-domain.com/api/plantbox/readings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pb_xxxxxxxxxxxxxxxxx" \
  -d '{"ip":"192.168.1.20","temp":28.4,"hum":67,"ec":1200,"ph":6.7,"n":14,"p":8,"k":12}'
```

ระบบจะระบุเครื่องจาก token เอง ไม่ต้องส่ง `boxId`

## API ทั้งหมด

สร้างเครื่องใหม่:

```http
POST /api/plantbox/devices
```

ดูรายการเครื่อง:

```http
GET /api/plantbox/devices
```

ออก token ใหม่:

```http
PATCH /api/plantbox/devices/:id
```

ลบเครื่อง:

```http
DELETE /api/plantbox/devices/:id
```

ส่งค่า sensor:

```http
POST /api/plantbox/readings
```

ดู readings ย้อนหลัง:

```http
GET /api/plantbox/readings?boxId=<BOX_ID>&limit=100
```

ดูค่าล่าสุดของทุกเครื่อง:

```http
GET /api/plantbox/boxes
```

## ตัวอย่างข้อมูลจาก Serial เดิม

ถ้า ESP32/Raspberry Pi ส่งข้อมูลเป็น CSV:

```txt
28.4,67,1200,6.7,14,8,12
```

ให้ map เป็น:

```txt
temp,hum,ec,ph,n,p,k
```

แล้วส่ง JSON:

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

## Storage

ระบบเลือก storage อัตโนมัติ:

- ถ้ามี `DATABASE_URL` หรือ `POSTGRES_URL` จะใช้ Postgres
- ถ้าไม่มี env จะ fallback เป็นไฟล์ local สำหรับ development

```txt
.data/plantbox-store.json
```

ไฟล์นี้ถูก ignore ด้วย `.gitignore` แล้ว

เหมาะสำหรับ:

- local development
- demo
- server ที่มี persistent disk

ไม่เหมาะสำหรับ:

- serverless production
- deployment ที่ filesystem หายหลัง restart
- ระบบหลาย instance

ถ้าจะใช้งานบน Vercel ต้องตั้งค่า Postgres connection string:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```

ใช้ Postgres provider ใดก็ได้ เช่น Neon, Supabase, Vercel Marketplace หรือ database ที่รองรับ Postgres connection string

## Environment

ตอนนี้ token ของเครื่องถูกสร้างจาก dashboard และเก็บใน store เพื่อให้ copy ซ้ำและ generate โค้ดสำเร็จรูปได้

ไฟล์ตัวอย่าง:

```bash
cp .env.example .env.local
```

ถ้าใช้ local development และยังไม่ต้องการ database สามารถปล่อย `DATABASE_URL` ว่างไว้ได้

## Deploy on Vercel

1. Push repo ขึ้น GitHub
2. Import project ใน Vercel
3. เพิ่ม Postgres database ผ่าน Vercel Marketplace, Neon, Supabase หรือ provider ที่ต้องการ
4. ตั้ง Environment Variable ใน Vercel:

```txt
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

5. Deploy

หลัง deploy ครั้งแรก API จะสร้างตารางให้อัตโนมัติเมื่อมี request แรกเข้ามา:

- `plantbox_devices`
- `plantbox_readings`

ถ้าใช้ Vercel CLI สามารถเพิ่ม env ได้ด้วย:

```bash
vercel env add DATABASE_URL production
```

## Future Plan: Large Farm Setup

สำหรับฟาร์มที่มีหลายสิบหรือหลายร้อยเครื่อง วิธีเพิ่มเครื่องแล้ว copy token ทีละเครื่องจะเริ่มดูแลยาก แผนถัดไปคือทำ provisioning flow เพื่อให้ติดตั้งเครื่องจำนวนมากได้ง่ายขึ้น

แนวคิดหลัก:

```txt
เครื่องเปิดครั้งแรก
-> เครื่องรู้ serial ของตัวเอง
-> ถ้ายังไม่มี deviceToken
-> เรียก provisioning API ด้วย factory token
-> server สร้างหรือ claim เครื่อง
-> server คืน deviceToken
-> เครื่องบันทึก token ลง config
-> ส่ง readings ตามปกติ
```

สิ่งที่จะเพิ่มในอนาคต:

- `serial` ถาวรต่อเครื่อง เช่น `PB-000001`
- `zone` หรือ `farmId` สำหรับแยกพื้นที่/ฟาร์ม
- `status` ของเครื่อง เช่น `pending`, `claimed`, `online`, `stale`, `disabled`
- `POST /api/plantbox/provision` สำหรับให้เครื่องขอ token ครั้งแรก
- `PLANTBOX_FACTORY_TOKEN` สำหรับ provisioning เฉพาะตอนติดตั้ง
- config file บน Raspberry Pi เช่น `/etc/plantbox/config.json`
- QR code หรือ claim code สำหรับทีมติดตั้งหน้างาน
- bulk import CSV สำหรับสร้างเครื่องล่วงหน้าหลายเครื่อง
- export QR codes เป็นชุดสำหรับติดบนตัวเครื่อง

ตัวอย่าง config บน Raspberry Pi:

```json
{
  "serial": "PB-000001",
  "serverUrl": "https://plantbox.example.com",
  "deviceToken": "pb_xxxxxxxxxxxxxxxxx"
}
```

ตัวอย่าง bulk import:

```csv
serial,name,zone
PB-000001,PlantBox A-01,A
PB-000002,PlantBox A-02,A
PB-000003,PlantBox B-01,B
```

เป้าหมายคือทีมติดตั้งไม่ต้องแก้โค้ด ไม่ต้อง copy token ยาว ๆ ทีละเครื่อง และสามารถจัดการเครื่องจำนวนมากได้จาก dashboard

## เอกสารเพิ่มเติม

- [PlantBox API Usage](./docs/plantbox-api.md)

## Scripts

```bash
bun run dev
bun run build
bun run start
bun run lint
```
