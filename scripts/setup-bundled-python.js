/**
 * Automated Bundled Python Setup Script for AI Plate.
 *
 * Downloads and configures the official standalone embeddable Python distribution
 * for Windows, uncomments 'import site' in the ._pth file to enable site-packages,
 * installs pip, and verifies self-contained execution.
 */

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");
const PYTHON_DIR = path.join(RUNTIME_DIR, "python");
const PYTHON_EXE = path.join(PYTHON_DIR, "python.exe");

const PYTHON_VERSION = "3.11.9";
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

/**
 * Robust HTTP/HTTPS download helper with redirect support.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function get(currentUrl) {
      const client = currentUrl.startsWith("https") ? https : http;
      client
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith("http")) {
              const parsed = new URL(currentUrl);
              nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
            }
            return get(nextUrl);
          }

          if (res.statusCode !== 200) {
            file.close();
            try { fs.unlinkSync(destPath); } catch {}
            return reject(new Error(`Failed to download ${currentUrl}: HTTP ${res.statusCode}`));
          }

          res.pipe(file);
          file.on("finish", () => {
            file.close(() => resolve(destPath));
          });
        })
        .on("error", (err) => {
          file.close();
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
    }

    get(url);
  });
}

async function setupBundledPython() {
  console.log("🐍 [Python Setup] Checking bundled Python runtime in:", PYTHON_DIR);

  // Check if already functional
  if (fs.existsSync(PYTHON_EXE)) {
    try {
      const ver = execSync(`"${PYTHON_EXE}" -V`, { encoding: "utf-8" }).trim();
      console.log(`✔ [Python Setup] Bundled Python already installed & active: ${ver}`);

      // Check pip
      try {
        const pipVer = execSync(`"${PYTHON_EXE}" -m pip --version`, { encoding: "utf-8" }).trim();
        console.log(`✔ [Python Setup] Bundled pip verified: ${pipVer}`);
        return;
      } catch {
        console.log("⚠️ [Python Setup] Python is present, but pip is missing. Bootstrapping pip...");
      }
    } catch {
      console.log("⚠️ [Python Setup] Existing python binary corrupted or unverified. Reinstalling...");
    }
  }

  // Ensure directories exist
  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  if (!fs.existsSync(PYTHON_DIR)) fs.mkdirSync(PYTHON_DIR, { recursive: true });

  const tempZip = path.join(RUNTIME_DIR, `python-${PYTHON_VERSION}-embed-amd64.zip`);
  const getPipScript = path.join(PYTHON_DIR, "get-pip.py");

  try {
    // 1. Download official embeddable package if python.exe not present
    if (!fs.existsSync(PYTHON_EXE)) {
      console.log(`⬇ [Python Setup] Downloading standalone Python ${PYTHON_VERSION} embeddable package...`);
      await downloadFile(PYTHON_ZIP_URL, tempZip);
      console.log("📦 [Python Setup] Extracting into runtime/python...");

      const zip = new AdmZip(tempZip);
      zip.extractAllTo(PYTHON_DIR, true);

      try { fs.unlinkSync(tempZip); } catch {}
    }

    // 2. Enable site-packages in python311._pth
    console.log("⚙️ [Python Setup] Configuring python._pth to enable site-packages & pip...");
    const files = fs.readdirSync(PYTHON_DIR);
    const pthFile = files.find((f) => f.endsWith("._pth"));
    if (pthFile) {
      const pthPath = path.join(PYTHON_DIR, pthFile);
      let content = fs.readFileSync(pthPath, "utf-8");
      // Uncomment 'import site' if commented, or append it
      if (content.includes("#import site")) {
        content = content.replace("#import site", "import site");
      } else if (!content.includes("import site")) {
        content += "\nimport site\n";
      }
      fs.writeFileSync(pthPath, content, "utf-8");
    }

    // 3. Download & run get-pip.py
    console.log("⬇ [Python Setup] Downloading get-pip.py...");
    await downloadFile(GET_PIP_URL, getPipScript);

    console.log("🔧 [Python Setup] Installing pip into isolated runtime...");
    execSync(`"${PYTHON_EXE}" "${getPipScript}" --no-warn-script-location`, {
      cwd: PYTHON_DIR,
      stdio: "inherit",
    });

    try { fs.unlinkSync(getPipScript); } catch {}

    // 4. Verify installation
    const ver = execSync(`"${PYTHON_EXE}" -V`, { encoding: "utf-8" }).trim();
    const pipVer = execSync(`"${PYTHON_EXE}" -m pip --version`, { encoding: "utf-8" }).trim();

    console.log("\n=======================================================");
    console.log("🎉 [Python Setup] Bundled Python Successfully Installed!");
    console.log(`   Python Engine: ${ver} (${PYTHON_EXE})`);
    console.log(`   Package Manager: ${pipVer}`);
    console.log("=======================================================\n");
  } catch (err) {
    console.error("❌ [Python Setup] Error setting up bundled Python:", err.message);
    throw err;
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupBundledPython().catch((err) => {
    process.exit(1);
  });
}

export { setupBundledPython };
