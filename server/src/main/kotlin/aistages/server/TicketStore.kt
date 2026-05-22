package aistages.server

import aistages.shared.TicketInfo
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
private data class StatusJson(
    val number: String,
    val title: String,
    val status: String,
)

class TicketStore(private val worktreeDir: File) {
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    private fun requireContained(file: File, label: String) {
        requireContainedIn(file, worktreeDir, label)
    }

    private fun requireContainedIn(file: File, parent: File, label: String) {
        val canonical = file.canonicalPath
        val root = parent.canonicalPath + File.separator
        require(canonical.startsWith(root)) { "$label escapes allowed directory: $canonical" }
    }

    private fun requireSimpleName(name: String, label: String) {
        require(!name.contains('/') && !name.contains('\\') && name != ".." && name != ".") {
            "$label must be a simple name without path separators: $name"
        }
    }

    fun listTickets(): List<TicketInfo> {
        if (!worktreeDir.exists()) return emptyList()
        return worktreeDir.listFiles()
            ?.filter { it.isDirectory && !it.name.startsWith(".") }
            ?.mapNotNull { dir -> readTicket(dir) }
            ?.sortedBy { it.number.lowercase() }
            ?: emptyList()
    }

    fun createTicket(number: String, title: String, initialStatus: String = "todo"): TicketInfo {
        require(number.isNotBlank()) { "Ticket number must not be blank" }
        require(title.isNotBlank()) { "Ticket title must not be blank" }

        val baseFolderName = toKebabCase("$number $title")
        val dir = resolveUniqueFolderName(baseFolderName)
        dir.mkdirs()

        val status = StatusJson(number = number.trim(), title = title.trim(), status = initialStatus)
        writeStatusJson(dir, status)
        autoCommit("create ticket ${status.number}")

        return readTicket(dir)!!
    }

    fun updateTicket(folderName: String, number: String?, title: String?, status: String?): TicketInfo {
        val dir = File(worktreeDir, folderName)
        requireContained(dir, "folderName")
        require(dir.exists() && dir.isDirectory) { "Ticket not found: $folderName" }

        val current = readStatusJson(dir) ?: throw IllegalArgumentException("Malformed ticket: $folderName")
        val updated = current.copy(
            number = number?.trim()?.also { require(it.isNotBlank()) { "Ticket number must not be blank" } } ?: current.number,
            title = title?.trim()?.also { require(it.isNotBlank()) { "Ticket title must not be blank" } } ?: current.title,
            status = status ?: current.status,
        )

        val needsRename = (number != null && number.trim() != current.number) ||
            (title != null && title.trim() != current.title)

        val finalDir = if (needsRename) {
            val newFolderName = toKebabCase("${updated.number} ${updated.title}")
            if (newFolderName != folderName) {
                val newDir = File(worktreeDir, newFolderName)
                require(!newDir.exists()) { "Folder name collision: $newFolderName" }
                check(dir.renameTo(newDir)) {
                    "Failed to rename ticket folder from ${dir.name} to $newFolderName"
                }
                newDir
            } else {
                dir
            }
        } else {
            dir
        }

        writeStatusJson(finalDir, updated)
        autoCommit("update ticket ${updated.number}")

        return readTicket(finalDir)!!
    }

    fun deleteTicket(folderName: String) {
        val dir = File(worktreeDir, folderName)
        requireContained(dir, "folderName")
        require(dir.exists() && dir.isDirectory) { "Ticket not found: $folderName" }
        val number = readStatusJson(dir)?.number ?: folderName
        dir.deleteRecursively()
        autoCommit("delete ticket $number")
    }

    fun getStageMarkdown(folderName: String, stage: String): String? {
        requireSimpleName(stage, "stage")
        val dir = File(worktreeDir, folderName)
        val file = File(dir, "$stage.md")
        requireContained(file, "stage")
        requireContainedIn(file, dir, "stage")
        return if (file.exists()) file.readText() else null
    }

    fun saveStageMarkdown(folderName: String, stage: String, content: String) {
        requireSimpleName(stage, "stage")
        val dir = File(worktreeDir, folderName)
        requireContained(dir, "folderName")
        require(dir.exists() && dir.isDirectory) { "Ticket not found: $folderName" }
        val file = File(dir, "$stage.md")
        requireContained(file, "stage")
        requireContainedIn(file, dir, "stage")
        file.writeText(content)
        val number = readStatusJson(dir)?.number ?: folderName
        autoCommit("update $stage for $number")
    }

    private fun readTicket(dir: File): TicketInfo? {
        val status = readStatusJson(dir) ?: return null
        val stageNames = dir.listFiles()
            ?.filter { it.isFile && it.extension == "md" }
            ?.map { it.nameWithoutExtension }
            ?.sorted()
            ?: emptyList()
        return TicketInfo(
            number = status.number,
            title = status.title,
            status = status.status,
            folderName = dir.name,
            stageNames = stageNames,
        )
    }

    private fun readStatusJson(dir: File): StatusJson? {
        val file = File(dir, "status.json")
        if (!file.exists()) return null
        return try {
            json.decodeFromString(StatusJson.serializer(), file.readText())
        } catch (_: Exception) {
            null
        }
    }

    private fun writeStatusJson(dir: File, status: StatusJson) {
        File(dir, "status.json").writeText(json.encodeToString(StatusJson.serializer(), status))
    }

    private fun resolveUniqueFolderName(baseName: String): File {
        var dir = File(worktreeDir, baseName)
        if (!dir.exists()) return dir
        var i = 2
        while (true) {
            dir = File(worktreeDir, "$baseName-$i")
            if (!dir.exists()) return dir
            i++
        }
    }

    private fun autoCommit(message: String) {
        try {
            WorktreeManager.git(worktreeDir, "add", "-A")
            val status = WorktreeManager.git(worktreeDir, "status", "--porcelain")
            if (status.isBlank()) return
            WorktreeManager.git(worktreeDir, "commit", "-m", message)
        } catch (_: Exception) {
            // Auto-commit failure is non-fatal
        }
    }

    companion object {
        fun toKebabCase(input: String): String =
            input.lowercase()
                .replace(Regex("[^a-z0-9]+"), "-")
                .replace(Regex("-+"), "-")
                .trim('-')
    }
}
