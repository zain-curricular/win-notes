# Presses a key combination in the Notes window through SendInput, the same path a physical keyboard uses,
# so Windows applies the active keyboard layout and its AltGr rules. -Layout switches that window's layout first.
param([string]$Combo = '', [string]$Layout = '')

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class K {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  public static void Key(ushort vk, bool up) {
    var i = new INPUT[1];
    i[0].type = 1;
    i[0].u.ki.wVk = vk;
    // A physical keyboard always sends its scan code; the browser derives KeyboardEvent.code from it.
    i[0].u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
    // Right Alt (AltGr) is an extended key.
    i[0].u.ki.dwFlags = (up ? 2u : 0u) | (vk == 0xA5 ? 1u : 0u);
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@

$hwnd = (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
if (-not $hwnd) { throw 'Notes window not found' }

if ([K]::GetForegroundWindow() -ne $hwnd) {
  # Windows only lets the process that last had input change the foreground window; a tap of Alt gives us that.
  [K]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [K]::SetForegroundWindow($hwnd) | Out-Null
  [K]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 300
}
"foreground={0}" -f ([K]::GetForegroundWindow() -eq $hwnd)

if ($Layout) {
  $hkl = [K]::LoadKeyboardLayout($Layout, 1)
  [K]::PostMessage($hwnd, 0x50, [IntPtr]::Zero, $hkl) | Out-Null  # WM_INPUTLANGCHANGEREQUEST
  Start-Sleep -Milliseconds 600
  $thread = [K]::GetWindowThreadProcessId($hwnd, [IntPtr]::Zero)
  "layout={0:x8}" -f [K]::GetKeyboardLayout($thread).ToInt64()
}

if ($Combo) {
  $named = @{ ctrl = 0x11; alt = 0x12; shift = 0x10; altgr = 0xA5; esc = 0x1B; enter = 0x0D }
  $codes = @(foreach ($part in $Combo.ToLower().Split('+')) {
      if ($named.ContainsKey($part)) { $named[$part] }
      elseif ($part.Length -eq 1) { [int][char]$part.ToUpper() }
      else { throw "Unknown key '$part'" }
    })
  foreach ($c in $codes) { [K]::Key([uint16]$c, $false); Start-Sleep -Milliseconds 40 }
  [array]::Reverse($codes)
  foreach ($c in $codes) { [K]::Key([uint16]$c, $true); Start-Sleep -Milliseconds 40 }
}
