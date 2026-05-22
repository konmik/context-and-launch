package aistages.server

import aistages.shared.BoardConfig
import kotlinx.serialization.json.Json
import java.io.File

class BoardConfigManager(configDir: File = File(System.getProperty("user.home"), ".ai-stages")) {
    private val boardConfigDir = File(configDir, "board-config")
    private val configFile = File(boardConfigDir, "kanban.json")
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    companion object {
        val DEFAULT_COLUMNS = listOf("todo", "prd", "in-progress", "review", "done")
    }

    fun getConfig(): BoardConfig {
        if (!configFile.exists()) {
            boardConfigDir.mkdirs()
            val default = BoardConfig(DEFAULT_COLUMNS)
            configFile.writeText(json.encodeToString(BoardConfig.serializer(), default))
            return default
        }
        return try {
            json.decodeFromString(BoardConfig.serializer(), configFile.readText())
        } catch (_: Exception) {
            BoardConfig(DEFAULT_COLUMNS)
        }
    }
}
