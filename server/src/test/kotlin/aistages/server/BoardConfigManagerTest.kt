package aistages.server

import kotlin.io.path.createTempDirectory
import kotlin.test.*
import java.io.File

class BoardConfigManagerTest {

    @Test
    fun `first call creates default config file`() {
        val configDir = createTempDirectory("board-config-test").toFile()
        try {
            val manager = BoardConfigManager(configDir)
            val config = manager.getConfig()

            assertEquals(BoardConfigManager.DEFAULT_COLUMNS, config.columns)
            assertTrue(File(configDir, "board-config/kanban.json").exists())
        } finally {
            configDir.deleteRecursively()
        }
    }

    @Test
    fun `reads back saved config`() {
        val configDir = createTempDirectory("board-config-test").toFile()
        try {
            val manager = BoardConfigManager(configDir)
            manager.getConfig() // creates default

            val manager2 = BoardConfigManager(configDir)
            val config = manager2.getConfig()
            assertEquals(BoardConfigManager.DEFAULT_COLUMNS, config.columns)
        } finally {
            configDir.deleteRecursively()
        }
    }

    @Test
    fun `malformed JSON falls back to defaults`() {
        val configDir = createTempDirectory("board-config-test").toFile()
        try {
            val boardConfigDir = File(configDir, "board-config")
            boardConfigDir.mkdirs()
            File(boardConfigDir, "kanban.json").writeText("not valid json")

            val manager = BoardConfigManager(configDir)
            val config = manager.getConfig()
            assertEquals(BoardConfigManager.DEFAULT_COLUMNS, config.columns)
        } finally {
            configDir.deleteRecursively()
        }
    }
}
