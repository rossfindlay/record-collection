import { type NextRequest } from "next/server";
import { proxy } from "./_proxy";

export async function GET(request: NextRequest) {
  return proxy(request, "/api/user");
}

export async function POST(request: NextRequest) {
  return proxy(request, "/api/user");
}

export async function DELETE(request: NextRequest) {
  return proxy(request, "/api/user");
}
