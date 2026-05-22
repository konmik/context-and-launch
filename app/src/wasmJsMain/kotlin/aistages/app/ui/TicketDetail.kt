package aistages.app.ui

import aistages.app.Api
import aistages.shared.StageMarkdownContent
import aistages.shared.TicketInfo
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun TicketDetailDialog(
    slug: String,
    ticket: TicketInfo,
    columns: List<String>,
    onDismiss: () -> Unit,
) {
    var selectedTab by remember { mutableStateOf(0) }
    var content by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val currentStage = columns.getOrNull(selectedTab) ?: columns.firstOrNull() ?: ""

    LaunchedEffect(selectedTab, currentStage) {
        if (currentStage.isBlank()) return@LaunchedEffect
        loading = true
        try {
            val md = Api.getStageMarkdown(slug, ticket.folderName, currentStage)
            content = md?.content ?: ""
        } catch (_: Exception) {
            content = ""
        } finally {
            loading = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("${ticket.number} - ${ticket.title}")
            }
        },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(min = 300.dp)) {
                @Suppress("DEPRECATION")
                ScrollableTabRow(selectedTabIndex = selectedTab) {
                    columns.forEachIndexed { index, column ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            text = { Text(column) },
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                if (loading) {
                    CircularProgressIndicator()
                } else {
                    OutlinedTextField(
                        value = content,
                        onValueChange = { content = it },
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        label = { Text("$currentStage.md") },
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        saving = true
                        try {
                            Api.saveStageMarkdown(
                                slug, ticket.folderName, currentStage,
                                StageMarkdownContent(content),
                            )
                        } catch (_: Exception) {}
                        saving = false
                    }
                },
                enabled = !saving && !loading,
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}
