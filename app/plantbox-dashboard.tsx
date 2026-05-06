"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  IconClock,
  IconCode,
  IconCopy,
  IconDatabase,
  IconDots,
  IconKey,
  IconNetwork,
  IconPlant,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Container } from "@/components/container";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";
import {
  PLANTBOX_METRIC_FIELDS,
  type PlantBoxDevice,
  type PlantBoxSummary,
} from "@/lib/plantbox";

type LatestBoxesResponse = {
  boxes: PlantBoxSummary[];
  serverTime: string;
};

type DevicesResponse = {
  devices: PlantBoxDevice[];
};

type DeviceTokenResponse = {
  device: PlantBoxDevice;
  token: string;
};

type CachedLatestBoxes = {
  version: 1;
  boxes: PlantBoxSummary[];
  updatedAt: string;
};

type DeviceCardModel = {
  device: PlantBoxDevice;
  latest: PlantBoxSummary | null;
};

type ConfirmationState =
  | { type: "rotate"; device: PlantBoxDevice }
  | { type: "delete"; device: PlantBoxDevice }
  | null;

type CodeDialogState = {
  device: PlantBoxDevice;
  code: string;
} | null;

const deviceFormSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อเครื่อง"),
});

type DeviceFormValues = z.infer<typeof deviceFormSchema>;

const CACHE_KEY = "plantbox.latest.v2";
const POLL_INTERVAL_MS = 5000;
const STALE_AFTER_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCachedBoxes() {
  try {
    const rawValue = localStorage.getItem(CACHE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;

    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.boxes)
    ) {
      return [];
    }

    return parsed.boxes as PlantBoxSummary[];
  } catch {
    return [];
  }
}

