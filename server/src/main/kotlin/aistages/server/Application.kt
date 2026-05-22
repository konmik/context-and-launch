package aistages.server

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.http.content.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.routing.*
import java.io.File

fun main() {
    val port = System.getProperty("app.port")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port) {
        install(ContentNegotiation) {
            json()
        }
        install(CORS) {
            anyHost()
            allowHeader(HttpHeaders.ContentType)
        }
        routing {
            val staticDir = System.getProperty("app.static.dir")
            if (staticDir != null) {
                staticFiles("/", File(staticDir)) {
                    default("index.html")
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
