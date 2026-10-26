"use client";

import { useState } from "react";
import { resetEvaluationFixtures } from "@/app/(app)/evaluation-actions";
import { Icon } from "./shared";

export function EvaluationResetButton() {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ status: "success" | "error"; message: string } | null>(null);

  async function reset() {
    if (!window.confirm("Esto reemplazará todos los pedidos y productos de evaluación por los datos demo. ¿Continuar?")) return;

    setPending(true);
    setFeedback(null);
    try {
      const result = await resetEvaluationFixtures();
      if (result.status === "error") {
        setFeedback({ status: "error", message: result.message });
        return;
      }
      setFeedback({ status: "success", message: "Datos demo restaurados. Actualizando…" });
      window.setTimeout(() => window.location.reload(), 800);
    } catch {
      setFeedback({ status: "error", message: "No se pudieron restaurar los datos. Revisa los registros del servidor." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="evaluation-reset">
      <button className="evaluation-reset-button" type="button" onClick={() => void reset()} disabled={pending || feedback?.status === "success"}>
        <Icon name="refresh" />
        {pending ? "Restaurando datos…" : "Restablecer datos demo"}
      </button>
      {feedback && (
        <span className={`evaluation-reset-feedback ${feedback.status}`} role={feedback.status === "error" ? "alert" : "status"}>
          {feedback.message}
        </span>
      )}
    </div>
  );
}
