ObjC.import("Foundation");

function readStandardInput() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}

function runTask(executable, arguments) {
  const task = $.NSTask.alloc.init;
  const outputPipe = $.NSPipe.pipe;
  task.launchPath = executable;
  task.arguments = arguments;
  task.standardOutput = outputPipe;
  task.standardError = outputPipe;
  task.launch;
  // Drain while the process is running so large command output cannot fill the pipe and deadlock.
  const outputData = outputPipe.fileHandleForReading.readDataToEndOfFile;
  task.waitUntilExit;
  return {
    status: Number(task.terminationStatus),
    stdout: ObjC.unwrap($.NSString.alloc.initWithDataEncoding(outputData, $.NSUTF8StringEncoding)),
    stderr: ""
  };
}

function clean(value) {
  return String(value || "").replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function expandPath(value) {
  const home = ObjC.unwrap($.NSHomeDirectory());
  const path = String(value || "").trim();
  return path === "~" ? home : path.replace(/^~\//, `${home}/`);
}

function fileExists(path) {
  return Boolean($.NSFileManager.defaultManager.fileExistsAtPath(path));
}

function directoryExists(path) {
  const isDirectory = Ref();
  return Boolean($.NSFileManager.defaultManager.fileExistsAtPathIsDirectory(path, isDirectory))
    && Boolean(isDirectory[0]);
}

function requestPayload(request) {
  return request.params && request.params.payload || {};
}

function findNVM(payload) {
  const home = ObjC.unwrap($.NSHomeDirectory());
  const custom = expandPath(payload.nvmDirectory || "");
  const candidates = [];
  if (custom) candidates.push({ directory: custom, script: `${custom}/nvm.sh` });
  candidates.push(
    { directory: `${home}/.nvm`, script: `${home}/.nvm/nvm.sh` },
    { directory: `${home}/.nvm`, script: "/opt/homebrew/opt/nvm/nvm.sh" },
    { directory: `${home}/.nvm`, script: "/usr/local/opt/nvm/nvm.sh" }
  );
  const location = candidates.find((item) => fileExists(item.script));
  if (!location) throw new Error("没有找到 NVM，请确认 ~/.nvm/nvm.sh 存在或设置自定义目录");
  return location;
}

function runNVM(command, payload) {
  const location = findNVM(payload);
  const script = [
    `export NVM_DIR=${shellQuote(location.directory)}`,
    "export NVM_NO_COLORS=1",
    `source ${shellQuote(location.script)}`,
    command
  ].join("; ");
  const result = runTask("/bin/zsh", ["-c", script]);
  const output = clean(`${result.stdout}\n${result.stderr}`);
  if (result.status !== 0) throw new Error(output || "NVM 命令执行失败");
  return { output, location };
}

function versionParts(version) {
  return String(version).replace(/^v/, "").split(".").map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (b[index] || 0) - (a[index] || 0);
  }
  return 0;
}

function validVersion(value) {
  const version = String(value || "").trim();
  if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error("Node.js 版本格式无效");
  return version;
}

function nvmState(payload) {
  const listed = runNVM("nvm ls --no-colors", payload);
  const alias = runNVM("nvm alias default --no-colors || true", payload).output;
  const versions = Array.from(new Set(listed.output.match(/\bv\d+\.\d+\.\d+\b/g) || []))
    .sort(compareVersions);
  const defaultMatch = alias.match(/\bv\d+\.\d+\.\d+\b/);
  return {
    versions,
    defaultVersion: defaultMatch ? defaultMatch[0] : null,
    nvmDirectory: listed.location.directory,
    nvmScript: listed.location.script
  };
}

function remoteVersions() {
  const urls = [
    "https://nodejs.org/dist/index.tab",
    "https://npmmirror.com/mirrors/node/index.tab"
  ];
  let body = "";
  for (const url of urls) {
    const result = runTask("/usr/bin/curl", [
      "-L", "-sS", "--connect-timeout", "5", "--max-time", "20", url
    ]);
    if (result.status === 0 && result.stdout.startsWith("version\t")) {
      body = result.stdout;
      break;
    }
  }
  if (!body) throw new Error("无法读取 Node.js 在线版本索引");
  const lines = body.trim().split(/\r?\n/);
  const headers = lines.shift().split("\t");
  return lines.map((line) => {
    const values = line.split("\t");
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const files = new Set((item.files || "").split(","));
    return {
      version: item.version,
      date: item.date,
      npm: item.npm,
      v8: item.v8,
      lts: item.lts && item.lts !== "-" ? item.lts : null,
      security: item.security === "true",
      appleSilicon: files.has("osx-arm64-tar"),
      intel: files.has("osx-x64-tar")
    };
  });
}

function readFile(path) {
  const result = runTask("/bin/cat", [path]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function inspectProject(payload) {
  const path = expandPath(payload.path);
  if (!directoryExists(path)) throw new Error("项目目录不存在");
  const candidates = [
    { source: ".nvmrc", value: readFile(`${path}/.nvmrc`) },
    { source: ".node-version", value: readFile(`${path}/.node-version`) }
  ];
  let requirement = candidates.find((item) => item.value);
  if (!requirement) {
    const packageText = readFile(`${path}/package.json`);
    if (packageText) {
      try {
        const packageJSON = JSON.parse(packageText);
        const value = packageJSON.engines && packageJSON.engines.node;
        if (value) requirement = { source: "package.json engines.node", value };
      } catch (_) {}
    }
  }
  const state = nvmState(payload);
  let resolvedVersion = null;
  if (requirement && /^[vV]?\d+(?:\.\d+){0,2}$/.test(requirement.value)) {
    const result = runNVM(`nvm version ${shellQuote(requirement.value)} || true`, payload).output;
    const match = result.match(/\bv\d+\.\d+\.\d+\b/);
    resolvedVersion = match ? match[0] : null;
  }
  return {
    path,
    name: path.split("/").filter(Boolean).pop() || path,
    source: requirement ? requirement.source : null,
    requestedVersion: requirement ? requirement.value : null,
    resolvedVersion,
    installed: resolvedVersion ? state.versions.includes(resolvedVersion) : false
  };
}

function writeProjectVersion(payload) {
  const path = expandPath(payload.path);
  const version = validVersion(payload.version);
  if (!directoryExists(path)) throw new Error("项目目录不存在");
  const target = `${path}/.nvmrc`;
  const written = $(version + "\n").writeToFileAtomicallyEncodingError(
    target,
    true,
    $.NSUTF8StringEncoding,
    null
  );
  if (!written) throw new Error("无法写入 .nvmrc");
  return inspectProject(Object.assign({}, payload, { path }));
}

function openTerminal(payload, projectPath) {
  const location = findNVM(payload);
  const version = payload.version ? validVersion(payload.version) : "";
  const commands = [];
  if (projectPath) commands.push(`cd ${shellQuote(expandPath(projectPath))}`);
  commands.push(`export NVM_DIR=${shellQuote(location.directory)}`);
  commands.push(`source ${shellQuote(location.script)}`);
  commands.push(version ? `nvm use ${shellQuote(version)}` : "nvm use");
  const command = commands.join(" && ");
  const appleScript = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(command)}\nend tell`;
  const result = runTask("/usr/bin/osascript", ["-e", appleScript]);
  if (result.status !== 0) throw new Error(clean(result.stderr) || "无法打开 Terminal");
}

function environmentState(payload) {
  const state = nvmState(payload);
  const home = ObjC.unwrap($.NSHomeDirectory());
  const shell = $.NSProcessInfo.processInfo.environment.objectForKey("SHELL")
    ? ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey("SHELL"))
    : "/bin/zsh";
  const profileName = shell.endsWith("bash") ? ".bashrc" : ".zshrc";
  const profile = readFile(`${home}/${profileName}`);
  return Object.assign({}, state, {
    shell,
    architecture: ObjC.unwrap($.NSProcessInfo.processInfo.operatingSystemVersionString)
      + " · " + runTask("/usr/bin/uname", ["-m"]).stdout.trim(),
    scriptReadable: fileExists(state.nvmScript),
    directoryWritable: Boolean($.NSFileManager.defaultManager.isWritableFileAtPath(state.nvmDirectory)),
    profileName,
    profileConfigured: profile.includes("nvm.sh") || profile.includes("NVM_DIR")
  });
}

function success(id, title, message, detail) {
  return JSON.stringify({ jsonrpc: "2.0", id, result: { title, message, detail } });
}

function failure(id, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } });
}

function resultJSON(id, title, message, value) {
  return success(id, title, message, JSON.stringify(value));
}

function run() {
  let request = null;
  try {
    request = JSON.parse(readStandardInput().trim());
    const payload = requestPayload(request);
    switch (request.method) {
      case "nvm.state":
        return resultJSON(request.id, "NVM 状态", "已刷新已安装版本", nvmState(payload));
      case "nvm.remote": {
        const releases = remoteVersions();
        return resultJSON(request.id, "在线版本", `读取到 ${releases.length} 个版本`, releases);
      }
      case "nvm.install": {
        const version = validVersion(payload.version);
        const output = runNVM(`nvm install ${shellQuote(version)}`, payload).output;
        return success(request.id, "安装完成", `${version} 已安装`, output.slice(-4000));
      }
      case "nvm.uninstall": {
        const version = validVersion(payload.version);
        const state = nvmState(payload);
        if (state.defaultVersion === version) throw new Error("请先选择另一个默认版本，再卸载当前默认版本");
        runNVM(`nvm uninstall ${shellQuote(version)}`, payload);
        return success(request.id, "卸载完成", `${version} 已卸载`, "");
      }
      case "nvm.default": {
        const version = validVersion(payload.version);
        if (!nvmState(payload).versions.includes(version)) {
          throw new Error(`${version} 尚未安装，不能设为默认版本`);
        }
        runNVM(`nvm alias default ${shellQuote(version)}`, payload);
        return success(request.id, "默认版本已更新", `${version} 已设为默认版本`, "");
      }
      case "nvm.terminal":
        openTerminal(payload, null);
        return success(request.id, "Terminal 已打开", `已加载 ${validVersion(payload.version)}`, "");
      case "project.inspect":
        return resultJSON(request.id, "项目状态", "项目版本检查完成", inspectProject(payload));
      case "project.write":
        return resultJSON(request.id, "项目版本已更新", ".nvmrc 已写入", writeProjectVersion(payload));
      case "project.terminal":
        openTerminal(payload, payload.path);
        return success(request.id, "Terminal 已打开", "已在项目目录加载 Node.js 版本", "");
      case "environment.inspect":
        return resultJSON(request.id, "环境检查", "NVM 环境检查完成", environmentState(payload));
      default:
        return failure(request.id, "Method not found");
    }
  } catch (error) {
    return failure(request && request.id || null, String(error.message || error));
  }
}
