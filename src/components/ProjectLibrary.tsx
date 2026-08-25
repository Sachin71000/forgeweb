import { Check, FolderOpen, History, LoaderCircle, Menu, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getBuild, getProjectWorkspace, listProjects, type BuildResponse, type ProjectSummary } from "../lib/forgeweb-api";

type ProjectLibraryProps = {
  activeProjectId?: string;
  refreshToken: number;
  onOpen: (build: BuildResponse) => void;
  onNewChat: () => void;
};

export default function ProjectLibrary({ activeProjectId, refreshToken, onOpen, onNewChat }: ProjectLibraryProps) {
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
      <button type="button" className="project-library-trigger" onClick={() => setOpen(true)} aria-label="My Projects" aria-expanded={open} aria-controls="project-history-drawer">
        <Menu /><span className="project-library-trigger-label">My Projects</span>{projects.length > 0 && <b>{projects.length}</b>}
      </button>
      {open && (
        <>
          <button type="button" className="project-library-scrim" aria-label="Close project history" onClick={() => setOpen(false)} />
          <aside id="project-history-drawer" className="project-library-panel" aria-label="My Projects">
            <div className="project-drawer-brand"><div><img src="/forgeweb-logo-gold.png" alt="" /><strong>ForgeWeb</strong></div><button type="button" aria-label="Close projects" onClick={() => setOpen(false)}><X /></button></div>
            <button type="button" className="project-new-chat" onClick={() => { onNewChat(); setOpen(false); }}><Plus /> New chat</button>
            <div className="project-drawer-heading"><span><History /> History</span><button type="button" aria-label="Refresh projects" onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></button></div>
            {error && <div className="workspace-error"><strong>Project storage unavailable.</strong><p>{error}</p></div>}
            <div className="project-library-list">
              {projects.map((project) => (
                <article className={project.id === activeProjectId ? "is-active" : ""} key={project.id}>
                  <button type="button" disabled={!project.currentBuildId || opening === project.id} onClick={() => void openProject(project)}>
                    <span className="project-history-icon">{opening === project.id ? <LoaderCircle className="animate-spin" /> : <FolderOpen />}</span>
                    <span className="project-history-copy"><strong>{project.name}</strong><small>{project.status.replaceAll("_", " ")} · v{project.currentVersionNumber ?? "—"}</small></span>
                    {project.id === activeProjectId && <Check className="project-history-current" />}
                  </button>
                </article>
              ))}
              {loading && projects.length === 0 && <p className="workspace-muted"><LoaderCircle className="animate-spin" /> Loading history…</p>}
              {!loading && projects.length === 0 && <p className="workspace-muted">Your generated projects will appear here automatically.</p>}
            </div>
            <footer><span>Local private workspace</span><small>{projects.length} project{projects.length === 1 ? "" : "s"}</small></footer>
          </aside>
        </>
      )}
    </div>
  );
}
