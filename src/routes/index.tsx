import { useNavigate, createAsync } from "@solidjs/router";
import { createEffect } from "solid-js";
import { getDefaultSlug } from "~/server/actions";

export const route = {
  load: () => getDefaultSlug(),
};

export default function Home() {
  const navigate = useNavigate();
  const slug = createAsync(() => getDefaultSlug());

  createEffect(() => {
    const s = slug();
    if (s === undefined) return;
    if (s) {
      navigate(`/project/${s}`, { replace: true });
    } else {
      navigate("/add-project", { replace: true });
    }
  });

  return <p>Loading...</p>;
}
