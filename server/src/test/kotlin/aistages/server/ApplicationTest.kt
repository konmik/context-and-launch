package aistages.server

import aistages.shared.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.testing.*
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ApplicationTest {

    @Test
    fun `GET project with trailing slash extracts empty slug and serves index html`() {
        val configDir = createTempDirectory("app-config").toFile()
        val staticDir = createTempDirectory("app-static").toFile()
        try {
            File(staticDir, "index.html").writeText("<html>SPA</html>")

            // Set up a registry with a fake project so lastUsedSlug is non-null
            val registry = ProjectRegistry(configDir)
            val fakeProjectDir = createTempDirectory("fake-project").toFile()
            File(fakeProjectDir, ".git").mkdir()
            registry.addProject(fakeProjectDir.absolutePath, "my-project")
            // addProject sets lastUsedSlug to "my-project"

            testApplication {
                application {
                    configureApp(registry, staticDir.canonicalFile)
                }

                val response = client.get("/project/")
                assertEquals(HttpStatusCode.OK, response.status)

                // Verify the SPA fallback served index.html content
                val body = response.bodyAsText()
                assertEquals("<html>SPA</html>", body)
            }

            // setLastUsed("") should have been a no-op — lastUsedSlug unchanged
            assertEquals("my-project", registry.findStartSlug())

            fakeProjectDir.deleteRecursively()
        } finally {
            configDir.deleteRecursively()
            staticDir.deleteRecursively()
        }
    }

    @Test
    fun `path traversal with encoded dot-dot segments returns index html not parent files`() {
        val configDir = createTempDirectory("app-config").toFile()
        val staticDir = createTempDirectory("app-static").toFile()
        try {
            // Create index.html in static dir
            File(staticDir, "index.html").writeText("<html>SPA</html>")

            // Create a secret file in the parent directory
            val secretFile = File(staticDir.parentFile, "secret.txt")
            secretFile.writeText("SECRET DATA")

            val registry = ProjectRegistry(configDir)

            testApplication {
                application {
                    configureApp(registry, staticDir.canonicalFile)
                }

                // Try path traversal with literal ..
                val response1 = client.get("/../secret.txt")
                // Should get index.html (SPA fallback), not the secret file
                assertEquals(HttpStatusCode.OK, response1.status)

                // Try path traversal with encoded segments
                val response2 = client.get("/%2e%2e/secret.txt")
                assertEquals(HttpStatusCode.OK, response2.status)
            }

            secretFile.delete()
        } finally {
            configDir.deleteRecursively()
            staticDir.deleteRecursively()
        }
    }

    @Test
    fun `POST api projects with malformed JSON body returns 400 not 500`() {
        val configDir = createTempDirectory("app-config").toFile()
        try {
            val registry = ProjectRegistry(configDir)

            testApplication {
                application {
                    configureApp(registry, null)
                }

                val client = createClient {
                    install(ContentNegotiation) { json() }
                }

                // Missing required "path" field
                val response1 = client.post("/api/projects") {
                    contentType(ContentType.Application.Json)
                    setBody(mapOf("invalid" to "json"))
                }
                assertEquals(
                    HttpStatusCode.BadRequest,
                    response1.status,
                    "Missing required 'path' field should return 400, got ${response1.status}",
                )

                // Completely invalid JSON
                val response2 = client.post("/api/projects") {
                    contentType(ContentType.Application.Json)
                    setBody("{not json at all}")
                }
                assertEquals(
                    HttpStatusCode.BadRequest,
                    response2.status,
                    "Invalid JSON should return 400, got ${response2.status}",
                )
            }
        } finally {
            configDir.deleteRecursively()
        }
    }

    private fun createTestProjectWithBoard(
        block: suspend (client: io.ktor.client.HttpClient, slug: String) -> Unit,
    ) {
        val configDir = createTempDirectory("app-config").toFile()
        val boardConfigDir = createTempDirectory("board-config").toFile()
        val projectDir = createTempDirectory("test-project").toFile()
        try {
            WorktreeManager.git(projectDir, "init")
            WorktreeManager.git(projectDir, "commit", "--allow-empty", "-m", "init")

            val registry = ProjectRegistry(configDir)
            registry.addProject(projectDir.absolutePath, "test-proj")

            val worktreeManager = WorktreeManager(boardConfigDir)
            val boardConfigManager = BoardConfigManager(boardConfigDir)

            testApplication {
                application {
                    configureApp(registry, null, worktreeManager, boardConfigManager)
                }

                val client = createClient {
                    install(ContentNegotiation) { json() }
                }

                block(client, "test-proj")
            }
        } finally {
            // Clean up worktrees
            try {
                val wtDir = File(boardConfigDir, "worktrees/test-proj")
                if (wtDir.exists()) {
                    WorktreeManager.git(projectDir, "worktree", "remove", "--force", wtDir.absolutePath)
                }
            } catch (_: Exception) {}
            configDir.deleteRecursively()
            boardConfigDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `GET board returns columns and empty ticket list`() {
        createTestProjectWithBoard { client, slug ->
            val response = client.get("/api/projects/$slug/board")
            assertEquals(HttpStatusCode.OK, response.status)

            val board = response.body<BoardState>()
            assertEquals(BoardConfigManager.DEFAULT_COLUMNS, board.columns)
            assertTrue(board.tickets.isEmpty())
        }
    }

    @Test
    fun `POST ticket then GET board shows it in first column`() {
        createTestProjectWithBoard { client, slug ->
            val createResponse = client.post("/api/projects/$slug/board/tickets") {
                contentType(ContentType.Application.Json)
                setBody(CreateTicketRequest("T-1", "Test Ticket"))
            }
            assertEquals(HttpStatusCode.Created, createResponse.status)

            val ticket = createResponse.body<TicketInfo>()
            assertEquals("T-1", ticket.number)
            assertEquals("todo", ticket.status)

            val board = client.get("/api/projects/$slug/board").body<BoardState>()
            assertEquals(1, board.tickets.size)
            assertEquals("T-1", board.tickets[0].number)
        }
    }

    @Test
    fun `PUT ticket status moves it to another column`() {
        createTestProjectWithBoard { client, slug ->
            val ticket = client.post("/api/projects/$slug/board/tickets") {
                contentType(ContentType.Application.Json)
                setBody(CreateTicketRequest("M-1", "Move Me"))
            }.body<TicketInfo>()

            val updated = client.put("/api/projects/$slug/board/tickets/${ticket.folderName}") {
                contentType(ContentType.Application.Json)
                setBody(UpdateTicketRequest(status = "in-progress"))
            }.body<TicketInfo>()

            assertEquals("in-progress", updated.status)
        }
    }

    @Test
    fun `DELETE ticket removes it`() {
        createTestProjectWithBoard { client, slug ->
            val ticket = client.post("/api/projects/$slug/board/tickets") {
                contentType(ContentType.Application.Json)
                setBody(CreateTicketRequest("D-1", "Delete Me"))
            }.body<TicketInfo>()

            val deleteResponse = client.delete("/api/projects/$slug/board/tickets/${ticket.folderName}")
            assertEquals(HttpStatusCode.NoContent, deleteResponse.status)

            val board = client.get("/api/projects/$slug/board").body<BoardState>()
            assertTrue(board.tickets.isEmpty())
        }
    }

    @Test
    fun `GET board for unknown slug returns 400`() {
        val configDir = createTempDirectory("app-config").toFile()
        try {
            val registry = ProjectRegistry(configDir)

            testApplication {
                application {
                    configureApp(registry, null)
                }

                val client = createClient {
                    install(ContentNegotiation) { json() }
                }

                val response = client.get("/api/projects/nonexistent/board")
                assertEquals(HttpStatusCode.BadRequest, response.status)
            }
        } finally {
            configDir.deleteRecursively()
        }
    }

    @Test
    fun `GET stage markdown returns 404 when not found`() {
        createTestProjectWithBoard { client, slug ->
            val ticket = client.post("/api/projects/$slug/board/tickets") {
                contentType(ContentType.Application.Json)
                setBody(CreateTicketRequest("N-1", "No Stage"))
            }.body<TicketInfo>()

            val response = client.get("/api/projects/$slug/board/tickets/${ticket.folderName}/stages/todo")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }
    }

    @Test
    fun `GET stage with encoded traversal segments returns 400`() {
        createTestProjectWithBoard { client, slug ->
            // Create a real ticket so the folderName exists
            val ticket = client.post("/api/projects/$slug/board/tickets") {
                contentType(ContentType.Application.Json)
                setBody(CreateTicketRequest("T-2", "Traversal Test"))
            }.body<TicketInfo>()

            // Traversal in stage parameter: encoded ".." should be caught by requireSimpleName
            val r1 = client.get("/api/projects/$slug/board/tickets/${ticket.folderName}/stages/%2e%2e")
            assertEquals(
                HttpStatusCode.BadRequest, r1.status,
                "Encoded '..' in stage should return 400, got ${r1.status}",
            )

            // Traversal in folderName parameter: encoded "../" should be caught by requireContained
            val r2 = client.get("/api/projects/$slug/board/tickets/%2e%2e/stages/todo")
            assertEquals(
                HttpStatusCode.BadRequest, r2.status,
                "Encoded '..' in folderName should return 400, got ${r2.status}",
            )

            // Slash in stage parameter
            val r3 = client.get("/api/projects/$slug/board/tickets/${ticket.folderName}/stages/..%2ftodo")
            assertEquals(
                HttpStatusCode.BadRequest, r3.status,
                "Encoded slash in stage should return 400, got ${r3.status}",
            )
        }
    }

    @Test
    fun `stage markdown PUT and GET roundtrip`() {
        createTestProjectWithBoard { client, slug ->
            val ticket = client.post("/api/projects/$slug/board/tickets") {
                contentType(ContentType.Application.Json)
                setBody(CreateTicketRequest("S-1", "Stage Test"))
            }.body<TicketInfo>()

            val putResponse = client.put("/api/projects/$slug/board/tickets/${ticket.folderName}/stages/todo") {
                contentType(ContentType.Application.Json)
                setBody(StageMarkdownContent("# Notes\nSome content"))
            }
            assertEquals(HttpStatusCode.NoContent, putResponse.status)

            val getResponse = client.get("/api/projects/$slug/board/tickets/${ticket.folderName}/stages/todo")
            assertEquals(HttpStatusCode.OK, getResponse.status)
            val content = getResponse.body<StageMarkdownContent>()
            assertEquals("# Notes\nSome content", content.content)
        }
    }
}
