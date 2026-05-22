package aistages.shared

import kotlinx.serialization.Serializable

@Serializable
data class TicketInfo(
    val number: String,
    val title: String,
    val status: String,
    val folderName: String,
    val stageNames: List<String>,
)

@Serializable
data class CreateTicketRequest(
    val number: String,
    val title: String,
)

@Serializable
data class UpdateTicketRequest(
    val number: String? = null,
    val title: String? = null,
    val status: String? = null,
)

@Serializable
data class BoardConfig(
    val columns: List<String>,
)

@Serializable
data class BoardState(
    val columns: List<String>,
    val tickets: List<TicketInfo>,
)

@Serializable
data class StageMarkdownContent(
    val content: String,
)
