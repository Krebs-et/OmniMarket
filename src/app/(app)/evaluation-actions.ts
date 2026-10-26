"use server";

import { resetEvaluationData } from "@application/use-cases/reset-evaluation-data";
import { getSession } from "@lib/auth";
import { isEvaluationPreviewEnabled, isEvaluationResetConfigured } from "@lib/evaluation-api";

export type EvaluationResetResult =
  | { status: "success"; orders: number; products: number }
  | { status: "error"; message: string };

export async function resetEvaluationFixtures(): Promise<EvaluationResetResult> {
  if (!isEvaluationPreviewEnabled() || !isEvaluationResetConfigured()) {
    return { status: "error", message: "El reinicio solo está disponible en el Preview de evaluación configurado." };
  }

  const session = await getSession();
  if (!session) {
    return { status: "error", message: "Inicia sesión para continuar." };
  }
  if (session.role !== "admin") {
    return { status: "error", message: "Se requieren permisos de administrador." };
  }

  return { status: "success", ...(await resetEvaluationData()) };
}
