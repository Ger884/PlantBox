import { listPlantBoxSummaries } from "@/lib/plantbox-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const boxes = await listPlantBoxSummaries();

  return Response.json({
    boxes,
    serverTime: new Date().toISOString(),
  });
}
