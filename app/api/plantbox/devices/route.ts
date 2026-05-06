import {
  createPlantBoxDevice,
  listPlantBoxDevices,
} from "@/lib/plantbox-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const devices = await listPlantBoxDevices();

  return Response.json({ devices });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const name =
    typeof payload === "object" &&
    payload !== null &&
    "name" in payload &&
    typeof payload.name === "string"
      ? payload.name
      : "PlantBox";

  const result = await createPlantBoxDevice(name);

  return Response.json(result, { status: 201 });
}
