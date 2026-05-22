package aistages.app

import aistages.app.ui.AddProjectScreen
import aistages.app.ui.ProjectScreen
import aistages.shared.ProjectInfo
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.window.ComposeViewport
import kotlinx.browser.document
import kotlinx.browser.window

@OptIn(ExperimentalComposeUiApi::class)
fun main() {
    ComposeViewport(document.body!!) {
        App()
    }
}

@Composable
fun App() {
    MaterialTheme {
        var projects by remember { mutableStateOf<List<ProjectInfo>?>(null) }
        var browseCapable by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }

        LaunchedEffect(Unit) {
            try {
                projects = Api.getProjects()
                browseCapable = Api.getBrowseCapabilities().folderPicker
            } catch (e: Exception) {
                error = e.message
            }
        }

        val path = window.location.pathname

        when {
            error != null -> ErrorScreen(error!!)
            projects == null -> LoadingScreen()
            projects!!.isEmpty() || path == "/add-project" ->
                AddProjectScreen(browseCapable)
            path.startsWith("/project/") -> {
                val slug = path.removePrefix("/project/")
                ProjectScreen(slug, projects!!, browseCapable)
            }
            else -> AddProjectScreen(browseCapable)
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(
        modifier = androidx.compose.ui.Modifier.fillMaxSize(),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorScreen(message: String) {
    Box(
        modifier = androidx.compose.ui.Modifier.fillMaxSize(),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Text("Error: $message", color = MaterialTheme.colorScheme.error)
    }
}
