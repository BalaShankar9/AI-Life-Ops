import { createApp, logger, prisma } from "./app";

const port = Number(process.env.PORT) || 4000;
const app = createApp();

const server = app.listen(port, () => {
  logger.info({ port }, "API listening");
});

async function shutdown() {
  server.close(() => {
    logger.info("API server stopped");
  });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
