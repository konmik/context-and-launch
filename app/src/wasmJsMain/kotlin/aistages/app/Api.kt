package aistages.app

import aistages.shared.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*

private fun urlEncode(value: String): String = value.encodeURLPath()

object Api {
    private val client = HttpClient {
        install(ContentNegotiation) { json() }
    }

    suspend fun getProjects(): List<ProjectInfo> =
        client.get("/api/projects").body()

    suspend fun addProject(request: AddProjectRequest): ProjectInfo =
        client.post("/api/projects") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()

    suspend fun updateProject(slug: String, request: UpdateProjectRequest): ProjectInfo =
        client.put("/api/projects/$slug") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()

    suspend fun deleteProject(slug: String) {
        client.delete("/api/projects/$slug")
    }

    suspend fun getBrowseCapabilities(): BrowseCapabilities =
        client.get("/api/browse/capabilities").body()

    suspend fun browseFolder(initialPath: String? = null): String? {
        val response = client.post("/api/browse/folder") {
            contentType(ContentType.Application.Json)
            setBody(BrowseFolderRequest(initialPath))
        }
        return if (response.status == HttpStatusCode.NoContent) null
        else response.body<BrowseFolderResponse>().path
    }

    suspend fun getBoard(slug: String): BoardState =
        client.get("/api/projects/$slug/board").body()

    suspend fun createTicket(slug: String, request: CreateTicketRequest): TicketInfo =
        client.post("/api/projects/$slug/board/tickets") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()

    suspend fun updateTicket(slug: String, folderName: String, request: UpdateTicketRequest): TicketInfo =
        client.put("/api/projects/$slug/board/tickets/${urlEncode(folderName)}") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()

    suspend fun deleteTicket(slug: String, folderName: String) {
        client.delete("/api/projects/$slug/board/tickets/${urlEncode(folderName)}")
    }

    suspend fun getStageMarkdown(slug: String, folderName: String, stage: String): StageMarkdownContent? {
        val response = client.get("/api/projects/$slug/board/tickets/${urlEncode(folderName)}/stages/${urlEncode(stage)}")
        return if (response.status == HttpStatusCode.NotFound) null
        else response.body()
    }

    suspend fun saveStageMarkdown(slug: String, folderName: String, stage: String, content: StageMarkdownContent) {
        client.put("/api/projects/$slug/board/tickets/${urlEncode(folderName)}/stages/${urlEncode(stage)}") {
            contentType(ContentType.Application.Json)
            setBody(content)
        }
    }
}
