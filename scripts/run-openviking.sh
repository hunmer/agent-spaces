#!/usr/bin/env bash
# 启动 openviking-server（带 bot），并将 OPENVIKING_CONFIG_FILE 指向脚本所在目录下的 .openviking/ov.conf
set -euo pipefail

# 定位脚本所在目录（兼容符号链接与任意调用位置）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONF_DIR="${PROJECT_DIR}/.openviking"
CONF_FILE="${CONF_DIR}/ov.conf"

# 配置目录缺失则创建（ov.conf 文件需自行准备）
if [ ! -d "${CONF_DIR}" ]; then
  mkdir -p "${CONF_DIR}"
fi

export OPENVIKING_CONFIG_FILE="${CONF_FILE}"

echo "[openviking] PROJECT_DIR=${PROJECT_DIR}"
echo "[openviking] OPENVIKING_CONFIG_FILE=${OPENVIKING_CONFIG_FILE}"

exec openviking-server --with-bot "$@"
