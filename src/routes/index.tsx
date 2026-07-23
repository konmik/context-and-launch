import { useNavigate } from "@solidjs/router";
import { createEffect } from "solid-js";
import { getDefaultProjectSlug } from "~/components/project/project-api.js";
import { createNonSuspendingAsync } from "~/lib/create-non-suspending-async.js";

export const route = {
  load: () => getDefaultProjectSlug(),
};

export default function Home() {
  const navigate = useNavigate();
  const defaultProjectSlug = createNonSuspendingAsync(() => getDefaultProjectSlug());

  createEffect(() => {
    const s = defaultProjectSlug();
    if (s === undefined) return;
    if (s) {
      navigate(`/project/${s}`, { replace: true });
    } else {
      navigate("/add-project", { replace: true });
    }
  });

  return <p>Loading...</p>;
}
