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

fun Application.configureApp(
    registry: ProjectRegistry,
    staticDir: File?,
    worktreeManager: WorktreeManager = WorktreeManager(),
    boardConfigManager: BoardConfigManager = BoardConfigManager(),
    fileWatcher: FileWatcher = FileWatcher(),
) {
    install(ContentNegotiation) { json() }
    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
    }

    fun resolveWorktree(slug: String): File {
        val project = registry.listProjects().find { it.slug == slug }
            ?: throw IllegalArgumentException("Project not found: $slug")
        return worktreeManager.ensureWorktree(project.path, slug)
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

            route("/projects/{slug}/board") {
                get {
                    try {
                        val slug = call.parameters["slug"]!!
                        val worktreeDir = resolveWorktree(slug)
                        fileWatcher.watch(worktreeDir)
                        val config = boardConfigManager.getConfig()
                        val tickets = TicketStore(worktreeDir).listTickets()
                        call.respond(BoardState(columns = config.columns, tickets = tickets))
                    } catch (e: IllegalArgumentException) {
                        call.respondText(e.message ?: "Bad request", status = HttpStatusCode.BadRequest)
                    }
                }

                post("/tickets") {
                    try {
                        val slug = call.parameters["slug"]!!
                        val worktreeDir = resolveWorktree(slug)
                        val request = call.receive<CreateTicketRequest>()
                        val firstColumn = boardConfigManager.getConfig().columns.first()
                        val ticket = TicketStore(worktreeDir).createTicket(request.number, request.title, firstColumn)
                        call.respond(HttpStatusCode.Created, ticket)
                    } catch (e: IllegalArgumentException) {
                        call.respondText(e.message ?: "Bad request", status = HttpStatusCode.BadRequest)
                    }
                }

                put("/tickets/{folderName}") {
                    try {
                        val slug = call.parameters["slug"]!!
                        val folderName = call.parameters["folderName"]!!
                        val worktreeDir = resolveWorktree(slug)
                        val request = call.receive<UpdateTicketRequest>()
                        val ticket = TicketStore(worktreeDir).updateTicket(
                            folderName, request.number, request.title, request.status,
                        )
                        call.respond(ticket)
                    } catch (e: IllegalArgumentException) {
                        call.respondText(e.message ?: "Bad request", status = HttpStatusCode.BadRequest)
                    }
                }

                delete("/tickets/{folderName}") {
                    try {
                        val slug = call.parameters["slug"]!!
                        val folderName = call.parameters["folderName"]!!
                        val worktreeDir = resolveWorktree(slug)
                        TicketStore(worktreeDir).deleteTicket(folderName)
                        call.respond(HttpStatusCode.NoContent)
                    } catch (e: IllegalArgumentException) {
                        call.respondText(e.message ?: "Bad request", status = HttpStatusCode.BadRequest)
                    }
                }

                get("/tickets/{folderName}/stages/{stage}") {
                    try {
                        val slug = call.parameters["slug"]!!
                        val folderName = call.parameters["folderName"]!!
                        val stage = call.parameters["stage"]!!
                        val worktreeDir = resolveWorktree(slug)
                        val content = TicketStore(worktreeDir).getStageMarkdown(folderName, stage)
                        if (content != null) {
                            call.respond(StageMarkdownContent(content))
                        } else {
                            call.respond(HttpStatusCode.NotFound)
                        }
                    } catch (e: IllegalArgumentException) {
                        call.respondText(e.message ?: "Bad request", status = HttpStatusCode.BadRequest)
                    }
                }

                put("/tickets/{folderName}/stages/{stage}") {
                    try {
                        val slug = call.parameters["slug"]!!
                        val folderName = call.parameters["folderName"]!!
                        val stage = call.parameters["stage"]!!
                        val worktreeDir = resolveWorktree(slug)
                        val body = call.receive<StageMarkdownContent>()
                        TicketStore(worktreeDir).saveStageMarkdown(folderName, stage, body.content)
                        call.respond(HttpStatusCode.NoContent)
                    } catch (e: IllegalArgumentException) {
                        call.respondText(e.message ?: "Bad request", status = HttpStatusCode.BadRequest)
                    }
                }
            }
        }

        get("/") {
            val slug = registry.findStartSlug()
            if (slug != null) {
                call.respondRedirect("/project/$slug")
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
}

fun main() {
    val port = System.getProperty("app.port")?.toIntOrNull() ?: 8080
    val staticDir = System.getProperty("app.static.dir")?.let { File(it).canonicalFile }
    val registry = ProjectRegistry()
    val worktreeManager = WorktreeManager()
    val boardConfigManager = BoardConfigManager()
    val fileWatcher = FileWatcher()

    embeddedServer(Netty, port = port) {
        configureApp(registry, staticDir, worktreeManager, boardConfigManager, fileWatcher)
    }.start(wait = false)

    println()
    println("  http://localhost:$port")
    println()
    println("  Press Ctrl+C to stop")
    println()

    Thread.currentThread().join()
}
