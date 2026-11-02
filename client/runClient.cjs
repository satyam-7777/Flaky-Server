const { executeTask } = require("./client.cjs");

executeTask().catch((error) => {
  console.error("Client stopped:", error.message);
  process.exitCode = 1;
});
