import {
  deletePlantBoxDevice,
  rotatePlantBoxDeviceToken,
} from "@/lib/plantbox-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = await rotatePlantBoxDeviceToken(id);

  if (!result) {
    return Response.json({ error: "Device not found" }, { status: 404 });
  }

  return Response.json(result);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const deleted = await deletePlantBoxDevice(id);

  if (!deleted) {
    return Response.json({ error: "Device not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
