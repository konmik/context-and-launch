import { useNavigate } from "@solidjs/router";
import AddProjectForm from "~/lib/components/AddProjectForm";
import { addProjectAction } from "~/lib/server/actions";

export default function AddProjectPage() {
  const navigate = useNavigate();
  return (
    <div class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 class="mb-6 text-2xl font-semibold">Welcome to AI Stages</h1>
        <AddProjectForm
          action={addProjectAction}
          onSuccess={(slug) => navigate(`/project/${slug}`)}
        />
      </div>
    </div>
  );
}
