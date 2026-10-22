param([string]$Kind, [long]$Target, [int]$Left, [int]$Top, [int]$Width, [int]$Height, [int]$IncludeCursor, [switch]$CompileOnly, [switch]$VerifySelection, [switch]$VerifyAutoShow, [switch]$Server)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing,System.Windows.Forms -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.IO;
using System.Windows.Forms;
public static class ToolboxCapture {
  public static int[] LastBounds { get; private set; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr hCursor; public POINT pos; }
  [StructLayout(LayoutKind.Sequential)] struct ICONINFO { public bool icon; public int xHotspot, yHotspot; public IntPtr mask, color; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static void EnableDpi() {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); SetThreadDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
  }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref POINT point);
  public static int[] MeasureWindow(long target) {
    EnableDpi();
    RECT rect; var point = new POINT();
    if (!GetClientRect(new IntPtr(target), out rect) || !ClientToScreen(new IntPtr(target), ref point)) throw new Exception("Cannot measure image window");
    return new int[] { rect.right, rect.bottom, point.x, point.y };
  }
  public static int[] ChangeBorder(long target, int delta) {
    EnableDpi(); RECT bounds;
    if (!GetWindowRect(new IntPtr(target), out bounds)) throw new Exception("Cannot find image window");
    if (!SetWindowPos(new IntPtr(target), IntPtr.Zero, bounds.left - delta, bounds.top - delta, bounds.right - bounds.left + delta * 2, bounds.bottom - bounds.top + delta * 2, 0x0014)) throw new Exception("Cannot resize image border");
    return MeasureWindow(target);
  }
  [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO info);
  [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon, out ICONINFO info);
  [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr dc, int x, int y, IntPtr icon, int width, int height, int step, IntPtr brush, int flags);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("dwmapi.dll")] static extern int DwmFlush();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out RECT value, int size);
  static Rectangle WindowBounds(IntPtr window) {
    RECT rect;
    if (DwmGetWindowAttribute(window, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(window, out rect)) return Rectangle.Empty;
    return Rectangle.FromLTRB(rect.left, rect.top, rect.right, rect.bottom);
  }
  static Rectangle[] SnapshotWindows() {
    var rectangles = new System.Collections.Generic.List<Rectangle>();
    var shell = GetShellWindow();
    // Freeze top-level bounds in visible stacking order before the selector exists.
    int visited = 0;
    for (var window = GetTopWindow(IntPtr.Zero); window != IntPtr.Zero && visited++ < 10000; window = GetWindow(window, 2)) {
      if (window == shell || !IsWindowVisible(window) || IsIconic(window)) continue;
      int cloaked;
      if (DwmGetWindowAttribute(window, 14, out cloaked, sizeof(int)) == 0 && cloaked != 0) continue;
      var rect = WindowBounds(window);
      if (rect.Width > 0 && rect.Height > 0) rectangles.Add(rect);
    }
    return rectangles.ToArray();
  }
  sealed class Selector : Form {
    readonly Bitmap background;
    readonly Rectangle desktop;
    readonly Rectangle[] frozenWindows;
    readonly Timer inputTimer;
    bool previousLeft;
    bool finished;
    Point anchor;
    Point pointer;
    bool dragging;
    bool pressed;
    public int PaintCount { get; private set; }
    public int Magnification = 4;
    public Rectangle SelectedRegion;
    public Selector(Bitmap image, bool windows, Rectangle bounds, Rectangle[] targets) {
      background = image; desktop = bounds;
      frozenWindows = targets;
      pointer = new Point(Control.MousePosition.X - bounds.X, Control.MousePosition.Y - bounds.Y);
      FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual;
      Bounds = desktop; TopMost = true; ShowInTaskbar = false; KeyPreview = true;
      DoubleBuffered = true; AutoScaleMode = AutoScaleMode.None;
      Cursor = Cursors.Cross;
      inputTimer = new Timer(); inputTimer.Interval = 8;
      inputTimer.Tick += PollInput;
    }
    protected override void OnShown(EventArgs e) {
      base.OnShown(e);
      ShowWindow(Handle, 5); ShowWindow(Handle, 5);
      SetWindowPos(Handle, new IntPtr(-1), desktop.X, desktop.Y, desktop.Width, desktop.Height, 0x0040);
      BringToFront(); Activate(); Focus(); SetForegroundWindow(Handle);
      Refresh();
      BeginInvoke((Action)delegate { if (!finished) { SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0043); Refresh(); } });
      previousLeft = false;
      inputTimer.Start();
      if (!pressed) UpdateWindow();
    }
    protected override void WndProc(ref Message message) {
      // WM_MOUSEACTIVATE: activate without eating the first click/drag.
      if (message.Msg == 0x21) { message.Result = new IntPtr(1); return; }
      base.WndProc(ref message);
    }
    void UpdateWindow() {
      UpdateWindow(Control.MousePosition);
    }
    void UpdateWindow(Point point) {
      SelectedRegion = ClientRectangle;
      foreach (var rect in frozenWindows) {
        if (!rect.Contains(point)) continue;
        SelectedRegion = rect; SelectedRegion.Offset(-desktop.Left, -desktop.Top);
        SelectedRegion = Rectangle.Intersect(SelectedRegion, ClientRectangle); break;
      }
      Invalidate();
    }
    void Finish(bool accepted) {
      if (finished) return;
      finished = true; inputTimer.Stop();
      DialogResult = accepted ? DialogResult.OK : DialogResult.Cancel; Close();
    }
    void Press(Point point) {
      if (finished || pressed) return;
      TrackPointer(point);
      UpdateWindow(new Point(point.X + desktop.Left, point.Y + desktop.Top));
      anchor = point; pressed = true; dragging = false; Capture = true;
    }
    void MovePointer(Point point) {
      TrackPointer(point);
      if (pressed && !dragging &&
          (Math.Abs(point.X - anchor.X) >= SystemInformation.DragSize.Width / 2 ||
           Math.Abs(point.Y - anchor.Y) >= SystemInformation.DragSize.Height / 2)) dragging = true;
      if (dragging) UpdateRegion(point);
      else if (!pressed) UpdateWindow(new Point(point.X + desktop.Left, point.Y + desktop.Top));
      Invalidate();
    }
    void Release(Point point) {
      if (finished || !pressed) return;
      MovePointer(point);
      Capture = false; pressed = false;
      if (SelectedRegion.Width >= 2 && SelectedRegion.Height >= 2) { Finish(true); return; }
      dragging = false; UpdateWindow(new Point(point.X + desktop.Left, point.Y + desktop.Top));
    }
    void PollInput(object sender, EventArgs e) {
      // Read the physical buttons too: foreground activation must never consume a selection click.
      if (finished) return;
      if ((GetAsyncKeyState(27) & 0x8000) != 0 || (GetAsyncKeyState(46) & 0x8000) != 0 || (GetAsyncKeyState(2) & 0x8000) != 0) { Finish(false); return; }
      var point = PointToClient(Control.MousePosition);
      bool left = (GetAsyncKeyState(1) & 0x8000) != 0;
      ProcessPointer(point, left);
    }
    public void ProcessPointer(Point point, bool left) {
      if (finished) return;
      MovePointer(point);
      if (left && !previousLeft) Press(point);
      else if (!left && previousLeft) Release(point);
      previousLeft = left;
    }
    protected override void OnMouseMove(MouseEventArgs e) {
      base.OnMouseMove(e);
      MovePointer(e.Location);
    }
    void TrackPointer(Point point) {
      if (pointer == point) return;
      pointer = point;
      Invalidate();
    }
    public static Rectangle HintBounds(Rectangle monitor, Point point, Size size, int margin) {
      int x = point.X + margin, y = point.Y + margin;
      if (x + size.Width > monitor.Right) x = point.X - size.Width - margin;
      if (y + size.Height > monitor.Bottom) y = point.Y - size.Height - margin;
      return new Rectangle(Math.Max(monitor.Left, Math.Min(x, monitor.Right - size.Width)),
        Math.Max(monitor.Top, Math.Min(y, monitor.Bottom - size.Height)), size.Width, size.Height);
    }

    public void DrawGuides(Graphics graphics) {
      if (!ClientRectangle.Contains(pointer) || pointer.X >= background.Width || pointer.Y >= background.Height) return;
      using (var dark = new Pen(Color.Black))
      using (var light = new Pen(Color.White)) {
        DrawGuide(graphics, true, dark, light);
        DrawGuide(graphics, false, dark, light);
      }
    }
    void DrawGuide(Graphics graphics, bool horizontal, Pen dark, Pen light) {
      int length = horizontal ? Math.Min(ClientSize.Width, background.Width) : Math.Min(ClientSize.Height, background.Height);
      int run = 0;
      bool previousDark = false;
      for (int i = 0; i <= length; i++) {
        bool useDark = false;
        if (i < length) {
          int x = horizontal ? i : pointer.X, y = horizontal ? pointer.Y : i;
          var color = background.GetPixel(x, y);
          // Match the visible desktop: the area outside the selection is dimmed.
          double luminance = (299 * color.R + 587 * color.G + 114 * color.B) / 1000.0;
          if (!SelectedRegion.Contains(x, y)) luminance *= 150.0 / 255;
          useDark = luminance >= 110;
        }
        if (i > 0 && (i == length || useDark != previousDark)) {
          var pen = previousDark ? dark : light;
          if (horizontal) graphics.DrawLine(pen, run, pointer.Y, i - 1, pointer.Y);
          else graphics.DrawLine(pen, pointer.X, run, pointer.X, i - 1);
          run = i;
        }
        previousDark = useDark;
      }
    }
    void DrawHint(Graphics graphics) {
      var absolute = new Point(pointer.X + desktop.Left, pointer.Y + desktop.Top);
      var monitor = Rectangle.Intersect(Screen.FromPoint(absolute).Bounds, desktop);
      monitor.Offset(-desktop.Left, -desktop.Top);
      if (monitor.Width < 1 || monitor.Height < 1) monitor = ClientRectangle;
      var panel = HintBounds(monitor, pointer, new Size(Math.Min(268, monitor.Width), Math.Min(248, monitor.Height)), 20);
      var saved = graphics.Save();
      graphics.SetClip(panel);
      using (var brush = new SolidBrush(Color.FromArgb(245, 30, 30, 38))) graphics.FillRectangle(brush, panel);
      int px = Math.Max(0, Math.Min(background.Width - 1, pointer.X));
      int py = Math.Max(0, Math.Min(background.Height - 1, pointer.Y));
      var zoom = new Rectangle(panel.X, panel.Y, panel.Width, 128);
      var zoomState = graphics.Save();
      graphics.SetClip(zoom, System.Drawing.Drawing2D.CombineMode.Intersect);
      graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
      graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;
      int cx = zoom.X + zoom.Width / 2, cy = zoom.Y + zoom.Height / 2;
      int radiusX = zoom.Width / (2 * Magnification) + 1, radiusY = zoom.Height / (2 * Magnification) + 1;
      var source = Rectangle.Intersect(new Rectangle(px - radiusX, py - radiusY, radiusX * 2 + 1, radiusY * 2 + 1), new Rectangle(Point.Empty, background.Size));
      var destination = new Rectangle(cx + (source.X - px) * Magnification - Magnification / 2, cy + (source.Y - py) * Magnification - Magnification / 2, source.Width * Magnification, source.Height * Magnification);
      graphics.DrawImage(background, destination, source, GraphicsUnit.Pixel);
      graphics.Restore(zoomState);
      using (var pen = new Pen(Color.FromArgb(80, 160, 255))) {
        graphics.DrawLine(pen, cx, zoom.Top, cx, zoom.Bottom - 1);
        graphics.DrawLine(pen, zoom.Left, cy, zoom.Right - 1, cy);
      }
      var color = background.GetPixel(px, py);
      using (var font = new Font(SystemFonts.MessageBoxFont.FontFamily, 10, FontStyle.Regular, GraphicsUnit.Point)) {
        int x = panel.X + 12, y = panel.Y + 138;
        graphics.DrawString("\u5750\u6807   " + absolute.X + ", " + absolute.Y, font, Brushes.White, x, y);
        graphics.DrawString("\u5c3a\u5bf8   " + SelectedRegion.Width + " \u00d7 " + SelectedRegion.Height, font, Brushes.White, x, y + 25);
        graphics.DrawString("HEX    #" + color.R.ToString("X2") + color.G.ToString("X2") + color.B.ToString("X2"), font, Brushes.White, x, y + 50);
        graphics.DrawString("RGB    " + color.R + ", " + color.G + ", " + color.B, font, Brushes.White, x, y + 75);
      }
      using (var pen = new Pen(Color.FromArgb(144, 126, 255)))
        graphics.DrawRectangle(pen, panel.X, panel.Y, panel.Width - 1, panel.Height - 1);
      graphics.Restore(saved);
    }
    void UpdateRegion(Point end) {
      end.X = Math.Max(0, Math.Min(ClientSize.Width, end.X));
      end.Y = Math.Max(0, Math.Min(ClientSize.Height, end.Y));
      SelectedRegion = Rectangle.FromLTRB(Math.Min(anchor.X, end.X), Math.Min(anchor.Y, end.Y), Math.Max(anchor.X, end.X), Math.Max(anchor.Y, end.Y));
    }
    protected override void OnMouseDown(MouseEventArgs e) {
      base.OnMouseDown(e);
      if (e.Button == MouseButtons.Right) { Finish(false); return; }
      if (e.Button != MouseButtons.Left) return;
      Press(e.Location);
    }
    protected override void OnMouseUp(MouseEventArgs e) {
      base.OnMouseUp(e);
      if (e.Button == MouseButtons.Left) Release(e.Location);
    }
    protected override void Dispose(bool disposing) {
      if (disposing) inputTimer.Dispose();
      base.Dispose(disposing);
    }
    protected override void OnPaint(PaintEventArgs e) {
      PaintCount++;
      e.Graphics.DrawImageUnscaled(background, 0, 0);
      using (var shade = new SolidBrush(Color.FromArgb(105, 0, 0, 0))) e.Graphics.FillRectangle(shade, ClientRectangle);
      var visible = Rectangle.Intersect(SelectedRegion, ClientRectangle);
      if (visible.Width > 0 && visible.Height > 0) {
        e.Graphics.DrawImage(background, visible, visible, GraphicsUnit.Pixel);
        using (var pen = new Pen(Color.FromArgb(144, 126, 255), 3)) e.Graphics.DrawRectangle(pen, visible.X + 1, visible.Y + 1, Math.Max(0, visible.Width - 3), Math.Max(0, visible.Height - 3));
      }
      DrawGuides(e.Graphics);
      DrawHint(e.Graphics);
    }
  }
  public static string Select(bool windowMode, bool cursor) {
    return Select(windowMode, cursor, 4);
  }
  public static string Select(bool windowMode, bool cursor, int magnification) {
    return Select(windowMode, cursor, magnification, false);
  }
  public static string Select(bool windowMode, bool cursor, int magnification, bool syncDesktop) {
    if (magnification < 2 || magnification > 8) throw new ArgumentException("Invalid magnification");
    LastBounds = null;
    EnableDpi();
    // Synchronize composition after the toolbox hides instead of always sleeping 180 ms.
    // If composition is unavailable, retain the previous settling delay as a fallback.
    if (syncDesktop && DwmFlush() < 0) System.Threading.Thread.Sleep(180);
    var bounds = SystemInformation.VirtualScreen;
    var windows = SnapshotWindows();
    // Keep the frozen desktop in memory; encode only the final selected region.
    using (var background = CaptureBitmap(bounds.X, bounds.Y, bounds.Width, bounds.Height, cursor))
    using (var selector = new Selector(background, windowMode, bounds, windows)) {
      selector.Magnification = magnification;
      if (selector.ShowDialog() != DialogResult.OK) return "CANCEL";
      var region = Rectangle.Intersect(selector.SelectedRegion, new Rectangle(Point.Empty, background.Size));
      if (region.Width < 1 || region.Height < 1) return "CANCEL";
      LastBounds = new int[] { bounds.X + region.X, bounds.Y + region.Y, region.Width, region.Height };
      using (var crop = background.Clone(region, PixelFormat.Format32bppRgb))
      using (var output = new MemoryStream()) { crop.Save(output, ImageFormat.Png); return Convert.ToBase64String(output.ToArray()); }
    }
  }
  public static void WarmUp() {
    EnableDpi();
    foreach (var type in new Type[] { typeof(ToolboxCapture), typeof(Selector) }) {
      foreach (var method in type.GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.DeclaredOnly)) {
        if (method.GetMethodBody() != null) System.Runtime.CompilerServices.RuntimeHelpers.PrepareMethod(method.MethodHandle);
      }
    }
    using (var image = new Bitmap(32, 32))
    using (var selector = new Selector(image, false, new Rectangle(0, 0, 32, 32), new Rectangle[0])) {
      selector.CreateControl();
      using (var target = new Bitmap(32, 32)) selector.DrawToBitmap(target, new Rectangle(0, 0, 32, 32));
    }
    try {
      var encoded = Capture("screen", 0, 0, 0, 2, 2, true);
      using (var stream = new MemoryStream(Convert.FromBase64String(encoded)))
      using (var bitmap = new Bitmap(stream)) { bitmap.GetPixel(0, 0); }
      SnapshotWindows();
    } catch (System.ComponentModel.Win32Exception) { /* No interactive desktop during headless verification. */ }
  }
  public static string VerifySelectionFlow() {
    EnableDpi();
    using (var background = new Bitmap(80, 60))
    using (var target = new Bitmap(80, 60)) {
      using (var graphics = Graphics.FromImage(background)) {
        graphics.Clear(Color.White);
        graphics.FillRectangle(Brushes.Black, 40, 0, 40, 60);
        graphics.FillRectangle(Brushes.Black, 0, 30, 80, 30);
      }
      using (var selector = new Selector(background, false, new Rectangle(0, 0, 80, 60), new Rectangle[0]))
      using (var graphics = Graphics.FromImage(target)) {
        graphics.Clear(Color.Magenta);
        selector.ProcessPointer(new Point(20, 15), false);
        selector.DrawGuides(graphics);
        if (target.GetPixel(5, 15).ToArgb() != Color.Black.ToArgb() ||
            target.GetPixel(60, 15).ToArgb() != Color.White.ToArgb() ||
            target.GetPixel(20, 5).ToArgb() != Color.Black.ToArgb() ||
            target.GetPixel(20, 45).ToArgb() != Color.White.ToArgb() ||
            target.GetPixel(5, 5).ToArgb() != Color.Magenta.ToArgb()) throw new Exception("Adaptive crosshair regression");
        selector.ProcessPointer(new Point(0, 0), false);
        selector.DrawGuides(graphics);
        if (target.GetPixel(79, 0).ToArgb() != Color.White.ToArgb()) throw new Exception("Edge crosshair regression");
      }
    }
    var monitor = new Rectangle(-1200, -200, 1200, 800);
    var hintSize = new Size(336, 258);
    var points = new Point[] { new Point(-1100, -100), new Point(-100, -100), new Point(-1100, 500), new Point(-100, 500) };
    var corners = new Point[] { new Point(-1084, -84), new Point(-452, -84), new Point(-1084, 226), new Point(-452, 226) };
    for (int i = 0; i < points.Length; i++) {
      var hint = Selector.HintBounds(monitor, points[i], hintSize, 16);
      if (hint.Location != corners[i] || !monitor.Contains(hint)) throw new Exception("Pointer-following hint regression");
    }
    using (var background = new Bitmap(200, 120)) {
      background.SetPixel(30, 20, Color.Red);
      var bounds = new Rectangle(-100, -50, 200, 120);
      using (var region = new Selector(background, false, bounds, new Rectangle[0])) {
        // No activation click and no WM_MOUSE events: the first physical drag must suffice.
        region.ProcessPointer(new Point(10, 12), true);
        region.ProcessPointer(new Point(20, 30), true);
        region.ProcessPointer(new Point(80, 65), false);
        if (region.DialogResult != DialogResult.OK || region.SelectedRegion != new Rectangle(10, 12, 70, 53)) throw new Exception("First-drag regression");
      }
      var targets = new Rectangle[] { new Rectangle(-80, -40, 40, 40), new Rectangle(-100, -50, 140, 100) };
      using (var region = new Selector(background, false, bounds, targets)) {
        region.ProcessPointer(new Point(30, 20), false);
        if (region.SelectedRegion != new Rectangle(20, 10, 40, 40)) throw new Exception("Unified hover regression");
        region.ProcessPointer(new Point(30, 20), true);
        if (region.DialogResult == DialogResult.OK) throw new Exception("Mouse-down completed before drag decision");
        region.ProcessPointer(new Point(100, 80), true);
        if (region.SelectedRegion != new Rectangle(30, 20, 70, 60)) throw new Exception("Window-to-region drag regression");
        region.ProcessPointer(new Point(100, 80), false);
        if (region.DialogResult != DialogResult.OK) throw new Exception("Unified drag release regression");
      }
      using (var window = new Selector(background, true, bounds, targets)) {
        window.ProcessPointer(new Point(30, 20), false);
        if (window.SelectedRegion != new Rectangle(20, 10, 40, 40)) throw new Exception("Frozen window hit-test regression");
        window.ProcessPointer(new Point(30, 20), true);
        window.ProcessPointer(new Point(31, 21), false);
        if (window.DialogResult != DialogResult.OK) throw new Exception("First-click regression");
        using (var crop = background.Clone(window.SelectedRegion, PixelFormat.Format32bppRgb)) {
          if (crop.Width != 40 || crop.Height != 40 || crop.GetPixel(10, 10).ToArgb() != Color.Red.ToArgb()) throw new Exception("Frozen pixels regression");
        }
      }
      using (var clipped = new Selector(background, true, bounds, targets)) {
        clipped.ProcessPointer(new Point(100, 80), false);
        if (clipped.SelectedRegion != new Rectangle(0, 0, 140, 100)) throw new Exception("Stacking-order regression");
      }
    }
    return "Native selection checks passed: first drag, first click, frozen window bounds and frozen pixels";
  }
  public static string VerifyAutomaticShow() {
    EnableDpi();
    using (var background = new Bitmap(300, 150))
    using (var selector = new Selector(background, false, new Rectangle(30, 30, 300, 150), new Rectangle[0]))
    using (var check = new Timer()) {
      bool visible = false; bool painted = false;
      check.Interval = 700;
      check.Tick += delegate {
        check.Stop(); visible = IsWindowVisible(selector.Handle); painted = selector.PaintCount > 0;
        selector.Close();
      };
      check.Start();
      selector.ShowDialog();
      if (!visible || !painted) throw new Exception("Selector did not show/paint automatically: visible=" + visible + ", painted=" + painted);
    }
    return "Auto-show check passed without mouse input";
  }
  public static string Capture(string kind, long target, int x, int y, int width, int height, bool cursor) {
    EnableDpi();
    if (kind == "window") {
      RECT rect;
      if (!GetWindowRect(new IntPtr(target), out rect)) throw new Exception("Cannot find target window");
      x = rect.left; y = rect.top; width = rect.right - x; height = rect.bottom - y;
    }
    using (var bitmap = CaptureBitmap(x, y, width, height, cursor))
    using (var output = new MemoryStream()) { bitmap.Save(output, ImageFormat.Png); return Convert.ToBase64String(output.ToArray()); }
  }
  static Bitmap CaptureBitmap(int x, int y, int width, int height, bool cursor) {
    if (width <= 0 || height <= 0) throw new Exception("Invalid capture size");
    var bitmap = new Bitmap(width, height, PixelFormat.Format32bppRgb);
    try {
      using (var graphics = Graphics.FromImage(bitmap)) {
        graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
        if (cursor) {
          var info = new CURSORINFO(); info.cbSize = Marshal.SizeOf(info);
          ICONINFO icon;
          if (GetCursorInfo(ref info) && info.flags == 1 && GetIconInfo(info.hCursor, out icon)) {
            try {
              var dc = graphics.GetHdc();
              try { DrawIconEx(dc, info.pos.x - x - icon.xHotspot, info.pos.y - y - icon.yHotspot, info.hCursor, 0, 0, 0, IntPtr.Zero, 3); }
              finally { graphics.ReleaseHdc(dc); }
            } finally { if (icon.mask != IntPtr.Zero) DeleteObject(icon.mask); if (icon.color != IntPtr.Zero) DeleteObject(icon.color); }
          }
        }
      }
      return bitmap;
    } catch { bitmap.Dispose(); throw; }
  }
}
'@
if ($CompileOnly) { 'Windows capture helper compiled'; exit }
if ($VerifySelection) { [ToolboxCapture]::VerifySelectionFlow(); exit }
if ($VerifyAutoShow) { [ToolboxCapture]::VerifyAutomaticShow(); exit }
if ($Server) {
  [ToolboxCapture]::WarmUp()
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  [Console]::WriteLine('{"type":"ready"}')
  while ($null -ne ($line = [Console]::ReadLine())) {
    try {
      $request = ConvertFrom-Json $line
      if ($request.mode -eq 'verify-auto-show') {
        [void][ToolboxCapture]::VerifyAutomaticShow()
        $image = 'AUTO_SHOW_OK'
      } elseif ($request.mode -eq 'measure-window') {
        $image = [ToolboxCapture]::MeasureWindow([long]$request.handle)
      } elseif ($request.mode -eq 'change-border') {
        $image = [ToolboxCapture]::ChangeBorder([long]$request.handle, [int]$request.delta)
      } elseif (($request.mode -eq 'screen' -or $request.mode -eq 'window') -and $request.cursor -is [bool]) {
        $zoom = 4
        if ($null -ne $request.magnification) { $zoom = [int]$request.magnification }
        $image = [ToolboxCapture]::Select(($request.mode -eq 'window'), $request.cursor, $zoom, ($request.syncDesktop -eq $true))
      } else { throw 'Invalid selection command' }
      [Console]::WriteLine((ConvertTo-Json -Compress @{ type = 'result'; image = $image; bounds = [ToolboxCapture]::LastBounds }))
    } catch {
      [Console]::WriteLine((ConvertTo-Json -Compress @{ type = 'error'; message = $_.Exception.Message }))
    }
  }
  exit
}
if ($Kind -eq 'select-region' -or $Kind -eq 'select-window') {
  [ToolboxCapture]::Select(($Kind -eq 'select-window'), ($IncludeCursor -eq 1))
} else {
  [ToolboxCapture]::Capture($Kind, $Target, $Left, $Top, $Width, $Height, ($IncludeCursor -eq 1))
}
