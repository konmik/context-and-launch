import { useNavigate, createAsync } from "@solidjs/router";
import { createEffect } from "solid-js";
import { getDefaultProjectSlug } from "~/server/actions";

export const route = {
  load: () => getDefaultProjectSlug(),
};

export default function Home() {
  const navigate = useNavigate();
  const defaultProjectSlug = createAsync(() => getDefaultProjectSlug());

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
