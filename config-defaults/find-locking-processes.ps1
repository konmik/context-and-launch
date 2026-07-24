param([Parameter(Mandatory)][string]$WorktreePath)

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class ProcessCwdReader {
    [DllImport("ntdll.dll")]
    static extern int NtQueryInformationProcess(
        IntPtr h, int cls, ref PROCESS_BASIC_INFORMATION info, int len, out int ret);
    [DllImport("kernel32.dll")]
    static extern bool ReadProcessMemory(
        IntPtr h, IntPtr addr, byte[] buf, int sz, out int read);
    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint acc, bool inh, int pid);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_BASIC_INFORMATION {
        public IntPtr ExitStatus;
        public IntPtr PebBaseAddress;
        public IntPtr AffinityMask;
        public IntPtr BasePriority;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }

    static string GetCwd(int pid) {
        IntPtr h = OpenProcess(0x0410, false, pid);
        if (h == IntPtr.Zero) return null;
        try {
            var pbi = new PROCESS_BASIC_INFORMATION();
            int ret;
            if (NtQueryInformationProcess(h, 0, ref pbi, Marshal.SizeOf(pbi), out ret) != 0)
                return null;
            byte[] peb = new byte[0x30];
            int r;
            if (!ReadProcessMemory(h, pbi.PebBaseAddress, peb, peb.Length, out r))
                return null;
            IntPtr pp = (IntPtr)BitConverter.ToInt64(peb, 0x20);
            byte[] ppd = new byte[0x48];
            if (!ReadProcessMemory(h, pp, ppd, ppd.Length, out r))
                return null;
            ushort len = BitConverter.ToUInt16(ppd, 0x38);
            IntPtr buf = (IntPtr)BitConverter.ToInt64(ppd, 0x40);
            byte[] path = new byte[len];
            if (!ReadProcessMemory(h, buf, path, len, out r))
                return null;
            return Encoding.Unicode.GetString(path).TrimEnd('\\');
        } finally {
            CloseHandle(h);
        }
    }

    public static string FindByPath(string dir) {
        int self = Process.GetCurrentProcess().Id;
        var sb = new StringBuilder();
        foreach (var p in Process.GetProcesses()) {
            try {
                if (p.Id == self) continue;
                string cwd = GetCwd(p.Id);
                if (cwd != null && cwd.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) {
                    if (sb.Length > 0) sb.AppendLine();
                    sb.Append(p.Id).Append('\t').Append(p.ProcessName);
                }
            } catch {}
        }
        return sb.ToString();
    }
}
'@ -ErrorAction SilentlyContinue

try {
    [ProcessCwdReader]::FindByPath($WorktreePath)
} catch {
    ""
}
