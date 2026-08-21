#!/bin/zsh

set -euo pipefail

plugin_root="${0:A:h:h}"
backend="$plugin_root/bin/nvm-plugin"

invoke() {
  local method="$1"
  local payload="$2"
  jq -cn --arg method "$method" --argjson payload "$payload" \
    '{jsonrpc:"2.0",id:"test",method:$method,params:{payload:$payload}}' | "$backend"
}

jq empty "$plugin_root/plugin.json"
node --check "$plugin_root/ui/app.js"
node --check "$plugin_root/lib/nvm-plugin.js"

state="$(invoke nvm.state '{}')"
jq -e '.result.detail | fromjson | .versions | type == "array"' <<< "$state" >/dev/null

environment="$(invoke environment.inspect '{}')"
jq -e '.result.detail | fromjson | .nvmScript | endswith("nvm.sh")' <<< "$environment" >/dev/null

project="$(invoke project.inspect "$(jq -cn --arg path "$plugin_root" '{path:$path}')")"
jq -e --arg path "$plugin_root" '.result.detail | fromjson | .path == $path' <<< "$project" >/dev/null

invalid="$(invoke nvm.default '{"version":"v0.0.0"}')"
jq -e '.error.message | contains("尚未安装")' <<< "$invalid" >/dev/null

print "NVM backend checks passed"
