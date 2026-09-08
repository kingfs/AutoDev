import { describe, expect, it } from "vitest";
import { decideAnalysisAdmission } from "../src/policies/analysis.js";

const base = { summary: "bounded", codeEvidence: [{ path: "src/a.ts", symbol: "run", evidence: "branch lacks check" }], validity: "valid", necessity: "needed", feasibility: "feasible", acceptanceCriteria: ["test passes"], risks: [], questions: [], recommendation: "proceed" as const };

describe("analysis admission", () => {
  it("allows a bounded evidence-backed Issue", () => expect(decideAnalysisAdmission(base).verdict).toBe("proceed"));
  it("requires a human when evidence or acceptance criteria are absent", () => {
    expect(decideAnalysisAdmission({ ...base, codeEvidence: [] }).verdict).toBe("needs_human");
    expect(decideAnalysisAdmission({ ...base, acceptanceCriteria: [] }).verdict).toBe("needs_human");
  });
  it("preserves an evidence-backed rejection", () => expect(decideAnalysisAdmission({ ...base, recommendation: "reject" }).verdict).toBe("reject"));
});
