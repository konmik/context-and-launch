package aistages.server

import aistages.shared.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.io.File

fun main() {
    val port = System.getProperty("app.port")?.toIntOrNull() ?: 8080
    val staticDir = System.getProperty("app.static.dir")?.let { File(it).canonicalFile }
    val registry = ProjectRegistry()

    embeddedServer(Netty, port = port) {
        install(ContentNegotiation) { json() }
        install(CORS) {
            anyHost()
            allowHeader(HttpHeaders.ContentType)
        }

        routing {
            route("/api") {
                get("/projects") {
                    call.respond(registry.listProjects())
                }

                post("/projects") {
                    try {
                        val request = call.receive<AddProjectRequest>()
                        val project = registry.addProject(request.path, request.slug)
                        call.respond(HttpStatusCode.Created, project)
                    } catch (e: IllegalArgumentException) {
                        call.respondText(
                            e.message ?: "Bad request",
                            status = HttpStatusCode.BadRequest,
                        )
                    }
                }

                put("/projects/{slug}") {
                    try {
                        val slug = call.parameters["slug"]!!
                        val request = call.receive<UpdateProjectRequest>()
                        val project = registry.updateProject(slug, request.path, request.slug)
                        call.respond(project)
                    } catch (e: IllegalArgumentException) {
                        call.respondText(
                            e.message ?: "Bad request",
                            status = HttpStatusCode.BadRequest,
                        )
                    }
                }

                delete("/projects/{slug}") {
                    val slug = call.parameters["slug"]!!
                    registry.removeProject(slug)
                    call.respond(HttpStatusCode.NoContent)
                }

                get("/browse/capabilities") {
                    call.respond(BrowseCapabilities(folderPicker = true))
                }

                post("/browse/folder") {
                    val request = call.receive<BrowseFolderRequest>()
                    val path = openFolderPicker(request.initialPath)
                    if (path != null) {
                        call.respond(BrowseFolderResponse(path))
                    } else {
                        call.respond(HttpStatusCode.NoContent)
                    }
                }
            }

            get("/") {
                val config = registry.load()
                val lastSlug = config.lastUsedSlug
                if (lastSlug != null && config.projects.any { it.slug == lastSlug }) {
                    call.respondRedirect("/project/$lastSlug")
                } else if (config.projects.isNotEmpty()) {
                    call.respondRedirect("/project/${config.projects.first().slug}")
                } else {
                    call.respondRedirect("/add-project")
                }
            }

            if (staticDir != null) {
                get("{path...}") {
                    val requestPath = call.parameters.getAll("path")?.joinToString("/") ?: ""

                    if (requestPath.startsWith("project/")) {
                        val slug = requestPath.removePrefix("project/").takeWhile { it != '/' }
                        registry.setLastUsed(slug)
                    }

                    val file = File(staticDir, requestPath).canonicalFile
                    if (file.startsWith(staticDir) && file.exists() && file.isFile) {
                        call.respondFile(file)
                    } else {
                        call.respondFile(File(staticDir, "index.html"))
                    }
                }
            }
        }
    }.start(wait = false)

    println()
    println("  http://localhost:$port")
    println()
    println("  Press Ctrl+C to stop")
    println()

    Thread.currentThread().join()
}
