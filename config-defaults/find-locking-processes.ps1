param([Parameter(Mandatory)][string]$WorktreePath)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class LockingProcessFinder {
    [DllImport("ntdll.dll")]
    static extern int NtQuerySystemInformation(int cls, IntPtr buf, int len, out int ret);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateFileW(string name, uint acc, uint share, IntPtr sa, uint disp,
        uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint acc, bool inh, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DuplicateHandle(IntPtr srcProc, IntPtr src, IntPtr dstProc, out IntPtr dst,
        uint acc, bool inh, uint opts);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")]
    static extern uint GetFileType(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern uint GetFinalPathNameByHandleW(IntPtr h, StringBuilder buf, uint len, uint flags);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetCurrentProcess();

    const int SystemExtendedHandleInformation = 0x40;
    const int STATUS_INFO_LENGTH_MISMATCH = unchecked((int)0xC0000004);
    const int ERROR_FILE_NOT_FOUND = 2;
    const int ERROR_PATH_NOT_FOUND = 3;
    const uint PROCESS_DUP_HANDLE = 0x0040;
    const uint DUPLICATE_SAME_ACCESS = 0x0002;
    const uint FILE_TYPE_DISK = 0x0001;
    const uint FILE_READ_ATTRIBUTES = 0x0080;
    const uint FILE_SHARE_ALL = 0x0007;
    const uint OPEN_EXISTING = 3;
    const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    static readonly IntPtr INVALID_HANDLE = (IntPtr)(-1);

    [StructLayout(LayoutKind.Sequential)]
    struct HandleEntry {
        public IntPtr Object;
        public IntPtr UniqueProcessId;
        public IntPtr HandleValue;
        public uint GrantedAccess;
        public ushort CreatorBackTraceIndex;
        public ushort ObjectTypeIndex;
        public uint HandleAttributes;
        public uint Reserved;
    }

    static IntPtr HandleSnapshot(out int count) {
        int len = 1 << 20;
        for (;;) {
            IntPtr buf = Marshal.AllocHGlobal(len);
            int needed;
            int status = NtQuerySystemInformation(SystemExtendedHandleInformation, buf, len, out needed);
            if (status == 0) {
                count = Marshal.ReadIntPtr(buf).ToInt32();
                return buf;
            }
            Marshal.FreeHGlobal(buf);
            if (status != STATUS_INFO_LENGTH_MISMATCH)
                throw new Exception("NtQuerySystemInformation failed with 0x" + status.ToString("X8"));
            len = Math.Max(needed, len * 2);
        }
    }

    static HandleEntry EntryAt(IntPtr buf, int index) {
        long offset = IntPtr.Size * 2 + (long)index * Marshal.SizeOf(typeof(HandleEntry));
        return (HandleEntry)Marshal.PtrToStructure(
            (IntPtr)(buf.ToInt64() + offset), typeof(HandleEntry));
    }

    static ushort FileObjectTypeIndex(IntPtr buf, int count, int selfPid, IntPtr known) {
        for (int i = 0; i < count; i++) {
            HandleEntry e = EntryAt(buf, i);
            if (e.UniqueProcessId.ToInt32() == selfPid && e.HandleValue == known)
                return e.ObjectTypeIndex;
        }
        throw new Exception("Own directory handle missing from the system handle table");
    }

    static string DosPathOf(IntPtr handle) {
        if (GetFileType(handle) != FILE_TYPE_DISK) return null;
        StringBuilder sb = new StringBuilder(4096);
        uint n = GetFinalPathNameByHandleW(handle, sb, (uint)sb.Capacity, 0);
        if (n == 0 || n >= sb.Capacity) return null;
        string p = sb.ToString();
        if (p.StartsWith(@"\\?\UNC\")) return @"\\" + p.Substring(8);
        if (p.StartsWith(@"\\?\")) return p.Substring(4);
        return p;
    }

    static bool IsUnder(string path, string dir) {
        return path.Equals(dir, StringComparison.OrdinalIgnoreCase)
            || path.StartsWith(dir + @"\", StringComparison.OrdinalIgnoreCase);
    }

    static string ProcessName(int pid) {
        try { return Process.GetProcessById(pid).ProcessName; }
        catch (ArgumentException) { return "pid " + pid; }
    }

    public static string FindByPath(string dir) {
        dir = dir.TrimEnd('\\');
        IntPtr self = CreateFileW(dir, FILE_READ_ATTRIBUTES, FILE_SHARE_ALL, IntPtr.Zero,
            OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, IntPtr.Zero);
        if (self == INVALID_HANDLE) {
            int err = Marshal.GetLastWin32Error();
            if (err == ERROR_FILE_NOT_FOUND || err == ERROR_PATH_NOT_FOUND) return "";
            throw new Exception("Cannot open " + dir + ": win32 error " + err);
        }
        int selfPid = Process.GetCurrentProcess().Id;
        int count;
        IntPtr buf = HandleSnapshot(out count);
        try {
            ushort fileType = FileObjectTypeIndex(buf, count, selfPid, self);
            IntPtr selfProc = GetCurrentProcess();
            SortedDictionary<int, string> holders = new SortedDictionary<int, string>();
            Dictionary<int, IntPtr> opened = new Dictionary<int, IntPtr>();
            try {
                for (int i = 0; i < count; i++) {
                    HandleEntry e = EntryAt(buf, i);
                    if (e.ObjectTypeIndex != fileType) continue;
                    int pid = e.UniqueProcessId.ToInt32();
                    if (pid <= 4 || pid == selfPid || holders.ContainsKey(pid)) continue;
                    IntPtr proc;
                    if (!opened.TryGetValue(pid, out proc)) {
                        proc = OpenProcess(PROCESS_DUP_HANDLE, false, pid);
                        opened[pid] = proc;
                    }
                    if (proc == IntPtr.Zero) continue;
                    IntPtr dup;
                    if (!DuplicateHandle(proc, e.HandleValue, selfProc, out dup, 0, false,
                            DUPLICATE_SAME_ACCESS)) continue;
                    try {
                        string path = DosPathOf(dup);
                        if (path != null && IsUnder(path, dir)) holders[pid] = ProcessName(pid);
                    } finally { CloseHandle(dup); }
                }
            } finally {
                foreach (IntPtr proc in opened.Values)
                    if (proc != IntPtr.Zero) CloseHandle(proc);
            }
            StringBuilder result = new StringBuilder();
            foreach (KeyValuePair<int, string> holder in holders)
                result.Append(holder.Key).Append('\t').Append(holder.Value).AppendLine();
            return result.ToString();
        } finally {
            Marshal.FreeHGlobal(buf);
            CloseHandle(self);
        }
    }
}
'@

[LockingProcessFinder]::FindByPath($WorktreePath)
