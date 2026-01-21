import os
import platform
import subprocess
from datetime import datetime

import psutil
from flask import Flask, jsonify, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static",
)

BAD_CPU_HINTS = ("family", "model", "stepping", "genuineintel", "authenticamd")

def _is_bad_cpu_string(s: str) -> bool:
    if not s:
        return True
    low = s.strip().lower()
    return any(h in low for h in BAD_CPU_HINTS)

def _run_shell(cmd: str) -> str:
    """Run a shell command and return stdout (strip). Never raises."""
    try:
        out = subprocess.check_output(
            cmd,
            shell=True,
            stderr=subprocess.DEVNULL,
            text=True
        )
        return out.strip()
    except Exception:
        return ""

def get_cpu_model_pretty() -> str:
    system = platform.system().lower()

    # ---------------------------
    # WINDOWS: lấy tên CPU đẹp
    # ---------------------------
    if system == "windows":
        # 1) PowerShell (khuyên dùng, sạch, ổn)
        ps = _run_shell(
            r'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)"'
        )
        if ps and not _is_bad_cpu_string(ps):
            return ps

        # 2) WMIC (cũ nhưng vẫn hay có)
        wmic = _run_shell(r'wmic cpu get name /value')
        # output kiểu: Name=Intel(R) ...
        if wmic:
            for line in wmic.splitlines():
                line = line.strip()
                if line.lower().startswith("name="):
                    name = line.split("=", 1)[1].strip()
                    if name and not _is_bad_cpu_string(name):
                        return name

        # 3) Fallback
        p = (platform.processor() or "").strip()
        if p and not _is_bad_cpu_string(p):
            return p

        return "Unknown CPU"

    # ---------------------------
    # LINUX: ưu tiên lscpu -> /proc/cpuinfo -> dmidecode -> fallback
    # ---------------------------
    # 1) lscpu
    lscpu = _run_shell(r"bash -lc ""LC_ALL=C lscpu | awk -F: '/Model name/ {print $2; exit}'""")
    if lscpu and not _is_bad_cpu_string(lscpu):
        return lscpu.strip()

    # 2) /proc/cpuinfo
    try:
        with open("/proc/cpuinfo", "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    name = line.split(":", 1)[1].strip()
                    if name and not _is_bad_cpu_string(name):
                        return name
    except Exception:
        pass

    # 3) dmidecode (có thể cần root, container hay bị chặn)
    dmi = _run_shell(
        r"bash -lc ""sudo -n dmidecode -t processor 2>/dev/null | awk -F: '/Version/ {print $2; exit}'"""
    )
    if dmi and not _is_bad_cpu_string(dmi):
        return dmi.strip()

    # 4) fallback
    p = (platform.processor() or "").strip()
    if p and not _is_bad_cpu_string(p):
        return p

    return "Unknown CPU"


def get_stats():
    cpu_percent = psutil.cpu_percent(interval=0.4)
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    try:
        disk = psutil.disk_usage("/")
    except Exception:
        disk = psutil.disk_usage(BASE_DIR)

    cpu_model = get_cpu_model_pretty()
    cpu_cores = psutil.cpu_count(logical=False) or 0
    cpu_threads = psutil.cpu_count(logical=True) or 0
    cpu_arch = platform.machine() or "unknown"

    return {
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

        "cpu_percent": float(cpu_percent),
        "cpu_model": cpu_model,
        "cpu_cores": cpu_cores,
        "cpu_threads": cpu_threads,
        "cpu_arch": cpu_arch,

        "mem_used_mb": mem.used / 1024 / 1024,
        "mem_total_mb": mem.total / 1024 / 1024,
        "mem_percent": float(mem.percent),

        "swap_used_mb": swap.used / 1024 / 1024,
        "swap_total_mb": (swap.total / 1024 / 1024) if swap.total else 0,
        "swap_percent": float(swap.percent) if swap.total else 0,

        "disk_used_gb": disk.used / 1024 / 1024 / 1024,
        "disk_total_gb": disk.total / 1024 / 1024 / 1024,
        "disk_percent": float(disk.percent),
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stats")
def api_stats():
    return jsonify(get_stats())

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "2026"))
    app.run(host="0.0.0.0", port=port)
