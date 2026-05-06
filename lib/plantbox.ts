export type PlantBoxMetrics = {
  temperature: number;
  humidity: number;
  ph: number;
  ec: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
};

export type PlantBoxReading = {
  id: string;
  boxId: string;
  boxName: string;
  ip: string;
  metrics: PlantBoxMetrics;
  recordedAt: string;
  receivedAt: string;
};

export type PlantBoxSummary = {
  id: string;
  name: string;
  ip: string;
  updatedAt: string;
  metrics: PlantBoxMetrics;
};

export type PlantBoxDevice = {
  id: string;
  name: string;
  token: string;
  tokenPreview: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
};

export type PlantBoxReadingInput = {
  boxId?: unknown;
  boxName?: unknown;
  name?: unknown;
  ip?: unknown;
  recordedAt?: unknown;
  temperature?: unknown;
  temp?: unknown;
  humidity?: unknown;
  hum?: unknown;
  ph?: unknown;
  ec?: unknown;
  nitrogen?: unknown;
  n?: unknown;
  phosphorus?: unknown;
  p?: unknown;
  potassium?: unknown;
  k?: unknown;
};

export const PLANTBOX_METRIC_FIELDS = [
  { key: "temperature", label: "อุณหภูมิ", suffix: "°C" },
  { key: "humidity", label: "ความชื้น", suffix: "%" },
  { key: "ph", label: "ค่า pH", suffix: "" },
  { key: "ec", label: "ค่า EC", suffix: "" },
  { key: "nitrogen", label: "N", suffix: "" },
  { key: "phosphorus", label: "P", suffix: "" },
  { key: "potassium", label: "K", suffix: "" },
] as const;

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeReadingInput(input: PlantBoxReadingInput) {
  const metrics = {
    temperature: readNumber(input.temperature ?? input.temp),
    humidity: readNumber(input.humidity ?? input.hum),
    ph: readNumber(input.ph),
    ec: readNumber(input.ec),
    nitrogen: readNumber(input.nitrogen ?? input.n),
    phosphorus: readNumber(input.phosphorus ?? input.p),
    potassium: readNumber(input.potassium ?? input.k),
  };

  const missingFields = Object.entries(metrics)
    .filter(([, value]) => value === null)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    return {
      ok: false as const,
      error: `Missing or invalid metrics: ${missingFields.join(", ")}`,
    };
  }

  const boxId = readString(input.boxId, "unregistered-device");
  const recordedAt = readString(input.recordedAt, new Date().toISOString());

  return {
    ok: true as const,
    reading: {
      boxId,
      boxName: readString(input.boxName ?? input.name, boxId),
      ip: readString(input.ip, "unknown"),
      recordedAt,
      metrics: metrics as PlantBoxMetrics,
    },
  };
}
