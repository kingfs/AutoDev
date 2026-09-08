import type { AnalysisResult } from "../domain.js";

export function decideAnalysisAdmission(analysis: AnalysisResult): { verdict: "proceed" | "needs_human" | "reject"; reason: string } {
  if (analysis.recommendation === "reject") return { verdict: "reject", reason: analysis.summary };
  if (analysis.recommendation === "needs_human") return { verdict: "needs_human", reason: analysis.questions.join("\n") || analysis.summary };
  if (analysis.codeEvidence.length === 0) return { verdict: "needs_human", reason: "analysis proposed implementation without concrete repository evidence" };
  if (analysis.acceptanceCriteria.length === 0) return { verdict: "needs_human", reason: "analysis proposed implementation without testable acceptance criteria" };
  if (analysis.risks.some((risk) => risk.level === "critical")) return { verdict: "needs_human", reason: "critical analysis risk requires human confirmation" };
  return { verdict: "proceed", reason: analysis.summary };
}
