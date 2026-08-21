const releases = Array.from({ length: 125 }, (_, index) => ({
  version: `v${24 - Math.floor(index / 10)}.${9 - (index % 10)}.${index % 4}`,
  lts: index % 3 === 0 ? "Krypton" : index % 3 === 1 ? "Jod" : false,
  date: `2026-${String(8 - (index % 8)).padStart(2, "0")}-${String(20 - (index % 18)).padStart(2, "0")}`,
  npm: `11.${index % 7}.0`,
  v8: `13.${index % 10}.1`,
  appleSilicon: true,
  intel: index % 5 !== 0,
  security: index % 17 === 0
}));

const responses = {
  state: {
    versions: ["v22.18.0", "v20.19.4", "v18.20.8", "v14.17.0"],
    defaultVersion: "v22.18.0",
    nvmDirectory: "/Users/developer/.nvm",
    nvmScript: "/Users/developer/.nvm/nvm.sh"
  },
  remote: releases,
  environment: {
    nvmDirectory: "/Users/developer/.nvm",
    nvmScript: "/Users/developer/.nvm/nvm.sh",
    scriptReadable: true,
    directoryWritable: true,
    defaultVersion: "v22.18.0",
    profileConfigured: true,
    profileName: ".zshrc",
    shell: "/bin/zsh",
    architecture: "arm64"
  },
  "project-inspect": {
    name: "example-project",
    source: ".nvmrc",
    requestedVersion: "22",
    resolvedVersion: "v22.18.0"
  }
};

async function loadPreview() {
  localStorage.removeItem("nvm-remote-cache");
  const html = await fetch("../ui/index.html").then((response) => response.text());
  const bridge = '<script src="../tests/ui-preview-bridge.js"></script>';
  const documentSource = html
    .replace("<head>", '<head><base href="../ui/">')
    .replace('<script src="app.js"></script>', `${bridge}<script src="app.js"></script>`);
  window.previewResponses = responses;
  document.querySelector("iframe").srcdoc = documentSource;
}

loadPreview();
