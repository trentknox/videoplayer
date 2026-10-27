# Starts this computer's private Vivid SSH tunnel. This does not open a public port.
$ErrorActionPreference = 'Stop'
$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3021 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($process.ProcessName -eq 'ssh') { Write-Output 'An SSH process is already listening on the Vivid local port.'; exit 0 }
    throw 'Port 3021 is already in use by another program. No tunnel was started.'
}
$process = Start-Process -FilePath 'ssh.exe' -ArgumentList @('-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-L', '127.0.0.1:3021:127.0.0.1:3021', 'ccm-stream') -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($process.HasExited) { throw 'SSH exited before the tunnel was ready. Check the ccm-stream connection.' }
    if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3021 -State Listen -ErrorAction SilentlyContinue) { Write-Output 'Vivid private tunnel is ready.'; exit 0 }
}
throw 'The tunnel did not become ready. Check the ccm-stream connection.'
