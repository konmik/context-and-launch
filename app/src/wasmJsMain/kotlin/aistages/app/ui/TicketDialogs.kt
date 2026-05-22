package aistages.app.ui

import aistages.shared.TicketInfo
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
private fun TicketFormDialog(
    dialogTitle: String,
    confirmLabel: String,
    initialNumber: String = "",
    initialTitle: String = "",
    onConfirm: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var number by remember { mutableStateOf(initialNumber) }
    var title by remember { mutableStateOf(initialTitle) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(dialogTitle) },
        text = {
            Column {
                OutlinedTextField(
                    value = number,
                    onValueChange = { number = it },
                    label = { Text("Number") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(number.trim(), title.trim()) },
                enabled = number.isNotBlank() && title.isNotBlank(),
            ) {
                Text(confirmLabel)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

@Composable
fun CreateTicketDialog(
    onConfirm: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    TicketFormDialog(
        dialogTitle = "New Ticket",
        confirmLabel = "Create",
        onConfirm = onConfirm,
        onDismiss = onDismiss,
    )
}

@Composable
fun EditTicketDialog(
    ticket: TicketInfo,
    onConfirm: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    TicketFormDialog(
        dialogTitle = "Edit Ticket",
        confirmLabel = "Save",
        initialNumber = ticket.number,
        initialTitle = ticket.title,
        onConfirm = onConfirm,
        onDismiss = onDismiss,
    )
}

@Composable
fun DeleteTicketDialog(
    ticket: TicketInfo,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete Ticket") },
        text = {
            Text("Delete ticket ${ticket.number} - ${ticket.title}?")
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                ),
            ) {
                Text("Delete")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
