package aistages.server

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.*

class WorktreeManagerTest {

    @Test
    fun `creates orphan branch and worktree in a fresh repo`() {
        val configDir = createTempDirectory("wt-config").toFile()
        val projectDir = createTempDirectory("wt-project").toFile()
        try {
            WorktreeManager.git(projectDir, "init")
            WorktreeManager.git(projectDir, "commit", "--allow-empty", "-m", "init")

            val manager = WorktreeManager(configDir)
            val worktreeDir = manager.ensureWorktree(projectDir.absolutePath, "test-slug")

            assertTrue(worktreeDir.exists())
            assertTrue(File(worktreeDir, ".git").exists())

            val branches = WorktreeManager.git(projectDir, "branch", "--list", "ai-stages")
            assertTrue(branches.contains("ai-stages"))

            val files = worktreeDir.listFiles()?.filter { !it.name.startsWith(".") } ?: emptyList()
            assertTrue(files.isEmpty())
        } finally {
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/test-slug").absolutePath) } catch (_: Exception) {}
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `second call is idempotent`() {
        val configDir = createTempDirectory("wt-config").toFile()
        val projectDir = createTempDirectory("wt-project").toFile()
        try {
            WorktreeManager.git(projectDir, "init")
            WorktreeManager.git(projectDir, "commit", "--allow-empty", "-m", "init")

            val manager = WorktreeManager(configDir)
            val first = manager.ensureWorktree(projectDir.absolutePath, "test-slug")
            val second = manager.ensureWorktree(projectDir.absolutePath, "test-slug")

            assertEquals(first.absolutePath, second.absolutePath)
        } finally {
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/test-slug").absolutePath) } catch (_: Exception) {}
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `does not modify project working directory during worktree creation`() {
        val configDir = createTempDirectory("wt-config").toFile()
        val projectDir = createTempDirectory("wt-project").toFile()
        try {
            WorktreeManager.git(projectDir, "init")
            File(projectDir, "important.txt").writeText("do not touch")
            WorktreeManager.git(projectDir, "add", ".")
            WorktreeManager.git(projectDir, "commit", "-m", "init")

            val branchBefore = WorktreeManager.git(projectDir, "rev-parse", "--abbrev-ref", "HEAD").trim()

            val manager = WorktreeManager(configDir)
            manager.ensureWorktree(projectDir.absolutePath, "safe-slug")

            val branchAfter = WorktreeManager.git(projectDir, "rev-parse", "--abbrev-ref", "HEAD").trim()
            assertEquals(branchBefore, branchAfter, "project branch should not change")

            assertEquals("do not touch", File(projectDir, "important.txt").readText())
        } finally {
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/safe-slug").absolutePath) } catch (_: Exception) {}
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `detached HEAD is not disrupted by worktree creation`() {
        val configDir = createTempDirectory("wt-config").toFile()
        val projectDir = createTempDirectory("wt-project").toFile()
        try {
            WorktreeManager.git(projectDir, "init")
            WorktreeManager.git(projectDir, "commit", "--allow-empty", "-m", "first")
            val commitHash = WorktreeManager.git(projectDir, "rev-parse", "HEAD").trim()
            WorktreeManager.git(projectDir, "checkout", "--detach")

            val manager = WorktreeManager(configDir)
            manager.ensureWorktree(projectDir.absolutePath, "detach-slug")

            val currentBranch = WorktreeManager.git(projectDir, "rev-parse", "--abbrev-ref", "HEAD").trim()
            assertEquals("HEAD", currentBranch, "should still be detached")

            val currentCommit = WorktreeManager.git(projectDir, "rev-parse", "HEAD").trim()
            assertEquals(commitHash, currentCommit)
        } finally {
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/detach-slug").absolutePath) } catch (_: Exception) {}
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `two slugs for same project create separate worktrees`() = runTest {
        val configDir = createTempDirectory("wt-config").toFile()
        val projectDir = createTempDirectory("wt-project").toFile()
        val slugA = "race-slug-a"
        val slugB = "race-slug-b"
        try {
            WorktreeManager.git(projectDir, "init")
            WorktreeManager.git(projectDir, "commit", "--allow-empty", "-m", "init")

            val manager = WorktreeManager(configDir)

            val results = listOf(
                async(Dispatchers.IO) { manager.ensureWorktree(projectDir.absolutePath, slugA) },
                async(Dispatchers.IO) { manager.ensureWorktree(projectDir.absolutePath, slugB) },
            ).awaitAll()

            assertTrue(results[0].exists())
            assertTrue(results[1].exists())
            assertTrue(File(results[0], ".git").exists())
            assertTrue(File(results[1], ".git").exists())

            val branches = WorktreeManager.git(projectDir, "branch", "--list", "ai-stages")
            assertTrue(branches.contains("ai-stages"))
        } finally {
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/$slugA").absolutePath) } catch (_: Exception) {}
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/$slugB").absolutePath) } catch (_: Exception) {}
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `ensureWorktree recovers stale worktree with removed gitdir target`() {
        val configDir = createTempDirectory("wt-config").toFile()
        val projectDir = createTempDirectory("wt-project").toFile()
        val slug = "stale-gitdir-slug"
        try {
            WorktreeManager.git(projectDir, "init")
            WorktreeManager.git(projectDir, "commit", "--allow-empty", "-m", "init")

            val manager = WorktreeManager(configDir)
            val worktreeDir = manager.ensureWorktree(projectDir.absolutePath, slug)
            assertTrue(worktreeDir.exists())

            val dotGit = File(worktreeDir, ".git")
            val gitDirPath = dotGit.readText().trim().removePrefix("gitdir: ")
            val gitDir = File(gitDirPath)

            gitDir.deleteRecursively()
            assertFalse(gitDir.exists())

            val recreated = manager.ensureWorktree(projectDir.absolutePath, slug)

            assertTrue(recreated.exists())
            val newDotGit = File(recreated, ".git")
            assertTrue(newDotGit.isFile)
            val newGitDirPath = newDotGit.readText().trim().removePrefix("gitdir: ")
            assertTrue(File(newGitDirPath).exists())
        } finally {
            try { WorktreeManager.git(projectDir, "worktree", "remove", "--force", File(configDir, "worktrees/$slug").absolutePath) } catch (_: Exception) {}
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `git with non-zero exit code includes stderr in exception message`() {
        val projectDir = createTempDirectory("wt-stderr").toFile()
        try {
            WorktreeManager.git(projectDir, "init")

            val ex = assertFailsWith<RuntimeException> {
                WorktreeManager.git(projectDir, "log")
            }

            assertTrue(ex.message!!.contains("does not have any commits"))
            assertTrue(ex.message!!.contains("failed (exit"))
        } finally {
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `handles missing project path`() {
        val configDir = createTempDirectory("wt-config").toFile()
        try {
            val manager = WorktreeManager(configDir)
            assertFailsWith<IllegalArgumentException> {
                manager.ensureWorktree("/nonexistent/path/that/does/not/exist", "bad-slug")
            }
        } finally {
            configDir.deleteRecursively()
        }
    }
}
