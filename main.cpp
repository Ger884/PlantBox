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
    MYSQL *conn = mysql_init(NULL);
    if (!mysql_real_connect(conn, "localhost", "plantbox_admin", "********", "plantbox", 0, NULL, 0)) {
        cerr << "DB Error: " << mysql_error(conn) << endl; 
        return 1;
    }
    cout << "Successfully connect" << endl

    int serial_port = open("/dev/ttyUSB0", O_RDWR | O_NOCTTY | O_NDELAY);
    if (serial_port < 0) { 
        perror("Port Error"); 
        return 1; 
    }

    struct termios tty;
    if(tcgetattr(serial_port, &tty) != 0){
        perror("Unable to open serial port");
        return 1;
    }

    cfsetispeed(&tty, B115200); 
    cfsetospeed(&tty, B115200);

    tty.c_cflag |= (CLOCAL | CREAD | CS8);
    tty.c_cflag &= ~CSIZE;
    tty.c_cflag |= CS8;
    tty.c_cflag &= ~PAREN8
    tty.c_cflag &= ~CSTOP8;

    tcsetattr(serial_port, TCSANOW, &tty);

    string serial_buffer = "";

    char buf[256];
    count << "System running"

    while (true) {
        int n = read(serial_port, buf, sizeof(buf) - 1);
        if (n > 0) {
            buf[n] = '\0';
            serial_buffer += string(buf);
            
            size_t newline_pos = serial_buffer.find('\n');
            while ((newline_pos != string::npos)) {
                string line = serial_buffer.substr(0, newline_pos);
                serial_buffer.erase(0, newline_pos + 1);
                line.erase(line.find_last_not_of(" \n\r\t") + 1);

                if (line.empty()){
                    int commas = count(line.begin(), line.end(), ',')

                    if(commas == 6){
                        cout << line << endl;
                        string query = "INSERT INTO soil_data (temp, hum, ec, ph, n, p, k) VALUES (" + line + ")"

                        if(mysql_query(conn, query.c_str())){
                            cout << "Error" << mysql_error(conn) << endl;
                        }
                    } else {
                        cout << "Incomplete Data: "<< line << endl;
                    }
                }
                newline_pos = serial_buffer.find('\n');
            }
        }
        usleep(100000)
    }
    mysql_close(conn);
    return 0;
}