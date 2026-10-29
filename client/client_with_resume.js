//In this file I have added changes to resume the user creation from wherever it stopped
// for example if 3 users created then running the script again will start processing from 4th user
import fs from "fs";
import path from "path";
import { USERS } from "./data.js";

const MAX_ATTEMPTS = 1;

const DATA_FOLDER = path.join("server", "data");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getNextUserToProcess() {
  const count = fs.existsSync(DATA_FOLDER)
    ? fs.readdirSync(DATA_FOLDER).filter((file) => /^\d+\.json$/.test(file)).length
    : 0;

  console.log("Existing user files:", count);

  return count;
}

async function createUserData(user) {
  const response = await fetch(`http://127.0.0.1:7676/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  });

  const body = await response.text();

  return {
    status: response.status,
    body,
  };
}

async function saveUser(user) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await createUserData(user);

    console.log(
      `User ${user.user_id} | Attempt ${attempt} | ` + `HTTP ${result.status} | ${result.body}`,
    );

    if (result.status === 200) {
      console.log(`User ${user.user_id} saved`);
      return;
    }

    if (result.status !== 500) {
      throw new Error(`Stopped on HTTP ${result.status}: ${result.body}`);
    }

    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`Maximum attempts reached for user ${user.user_id}`);
    }

    const delay = Math.min(500 * 2 ** (attempt - 1), 5000);

    console.log(`Retrying in ${delay}ms...`);
    await wait(delay);
  }
}

async function executeTask() {
  const startIndex = getNextUserToProcess();

  if (startIndex < USERS.length) {
    console.log(`Resuming from user ${startIndex + 1}`);
  }

  if (startIndex >= USERS.length) {
    console.log("All users are already processed.");
    return;
  }

  for (let i = startIndex; i < USERS.length; i++) {
    await saveUser(USERS[i]);
  }

  console.log("All users saved successfully!");
}

executeTask().catch((error) => {
  console.error("Client stopped:", error.message);
  process.exitCode = 1;
});
