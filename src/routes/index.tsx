import { redirect, query, createAsync } from "@solidjs/router";

const redirectToDefaultProject = query(async () => {
  "use server";
  const { projectRegistry } = await import("~/lib/server/instances.js");
  const slug = projectRegistry.getDefaultSlug();
  if (slug) {
    throw redirect(`/project/${slug}`);
  }
  throw redirect("/add-project");
}, "home-redirect");

export const route = {
  load: () => redirectToDefaultProject()
};

export default function Home() {
  createAsync(() => redirectToDefaultProject());
  return <p>Loading...</p>;
}
