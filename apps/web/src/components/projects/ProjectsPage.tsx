import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import { subscribeToProjects, createProject, updateProject, deleteProject } from '@/lib/db';
import { subscribeToGoals } from '@/lib/db';
import { ProjectList, ProjectModal } from '@/components/projects';
import { FloatingAddButton } from '@/components/tasks/FloatingAddButton';
import type { Project, Goal } from '@totalis/shared';

export function ProjectsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  // Auth state listener
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to projects and goals
  useEffect(() => {
    if (!authChecked || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubProjects = subscribeToProjects(user.uid, (updatedProjects) => {
      setProjects(updatedProjects);
      setIsLoading(false);
    });

    const unsubGoals = subscribeToGoals(user.uid, (updatedGoals) => {
      setGoals(updatedGoals);
    });

    return () => {
      unsubProjects();
      unsubGoals();
    };
  }, [user, authChecked]);

  const handleCreateProject = () => {
    setSelectedProject(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSaveProject = async (projectData: Partial<Project>) => {
    if (!user) return;

    if (modalMode === 'create') {
      await createProject({
        ...projectData,
        userId: user.uid,
        title: projectData.title || 'Untitled Project',
        status: projectData.status || 'active',
        progress: 0,
        taskCount: 0,
        completedTaskCount: 0,
      } as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
    } else if (selectedProject?.id) {
      await updateProject(selectedProject.id, projectData);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
  };

  // Show login prompt if not authenticated
  if (authChecked && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-secondary"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">Sign in to view projects</h2>
          <p className="text-text-secondary mb-6">
            Create and manage your projects to track progress across multiple tasks
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text mb-2">Projects</h1>
        <p className="text-text-secondary">
          Organize your tasks into projects to track progress and stay focused
        </p>
      </div>

      {/* Project Stats */}
      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-text">{projects.length}</div>
            <div className="text-sm text-text-secondary">Total Projects</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-success">
              {projects.filter((p) => p.status === 'active').length}
            </div>
            <div className="text-sm text-text-secondary">Active</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-primary">
              {projects.filter((p) => p.status === 'completed').length}
            </div>
            <div className="text-sm text-text-secondary">Completed</div>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <div className="text-2xl font-bold text-text">
              {Math.round(
                projects.reduce((sum, p) => sum + p.progress, 0) / projects.length
              )}%
            </div>
            <div className="text-sm text-text-secondary">Avg Progress</div>
          </div>
        </div>
      )}

      {/* Project List */}
      <ProjectList
        projects={projects}
        onProjectClick={handleProjectClick}
        isLoading={isLoading}
        emptyMessage="No projects yet. Create one to get started!"
      />

      {/* Floating Add Button */}
      <FloatingAddButton onClick={handleCreateProject} label="New Project" />

      {/* Project Modal */}
      <ProjectModal
        project={selectedProject}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProject}
        onDelete={handleDeleteProject}
        goals={goals}
        mode={modalMode}
      />
    </div>
  );
}
