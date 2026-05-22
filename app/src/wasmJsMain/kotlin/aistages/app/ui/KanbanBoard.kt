package aistages.app.ui

import aistages.app.Api
import aistages.shared.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun KanbanBoard(slug: String) {
    var boardState by remember { mutableStateOf<BoardState?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var editingTicket by remember { mutableStateOf<TicketInfo?>(null) }
    var deletingTicket by remember { mutableStateOf<TicketInfo?>(null) }
    var detailTicket by remember { mutableStateOf<TicketInfo?>(null) }
    val scope = rememberCoroutineScope()

    val reload: () -> Unit = {
        scope.launch {
            try {
                boardState = Api.getBoard(slug)
                error = null
            } catch (e: Exception) {
                error = e.message
            }
        }
    }

    LaunchedEffect(slug) {
        loading = true
        try {
            boardState = Api.getBoard(slug)
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    when {
        loading -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        error != null -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Failed to load board", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text(error!!, color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = reload) { Text("Retry") }
                }
            }
        }
        boardState != null -> {
            val state = boardState!!
            Column(Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Spacer(Modifier.weight(1f))
                    Button(onClick = { showCreateDialog = true }) {
                        Text("+ New Ticket")
                    }
                }
                Row(Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
                    state.columns.forEach { column ->
                        val columnTickets = state.tickets.filter { it.status == column }
                        BoardColumn(
                            column = column,
                            tickets = columnTickets,
                            allColumns = state.columns,
                            modifier = Modifier.weight(1f).fillMaxHeight().padding(horizontal = 4.dp),
                            onTicketClick = { detailTicket = it },
                            onMoveTicket = { ticket, targetColumn ->
                                scope.launch {
                                    try {
                                        Api.updateTicket(
                                            slug, ticket.folderName,
                                            UpdateTicketRequest(status = targetColumn),
                                        )
                                        reload()
                                    } catch (_: Exception) {}
                                }
                            },
                            onEditTicket = { editingTicket = it },
                            onDeleteTicket = { deletingTicket = it },
                        )
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateTicketDialog(
            onConfirm = { number, title ->
                scope.launch {
                    try {
                        Api.createTicket(slug, CreateTicketRequest(number, title))
                        showCreateDialog = false
                        reload()
                    } catch (_: Exception) {}
                }
            },
            onDismiss = { showCreateDialog = false },
        )
    }

    if (editingTicket != null) {
        EditTicketDialog(
            ticket = editingTicket!!,
            onConfirm = { number, title ->
                scope.launch {
                    try {
                        Api.updateTicket(
                            slug, editingTicket!!.folderName,
                            UpdateTicketRequest(number = number, title = title),
                        )
                        editingTicket = null
                        reload()
                    } catch (_: Exception) {}
                }
            },
            onDismiss = { editingTicket = null },
        )
    }

    if (deletingTicket != null) {
        DeleteTicketDialog(
            ticket = deletingTicket!!,
            onConfirm = {
                scope.launch {
                    try {
                        Api.deleteTicket(slug, deletingTicket!!.folderName)
                        deletingTicket = null
                        reload()
                    } catch (_: Exception) {}
                }
            },
            onDismiss = { deletingTicket = null },
        )
    }

    if (detailTicket != null) {
        TicketDetailDialog(
            slug = slug,
            ticket = detailTicket!!,
            columns = boardState?.columns ?: emptyList(),
            onDismiss = {
                detailTicket = null
                reload()
            },
        )
    }
}

@Composable
private fun BoardColumn(
    column: String,
    tickets: List<TicketInfo>,
    allColumns: List<String>,
    modifier: Modifier = Modifier,
    onTicketClick: (TicketInfo) -> Unit,
    onMoveTicket: (TicketInfo, String) -> Unit,
    onEditTicket: (TicketInfo) -> Unit,
    onDeleteTicket: (TicketInfo) -> Unit,
) {
    Card(modifier = modifier) {
        Column(Modifier.fillMaxSize().padding(8.dp)) {
            Text(
                column,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            HorizontalDivider()
            Spacer(Modifier.height(4.dp))
            LazyColumn(Modifier.fillMaxSize()) {
                items(tickets, key = { it.folderName }) { ticket ->
                    TicketCard(
                        ticket = ticket,
                        columns = allColumns,
                        onClick = { onTicketClick(ticket) },
                        onMove = { targetColumn -> onMoveTicket(ticket, targetColumn) },
                        onEdit = { onEditTicket(ticket) },
                        onDelete = { onDeleteTicket(ticket) },
                    )
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }
}

@Composable
private fun TicketCard(
    ticket: TicketInfo,
    columns: List<String>,
    onClick: () -> Unit,
    onMove: (String) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    var showMenu by remember { mutableStateOf(false) }
    var showMoveMenu by remember { mutableStateOf(false) }

    ElevatedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        ticket.number,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        ticket.title,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box {
                    TextButton(onClick = { showMenu = true }) {
                        Text("...")
                    }
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("Move to...") },
                            onClick = {
                                showMenu = false
                                showMoveMenu = true
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Edit") },
                            onClick = {
                                showMenu = false
                                onEdit()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Delete") },
                            onClick = {
                                showMenu = false
                                onDelete()
                            },
                        )
                    }
                    DropdownMenu(
                        expanded = showMoveMenu,
                        onDismissRequest = { showMoveMenu = false },
                    ) {
                        columns.filter { it != ticket.status }.forEach { col ->
                            DropdownMenuItem(
                                text = { Text(col) },
                                onClick = {
                                    showMoveMenu = false
                                    onMove(col)
                                },
                            )
                        }
                    }
                }
            }
            if (ticket.stageNames.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Row {
                    ticket.stageNames.forEach { stage ->
                        Surface(
                            tonalElevation = 4.dp,
                            shape = MaterialTheme.shapes.extraSmall,
                            modifier = Modifier.padding(end = 4.dp),
                        ) {
                            Text(
                                stage,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
