package aistages.server

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
}
