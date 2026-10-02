$ErrorActionPreference = "Stop"
$Root = "c:\Users\asimb\Desktop\3D Video (GSplat)"
$VenvPip = Join-Path $Root "reconstructor\.venv\Scripts\pip.exe"
$VenvPy = Join-Path $Root "reconstructor\.venv\Scripts\python.exe"
$Wheels = Join-Path $Root "third_party\wheels"
$Torch = Join-Path $Wheels "torch-2.6.0+cu124-cp313-cp313-win_amd64.whl"
$Tv = Join-Path $Wheels "torchvision-0.21.0+cu124-cp313-cp313-win_amd64.whl"
$JobId = "fa8270de-1e39-4257-a795-63915ad0056f"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "Installing torch from complete wheel..."
& $VenvPip install --disable-pip-version-check --force-reinstall --no-deps $Torch
if ($LASTEXITCODE -ne 0) { throw "torch install failed" }

Write-Host "Installing torchvision..."
& $VenvPip install --disable-pip-version-check --force-reinstall --no-deps $Tv
if ($LASTEXITCODE -ne 0) { throw "torchvision install failed" }

# torch deps that --no-deps skipped
& $VenvPip install --disable-pip-version-check filelock typing-extensions networkx jinja2 fsspec sympy==1.13.1 setuptools

Write-Host "Installing gsplat editable..."
& $VenvPip install --disable-pip-version-check -e (Join-Path $Root "third_party\gsplat")

Write-Host "Verify CUDA..."
& $VenvPy -c "import torch; print(torch.__version__, 'cuda', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no gpu')"

Write-Host "Run job $JobId"
Set-Location (Join-Path $Root "reconstructor")
& $VenvPy process.py job --job-id $JobId
Write-Host "DONE exit=$LASTEXITCODE"
exit $LASTEXITCODE
