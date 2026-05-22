package aistages.server

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertContains

class ProjectRegistryTest {

    @Test
    fun `addProject with explicit slug that collides is rejected`() {
        val configDir = createTempDirectory("registry-config").toFile()
        val projectDir1 = createTempDirectory("registry-project1").toFile()
        val projectDir2 = createTempDirectory("registry-project2").toFile()
        try {
            File(projectDir1, ".git").mkdir()
            File(projectDir2, ".git").mkdir()

            val registry = ProjectRegistry(configDir)
            registry.addProject(projectDir1.absolutePath, "my-slug")

            val ex = assertFailsWith<IllegalArgumentException> {
                registry.addProject(projectDir2.absolutePath, "my-slug")
            }
            assertContains(ex.message!!, "Slug already exists")
        } finally {
            configDir.deleteRecursively()
            projectDir1.deleteRecursively()
            projectDir2.deleteRecursively()
        }
    }

    @Test
    fun `addProject rejects duplicate canonical path even when raw paths differ`() {
        val configDir = createTempDirectory("registry-config").toFile()
        val projectDir = createTempDirectory("registry-project").toFile()
        try {
            // Set up a fake git repo
            File(projectDir, ".git").mkdir()

            val registry = ProjectRegistry(configDir)

            // Add the project using canonical path
            registry.addProject(projectDir.absolutePath, "first")

            // Build an alternate path that resolves to the same canonical location.
            // Use "subdir\.." to create a different raw string but same canonical path.
            val altPath = File(projectDir, "subdir").also { it.mkdir() }
                .let { File(it.parentFile, "subdir/..").path }

            val ex = assertFailsWith<IllegalArgumentException> {
                registry.addProject(altPath, "second")
            }
            assertContains(ex.message!!, "already registered")
        } finally {
            configDir.deleteRecursively()
            projectDir.deleteRecursively()
        }
    }

    @Test
    fun `generateSlug deduplicates when dir name and parent-dir-name combos collide`() {
        // name "my-project" taken, parent-name "b-my-project" taken → numeric suffix
        assertEquals(
            "b-my-project-2",
            ProjectRegistry.generateSlug("/a/b/my-project", setOf("my-project", "b-my-project"))
        )

        // name taken, parent-name taken, first numeric suffix also taken → next suffix
        assertEquals(
            "b-my-project-3",
            ProjectRegistry.generateSlug(
                "/a/b/my-project",
                setOf("my-project", "b-my-project", "b-my-project-2")
            )
        )
    }
}
