import { useNavigate } from "@solidjs/router";
import AddProjectForm from "~/components/project/AddProjectForm";
import PalettePicker from "~/components/shared/PalettePicker";
import { addProject } from "~/components/project/project-api.js";

export default function AddProjectPage() {
  const navigate = useNavigate();
  return (
    <div class="flex min-h-screen items-center justify-center p-4">
      <div class="fixed right-4 top-4 flex items-center gap-2">
        <PalettePicker />
      </div>
      <div class="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h1 class="mb-6 text-[clamp(1.25rem,3vw,1.75rem)] font-semibold"># Welcome to Context &amp; Launch</h1>
        <AddProjectForm
          action={addProject}
          onSuccess={(projectSlug) => navigate(`/project/${projectSlug}`)}
        />
      </div>
    </div>
  );
}