function writeCachedBoxes(boxes: PlantBoxSummary[]) {
  const payload: CachedLatestBoxes = {
    version: 1,
    boxes,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "ยังไม่มีข้อมูลล่าสุด";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatMetric(value: number, suffix: string) {
  const formatted = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(1);
  return `${formatted}${suffix}`;
}

function isStale(updatedAt: string) {
  return Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS;
}

function getDeviceStatus(
  device: PlantBoxDevice,
  latest: PlantBoxSummary | null,
) {
  if (!latest && !device.lastSeenAt) {
    return {
      label: "รอข้อมูล",
      variant: "secondary" as const,
    };
  }

  if (latest && !isStale(latest.updatedAt)) {
    return {
      label: "ออนไลน์",
      variant: "default" as const,
    };
  }

  return {
    label: "ออฟไลน์",
    variant: "secondary" as const,
  };
}

function getCurrentBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return window.location.origin;
}

function createPlantBoxClientCode(baseUrl: string, token: string) {
  return `#include <fcntl.h>
#include <termios.h>
#include <unistd.h>
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <curl/curl.h>

using namespace std;

static const char* DEFAULT_BASE_URL     = ${JSON.stringify(baseUrl)};
static const char* DEFAULT_DEVICE_TOKEN = ${JSON.stringify(token)};
static const char* DEFAULT_SERIAL_PORT  = "/dev/ttyUSB0";

static string env_or(const char* key, const char* fallback) {
    const char* v = getenv(key);
    return (v && *v) ? string(v) : string(fallback);
}

// แยก line "28.4,67,1200,6.7,14,8,12" -> 7 field
static bool parse_line(const string& line, vector<string>& out) {
    out.clear();
    stringstream ss(line);
    string tok;
    while (getline(ss, tok, ',')) {
        size_t a = tok.find_first_not_of(" \\t\\r\\n");
        size_t b = tok.find_last_not_of(" \\t\\r\\n");
        if (a == string::npos) { out.push_back(""); continue; }
        out.push_back(tok.substr(a, b - a + 1));
    }
    return out.size() == 7;
}

static size_t discard_cb(void*, size_t size, size_t nmemb, void*) {
    return size * nmemb;
}

static long post_reading(CURL* curl,
                         const string& url,
                         const string& bearer,
                         const vector<string>& v) {
    string body = "{";
    body += "\\"temp\\":" + v[0] + ",";
    body += "\\"hum\\":"  + v[1] + ",";
    body += "\\"ec\\":"   + v[2] + ",";
    body += "\\"ph\\":"   + v[3] + ",";
    body += "\\"n\\":"    + v[4] + ",";
    body += "\\"p\\":"    + v[5] + ",";
    body += "\\"k\\":"    + v[6];
    body += "}";

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    string auth_header = "Authorization: Bearer " + bearer;
    headers = curl_slist_append(headers, auth_header.c_str());

    curl_easy_reset(curl);
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body.size());
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, discard_cb);

    CURLcode rc = curl_easy_perform(curl);
    long http_code = 0;
    if (rc == CURLE_OK) {
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
    } else {
        cerr << "curl error: " << curl_easy_strerror(rc) << endl;
    }
    curl_slist_free_all(headers);
    return http_code;
}

int main() {
    string base_url     = env_or("BASE_URL",     DEFAULT_BASE_URL);
    string device_token = env_or("DEVICE_TOKEN", DEFAULT_DEVICE_TOKEN);
    string serial_path  = env_or("SERIAL_PORT",  DEFAULT_SERIAL_PORT);
    string readings_url = base_url + "/api/plantbox/readings";

    cout << "PlantBox client" << endl;
    cout << "  endpoint: " << readings_url << endl;
    cout << "  serial:   " << serial_path << endl;

    int serial_port = open(serial_path.c_str(), O_RDWR | O_NOCTTY | O_NDELAY);
    if (serial_port < 0) {
        perror("Port Error");
        return 1;
    }

    struct termios tty;
    if (tcgetattr(serial_port, &tty) != 0) {
        perror("Unable to read serial attrs");
        close(serial_port);
        return 1;
    }

    cfsetispeed(&tty, B115200);
    cfsetospeed(&tty, B115200);

    tty.c_cflag |= (CLOCAL | CREAD);
    tty.c_cflag &= ~CSIZE;
    tty.c_cflag |= CS8;
    tty.c_cflag &= ~PARENB;
    tty.c_cflag &= ~CSTOPB;

    tcsetattr(serial_port, TCSANOW, &tty);

    curl_global_init(CURL_GLOBAL_DEFAULT);
    CURL* curl = curl_easy_init();
    if (!curl) {
        cerr << "curl init failed" << endl;
        close(serial_port);
        return 1;
    }

    cout << "System running" << endl;

    string serial_buffer;
    char buf[256];

    while (true) {
        int n = read(serial_port, buf, sizeof(buf) - 1);
        if (n > 0) {
            buf[n] = '\\0';
            serial_buffer += string(buf);

            size_t newline_pos = serial_buffer.find('\\n');
            while (newline_pos != string::npos) {
                string line = serial_buffer.substr(0, newline_pos);
                serial_buffer.erase(0, newline_pos + 1);

                size_t end = line.find_last_not_of(" \\n\\r\\t");
                if (end == string::npos) line.clear();
                else line.erase(end + 1);

                if (!line.empty()) {
                    vector<string> fields;
                    if (parse_line(line, fields)) {
                        cout << "-> " << line << endl;
                        long code = post_reading(curl, readings_url, device_token, fields);
                        if (code >= 200 && code < 300) {
                            cout << "   posted (HTTP " << code << ")" << endl;
                        } else {
                            cout << "   post failed (HTTP " << code << ")" << endl;
                        }
                    } else {
                        cout << "Incomplete Data: " << line << endl;
                    }
                }

                newline_pos = serial_buffer.find('\\n');
            }
        }
        usleep(100000);
    }

    curl_easy_cleanup(curl);
    curl_global_cleanup();
    close(serial_port);
    return 0;
}
`;
}

export function PlantBoxDashboard() {
  const [boxes, setBoxes] = useState<PlantBoxSummary[]>([]);
  const [devices, setDevices] = useState<PlantBoxDevice[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">(
    "loading",
  );
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedDevice, setGeneratedDevice] = useState<PlantBoxDevice | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [codeDialog, setCodeDialog] = useState<CodeDialogState>(null);

  const deviceForm = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceFormSchema),
    defaultValues: {
      name: "",
    },
  });

  const deviceCards = useMemo<DeviceCardModel[]>(() => {
    const latestByDeviceId = new Map(boxes.map((box) => [box.id, box]));

    return [...devices]
      .map((device) => ({
        device,
        latest: latestByDeviceId.get(device.id) ?? null,
      }))
      .sort((a, b) => {
        const aTime = new Date(
          a.latest?.updatedAt ?? a.device.lastSeenAt ?? a.device.createdAt,
        ).getTime();
        const bTime = new Date(
          b.latest?.updatedAt ?? b.device.lastSeenAt ?? b.device.createdAt,
        ).getTime();

        return bTime - aTime;
      });
  }, [boxes, devices]);

  const refreshBoxes = useCallback(async () => {
    try {
      const response = await fetch("/api/plantbox/boxes", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const data = (await response.json()) as LatestBoxesResponse;

      setBoxes(data.boxes);
      setLastSyncedAt(data.serverTime);
      setStatus("online");
      writeCachedBoxes(data.boxes);
    } catch {
      const cachedBoxes = readCachedBoxes();

      if (cachedBoxes.length > 0) {
        setBoxes(cachedBoxes);
      }

      setStatus("offline");
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    const response = await fetch("/api/plantbox/devices", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as DevicesResponse;
    setDevices(data.devices);
  }, []);

  useEffect(() => {
    const cacheTimer = window.setTimeout(() => {
      const cachedBoxes = readCachedBoxes();

      if (cachedBoxes.length > 0) {
        setBoxes(cachedBoxes);
      }
    }, 0);

    const refreshTimer = window.setTimeout(() => {
      void refreshBoxes();
      void refreshDevices();
    }, 0);
    const intervalId = window.setInterval(() => {
      void refreshBoxes();
      void refreshDevices();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(cacheTimer);
      window.clearTimeout(refreshTimer);
      window.clearInterval(intervalId);
    };
  }, [refreshBoxes, refreshDevices]);

  function openDeviceDialog() {
    setGeneratedToken(null);
    setGeneratedDevice(null);
    deviceForm.reset({ name: "" });
    setDeviceDialogOpen(true);
  }

  function handleDeviceDialogChange(open: boolean) {
    setDeviceDialogOpen(open);

    if (!open) {
      setGeneratedToken(null);
      setGeneratedDevice(null);
      deviceForm.reset({ name: "" });
    }
  }

  async function createDevice(values: DeviceFormValues) {
    if (generatedToken) {
      return;
    }

    const response = await fetch("/api/plantbox/devices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as DeviceTokenResponse;
    setGeneratedToken(data.token);
    setGeneratedDevice(data.device);
    deviceForm.reset({ name: data.device.name });
    await refreshDevices();
  }

  async function rotateDeviceToken(device: PlantBoxDevice) {
    const response = await fetch(`/api/plantbox/devices/${device.id}`, {
      method: "PATCH",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as DeviceTokenResponse;
    setGeneratedToken(data.token);
    setGeneratedDevice(data.device);
    setDeviceDialogOpen(true);
    await refreshDevices();

    return data.device;
  }

  async function deleteDevice(device: PlantBoxDevice) {
    const response = await fetch(`/api/plantbox/devices/${device.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return;
    }

    await Promise.all([refreshDevices(), refreshBoxes()]);
  }

  async function confirmAction() {
    if (!confirmation) {
      return;
    }

    setIsConfirming(true);

    try {
      if (confirmation.type === "rotate") {
        await rotateDeviceToken(confirmation.device);
      } else {
        await deleteDevice(confirmation.device);
      }
    } finally {
      setIsConfirming(false);
      setConfirmation(null);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function openCodeDialog(device: PlantBoxDevice) {
    setCodeDialog({
      device,
      code: createPlantBoxClientCode(getCurrentBaseUrl(), device.token),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="inline-flex items-center gap-2 text-lg font-semibold">
              <IconPlant className="size-4" />
              PlantBox
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={status === "online" ? "default" : "secondary"}>
                {status === "online"
                  ? "เชื่อมต่อ API"
                  : status === "offline"
                    ? "ใช้ cache ล่าสุด"
                    : "กำลังโหลด"}
              </Badge>
              {lastSyncedAt ? (
                <span>ซิงก์ล่าสุด {formatDateTime(lastSyncedAt)}</span>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void refreshBoxes();
                void refreshDevices();
              }}
            >
              <IconRefresh data-icon="inline-start" />
              รีเฟรช
            </Button>
            <Button type="button" onClick={openDeviceDialog}>
              <IconPlus data-icon="inline-start" />
              เพิ่มเครื่อง
            </Button>
          </div>
        </div>

        {deviceCards.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconKey />
              </EmptyMedia>
              <EmptyTitle>ยังไม่มีเครื่องที่ลงทะเบียน</EmptyTitle>
              <EmptyDescription>
                กดเพิ่มเครื่องเพื่อสร้าง Box อันแรกของคุณ
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {deviceCards.map(({ device, latest }) => {
              const statusBadge = getDeviceStatus(device, latest);

              return (
                <Card key={device.id}>
                  <CardHeader>
                    <CardTitle className="truncate">{device.name}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2">
                        {device.id}
                      </span>
                    </CardDescription>
                    <CardAction className="flex items-center gap-2">
                      <Badge variant={statusBadge.variant}>
                        {statusBadge.label}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`จัดการ ${device.name}`}
                          >
                            <IconDots />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-fit">
                          <DropdownMenuLabel>{device.name}</DropdownMenuLabel>
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              disabled={!device.token}
                              onClick={() => void copyText(device.token)}
                            >
                              <IconKey />
                              {device.token
                                ? "คัดลอก token"
                                : "ต้องออก token ใหม่ก่อน"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!device.token}
                              onClick={() => openCodeDialog(device)}
                            >
                              <IconCode />
                              โค้ดสำหรับเครื่องนี้
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmation({ type: "rotate", device })
                              }
                            >
                              <IconRefresh />
                              ออก token ใหม่
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setConfirmation({ type: "delete", device })
                            }
                          >
                            <IconTrash />
                            ลบเครื่อง
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardAction>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="secondary">
                        <IconKey data-icon="inline-start" />
                        {device.tokenPreview}
                      </Badge>
                      {latest ? (
                        <>
                          <span className="inline-flex items-center gap-2">
                            <IconNetwork className="size-4" />
                            {latest.ip}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <IconClock className="size-4" />
                            {formatDateTime(latest.updatedAt)}
                          </span>
                        </>
                      ) : null}
                    </div>

                    {latest ? (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          {PLANTBOX_METRIC_FIELDS.slice(0, 3).map((field) => (
                            <Item key={field.key} variant="muted">
                              <ItemHeader className="flex-col">
                                <ItemDescription>{field.label}</ItemDescription>
                                <ItemTitle className="text-xl font-bold tabular-nums text-primary">
                                  {formatMetric(
                                    latest.metrics[field.key],
                                    field.suffix,
                                  )}
                                </ItemTitle>
                              </ItemHeader>
                            </Item>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {PLANTBOX_METRIC_FIELDS.slice(3).map((field) => (
                            <Item key={field.key} variant="muted">
                              <ItemHeader className="flex-col">
                                <ItemDescription>{field.label}</ItemDescription>
                                <ItemTitle className="text-xl font-bold tabular-nums">
                                  {formatMetric(
                                    latest.metrics[field.key],
                                    field.suffix,
                                  )}
                                </ItemTitle>
                              </ItemHeader>
                            </Item>
                          ))}
                        </div>
                      </>
                    ) : (
                      <Empty className="min-h-32 border border-dashed">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <IconDatabase />
                          </EmptyMedia>
                          <EmptyTitle>รอข้อมูลจากเครื่อง</EmptyTitle>
                          <EmptyDescription>
                            เมื่อเครื่องเชื่อมต่อกับ API แล้วระบบจะอัปเดตข้อมูลล่าสุดให้อัตโนมัติ
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Container>

      <Dialog open={deviceDialogOpen} onOpenChange={handleDeviceDialogChange}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={deviceForm.handleSubmit(createDevice)}>
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>เพิ่มเครื่อง PlantBox</DialogTitle>
                <DialogDescription>
                  ตั้งชื่อเครื่องเพื่อสร้าง token และโค้ด client สำหรับเครื่องนั้น
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <Field data-invalid={!!deviceForm.formState.errors.name}>
                  <FieldLabel htmlFor="device-name">ชื่อเครื่อง</FieldLabel>
                  <Input
                    id="device-name"
                    aria-invalid={!!deviceForm.formState.errors.name}
                    disabled={!!generatedToken}
                    placeholder="เช่น PlantBox แปลง A-01"
                    {...deviceForm.register("name")}
                  />
                  <FieldError
                    errors={
                      deviceForm.formState.errors.name
                        ? [deviceForm.formState.errors.name]
                        : undefined
                    }
                  />
                </Field>

                {generatedToken ? (
                  <Field>
                    <FieldLabel htmlFor="device-token">
                      Token ของเครื่องนี้
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="device-token"
                        className="font-mono"
                        value={generatedToken}
                        readOnly
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="คัดลอก token"
                        onClick={() => void copyText(generatedToken)}
                      >
                        <IconCopy />
                      </Button>
                    </div>
                  </Field>
                ) : null}
              </FieldGroup>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDeviceDialogChange(false)}
                >
                  ปิด
                </Button>
                {generatedToken && generatedDevice ? (
                  <Button
                    type="button"
                    onClick={() => openCodeDialog(generatedDevice)}
                  >
                    <IconCode data-icon="inline-start" />
                    เปิดโค้ดสำเร็จรูป
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={deviceForm.formState.isSubmitting}
                  >
                    <IconKey data-icon="inline-start" />
                    สร้าง token
                  </Button>
                )}
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!codeDialog}
        onOpenChange={(open) => {
          if (!open) {
            setCodeDialog(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              โค้ด C++ สำหรับ {codeDialog?.device.name ?? "เครื่องนี้"}
            </DialogTitle>
            <DialogDescription>
              โค้ดนี้เติม URL ปัจจุบันและ token ของเครื่องไว้แล้ว สามารถ copy ไป build บน Raspberry Pi ได้ทันที
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="max-h-[60vh] min-h-96 resize-y font-mono text-xs"
            value={codeDialog?.code ?? ""}
            readOnly
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCodeDialog(null)}
            >
              ปิด
            </Button>
            <Button
              type="button"
              onClick={() => codeDialog && void copyText(codeDialog.code)}
            >
              <IconCopy data-icon="inline-start" />
              คัดลอกโค้ด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              {confirmation?.type === "delete" ? <IconTrash /> : <IconKey />}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {confirmation?.type === "delete"
                ? "ลบเครื่องนี้?"
                : "ออก token ใหม่?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.type === "delete"
                ? `การลบ ${confirmation.device.name} จะลบ readings ของเครื่องนี้ด้วย`
                : `token เดิมของ ${confirmation?.device.name ?? "เครื่องนี้"} จะใช้ส่งข้อมูลไม่ได้ทันทีหลังออก token ใหม่`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirming}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={isConfirming}
              variant={
                confirmation?.type === "delete" ? "destructive" : "default"
              }
              onClick={(event) => {
                event.preventDefault();
                void confirmAction();
              }}
            >
              {confirmation?.type === "delete" ? "ลบเครื่อง" : "ออก token ใหม่"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
