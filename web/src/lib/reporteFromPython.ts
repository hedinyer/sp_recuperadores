import { spawn } from "child_process";
import path from "path";

/**
 * Invoca `client_report.py --json` (misma fuente de verdad que el CLI Python).
 * Útil en desarrollo local: CLIENT_REPORT_PYTHON=1
 */
export async function fetchReporteFilasDesdePython(): Promise<
  Record<string, string>[]
> {
  const repoRoot = path.join(process.cwd(), "..");
  const scriptPath = path.join(repoRoot, "client_report.py");

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, "--json"], {
      cwd: repoRoot,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar client_report.py: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || `client_report.py salió con código ${code}`,
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as Record<string, string>[];
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch {
        reject(new Error("Salida JSON inválida de client_report.py"));
      }
    });
  });
}
