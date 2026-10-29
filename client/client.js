//In this script user data will get process one by one by retrying for max 5 times for each user
//if retry attempt completed then client script will stop and has to rerun the client again
import { USERS } from "./data.js";

const MAX_ATTEMPTS = 5;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createUserData(user) {
  const response = await fetch("http://127.0.0.1:7676/", {
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
      throw new Error(`Maximum retries reached for user ${user.user_id}`);
    }

    const delay = Math.min(500 * 2 ** (attempt - 1), 5000);
    console.log(`Retrying in ${delay}ms...`);
    await wait(delay);
  }
}

async function executeTask() {
  for (const user of USERS) {
    await saveUser(user);
  }

  console.log("All users saved successfully!");
}

executeTask().catch((error) => {
  console.error("Client stopped:", error.message);
  process.exitCode = 1;
});
