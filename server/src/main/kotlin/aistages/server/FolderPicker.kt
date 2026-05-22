package aistages.server

import java.io.File
import javax.swing.*

private var parentFrame: JFrame? = null

private fun ensureParentFrame(): JFrame {
    if (parentFrame == null) {
        UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName())
        parentFrame = JFrame().apply { isAlwaysOnTop = true }
    }
    return parentFrame!!
}

fun openFolderPicker(initialPath: String?): String? {
    var result: String? = null
    SwingUtilities.invokeAndWait {
        val chooser = JFileChooser().apply {
            fileSelectionMode = JFileChooser.DIRECTORIES_ONLY
            dialogTitle = "Select Repository"
            if (initialPath != null) currentDirectory = File(initialPath)
        }
        if (chooser.showOpenDialog(ensureParentFrame()) == JFileChooser.APPROVE_OPTION) {
            result = chooser.selectedFile.absolutePath
        }
    }
    return result
}
