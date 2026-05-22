package aistages.server

import java.io.File
import java.util.concurrent.TimeUnit

class WorktreeManager(private val configDir: File = File(System.getProperty("user.home"), ".ai-stages")) {
    private val worktreesDir = File(configDir, "worktrees")
    private val locks = mutableMapOf<String, Any>()

    private fun lockFor(key: String): Any = synchronized(locks) {
        locks.getOrPut(key) { Any() }
    }

    fun ensureWorktree(projectPath: String, slug: String): File {
        val projectDir = File(projectPath)
        require(projectDir.exists()) { "Project path does not exist: $projectPath" }

        synchronized(lockFor(projectDir.canonicalPath)) {
            val worktreeDir = File(worktreesDir, slug)

            if (worktreeDir.exists() && isValidWorktree(worktreeDir)) {
                return worktreeDir
            }

            if (worktreeDir.exists()) {
                worktreeDir.deleteRecursively()
                git(projectDir, "worktree", "prune")
            }

            worktreesDir.mkdirs()
            val worktreeBranch = "ai-stages--$slug"
            val branchExists = git(projectDir, "branch", "--list", worktreeBranch).trim().isNotEmpty()
            val orphanExists = git(projectDir, "branch", "--list", "ai-stages").trim().isNotEmpty()

            if (branchExists) {
                git(projectDir, "worktree", "add", worktreeDir.absolutePath, worktreeBranch)
            } else if (orphanExists) {
                git(projectDir, "worktree", "add", "-b", worktreeBranch, worktreeDir.absolutePath, "ai-stages")
            } else {
                git(projectDir, "worktree", "add", "--orphan", "-b", "ai-stages", worktreeDir.absolutePath)
                git(worktreeDir, "commit", "--allow-empty", "-m", "init ai-stages")
                if (worktreeBranch != "ai-stages") {
                    git(projectDir, "worktree", "remove", worktreeDir.absolutePath)
                    git(projectDir, "worktree", "add", "-b", worktreeBranch, worktreeDir.absolutePath, "ai-stages")
                }
            }

            return worktreeDir
        }
    }

    fun getWorktreeDir(slug: String): File = File(worktreesDir, slug)

    private fun isValidWorktree(dir: File): Boolean {
        val dotGit = File(dir, ".git")
        if (!dotGit.exists()) return false
        if (dotGit.isFile) {
            val content = dotGit.readText().trim()
            val gitDir = content.removePrefix("gitdir: ")
            return File(gitDir).exists()
        }
        return false
    }

    companion object {
        fun git(workDir: File, vararg args: String): String {
            val process = ProcessBuilder("git", *args)
                .directory(workDir)
                .redirectErrorStream(true)
                .start()
            try {
                val output = process.inputStream.bufferedReader().readText()
                val completed = process.waitFor(30, TimeUnit.SECONDS)
                if (!completed) {
                    throw RuntimeException("git ${args.toList()} timed out after 30 seconds")
                }
                val exitCode = process.exitValue()
                if (exitCode != 0) {
                    throw RuntimeException("git ${args.toList()} failed (exit $exitCode): $output")
                }
                return output
            } finally {
                process.destroyForcibly()
            }
        }
    }
}
