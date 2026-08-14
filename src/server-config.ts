import "server-only";
import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server";
import { createFlightDataCollector } from "@solidjs/router/server";
import { AppRouter } from "./router.js";
import { publishAppServices } from "./server/app-services.js";

publishAppServices();
configureServerFunctionsServer({ collectFlightData: createFlightDataCollector(AppRouter) });
