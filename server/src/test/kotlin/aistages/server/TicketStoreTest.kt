package aistages.server

import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileChannel
import kotlin.io.path.createTempDirectory
import kotlin.test.*

class TicketStoreTest {

    @Test
    fun `toKebabCase produces correct folder names`() {
        assertEquals("abc-1-fix-login", TicketStore.toKebabCase("ABC-1 Fix Login"))
        assertEquals("def-2-hello-world", TicketStore.toKebabCase("DEF-2  Hello  World"))
        assertEquals("x-1-test", TicketStore.toKebabCase("  X-1 Test  "))
        assertEquals("a-b-c", TicketStore.toKebabCase("a/b/c"))
    }

    @Test
    fun `createTicket creates folder and status json`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            val ticket = store.createTicket("ABC-1", "Fix Login")

            assertEquals("ABC-1", ticket.number)
            assertEquals("Fix Login", ticket.title)
            assertEquals("todo", ticket.status)
            assertEquals("abc-1-fix-login", ticket.folderName)

            val statusFile = File(worktreeDir, "abc-1-fix-login/status.json")
            assertTrue(statusFile.exists())
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `listTickets returns sorted results`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("C-3", "Third")
            store.createTicket("A-1", "First")
            store.createTicket("B-2", "Second")

            val tickets = store.listTickets()
            assertEquals(3, tickets.size)
            assertEquals("A-1", tickets[0].number)
            assertEquals("B-2", tickets[1].number)
            assertEquals("C-3", tickets[2].number)
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `listTickets skips malformed entries`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("OK-1", "Good Ticket")

            // Create a malformed ticket folder
            val badDir = File(worktreeDir, "bad-ticket")
            badDir.mkdirs()
            File(badDir, "status.json").writeText("not valid json")

            val tickets = store.listTickets()
            assertEquals(1, tickets.size)
            assertEquals("OK-1", tickets[0].number)
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket renames folder when title changes`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("ABC-1", "Old Title")

            val updated = store.updateTicket("abc-1-old-title", title = "New Title", number = null, status = null)
            assertEquals("New Title", updated.title)
            assertEquals("abc-1-new-title", updated.folderName)
            assertFalse(File(worktreeDir, "abc-1-old-title").exists())
            assertTrue(File(worktreeDir, "abc-1-new-title").exists())
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `deleteTicket removes folder`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("DEL-1", "To Delete")
            assertTrue(File(worktreeDir, "del-1-to-delete").exists())

            store.deleteTicket("del-1-to-delete")
            assertFalse(File(worktreeDir, "del-1-to-delete").exists())
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `stage markdown read write roundtrip`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("MD-1", "With Markdown")

            assertNull(store.getStageMarkdown("md-1-with-markdown", "todo"))

            store.saveStageMarkdown("md-1-with-markdown", "todo", "# My Notes\nSome content")
            val content = store.getStageMarkdown("md-1-with-markdown", "todo")
            assertEquals("# My Notes\nSome content", content)

            val ticket = store.listTickets().first()
            assertContains(ticket.stageNames, "todo")
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `createTicket rejects blank number or title`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            assertFailsWith<IllegalArgumentException> { store.createTicket("", "Title") }
            assertFailsWith<IllegalArgumentException> { store.createTicket("NUM", "") }
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `createTicket appends suffix on folder name collision`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            val first = store.createTicket("X-1", "Same Name")
            val second = store.createTicket("X-1", "Same Name")

            assertEquals("x-1-same-name", first.folderName)
            assertEquals("x-1-same-name-2", second.folderName)
            assertTrue(File(worktreeDir, "x-1-same-name").exists())
            assertTrue(File(worktreeDir, "x-1-same-name-2").exists())
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket renames folder when number changes`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("OLD-1", "My Title")

