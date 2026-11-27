import { handleMockRequest } from "@/mocks/handler";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleMockRequest(request, "report");
}
