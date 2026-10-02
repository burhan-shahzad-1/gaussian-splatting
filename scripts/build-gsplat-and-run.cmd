@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" || exit /b 1
set "CUDA_HOME=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.3"
set "DISTUTILS_USE_SDK=1"
set "TORCH_CUDA_ARCH_LIST=8.9"
set "WITH_SYMBOLS=1"
set "CUDA_PATH=%CUDA_HOME%"
set "BUILD_EXPERIMENTAL=0"
set "PATH=%CUDA_HOME%\bin;%PATH%"
echo CUDA_HOME=%CUDA_HOME%
where nvcc
where cl
"c:\Users\asimb\Desktop\3D Video (GSplat)\reconstructor\.venv\Scripts\pip.exe" install --disable-pip-version-check --no-build-isolation --no-deps -e "c:\Users\asimb\Desktop\3D Video (GSplat)\third_party\gsplat"
if errorlevel 1 exit /b 1
"c:\Users\asimb\Desktop\3D Video (GSplat)\reconstructor\.venv\Scripts\python.exe" -c "import gsplat,torch; print('gsplat_ok', gsplat.__version__, 'cuda', torch.cuda.is_available())"
if errorlevel 1 exit /b 1
cd /d "c:\Users\asimb\Desktop\3D Video (GSplat)\reconstructor"
"c:\Users\asimb\Desktop\3D Video (GSplat)\reconstructor\.venv\Scripts\python.exe" process.py job --job-id 93bfaf36-0aa3-4a84-afb0-d3ec9e3d741b
exit /b %ERRORLEVEL%
