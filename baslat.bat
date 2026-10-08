@echo off
rem Uygulamayi yerel sunucuda acar. Cevrimdisi calisma ve "uygulamayi yukle"
rem ozellikleri dosyaya cift tiklayinca degil, ancak bu sekilde calisir.
cd /d "%~dp0"
start "" http://localhost:8765/
python -m http.server 8765
