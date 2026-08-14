import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo } from "solid-js";
import { getDefaultProjectSlug } from "~/components/project/project-api.js";
import { paths } from "~/router.js";

export default function Home() {
  const navigate = useNavigate();
  const defaultProjectSlug = createMemo(() => getDefaultProjectSlug());

  createEffect(defaultProjectSlug, (s) => {
    if (s === undefined) return;
    if (s) {
      navigate(paths.project(s)(), { replace: true });
    } else {
      navigate(paths["add-project"](), { replace: true });
    }
  });

  return <p>Loading...</p>;
}
