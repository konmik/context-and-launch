import { useNavigate } from "@solidjs/router";
import AddProjectForm from "~/components/project/AddProjectForm";
import ThemeToggle from "~/components/shared/ThemeToggle";
import { addProjectAction } from "~/server/actions";

export default function AddProjectPage() {
  const navigate = useNavigate();
  return (
    <div class="flex min-h-screen items-center justify-center p-4">
      <div class="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <div class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 class="mb-6 text-2xl font-semibold">Welcome to Context & Launch</h1>
        <AddProjectForm
          action={addProjectAction}
          onSuccess={(projectSlug) => navigate(`/project/${projectSlug}`)}
        />
      </div>
    </div>
  );
}
