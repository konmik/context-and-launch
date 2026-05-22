package aistages.server

fun isWindows(): Boolean = System.getProperty("os.name").lowercase().contains("win")

fun openFolderPicker(initialPath: String?): String? {
    if (!isWindows()) return null

    val script = buildString {
        appendLine("Add-Type -AssemblyName System.Windows.Forms")
        appendLine("\$dialog = New-Object System.Windows.Forms.FolderBrowserDialog")
        if (initialPath != null) {
            appendLine("\$dialog.SelectedPath = '${initialPath.replace("'", "''")}'")
        }
        appendLine("\$result = \$dialog.ShowDialog()")
        appendLine("if (\$result -eq 'OK') { \$dialog.SelectedPath }")
    }

    val process = ProcessBuilder("powershell", "-NoProfile", "-Command", script)
        .redirectErrorStream(true)
        .start()
    val output = process.inputStream.bufferedReader().readText().trim()
    process.waitFor()

    return output.ifEmpty { null }
}
