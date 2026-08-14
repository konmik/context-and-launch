import { createRouter, defineRoutes } from "@solidjs/router";
import { lazy } from "solid-js";
import { getDefaultProjectSlug, loadProjectPage } from "~/components/project/project-api.js";

export const routes = defineRoutes([
  {
    path: "/",
    preload: () => getDefaultProjectSlug(),
    component: lazy(() => import("./pages/index.js")),
  },
  {
    path: "/add-project",
    component: lazy(() => import("./pages/add-project.js")),
  },
  {
    path: "/project/:projectSlug",
    preload: ({ params }) => loadProjectPage(params.projectSlug!),
    component: lazy(() => import("./pages/project.js")),
  },
]);

export const AppRouter = createRouter({ routes, singleFlight: true });
export const paths = AppRouter.paths;
