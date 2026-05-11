import { execFileSync } from "node:child_process";

const ports = [5050, 5173, 5174];

if (process.platform !== "win32") {
  process.exit(0);
}

const ps = `
$ports = @(${ports.join(",")})
$pids = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pidValue in $pids) {
  Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
  Write-Host "Stopped process $pidValue on Monimala dev port"
}
`;

try {
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    stdio: "inherit"
  });
} catch {
  process.exit(0);
}
