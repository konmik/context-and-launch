package aistages.shared

import kotlinx.serialization.Serializable

@Serializable
data class ProjectInfo(
    val path: String,
    val slug: String,
    val available: Boolean = true,
)

@Serializable
data class AddProjectRequest(
    val path: String,
    val slug: String? = null,
)

@Serializable
data class UpdateProjectRequest(
    val path: String? = null,
    val slug: String? = null,
)

@Serializable
data class BrowseCapabilities(
    val folderPicker: Boolean,
)

@Serializable
data class BrowseFolderRequest(
    val initialPath: String? = null,
)

@Serializable
data class BrowseFolderResponse(
    val path: String,
)
