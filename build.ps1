param([switch]$RebuildGpu, [string]$DistPath = '.\dist')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$converterPython = (Get-Command python -ErrorAction Stop).Source
$converterNode = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path '.\runtime' | Out-Null
if (-not (Test-Path -LiteralPath '.\runtime\node.exe') -or (Get-FileHash -LiteralPath $converterNode).Hash -ne (Get-FileHash -LiteralPath '.\runtime\node.exe').Hash) {
    Copy-Item -LiteralPath $converterNode -Destination '.\runtime\node.exe'
}
if (-not (Test-Path -LiteralPath '.\runtime\Node-LICENSE.txt')) { throw 'Missing Node-LICENSE.txt; obtain LICENSE for the bundled Node version first' }
if ($RebuildGpu -or -not (Test-Path -LiteralPath '.\runtime\gpu\gpu_backend.exe')) {
& $converterPython -m PyInstaller --noconfirm --clean --console --onedir --name 'gpu_backend' --add-data 'engine/gpu-kernel.cu;.' engine/gpu_backend.py
if ($LASTEXITCODE -ne 0) { throw 'GPU helper build failed' }
New-Item -ItemType Directory -Force -Path '.\runtime\gpu' | Out-Null
Copy-Item -Path '.\dist\gpu_backend\*' -Destination '.\runtime\gpu' -Recurse -Force
}
& $converterPython -m PyInstaller --noconfirm --clean --windowed --onedir --distpath $DistPath --name 'NBS红石投影转换器2.10.0' --icon 'desktop/studio.ico' --add-data 'engine;engine' --add-data 'runtime;runtime' --add-data 'desktop;desktop' --add-data 'README-2.4.md;.' --add-data 'README-2.9.md;.' --collect-data webview --copy-metadata pywebview desktop_app.py
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed' }
$converterRelease = Join-Path $DistPath 'NBS红石投影转换器2.10.0'
Copy-Item -LiteralPath '.\README-2.4.md' -Destination (Join-Path $converterRelease '使用说明.md')
Copy-Item -LiteralPath '.\README-2.9.md' -Destination (Join-Path $converterRelease '新版界面说明.md')

Copy-Item -LiteralPath '.\companion\配套模组' -Destination $converterRelease -Recurse -Force


Copy-Item -LiteralPath '.\README-2.10.md' -Destination (Join-Path $converterRelease '版本兼容说明.md')
