import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function startServer(retryCount = 0) {
  const server = app.listen(port, () => {
    logger.info(
      { port, retryCount: retryCount > 0 ? retryCount : undefined },
      "Server listening",
    );
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE" && retryCount < 10) {
      logger.warn(
        { port, retryCount },
        "Port already in use, retrying in 2 seconds...",
      );
      setTimeout(() => startServer(retryCount + 1), 2000);
    } else {
      logger.error({ err, retryCount }, "Server error");
      process.exit(1);
    }
  });
}

startServer();
