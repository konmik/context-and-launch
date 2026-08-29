import { createRouter, defineRoutes, query } from "@solidjs/router";
import { lazy } from "solid-js";
import { redirect } from "@solidjs/web";
import { getDefaultProjectSlug, loadProjectPage } from "~/components/project/project-api.js";

const redirectFromHome = query(async (): Promise<Response> => {
  const projectSlug = await getDefaultProjectSlug();
  return redirect(projectSlug ? paths.project(projectSlug)() : paths["add-project"]());
}, "home-redirect");

export const routes = defineRoutes([
  {
    path: "/",
    preload: () => redirectFromHome(),
    component: lazy(() => import("./pages/index.js"), undefined),
  },
  {
    path: "/add-project",
    component: lazy(() => import("./pages/add-project.js"), undefined),
  },
  {
    path: "/project/:projectSlug",
    preload: ({ params }) => loadProjectPage(params.projectSlug!),
    component: lazy(() => import("./pages/project.js"), undefined),
  },
]);

export const AppRouter = createRouter({ routes, singleFlight: true });
export const paths = AppRouter.paths;
