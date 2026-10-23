param([switch]$CompileOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class ScreenshotMouse {
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public POINT point; public uint data, flags, time; public IntPtr extra; }
  delegate IntPtr MouseProc(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, MouseProc callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flag);
  [DllImport("user32.dll")] static extern uint GetDoubleClickTime();
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  static readonly ConcurrentDictionary<long, byte> targets = new ConcurrentDictionary<long, byte>();
  static readonly MouseProc callback = OnMouse;
  static volatile bool stopped;
  static long lastHandle;
  static MOUSE lastClick;
  static IntPtr OnMouse(int code, IntPtr message, IntPtr data) {
    if (code >= 0 && (message.ToInt32() == 0x201 || message.ToInt32() == 0x205)) {
      var mouse = (MOUSE)Marshal.PtrToStructure(data, typeof(MOUSE));
      long handle = GetAncestor(WindowFromPoint(mouse.point), 2).ToInt64();
      if (targets.ContainsKey(handle)) {
        if (message.ToInt32() == 0x205) Console.WriteLine(handle + " menu");
        else {
          bool twice = handle == lastHandle && unchecked(mouse.time-lastClick.time) <= GetDoubleClickTime()
            && Math.Abs(mouse.point.x-lastClick.point.x) <= GetSystemMetrics(36)/2
            && Math.Abs(mouse.point.y-lastClick.point.y) <= GetSystemMetrics(37)/2;
          lastHandle = twice ? 0 : handle;
          lastClick = mouse;
          if (twice) Console.WriteLine(handle + " double");
        }
      } else lastHandle = 0;
    }
    // Observe only: Windows continues to handle dragging and all mouse input.
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  public static void Run() {
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) {}
    var hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) throw new Exception("Cannot observe screenshot mouse input");
    var reader = new Thread(() => {
      string line;
      while ((line = Console.ReadLine()) != null) {
        var parts = line.Split(' '); long handle; byte ignored;
        if (parts.Length != 2 || !long.TryParse(parts[1], out handle)) continue;
        if (parts[0] == "add") targets[handle] = 0;
        else if (parts[0] == "remove") targets.TryRemove(handle, out ignored);
      }
      stopped = true;
    });
    reader.IsBackground = true;
    reader.Start();
    using (var timer = new System.Windows.Forms.Timer()) {
      timer.Interval = 250;
      timer.Tick += (sender, args) => { if (stopped) Application.ExitThread(); };
      timer.Start();
      try { Application.Run(); }
      finally { UnhookWindowsHookEx(hook); }
    }
  }
}
'@
if (-not $CompileOnly) { [ScreenshotMouse]::Run() }
