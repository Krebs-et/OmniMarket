import { handlers } from "../../../../../auth";
import { withApiObservability } from "@lib/api-observability";

export const GET = withApiObservability("GET", "/api/auth/[...nextauth]", handlers.GET);
export const POST = withApiObservability("POST", "/api/auth/[...nextauth]", handlers.POST);
