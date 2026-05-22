package aistages.server

import aistages.shared.ProjectInfo
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class ProjectConfig(
    val projects: List<ProjectEntry> = emptyList(),
    val lastUsedSlug: String? = null,
)

@Serializable
data class ProjectEntry(
    val path: String,
    val slug: String,
)

class ProjectRegistry {
    private val configDir = File(System.getProperty("user.home"), ".ai-stages")
    private val configFile = File(configDir, "config.json")
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    fun load(): ProjectConfig {
        if (!configFile.exists()) return ProjectConfig()
        return try {
            json.decodeFromString(configFile.readText())
        } catch (_: Exception) {
            ProjectConfig()
        }
    }

    fun save(config: ProjectConfig) {
        configDir.mkdirs()
        configFile.writeText(json.encodeToString(ProjectConfig.serializer(), config))
    }

    fun listProjects(): List<ProjectInfo> {
        return load().projects.map { entry ->
            val dir = File(entry.path)
            ProjectInfo(
                path = entry.path,
                slug = entry.slug,
                available = dir.exists() && File(dir, ".git").exists(),
            )
        }
    }

    fun addProject(path: String, slug: String?): ProjectInfo {
        val dir = File(path)
        require(dir.exists()) { "Path does not exist: $path" }
        require(File(dir, ".git").exists()) { "Not a git repository: $path" }

        val config = load()
        val canonicalPath = dir.canonicalPath
        require(config.projects.none { File(it.path).canonicalPath == canonicalPath }) {
            "Project already registered: $path"
        }

        val existingSlugs = config.projects.map { it.slug }.toSet()
        val finalSlug = slug ?: generateSlug(path, existingSlugs)
        require(finalSlug !in existingSlugs) { "Slug already exists: $finalSlug" }

        val entry = ProjectEntry(path = canonicalPath, slug = finalSlug)
        save(config.copy(projects = config.projects + entry, lastUsedSlug = finalSlug))
        return ProjectInfo(path = entry.path, slug = entry.slug, available = true)
    }

    fun updateProject(slug: String, newPath: String?, newSlug: String?): ProjectInfo {
        val config = load()
        val index = config.projects.indexOfFirst { it.slug == slug }
        require(index >= 0) { "Project not found: $slug" }

        val entry = config.projects[index]
        val updatedPath = newPath?.let { File(it).canonicalPath } ?: entry.path
        val updatedSlug = newSlug ?: entry.slug

        if (newSlug != null && newSlug != slug) {
            val existingSlugs = config.projects.map { it.slug }.toSet() - slug
            require(updatedSlug !in existingSlugs) { "Slug already exists: $updatedSlug" }
        }

        val updated = entry.copy(path = updatedPath, slug = updatedSlug)
        val newProjects = config.projects.toMutableList().apply { set(index, updated) }
        val newLastUsed = if (config.lastUsedSlug == slug) updatedSlug else config.lastUsedSlug
        save(config.copy(projects = newProjects, lastUsedSlug = newLastUsed))

        val dir = File(updatedPath)
        return ProjectInfo(
            path = updatedPath,
            slug = updatedSlug,
            available = dir.exists() && File(dir, ".git").exists(),
        )
    }

    fun removeProject(slug: String) {
        val config = load()
        val newProjects = config.projects.filter { it.slug != slug }
        val newLastUsed = if (config.lastUsedSlug == slug) newProjects.firstOrNull()?.slug else config.lastUsedSlug
        save(config.copy(projects = newProjects, lastUsedSlug = newLastUsed))
    }

    fun setLastUsed(slug: String) {
        val config = load()
        if (config.projects.any { it.slug == slug } && config.lastUsedSlug != slug) {
            save(config.copy(lastUsedSlug = slug))
        }
    }

    companion object {
        fun generateSlug(path: String, existingSlugs: Set<String>): String {
            val file = File(path)
            var slug = file.name.lowercase()
                .replace(Regex("[^a-z0-9-]"), "-")
                .replace(Regex("-+"), "-")
                .trim('-')
            if (slug.isEmpty()) slug = "project"
            if (slug !in existingSlugs) return slug

            val parent = file.parentFile?.name?.lowercase()
                ?.replace(Regex("[^a-z0-9-]"), "-")
                ?.replace(Regex("-+"), "-")
                ?.trim('-')
            if (!parent.isNullOrEmpty()) {
                slug = "$parent-$slug"
                if (slug !in existingSlugs) return slug
            }

            val base = slug
            var i = 2
            while (slug in existingSlugs) {
                slug = "$base-$i"
                i++
            }
            return slug
        }
    }
}