            val updated = store.updateTicket("old-1-my-title", number = "NEW-1", title = null, status = null)
            assertEquals("NEW-1", updated.number)
            assertEquals("new-1-my-title", updated.folderName)
            assertFalse(File(worktreeDir, "old-1-my-title").exists())
            assertTrue(File(worktreeDir, "new-1-my-title").exists())
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket on nonexistent folder throws`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            assertFailsWith<IllegalArgumentException> {
                store.updateTicket("no-such-folder", number = null, title = null, status = "done")
            }
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `deleteTicket on nonexistent folder throws`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            assertFailsWith<IllegalArgumentException> {
                store.deleteTicket("no-such-folder")
            }
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket rejects rename collision`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("A-1", "First")
            store.createTicket("A-1", "Second")

            assertFailsWith<IllegalArgumentException> {
                store.updateTicket("a-1-second", title = "First", number = "A-1", status = null)
            }
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `saveStageMarkdown rejects path traversal in stage name`() {
        val parentDir = createTempDirectory("save-traversal-test").toFile()
        try {
            val worktreeDir = File(parentDir, "worktree")
            worktreeDir.mkdirs()
            WorktreeManager.git(worktreeDir, "init")
            WorktreeManager.git(worktreeDir, "commit", "--allow-empty", "-m", "init")

            val store = TicketStore(worktreeDir)
            store.createTicket("T-1", "Test")

            assertFailsWith<IllegalArgumentException> {
                store.saveStageMarkdown("t-1-test", "../sibling/evil", "pwned")
            }

            // Verify no file was created outside the ticket folder
            val escaped = File(parentDir, "sibling")
            assertFalse(escaped.exists(), "File escaped worktree via path traversal")
        } finally {
            parentDir.deleteRecursively()
        }
    }

    @Test
    fun `getStageMarkdown rejects path traversal in folderName`() {
        val parentDir = createTempDirectory("folder-traversal-test").toFile()
        try {
            // Create a file outside the worktree that an attacker might try to read
            val secretFile = File(parentDir, "todo.md")
            secretFile.writeText("TOP SECRET DATA")

            // Create worktree as a subdirectory
            val worktreeDir = File(parentDir, "worktree")
            worktreeDir.mkdirs()
            WorktreeManager.git(worktreeDir, "init")
            WorktreeManager.git(worktreeDir, "commit", "--allow-empty", "-m", "init")

            val store = TicketStore(worktreeDir)

            // folderName=".." escapes worktreeDir: worktree/../todo.md = parentDir/todo.md
            assertFailsWith<IllegalArgumentException> {
                store.getStageMarkdown("..", "todo")
            }
        } finally {
            parentDir.deleteRecursively()
        }
    }

