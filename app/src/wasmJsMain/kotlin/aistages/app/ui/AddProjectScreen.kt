package aistages.app.ui

import aistages.app.Api
import aistages.shared.AddProjectRequest
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.browser.window
import kotlinx.coroutines.launch

@Composable
fun AddProjectScreen(canBrowseFolders: Boolean) {
    Column(
        modifier = Modifier.fillMaxSize().padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Welcome to AI Stages", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(12.dp))
        Text(
            "AI orchestration framework with a local-first kanban board.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Add a git repository to get started.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(40.dp))
        AddProjectForm(canBrowseFolders)
    }
}

@Composable
fun AddProjectForm(canBrowseFolders: Boolean) {
    var path by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        AddProjectFields(
            canBrowseFolders = canBrowseFolders,
            path = path,
            onPathChange = { path = it; error = null },
            error = error,
        )
        Spacer(Modifier.height(16.dp))
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
            Text(if (loading) "Adding..." else "Add Project")
        }
    }
}

@Composable
fun AddProjectFields(
    canBrowseFolders: Boolean,
    path: String,
    onPathChange: (String) -> Unit,
    error: String?,
    fillWidth: Boolean = false,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = path,
            onValueChange = onPathChange,
            label = { Text("Repository path") },
            isError = error != null,
            singleLine = true,
            modifier = if (fillWidth) Modifier.weight(1f) else Modifier.width(500.dp),
        )
        if (canBrowseFolders) {
            Spacer(Modifier.width(8.dp))
            val scope = rememberCoroutineScope()
            OutlinedButton(onClick = {
                scope.launch {
                    val result = Api.browseFolder(path.ifBlank { null })
                    if (result != null) onPathChange(result)
                }
            }) {
                Text("Browse")
            }
        }
    }
    if (error != null) {
        Spacer(Modifier.height(8.dp))
        Text(error, color = MaterialTheme.colorScheme.error)
    }
}
