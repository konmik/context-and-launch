package aistages.app

import aistages.shared.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*

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
}
