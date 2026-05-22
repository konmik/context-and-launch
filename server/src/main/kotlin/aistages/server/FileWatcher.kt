package aistages.server

import kotlinx.coroutines.*
import java.io.File
import java.nio.file.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class FileWatcher(private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())) {
    private val watchers = ConcurrentHashMap<String, WatcherState>()

    private class WatcherState(
        val watchService: WatchService,
        val job: Job,
        var pendingCommit: Job? = null,
    )

    fun watch(worktreeDir: File, debounceMs: Long = 2000) {
        val key = worktreeDir.absolutePath
        if (watchers.containsKey(key)) return

        val watchService = try {
            FileSystems.getDefault().newWatchService()
        } catch (_: Exception) {
            return
        }

        val path = worktreeDir.toPath()
        val eventKinds = arrayOf(
            StandardWatchEventKinds.ENTRY_CREATE,
            StandardWatchEventKinds.ENTRY_DELETE,
            StandardWatchEventKinds.ENTRY_MODIFY,
        )
        try {
            path.register(watchService, *eventKinds)
            Files.walk(path, 1)
                .filter { Files.isDirectory(it) && it != path && !it.fileName.toString().startsWith(".") }
                .forEach { sub ->
                    try { sub.register(watchService, *eventKinds) } catch (_: Exception) {}
                }
        } catch (_: Exception) {
            watchService.close()
            return
        }

        val job = scope.launch {
            try {
                while (isActive) {
                    val watchKey = withContext(Dispatchers.IO) {
                        watchService.poll(1, TimeUnit.SECONDS)
                    } ?: continue
                    val events = watchKey.pollEvents()
                    watchKey.reset()

                    for (event in events) {
                        if (event.kind() == StandardWatchEventKinds.ENTRY_CREATE) {
                            val ctx = event.context()
                            if (ctx is Path) {
                                val newPath = (watchKey.watchable() as? Path)?.resolve(ctx)
                                if (newPath != null && Files.isDirectory(newPath) && !ctx.toString().startsWith(".")) {
                                    try { newPath.register(watchService, *eventKinds) } catch (_: Exception) {}
                                }
                            }
                        }
                    }

                    val currentState = watchers[key] ?: break
                    currentState.pendingCommit?.cancel()
                    currentState.pendingCommit = scope.launch {
                        delay(debounceMs)
                        withContext(Dispatchers.IO) {
                            try {
                                WorktreeManager.git(worktreeDir, "add", "-A")
                                val status = WorktreeManager.git(worktreeDir, "status", "--porcelain")
                                if (status.isNotBlank()) {
                                    WorktreeManager.git(worktreeDir, "commit", "-m", "auto: external changes")
                                }
                            } catch (_: Exception) {
                            }
                        }
                    }
                }
            } catch (_: ClosedWatchServiceException) {
            }
        }

        watchers[key] = WatcherState(watchService, job)
    }

    fun stop(worktreeDir: File) {
        val key = worktreeDir.absolutePath
        tearDown(watchers.remove(key) ?: return)
    }

    fun stopAll() {
        watchers.keys.toList().forEach { key ->
            tearDown(watchers.remove(key) ?: return@forEach)
        }
        scope.cancel()
    }

    private fun tearDown(state: WatcherState) {
        state.pendingCommit?.cancel()
        state.watchService.close()
        state.job.cancel()
    }
}
