package aistages.app.ui

import aistages.app.Api
import aistages.shared.AddProjectRequest
import aistages.shared.ProjectInfo
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.browser.window
import kotlinx.coroutines.launch

@Composable
fun ProjectScreen(
    currentSlug: String,
    projects: List<ProjectInfo>,
    browseCapable: Boolean,
) {
    var showAddDialog by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Header(
            projects = projects,
            currentSlug = currentSlug,
            onProjectSelected = { slug -> window.location.href = "/project/$slug" },
            onAddProject = { showAddDialog = true },
        )

        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            val project = projects.find { it.slug == currentSlug }
            if (project == null) {
                Text("Project not found: $currentSlug")
            } else if (!project.available) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Project unavailable", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Path not found: ${project.path}",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            } else {
                Text(
                    "Kanban board for ${project.slug}",
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        }
    }

    if (showAddDialog) {
        AddProjectDialog(
            browseCapable = browseCapable,
            onDismiss = { showAddDialog = false },
        )
    }
}

@Composable
private fun Header(
    projects: List<ProjectInfo>,
    currentSlug: String,
    onProjectSelected: (String) -> Unit,
    onAddProject: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Surface(tonalElevation = 2.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("AI Stages", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.width(24.dp))
            Box {
                TextButton(onClick = { expanded = true }) {
                    Text(currentSlug)
                    Text(" ▾")
                }
                DropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false },
                ) {
                    projects.forEach { project ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    project.slug,
                                    color = if (project.available)
                                        MaterialTheme.colorScheme.onSurface
                                    else
                                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
                                )
                            },
                            onClick = {
                                expanded = false
                                if (project.available) onProjectSelected(project.slug)
                            },
                            enabled = project.available,
                        )
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("Add project…") },
                        onClick = {
                            expanded = false
                            onAddProject()
                        },
                    )
                }
            }
            Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun AddProjectDialog(
    browseCapable: Boolean,
    onDismiss: () -> Unit,
) {
    var path by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Project") },
        text = {
            Column {
                AddProjectFields(
                    browseCapable = browseCapable,
                    path = path,
                    onPathChange = { path = it; error = null },
                    error = error,
                    fillWidth = true,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            val project = Api.addProject(AddProjectRequest(path.trim()))
                            window.location.href = "/project/${project.slug}"
                        } catch (e: Exception) {
                            error = e.message ?: "Failed to add project"
                        } finally {
                            loading = false
                        }
                    }
                },
                enabled = path.isNotBlank() && !loading,
            ) {
                Text(if (loading) "Adding..." else "Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
