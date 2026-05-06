import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

import type {
  PlantBoxDevice,
  PlantBoxReading,
  PlantBoxSummary,
} from "@/lib/plantbox";

type StoredDevice = PlantBoxDevice & { tokenHash: string };

type PlantBoxStoreFile = {
  version: 2;
  devices: StoredDevice[];
  readings: PlantBoxReading[];
};

type PlantBoxDeviceRow = {
  id: string;
  name: string;
  token: string;
  token_hash: string;
  token_preview: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_seen_at: Date | string | null;
};

type PlantBoxReadingRow = {
  id: string;
  box_id: string;
  box_name: string;
  ip: string;
  metrics: unknown;
  recorded_at: Date | string;
  received_at: Date | string;
};

const STORE_PATH = path.join(process.cwd(), ".data", "plantbox-store.json");
const MAX_READINGS = 5000;
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

let writeQueue = Promise.resolve();
let sqlClient: postgres.Sql | null = null;
let schemaReady: Promise<void> | null = null;

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

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPublicDevice(device: StoredDevice): PlantBoxDevice {
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

function toDevice(row: PlantBoxDeviceRow): StoredDevice {
  return {
    id: row.id,
    name: row.name,
    token: row.token,
    tokenHash: row.token_hash,
    tokenPreview: row.token_preview,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    lastSeenAt: toIsoString(row.last_seen_at),
  };
}

function toReading(row: PlantBoxReadingRow): PlantBoxReading {
  return {
    id: row.id,
    boxId: row.box_id,
    boxName: row.box_name,
    ip: row.ip,
    metrics: row.metrics as PlantBoxReading["metrics"],
    recordedAt: toIsoString(row.recorded_at) ?? new Date().toISOString(),
    receivedAt: toIsoString(row.received_at) ?? new Date().toISOString(),
  };
}

function getSql() {
  if (!databaseUrl) {
    return null;
  }

  if (!sqlClient) {
    const isLocalDatabase =
      databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

    sqlClient = postgres(databaseUrl, {
      max: 1,
      ssl: isLocalDatabase ? false : "require",
    });
  }

  return sqlClient;
}

async function ensureSchema() {
  const sql = getSql();

  if (!sql) {
    return;
  }

  schemaReady ??= (async () => {
    await sql`
      create table if not exists plantbox_devices (
        id text primary key,
        name text not null,
        token text not null,
        token_hash text not null unique,
        token_preview text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        last_seen_at timestamptz
      )
    `;

    await sql`
      create table if not exists plantbox_readings (
        id text primary key,
        box_id text not null references plantbox_devices(id) on delete cascade,
        box_name text not null,
        ip text not null,
        metrics jsonb not null,
        recorded_at timestamptz not null,
        received_at timestamptz not null
      )
    `;

    await sql`
      create index if not exists plantbox_readings_box_received_idx
      on plantbox_readings (box_id, received_at desc)
    `;
  })();

  await schemaReady;
}

async function readFileStore(): Promise<PlantBoxStoreFile> {
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

async function writeFileStore(store: PlantBoxStoreFile) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function addPlantBoxReading(
  reading: Omit<PlantBoxReading, "id" | "receivedAt">,
) {
  const savedReading: PlantBoxReading = {
    id: createReadingId(),
    receivedAt: new Date().toISOString(),
    ...reading,
  };

  const sql = getSql();

  if (sql) {
    await ensureSchema();
    await sql.begin(async (tx) => {
      await tx`
        insert into plantbox_readings (
          id,
          box_id,
          box_name,
          ip,
          metrics,
          recorded_at,
          received_at
        )
        values (
          ${savedReading.id},
          ${savedReading.boxId},
          ${savedReading.boxName},
          ${savedReading.ip},
          ${tx.json(savedReading.metrics)},
          ${savedReading.recordedAt},
          ${savedReading.receivedAt}
        )
      `;

      await tx`
        update plantbox_devices
        set
          name = ${savedReading.boxName},
          updated_at = ${savedReading.receivedAt},
          last_seen_at = ${savedReading.receivedAt}
        where id = ${savedReading.boxId}
      `;
    });

    return savedReading;
  }

  writeQueue = writeQueue.then(async () => {
    const store = await readFileStore();
    const readings = [savedReading, ...store.readings].slice(0, MAX_READINGS);
    const devices = store.devices.map((device) =>
      device.id === savedReading.boxId
        ? {
            ...device,
            name: savedReading.boxName,
            updatedAt: savedReading.receivedAt,
            lastSeenAt: savedReading.receivedAt,
          }
        : device,
    );

    await writeFileStore({ version: 2, devices, readings });
  });

  await writeQueue;
  return savedReading;
}

export async function listPlantBoxReadings(options?: {
  boxId?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const sql = getSql();

  if (sql) {
    await ensureSchema();

    const rows = options?.boxId
      ? await sql<PlantBoxReadingRow[]>`
          select *
          from plantbox_readings
          where box_id = ${options.boxId}
          order by received_at desc
          limit ${limit}
        `
      : await sql<PlantBoxReadingRow[]>`
          select *
          from plantbox_readings
          order by received_at desc
          limit ${limit}
        `;

    return rows.map(toReading);
  }

  const store = await readFileStore();

  return store.readings
    .filter((reading) => !options?.boxId || reading.boxId === options.boxId)
    .slice(0, limit);
}

export async function listPlantBoxSummaries(): Promise<PlantBoxSummary[]> {
  const sql = getSql();

  if (sql) {
    await ensureSchema();

    const rows = await sql<PlantBoxReadingRow[]>`
      select distinct on (r.box_id) r.*
      from plantbox_readings r
      join plantbox_devices d on d.id = r.box_id
      order by r.box_id, r.received_at desc
    `;

    return rows.map((row) => ({
      id: row.box_id,
      name: row.box_name,
      ip: row.ip,
      updatedAt: toIsoString(row.recorded_at) ?? new Date().toISOString(),
      metrics: row.metrics as PlantBoxSummary["metrics"],
    }));
  }

  const store = await readFileStore();
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
  const sql = getSql();

  if (sql) {
    await ensureSchema();

    const rows = await sql<PlantBoxDeviceRow[]>`
      select *
      from plantbox_devices
      order by created_at desc
    `;

    return rows.map((row) => toPublicDevice(toDevice(row)));
  }

  const store = await readFileStore();

  return store.devices.map(toPublicDevice);
}

export async function createPlantBoxDevice(name: string) {
  const token = createDeviceToken();
  const now = new Date().toISOString();
  const device: StoredDevice = {
    id: createDeviceId(),
    name: name.trim() || "PlantBox",
    token,
    tokenHash: hashToken(token),
    tokenPreview: getTokenPreview(token),
    createdAt: now,
    updatedAt: now,
    lastSeenAt: null,
  };

  const sql = getSql();

  if (sql) {
    await ensureSchema();
    await sql`
      insert into plantbox_devices (
        id,
        name,
        token,
        token_hash,
        token_preview,
        created_at,
        updated_at,
        last_seen_at
      )
      values (
        ${device.id},
        ${device.name},
        ${device.token},
        ${device.tokenHash},
        ${device.tokenPreview},
        ${device.createdAt},
        ${device.updatedAt},
        ${device.lastSeenAt}
      )
    `;

    return {
      device: toPublicDevice(device),
      token,
    };
  }

  writeQueue = writeQueue.then(async () => {
    const store = await readFileStore();
    await writeFileStore({
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
  const tokenHash = hashToken(token);
  const tokenPreview = getTokenPreview(token);
  const now = new Date().toISOString();
  const sql = getSql();

  if (sql) {
    await ensureSchema();

    const rows = await sql<PlantBoxDeviceRow[]>`
      update plantbox_devices
      set
        token = ${token},
        token_hash = ${tokenHash},
        token_preview = ${tokenPreview},
        updated_at = ${now}
      where id = ${id}
      returning *
    `;

    const rotatedDevice = rows[0] ? toDevice(rows[0]) : null;

    if (!rotatedDevice) {
      return null;
    }

    return {
      device: toPublicDevice(rotatedDevice),
      token,
    };
  }

  let rotatedDevice: StoredDevice | null = null;

  writeQueue = writeQueue.then(async () => {
    const store = await readFileStore();
    const devices = store.devices.map((device) => {
      if (device.id !== id) {
        return device;
      }

      rotatedDevice = {
        ...device,
        token,
        tokenHash,
        tokenPreview,
        updatedAt: now,
      };

      return rotatedDevice;
    });

    await writeFileStore({ version: 2, devices, readings: store.readings });
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
  const sql = getSql();

  if (sql) {
    await ensureSchema();

    const rows = await sql<{ id: string }[]>`
      delete from plantbox_devices
      where id = ${id}
      returning id
    `;

    return rows.length > 0;
  }

  let deleted = false;

  writeQueue = writeQueue.then(async () => {
    const store = await readFileStore();
    const devices = store.devices.filter((device) => device.id !== id);
    deleted = devices.length !== store.devices.length;

    await writeFileStore({
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

  const tokenHash = hashToken(token);
  const sql = getSql();

  if (sql) {
    await ensureSchema();

    const rows = await sql<PlantBoxDeviceRow[]>`
      select *
      from plantbox_devices
      where token_hash = ${tokenHash}
      limit 1
    `;

    return rows[0] ? toPublicDevice(toDevice(rows[0])) : null;
  }

  const store = await readFileStore();
  const device = store.devices.find((item) => item.tokenHash === tokenHash);

  return device ? toPublicDevice(device) : null;
}
