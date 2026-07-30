import { z } from "zod";

const risk = z.enum(["low", "medium", "high", "critical"]);

export const planSchema = z.object({
  summary: z.string(),
  acceptanceCriteria: z.array(z.string()),
  affectedAreas: z.array(z.string()),
  implementationSteps: z.array(z.object({
    title: z.string(),
    description: z.string(),
    expectedPaths: z.array(z.string()),
  })),
  risks: z.array(z.object({ level: risk, area: z.string(), mitigation: z.string() })),
  expectedChangedPaths: z.array(z.string()),
  proposedChecks: z.array(z.string()),
  requiresHumanInput: z.boolean(),
  humanQuestions: z.array(z.string()),
  changeRequest: z.object({ title: z.string(), description: z.string(), draft: z.boolean() }),
});

export const implementationSchema = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()),
  testsAttempted: z.array(z.string()),
  remainingRisks: z.array(z.string()),
});

export const reviewSchema = z.object({
  approved: z.boolean(),
  summary: z.string(),
  acceptanceCoverage: z.array(z.object({ criterion: z.string(), covered: z.boolean(), evidence: z.string() })),
  findings: z.array(z.object({ severity: risk, title: z.string(), evidence: z.string() })),
});
