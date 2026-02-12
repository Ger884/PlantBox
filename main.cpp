#include <iostream>
#include <mysql.h>
#include <fcntl.h>
#include <termios.h>
#include <unistd.h>
#include <string>
#include <cstring>
#include <algorithm>

using namespace std;

int main() {
    // เปิดการเชื่อมต่อกับ MySQL Database
    MYSQL *conn = mysql_init(NULL);
    // พยายามเชื่อมต่อไปยัง localhost โดยใช้ username, password และชื่อฐานข้อมูล
    if (!mysql_real_connect(conn, "localhost", "plantbox_admin", "********", "plantbox", 0, NULL, 0)) {
        cerr << "DB Error: " << mysql_error(conn) << endl; 
        return 1;
    }

    // เปิด Serial Port ที่ /dev/ttyUSB0 สำหรับรับข้อมูลจาก ESP32
    int fd = open("/dev/ttyUSB0", O_RDWR | O_NOCTTY);
    if (fd < 0) { 
        perror("Port Error"); 
        return 1; 
    }
    
    // ตั้งค่า Serial Port ให้ทำงานที่ความเร็ว 115200 baud
    struct termios tty;
    tcgetattr(fd, &tty); // อ่านค่าปัจจุบัน
    cfsetispeed(&tty, B115200); // ตั้งความเร็วรับ
    cfsetospeed(&tty, B115200); // ตั้งความเร็วส่ง
    tty.c_cflag |= (CLOCAL | CREAD | CS8); // เปิดโหมดรับข้อมูล 8 bit
    tty.c_cflag &= ~(PARENB | CSTOPB | CSIZE); // ปิด parity และ stop bit
    tcsetattr(fd, TCSANOW, &tty); // บันทึกการตั้งค่า

    char buf[256]; // บัฟเฟอร์สำหรับเก็บข้อมูลที่อ่านได้
    string serial_buffer = ""; // เก็บข้อมูลที่ยังไม่ครบบรรทัด
    cout << "System ready. Listening for ESP32..." << endl;

    while (true) {
        // อ่านข้อมูลจาก Serial Port
        int n = read(fd, buf, sizeof(buf) - 1);
        if (n > 0) {
            buf[n] = '\0'; // ปิดท้าย string
            serial_buffer += string(buf); // รวมข้อมูลเข้า buffer
            
            size_t pos;
            // วนแยกข้อมูลทีละบรรทัด
            while ((pos = serial_buffer.find('\n')) != string::npos) {
                string line = serial_buffer.substr(0, pos); // ตัดเอาบรรทัดแรก
                serial_buffer.erase(0, pos + 1); // ลบบรรทัดที่ประมวลผลแล้วออก
                line.erase(line.find_last_not_of(" \n\r\t") + 1); // ลบช่องว่างท้ายบรรทัด

                if (line.empty()) continue; // ข้ามบรรทัดว่าง

                float t, h, ph_val; // ตัวแปรเก็บค่า temp, humidity, pH
                int e, nv, pv, kv; // ตัวแปรเก็บค่า EC, N, P, K
                
                // แยกข้อมูลจาก CSV format (ต้องมีครบ 7 ค่า)
                if (sscanf(line.c_str(), "%f,%f,%d,%f,%d,%d,%d", &t, &h, &e, &ph_val, &nv, &pv, &kv) == 7) {
                    char query[512];
                    // สร้างคำสั่ง SQL INSERT
                    sprintf(query, "INSERT INTO soil_data (temp, hum, ec, ph, n, p, k) VALUES (%.2f, %.2f, %d, %.2f, %d, %d, %d)",
                            t, h, e, ph_val, nv, pv, kv);
                    
                    // ส่งคำสั่ง SQL ไปยังฐานข้อมูล
                    if (mysql_query(conn, query)) 
                        cerr << "SQL Error: " << mysql_error(conn) << endl;
                    else 
                        cout << ">> Stored: " << line << endl;
                } else {
                    // ถ้าข้อมูลไม่ครบ 7 ค่าจะไม่บันทึก
                    cout << ">> Data Ignored (Incomplete): " << line << endl;
                }
            }
        }
        usleep(100000); // หน่วงเวลา 0.1 วินาทีก่อนอ่านรอบถัดไป
    }
    
    mysql_close(conn); // ปิดการเชื่อมต่อฐานข้อมูล
    return 0;
}