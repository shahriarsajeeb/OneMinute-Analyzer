import { captureRequest } from "@/lib/server/capture-api";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: NextRequest) => captureRequest(request);
