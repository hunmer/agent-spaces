import http from "node:http";
import next from "next";
import { launchEditorMiddleware } from "@react-dev-inspector/middleware";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port, dir: process.cwd(), webpack: true });
const handle = app.getRequestHandler();

await app.prepare();

const server = http.createServer((req, res) => {
    if (dev) {
      launchEditorMiddleware(req, res, () => handle(req, res));
      return;
    }

    handle(req, res);
  });

if (dev) {
  server.on("upgrade", app.getUpgradeHandler());
}

server.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
