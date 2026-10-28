import { startStaticServer } from "./lib/static-server.mjs";

const port = Number(process.env.PORT || process.argv[2] || 3000);
const server = await startStaticServer({ port });

console.log(`NeuroSync is available at ${server.origin}`);
console.log("Press Ctrl+C to stop the server.");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
