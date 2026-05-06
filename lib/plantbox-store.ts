import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  PlantBoxDevice,
  PlantBoxReading,
  PlantBoxSummary,
} from "@/lib/plantbox";

type PlantBoxStoreFile = {
  version: 2;
  devices: Array<PlantBoxDevice & { tokenHash: string }>;
  readings: PlantBoxReading[];
};

const STORE_PATH = path.join(process.cwd(), ".data", "plantbox-store.json");
const MAX_READINGS = 5000;

let writeQueue = Promise.resolve();

function createReadingId() {
  return globalThis.crypto?.randomUUID?.() ?? `reading-${Date.now()}`;
}

function createDeviceId() {
  return `box-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

function createDeviceToken() {
  return `pb_${randomBytes(32).toString("base64url")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getTokenPreview(token: string) {
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

function toPublicDevice(
  device: PlantBoxDevice & { tokenHash: string }
): PlantBoxDevice {
  return {
    id: device.id,
    name: device.name,
    token: device.token,
    tokenPreview: device.tokenPreview,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    lastSeenAt: device.lastSeenAt,
  };
}

async function readStore(): Promise<PlantBoxStoreFile> {
  try {
    const rawValue = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(rawValue) as Partial<PlantBoxStoreFile> & {
      version?: number;
    };

    if (!Array.isArray(parsed.readings)) {
      return { version: 2, devices: [], readings: [] };
    }

    if (parsed.version === 2 && Array.isArray(parsed.devices)) {
      return {
        version: 2,
        devices: parsed.devices.map((device) => ({
          ...device,
          token: typeof device.token === "string" ? device.token : "",
        })),
        readings: parsed.readings,
      } as PlantBoxStoreFile;
    }

    return {
      version: 2,
      devices: [],
      readings: parsed.readings,
    };
  } catch {
    return { version: 2, devices: [], readings: [] };
  }
}

async function writeStore(store: PlantBoxStoreFile) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function addPlantBoxReading(
  reading: Omit<PlantBoxReading, "id" | "receivedAt">
) {
  const savedReading: PlantBoxReading = {
    id: createReadingId(),
    receivedAt: new Date().toISOString(),
    ...reading,
  };

  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    const readings = [savedReading, ...store.readings].slice(0, MAX_READINGS);
    const devices = store.devices.map((device) =>
      device.id === savedReading.boxId
        ? {
            ...device,
            name: savedReading.boxName,
            updatedAt: savedReading.receivedAt,
            lastSeenAt: savedReading.receivedAt,
          }
        : device
    );

    await writeStore({ version: 2, devices, readings });
  });

  await writeQueue;
  return savedReading;
}

export async function listPlantBoxReadings(options?: {
  boxId?: string;
  limit?: number;
}) {
  const store = await readStore();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);

  return store.readings
    .filter((reading) => !options?.boxId || reading.boxId === options.boxId)
    .slice(0, limit);
}

export async function listPlantBoxSummaries(): Promise<PlantBoxSummary[]> {
  const store = await readStore();
  const latestByBox = new Map<string, PlantBoxSummary>();
  const registeredDeviceIds = new Set(store.devices.map((device) => device.id));

  for (const reading of store.readings) {
    if (!registeredDeviceIds.has(reading.boxId)) {
      continue;
    }

    if (latestByBox.has(reading.boxId)) {
      continue;
    }

    latestByBox.set(reading.boxId, {
      id: reading.boxId,
      name: reading.boxName,
      ip: reading.ip,
      updatedAt: reading.recordedAt,
      metrics: reading.metrics,
    });
  }

  return [...latestByBox.values()];
}

export async function listPlantBoxDevices() {
  const store = await readStore();

  return store.devices.map(toPublicDevice);
}

export async function createPlantBoxDevice(name: string) {
  const token = createDeviceToken();
  const now = new Date().toISOString();
  const device = {
    id: createDeviceId(),
    name: name.trim() || "PlantBox",
    token,
    tokenHash: hashToken(token),
    tokenPreview: getTokenPreview(token),
    createdAt: now,
    updatedAt: now,
    lastSeenAt: null,
  };

  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    await writeStore({
      version: 2,
      devices: [device, ...store.devices],
      readings: store.readings,
    });
  });

  await writeQueue;

  return {
    device: toPublicDevice(device),
    token,
  };
}

export async function rotatePlantBoxDeviceToken(id: string) {
  const token = createDeviceToken();
  let rotatedDevice: (PlantBoxDevice & { tokenHash: string }) | null = null;

  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const devices = store.devices.map((device) => {
      if (device.id !== id) {
        return device;
      }

      rotatedDevice = {
        ...device,
        token,
        tokenHash: hashToken(token),
        tokenPreview: getTokenPreview(token),
        updatedAt: now,
      };

      return rotatedDevice;
    });

    await writeStore({ version: 2, devices, readings: store.readings });
  });

  await writeQueue;

  if (!rotatedDevice) {
    return null;
  }

  return {
    device: toPublicDevice(rotatedDevice),
    token,
  };
}

export async function deletePlantBoxDevice(id: string) {
  let deleted = false;

  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    const devices = store.devices.filter((device) => device.id !== id);
    deleted = devices.length !== store.devices.length;

    await writeStore({
      version: 2,
      devices,
      readings: store.readings.filter((reading) => reading.boxId !== id),
    });
  });

  await writeQueue;
  return deleted;
}

export async function findPlantBoxDeviceByToken(token: string | null) {
  if (!token) {
    return null;
  }

  const store = await readStore();
  const tokenHash = hashToken(token);
  const device = store.devices.find((item) => item.tokenHash === tokenHash);

  return device ? toPublicDevice(device) : null;
}
