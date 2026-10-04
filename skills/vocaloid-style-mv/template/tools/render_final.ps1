# Final render (frames -> video -> song mux). Thin wrapper: forwards all arguments to tools/render_final.mjs (see --help).
#   powershell -ExecutionPolicy Bypass -File tools\render_final.ps1 --workers 3 --name mv [--end 226.54] [--preview]   (Author: NikusonP, MIT)
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'render_final.mjs') @args
exit $LASTEXITCODE
