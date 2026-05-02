import http from "node:http";
import next from "next";
import { launchEditorMiddleware } from "@react-dev-inspector/middleware";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

http
  .createServer((req, res) => {
    if (dev) {
      launchEditorMiddleware(req, res, () => handle(req, res));
      return;
    }

    handle(req, res);
  })
  .listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
