package aistages.server

import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.*

class FileWatcherTest {

    @Test
    fun `watch is idempotent -- second call for same directory does not create a second watcher`() = runTest {
        val dir = createTempDirectory("filewatcher-idempotent-test").toFile()
        val watcher = FileWatcher()
        try {
            watcher.watch(dir)
            delay(50)
            watcher.watch(dir)
            delay(50)
            watcher.stop(dir)
        } finally {
            watcher.stopAll()
            dir.deleteRecursively()
        }
    }

    @Test
    fun `stop cancels a pending debounced commit before it executes`() = runTest {
        val dir = createTempDirectory("filewatcher-stop-cancel-test").toFile()
        val watcher = FileWatcher()
        try {
            git(dir, "init")
            git(dir, "config", "user.email", "test@test.com")
            git(dir, "config", "user.name", "Test")
            File(dir, "init.txt").writeText("initial")
            git(dir, "add", "-A")
            git(dir, "commit", "-m", "initial commit")

            val debounceMs = 500L
            watcher.watch(dir, debounceMs)
            delay(100)

            File(dir, "trigger.txt").writeText("should not be committed")
            delay(200)

            watcher.stop(dir)

            delay(debounceMs + 500)

            val log = git(dir, "log", "--oneline")
            val commitCount = log.trim().lines().size
            assertEquals(1, commitCount, "Expected only the initial commit, but got:\n$log")
        } finally {
            watcher.stopAll()
            dir.deleteRecursively()
        }
    }

    @Test
    fun `stopAll stops all active watchers and prevents new scheduled commits from firing`() = runTest {
        val dirA = createTempDirectory("filewatcher-stopall-a").toFile()
        val dirB = createTempDirectory("filewatcher-stopall-b").toFile()
        val watcher = FileWatcher()
        try {
            for (dir in listOf(dirA, dirB)) {
                git(dir, "init")
                git(dir, "config", "user.email", "test@test.com")
                git(dir, "config", "user.name", "Test")
                File(dir, "init.txt").writeText("initial")
                git(dir, "add", "-A")
                git(dir, "commit", "-m", "initial commit")
            }

            val debounceMs = 500L
            watcher.watch(dirA, debounceMs)
            watcher.watch(dirB, debounceMs)
            delay(100)

            File(dirA, "trigger-a.txt").writeText("should not be committed")
            File(dirB, "trigger-b.txt").writeText("should not be committed")
            delay(200)

            watcher.stopAll()

            delay(debounceMs + 500)

            for ((label, dir) in listOf("A" to dirA, "B" to dirB)) {
                val log = git(dir, "log", "--oneline")
                val commitCount = log.trim().lines().size
                assertEquals(1, commitCount, "Repo $label: expected only the initial commit, but got:\n$log")
            }
        } finally {
            dirA.deleteRecursively()
            dirB.deleteRecursively()
        }
    }

    private fun git(dir: File, vararg args: String): String {
        val process = ProcessBuilder("git", *args)
            .directory(dir)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().readText()
        process.waitFor()
        return output
    }
}
