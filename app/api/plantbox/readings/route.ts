import { normalizeReadingInput } from "@/lib/plantbox";
import {
  addPlantBoxReading,
  findPlantBoxDeviceByToken,
  listPlantBoxReadings,
} from "@/lib/plantbox-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getRequestToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  return bearerToken ?? request.headers.get("x-plantbox-token");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const boxId = url.searchParams.get("boxId") ?? undefined;
  const readings = await listPlantBoxReadings({ boxId, limit });

  return Response.json({ readings });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const normalized = normalizeReadingInput(payload);

  if (!normalized.ok) {
    return Response.json({ error: normalized.error }, { status: 400 });
  }

  const device = await findPlantBoxDeviceByToken(getRequestToken(request));

  if (!device) {
    return Response.json({ error: "Unauthorized device token" }, { status: 401 });
  }

  const reading = await addPlantBoxReading({
    ...normalized.reading,
    boxId: device.id,
    boxName: device.name,
  });

  return Response.json({ ok: true, reading }, { status: 201 });
}
