export type BuildStatus =
  | "queued"
  | "specifying"
  | "planning"
  | "awaiting_confirmation"
  | "generating"
  | "reviewing"
  | "validating"
  | "completed"
  | "failed"
  | "needs_context";

export type BuildStage = {
  index: number;
  key: BuildStatus;
  label: string;
  detail: string;
  startedAt: string;
  completedAt?: string;
};

export type Requirement = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: "P0" | "P1";
};

export type BuildCapability = {
  id: "react" | "git" | "gsap" | "animejs" | "react-bits";
  name: string;
  kind: "framework" | "source-control" | "motion" | "component-source";
  sourceUrl: string;
  usage: string;
  boundary: string;
};

export type ArchitecturePlan = {
  systemShape: string;
  frontend: { framework: string; pages: string[]; components: string[]; motion: string[] };
  backend: { runtime: string; modules: string[]; apiStyle: string; jobs: string[] };
  data: { database: string; entities: string[]; rules: string[] };
  security: string[];
  delivery: string[];
  diagram: string;
  markdown: string;
  capabilities: BuildCapability[];
};

export type MasterSpecification = {
  id: string;
  projectId: string;
  version: number;
  status: "proposed" | "approved";
  prompt: string;
  productName: string;
  summary: string;
  roles: string[];
  entities: string[];
  requirements: Requirement[];
  assumptions: string[];
  architecture: ArchitecturePlan;
  createdAt: string;
  confirmedAt?: string;
};

export type AgentRole = "engineering_planner" | "implementation" | "engineering_reviewer" | "validator";

export type AgentTask = {
  id: string;
  buildId: string;
  role: AgentRole;
  objective: string;
  requirementIds: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  behaviorToPreserve: string[];
  assumptions: string[];
  simplestSufficientApproach: string;
  changeBudget: { maxFiles: number; maxAddedLines: number; maxDeletedLines: number };
  acceptanceCriteria: string[];
  validationPlan: string[];
  policyPackVersion: string;
  policySourceRevision: string;
  policySourceDigest: string;
  status: "ready" | "completed" | "failed";
};

export type GeneratedFile = {
  path: string;
  content: string;
  requirementIds: string[];
  digest: string;
};

export type ReviewFinding = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
};

export type ValidationCheck = {
  id: string;
  name: string;
  status: "passed" | "failed";
  evidence: string;
};

export type GraphNode = {
  id: string;
  type: "project" | "requirement" | "task" | "file" | "validation" | "commit";
  label: string;
  metadata?: Record<string, string | number | boolean>;
};

export type GraphEdge = {
  id: string;
  type: "CONTAINS" | "SATISFIED_BY" | "PERFORMED_BY" | "VALIDATED_BY" | "SNAPSHOT_OF";
  from: string;
  to: string;
};

export type GraphSnapshot = {
  id: string;
  projectId: string;
  buildId: string;
  mode: "authoritative";
  engine: "forgeweb-structural-adapter";
  upstreamTarget: "code-review-graph@2.3.7";
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt: string;
};

export type Project = {
  id: string;
  slug: string;
  name: string;
  status: "planning" | "awaiting_confirmation" | "building" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
  currentSpecificationId?: string;
  currentBuildId?: string;
  currentGraphSnapshotId?: string;
};

export type BuildEvent = {
  id: string;
  buildId: string;
  type: "build.created" | "build.stage.started" | "build.stage.completed" | "build.awaiting_confirmation" | "build.confirmed" | "build.completed" | "build.failed";
  message: string;
  timestamp: string;
  data?: Record<string, string | number | boolean>;
};

export type Build = {
  id: string;
  projectId: string;
  specificationId?: string;
  status: BuildStatus;
  currentStageIndex: number;
  stageDetail: string;
  stages: BuildStage[];
  taskIds: string[];
  filePaths: string[];
  reviewFindings: ReviewFinding[];
  validationChecks: ValidationCheck[];
  graphSnapshotId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  confirmedAt?: string;
};

export type ForgeDatabase = {
  schemaVersion: 1;
  projects: Record<string, Project>;
  specifications: Record<string, MasterSpecification>;
  builds: Record<string, Build>;
  tasks: Record<string, AgentTask>;
  files: Record<string, GeneratedFile[]>;
  events: Record<string, BuildEvent[]>;
  graphs: Record<string, GraphSnapshot>;
};

export type BuildView = Build & {
  project: Project;
  specification?: MasterSpecification;
  events: BuildEvent[];
};
