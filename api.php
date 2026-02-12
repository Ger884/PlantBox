// api สำหรับส่งข้อมูลไปหน้าเว็บไซต์
<?php
// กำหนด Header ให้ส่งข้อมูลเป็น JSON และรองรับ UTF8
header("Content-Type: application/json; charset=UTF-8");
// อนุญาตให้เว็บไซต์อื่นเรียกใช้ API
header("Access-Control-Allow-Origin: *");

// ข้อมูลสำหรับเชื่อมต่อฐานข้อมูล
$host = "localhost";
$user = "plantbox_admin";
$pass = "********";
$db   = "plantbox";

// สร้างการเชื่อมต่อกับ DataBase
$conn = new mysqli($host, $user, $pass, $db);

// ตรวจสอบว่าเชื่อมต่อสำเร็จหรือไม่
if ($conn->connect_error) {
    die(json_encode(["error" => "Conn failed"]));
}

// ตั้งค่า CharSet เป็น UTF8 เพื่อรองรับภาษาไทย
$conn->set_charset("utf8");

// ถ้ามี parameter ?history=1 จะดึงข้อมูล 20 รายการล่าสุด ถ้าไม่มีจะดึงแค่รายการเดียว
$limit = isset($_GET['history']) ? 20 : 1;

// คำสั่ง SQL ดึงข้อมูลเซ็นเซอร์ โดยเรียงจากใหม่ไปเก่า
$sql = "SELECT temp, hum, ec, ph, n, p, k, timestamp as created_at 
        FROM soil_data 
        ORDER BY timestamp DESC LIMIT $limit";

// รันคำสั่ง SQL
$result = $conn->query($sql);
$data = []; // สร้าง Array เปล่าสำหรับเก็บผลลัพธ์

// ถ้าพบข้อมูลให้ลูปแปลงเป็น JSON Array
if ($result && $result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $data[] = [
            "temp" => (float)$row['temp'],        // แปลงเป็นทศนิยม
            "hum"  => (float)$row['hum'],         // แปลงเป็นทศนิยม
            "ec"   => (int)$row['ec'],            // แปลงเป็นจำนวนเต็ม
            "ph"   => (float)$row['ph'],          // แปลงเป็นทศนิยม
            "n"    => (int)$row['n'],             // แปลงเป็นจำนวนเต็ม
            "p"    => (int)$row['p'],             // แปลงเป็นจำนวนเต็ม
            "k"    => (int)$row['k'],             // แปลงเป็นจำนวนเต็ม
            "created_at" => $row['created_at']    // เวลาที่บันทึกข้อมูล
        ];
    }
}

// ส่งข้อมูลกลับไปในรูปแบบ JSON
echo json_encode($data);

// ปิดการเชื่อมต่อฐานข้อมูล
$conn->close();
?>
