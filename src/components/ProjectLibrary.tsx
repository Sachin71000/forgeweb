import { Check, FolderOpen, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getBuild, getProjectWorkspace, listProjects, type BuildResponse, type ProjectSummary } from "../lib/forgeweb-api";

type ProjectLibraryProps = {
  activeProjectId?: string;
  refreshToken: number;
  onOpen: (build: BuildResponse) => void;
};

export default function ProjectLibrary({ activeProjectId, refreshToken, onOpen }: ProjectLibraryProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProjects(await listProjects());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Projects could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const openProject = async (project: ProjectSummary) => {
    if (!project.currentBuildId) return;
    setOpening(project.id);
    setError("");
    try {
      await getProjectWorkspace(project.id);
      onOpen(await getBuild(project.currentBuildId));
      setOpen(false);
      window.setTimeout(() => document.querySelector(".build-proposal")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Project could not be opened.");
    } finally {
      setOpening("");
    }
  };

  return (
    <div className="project-library">
      <button type="button" className="project-library-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <FolderOpen /> My Projects {projects.length > 0 && <span>{projects.length}</span>}
      </button>
      {open && (
        <section className="project-library-panel" aria-label="My Projects">
          <div className="workspace-panel-heading"><div><span>Persistent workspace</span><h3>My Projects</h3></div><div><button type="button" aria-label="Refresh projects" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></button><button type="button" aria-label="Close projects" onClick={() => setOpen(false)}><X /></button></div></div>
          {error && <div className="workspace-error"><strong>Project storage unavailable.</strong><p>{error}</p></div>}
          <div className="project-library-list">
            {projects.map((project) => (
              <article className={project.id === activeProjectId ? "is-active" : ""} key={project.id}>
                <div><span>{project.status.replaceAll("_", " ")}</span><h4>{project.name}</h4><p>Updated {new Date(project.updatedAt).toLocaleString()} · Version {project.currentVersionNumber ?? "—"}</p><code>{project.id}</code></div>
                {project.id === activeProjectId ? <strong><Check /> Open</strong> : <button type="button" disabled={!project.currentBuildId || opening === project.id} onClick={() => void openProject(project)}>{opening === project.id ? <LoaderCircle className="animate-spin" /> : <FolderOpen />} Open</button>}
              </article>
            ))}
            {!loading && projects.length === 0 && <p className="workspace-muted">Your generated projects will appear here automatically.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
