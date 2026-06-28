
# Docker 部署

本文档记录使用 Docker 运行 Agent Spaces Server 的常用命令。当前 Web 前端已经在镜像构建阶段打包（`scripts/copy-web.mjs`）并复制到 Server 镜像中，不需要单独启动 Web 容器。

## 快速开始（npm 脚本）

仓库根目录 `package.json` 提供了封装好的 Docker 脚本，等价于底层的 `docker build` / `docker compose` 命令：

```bash
pnpm build:docker   # = docker build -f Dockerfile.server -t agent-spaces-server:latest .
pnpm up             # = docker compose up -d --build
```

镜像基于 `Dockerfile.server`（多阶段构建），最终镜像内仅包含 Server 编译产物（`dist/`）、静态资源（`public/`）、内置 Web 资源（`web/`）与 `node_modules`，监听 `3100` 端口，数据目录为 `/root/.agent-spaces-data`。

## 安装 Docker

### Windows

推荐安装 Docker Desktop：

```powershell
winget install Docker.DockerDesktop
```

安装完成后启动 Docker Desktop，并确认命令可用：

```powershell
docker --version
docker compose version
```

### macOS

推荐安装 Docker Desktop：

```bash
brew install --cask docker
```

安装完成后启动 Docker Desktop，并确认命令可用：

```bash
docker --version
docker compose version
```

### Linux

Debian / Ubuntu 可使用 Docker 官方安装脚本：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

重新登录 shell 后确认命令可用：

```bash
docker --version
docker compose version
```

## 构建并导出镜像

项目提供了构建并导出 tar 包的脚本。

Windows PowerShell：

```powershell
.\scripts\build-export.ps1
```

Linux / macOS：

```bash
sh ./scripts/build-export.sh
```

默认输出文件：

```text
agent_spaces-server.latest.tar
```

如需指定镜像名和输出路径：

```powershell
.\scripts\build-export.ps1 -ImageRef "agent_spaces-server:v1" -OutputPath ".\dist\agent_spaces-server.v1.tar"
```

```bash
sh ./scripts/build-export.sh agent_spaces-server:v1 ./dist/agent_spaces-server.v1.tar
```

## 导入镜像

将 tar 文件复制到目标机器后执行：

```bash
docker load -i agent_spaces-server.latest.tar
```

确认镜像已导入：

```bash
docker images agent_spaces-server
```

## 启动容器

使用 `docker run` 启动：

```bash
docker run -d \
  --name agent-spaces-server \
  --restart unless-stopped \
  -p 3100:3100 \
  -e PORT=3100 \
  -e HOST=0.0.0.0 \
  -e AGENT_SPACES_DATA_DIR=/root/.agent-spaces-data \
  -v agent-spaces-data:/root/.agent-spaces-data \
  agent_spaces-server:latest
```

访问：

```text
http://localhost:3100
```

查看日志：

```bash
docker logs -f agent-spaces-server
```

停止并删除容器：

```bash
docker stop agent-spaces-server
docker rm agent-spaces-server
```

## 使用 Docker Compose

仓库根目录已提供 `docker-compose.yml`，只包含 `server` 服务（与 `pnpm up` 等价）。

构建并启动：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f server
```

停止服务：

```bash
docker compose down
```

保留数据卷时不要添加 `-v`；如需同时删除数据卷：

```bash
docker compose down -v
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3100` | Server 监听端口 |
| `HOST` | `0.0.0.0` | Server 监听地址 |
| `AGENT_SPACES_DATA_DIR` | `/root/.agent-spaces-data` | 容器内数据目录 |

需要接入模型服务时，可按实际环境追加 API Key 或 Base URL：

```bash
docker run -d \
  --name agent-spaces-server \
  --restart unless-stopped \
  -p 3100:3100 \
  -e ANTHROPIC_API_KEY="your-key" \
  -e ANTHROPIC_BASE_URL="https://api.anthropic.com" \
  -v agent-spaces-data:/root/.agent-spaces-data \
  agent_spaces-server:latest
```
