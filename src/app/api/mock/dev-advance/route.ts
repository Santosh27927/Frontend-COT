import { handleMockRequest } from "@/mocks/handler";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleMockRequest(request, "dev-advance");
}