    @Test
    fun `getStageMarkdown rejects path traversal in stage name`() {
        val parentDir = createTempDirectory("traversal-test").toFile()
        try {
            // Create a secret file outside the worktree
            val secretFile = File(parentDir, "secret.md")
            secretFile.writeText("TOP SECRET DATA")

            // Create worktree as a subdirectory
            val worktreeDir = File(parentDir, "worktree")
            worktreeDir.mkdirs()
            WorktreeManager.git(worktreeDir, "init")
            WorktreeManager.git(worktreeDir, "commit", "--allow-empty", "-m", "init")

            val store = TicketStore(worktreeDir)
            store.createTicket("T-1", "Test")

            // Attempt path traversal: "../../secret" resolves to parentDir/secret.md
            // worktreeDir/t-1-test/../../secret.md = parentDir/secret.md
            assertFailsWith<IllegalArgumentException> {
                store.getStageMarkdown("t-1-test", "../../secret")
            }
        } finally {
            parentDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket rejects path traversal in folderName`() {
        val parentDir = createTempDirectory("update-traversal-test").toFile()
        try {
            val worktreeDir = File(parentDir, "worktree")
            worktreeDir.mkdirs()
            WorktreeManager.git(worktreeDir, "init")
            WorktreeManager.git(worktreeDir, "commit", "--allow-empty", "-m", "init")

            // Create a directory outside worktree that the attacker targets
            val outsideDir = File(parentDir, "target")
            outsideDir.mkdirs()

            val store = TicketStore(worktreeDir)

            // folderName="../../target" should be rejected before writing status.json
            assertFailsWith<IllegalArgumentException> {
                store.updateTicket("../../target", number = null, title = null, status = "done")
            }

            // Verify no status.json was created outside the worktree
            assertFalse(File(outsideDir, "status.json").exists(),
                "status.json written outside worktree via path traversal")
        } finally {
            parentDir.deleteRecursively()
        }
    }

    @Test
    fun `saveStageMarkdown rejects stage name containing path separators`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("S-1", "Slashes")

            // Stage "sub/dir" would create nested sub/dir.md inside the ticket folder.
            // Stage names should be simple column names like "todo", not nested paths.
            assertFailsWith<IllegalArgumentException> {
                store.saveStageMarkdown("s-1-slashes", "sub/dir", "content")
            }

            // Verify no nested directory was created
            val subDir = File(worktreeDir, "s-1-slashes/sub")
            assertFalse(subDir.exists(), "Nested directory created by stage name with path separator")
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `deleteTicket rejects path traversal in folderName`() {
        val parentDir = createTempDirectory("delete-traversal-test").toFile()
        try {
            val worktreeDir = File(parentDir, "worktree")
            worktreeDir.mkdirs()
            WorktreeManager.git(worktreeDir, "init")
            WorktreeManager.git(worktreeDir, "commit", "--allow-empty", "-m", "init")

            // Create a directory outside the worktree that the attacker targets
            val outsideDir = File(parentDir, "target")
            outsideDir.mkdirs()
            File(outsideDir, "precious.txt").writeText("important data")

            val store = TicketStore(worktreeDir)

            // folderName="../../target" would resolve outside worktreeDir
            assertFailsWith<IllegalArgumentException> {
                store.deleteTicket("../../target")
            }

            // Verify the outside directory was NOT deleted
            assertTrue(outsideDir.exists(), "Directory outside worktree was deleted via path traversal")
            assertTrue(File(outsideDir, "precious.txt").exists(), "File outside worktree was deleted")
        } finally {
            parentDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket when renameTo fails throws a clear error not IOException or NPE`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("REN-1", "Original")

            // Create and lock a second file inside the ticket directory so renameTo
            // fails on Windows (locked file prevents directory rename), while
            // status.json remains readable for the initial readStatusJson call.
            val lockFile = File(worktreeDir, "ren-1-original/lock.txt")
            lockFile.writeText("locked")
            val raf = RandomAccessFile(lockFile, "rw")
            val lock = raf.channel.lock()
            try {
                val ex = assertFailsWith<IllegalStateException> {
                    store.updateTicket("ren-1-original", title = "Changed", number = null, status = null)
                }
                assertContains(ex.message ?: "", "rename", ignoreCase = true,
                    message = "Error message should mention rename failure")
            } finally {
                lock.release()
                raf.close()
            }

            // Old directory should still exist intact
            assertTrue(File(worktreeDir, "ren-1-original").exists(),
                "Old directory should remain after failed rename")
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket rename failure leaves old directory and status json unchanged`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("REN-2", "Original Title")

            // Read the original status.json content before the failed rename
            val oldDir = File(worktreeDir, "ren-2-original-title")
            val statusFile = File(oldDir, "status.json")
            val originalStatusContent = statusFile.readText()

            // Lock a file inside the directory so renameTo fails on Windows
            val lockFile = File(oldDir, "lock.txt")
            lockFile.writeText("locked")
            val raf = RandomAccessFile(lockFile, "rw")
            val lock = raf.channel.lock()
            try {
                assertFailsWith<IllegalStateException> {
                    store.updateTicket("ren-2-original-title", title = "Changed Title", number = null, status = null)
                }

                // Old directory still exists with original status.json unchanged
                assertTrue(oldDir.exists(), "Old directory should remain after failed rename")
                assertTrue(statusFile.exists(), "status.json should remain in old directory")
                assertEquals(originalStatusContent, statusFile.readText(),
                    "status.json content should be unchanged after failed rename")

                // New directory should NOT have been created
                val newDir = File(worktreeDir, "ren-2-changed-title")
                assertFalse(newDir.exists(), "New directory should not exist after failed rename")
            } finally {
                lock.release()
                raf.close()
            }
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `updateTicket case-only title change on case-insensitive filesystem`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)
            store.createTicket("ABC-1", "My Title")

            // Case-only change: "My Title" -> "my title"
            // toKebabCase normalizes both to "abc-1-my-title", so no folder rename needed.
            // On a case-insensitive FS, this should NOT hit the collision guard.
            val updated = store.updateTicket("abc-1-my-title", title = "my title", number = null, status = null)

            assertEquals("my title", updated.title)
            assertEquals("abc-1-my-title", updated.folderName)
            assertTrue(File(worktreeDir, "abc-1-my-title").exists())
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `autoCommit stages unrelated files because git add -A is worktree-wide`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)

            // Create ticket A -- its autoCommit commits only its own status.json
            store.createTicket("A-1", "Alpha")

            // Simulate another operation writing a file before autoCommit runs.
            // In a concurrent scenario, operation B would create its ticket folder
            // while operation A's autoCommit has not yet fired.
            // Here we create the file manually between two public TicketStore calls.
            val rogueDir = File(worktreeDir, "rogue-ticket")
            rogueDir.mkdirs()
            File(rogueDir, "status.json").writeText("""{"number":"R-1","title":"Rogue","status":"todo"}""")

            // Now call saveStageMarkdown on ticket A, which triggers autoCommit.
            // autoCommit runs `git add -A` which stages EVERYTHING, including rogue-ticket.
            store.saveStageMarkdown("a-1-alpha", "todo", "some notes")

            // Check git log: the commit for "update todo for A-1" should contain
            // the rogue-ticket files, demonstrating cross-contamination.
            val log = WorktreeManager.git(worktreeDir, "log", "--oneline")
            val commits = log.trim().lines()
            // Find the commit for "update todo for A-1"
            val todoCommitLine = commits.first { "update todo" in it }
            val todoCommitHash = todoCommitLine.split(" ").first()

            // Show which files were changed in that commit
            val diffOutput = WorktreeManager.git(
                worktreeDir, "diff-tree", "--no-commit-id", "--name-only", "-r", todoCommitHash
            )
            val changedFiles = diffOutput.trim().lines().map { it.trim() }.filter { it.isNotEmpty() }

            // Cross-contamination: the "update todo" commit also includes rogue-ticket/status.json
            assertTrue(
                changedFiles.any { "rogue-ticket" in it },
                "autoCommit for ticket A-1 should have staged rogue-ticket files due to git add -A. " +
                    "Changed files: $changedFiles"
            )

            // Also verify the intended file is there
            assertTrue(
                changedFiles.any { "a-1-alpha" in it && "todo.md" in it },
                "autoCommit should include the intended stage file. Changed files: $changedFiles"
            )
        } finally {
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `autoCommit silently swallows index lock failure losing the commit`() {
        val worktreeDir = createGitWorktree()
        try {
            val store = TicketStore(worktreeDir)

            // Step 1: Create a ticket -- this commits cleanly
            store.createTicket("LOCK-1", "Lock Test")
            val folderName = "lock-1-lock-test"
            assertTrue(File(worktreeDir, folderName).exists())

            // Verify clean git status after createTicket
            val statusBefore = WorktreeManager.git(worktreeDir, "status", "--porcelain")
            assertTrue(statusBefore.isBlank(), "Working tree should be clean after createTicket")

            // Step 2: Create index.lock to simulate a concurrent git operation
            val gitDir = File(worktreeDir, ".git")
            val indexLock = File(gitDir, "index.lock")
            indexLock.writeText("simulated lock")
            assertTrue(indexLock.exists(), "index.lock should exist")

            // Step 3: saveStageMarkdown triggers autoCommit, which should fail due to index.lock
            // Crucially, autoCommit does NOT throw -- it silently swallows the error
            store.saveStageMarkdown(folderName, "todo", "# Notes\nThis change will be lost")

            // Step 4: The file was written to disk...
            val stageFile = File(worktreeDir, "$folderName/todo.md")
            assertTrue(stageFile.exists(), "Stage file should exist on disk")
            assertEquals("# Notes\nThis change will be lost", stageFile.readText())

            // Step 5: ...but the commit was silently lost. Git status shows uncommitted changes.
            // Remove the lock first so we can run git status
            indexLock.delete()
            val statusAfter = WorktreeManager.git(worktreeDir, "status", "--porcelain")
            assertTrue(statusAfter.isNotBlank(),
                "Git status should show uncommitted changes because autoCommit " +
                    "silently swallowed the index.lock failure. Status: $statusAfter")

            // The git log should NOT contain a commit for "update todo for LOCK-1"
            val log = WorktreeManager.git(worktreeDir, "log", "--oneline")
            assertFalse(log.contains("update todo"),
                "There should be no 'update todo' commit because autoCommit failed silently. Log: $log")
        } finally {
            // Clean up index.lock if test fails early
            File(worktreeDir, ".git/index.lock").delete()
            worktreeDir.deleteRecursively()
        }
    }

    @Test
    fun `FileWatcher and TicketStore autoCommit overlap -- both commits succeed or one is cleanly skipped`() = runTest {
        val worktreeDir = createGitWorktree()
        val watcher = FileWatcher()
        try {
            val debounceMs = 500L
            watcher.watch(worktreeDir, debounceMs)
            delay(100)

            File(worktreeDir, "external-note.txt").writeText("written by editor")
            delay(200)

            val store = TicketStore(worktreeDir)
            store.createTicket("RACE-1", "Overlap Test")

            delay(debounceMs + 2000)

            // Step 4: Verify the worktree ends up clean (no uncommitted changes).
            val status = WorktreeManager.git(worktreeDir, "status", "--porcelain")
            assertTrue(
                status.isBlank(),
                "Worktree should be clean after both commits. Uncommitted changes: $status"
            )

            // Step 5: Check git log for the commits.
            val log = WorktreeManager.git(worktreeDir, "log", "--oneline")
            val commits = log.trim().lines()

            // We expect at least the init commit + the TicketStore "create ticket" commit.
            // The FileWatcher "auto: external changes" commit may or may not appear:
            // - If TicketStore's autoCommit ran first, it staged everything (git add -A)
            //   including external-note.txt, so FileWatcher finds nothing to commit.
            // - If FileWatcher fires first, it commits external-note.txt, then TicketStore
            //   commits the ticket files.
            // - If they truly overlap, one gets index.lock error and silently fails, but
            //   the other should have committed all changes (git add -A is worktree-wide).
            assertTrue(
                commits.size >= 2,
                "Expected at least 2 commits (init + create ticket). Log:\n$log"
            )

            // The "create ticket" commit must exist (TicketStore's autoCommit is synchronous
            // on the calling thread and runs before we wait for debounce).
            assertTrue(
                commits.any { "create ticket" in it },
                "TicketStore's 'create ticket' commit should be present. Log:\n$log"
            )

            // Verify external-note.txt is tracked in git (committed by one of the two)
            val lsFiles = WorktreeManager.git(worktreeDir, "ls-files", "external-note.txt")
            assertTrue(
                lsFiles.trim().isNotEmpty(),
                "external-note.txt should be tracked in git (committed by TicketStore or FileWatcher)"
            )
        } finally {
            watcher.stopAll()
            worktreeDir.deleteRecursively()
        }
    }

    private fun createGitWorktree(): File {
        val dir = createTempDirectory("ticket-store-test").toFile()
        WorktreeManager.git(dir, "init")
        WorktreeManager.git(dir, "commit", "--allow-empty", "-m", "init")
        return dir
    }
}
