export type SCMProviderName = "gitlab" | "github";

export interface RepositoryRef {
  provider: SCMProviderName;
  id: string;
  fullName: string;
  cloneUrl: string;
  webUrl: string;
  defaultBranch: string;
}

export interface IssueRef {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  author: string;
  url: string;
  updatedAt: string;
}

export interface WorkItem {
  provider: SCMProviderName;
  deliveryId: string;
  action: string;
  repository: RepositoryRef;
  issue: IssueRef;
  revision: string;
  rawEventArtifact?: string;
}

export type AutomationMode = "plan-only" | "draft" | "no-push";

export interface AdmissionDecision {
  accepted: boolean;
  mode: AutomationMode;
  reason: string;
}

export interface GitCheckpoint {
  baseBranch: string;
  baseSha: string;
  taskBranch: string;
  headSha: string;
  changedFiles: string[];
  clean: boolean;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PlanStep {
  title: string;
  description: string;
  expectedPaths: string[];
}

export interface PlanRisk {
  level: RiskLevel;
  area: string;
  mitigation: string;
}

export interface PlanResult {
  summary: string;
  acceptanceCriteria: string[];
  affectedAreas: string[];
  implementationSteps: PlanStep[];
  risks: PlanRisk[];
  expectedChangedPaths: string[];
  proposedChecks: string[];
  requiresHumanInput: boolean;
  humanQuestions: string[];
  changeRequest: {
    title: string;
    description: string;
    draft: boolean;
  };
}

export interface ImplementationResult {
  summary: string;
  changedFiles: string[];
  testsAttempted: string[];
  remainingRisks: string[];
}

export type GateType = "command" | "git" | "path" | "human" | "review";

export interface QualityGate {
  id: string;
  type: GateType;
  description: string;
  required: boolean;
  command?: string;
  cwd?: string;
  source: "global" | "repository" | "plan" | "changed-path";
}

export interface GateEvidence {
  gateId: string;
  passed: boolean;
  summary: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  artifact?: string;
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  acceptanceCoverage: Array<{ criterion: string; covered: boolean; evidence: string }>;
  findings: Array<{ severity: RiskLevel; title: string; evidence: string }>;
}

export interface ChangeRequest {
  id: string;
  number: number;
  url: string;
  sourceBranch: string;
  targetBranch: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
}

export type PipelineStatus = "pending" | "running" | "success" | "failed" | "cancelled" | "skipped";

export interface Pipeline {
  id: string;
  sha: string;
  status: PipelineStatus;
  url: string;
}

export interface JobFailure {
  id: string;
  name: string;
  url: string;
  log: string;
}
