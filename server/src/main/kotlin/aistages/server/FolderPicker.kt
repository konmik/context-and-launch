package aistages.server

import java.io.File
import javax.swing.*

fun openFolderPicker(initialPath: String?): String? {
    var result: String? = null
    SwingUtilities.invokeAndWait {
        UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName())
        val frame = JFrame().apply { isAlwaysOnTop = true }
        val chooser = JFileChooser().apply {
            fileSelectionMode = JFileChooser.DIRECTORIES_ONLY
            dialogTitle = "Select Repository"
            if (initialPath != null) currentDirectory = File(initialPath)
        }
        if (chooser.showOpenDialog(frame) == JFileChooser.APPROVE_OPTION) {
            result = chooser.selectedFile.absolutePath
        }
        frame.dispose()
    }
    return result
}
