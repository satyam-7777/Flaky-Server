const USERS = require("./data.js");
const fs = require("fs/promises");
const path = require("path");

const PROGRESS_FILE = path.join(__dirname, "progress.json");
const DATA_DIR = path.join(__dirname, "../server/data");

const SERVER_URL = "http://127.0.0.1:7676/";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadProgress(filePath = PROGRESS_FILE, fileSystem = fs, totalUsers = USERS.length) {
  try {
    const fileContent = await fileSystem.readFile(filePath, "utf8");

    const progress = JSON.parse(fileContent);

    if (!Array.isArray(progress.savedUsers)) {
      throw new Error("Invalid progress file: savedUsers must be an array");
    }

    return progress;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        savedUsers: [],
        lastSavedUser: null,
        totalUsers,
      };
    }

    throw error;
  }
}

async function saveProgress(progress, filePath = PROGRESS_FILE, fileSystem = fs) {
  const fileContent = JSON.stringify(progress, null, 2);

  await fileSystem.writeFile(filePath, fileContent, "utf8");
}

async function createUserData(user, fetchImpl = fetch) {
  const response = await fetchImpl(SERVER_URL, {
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

async function saveUser(
  user,
  {
    progress,
    fetchImpl = fetch,
    waitFn = wait,
    saveProgressFn = saveProgress,
    log = console.log,
    progressFilePath = PROGRESS_FILE,
    fileSystem = fs,
  },
) {
  let attempt = 0;

  while (true) {
    attempt++;

    const result = await createUserData(user, fetchImpl);

    log(`User ${user.user_id} | Attempt ${attempt} | HTTP ${result.status} | ${result.body}`);

    if (result.status === 200) {
      if (!progress.savedUsers.includes(user.user_id)) {
        progress.savedUsers.push(user.user_id);
      }

      progress.lastSavedUser = user.user_id;

      await saveProgressFn(progress, progressFilePath, fileSystem);

      log(`User ${user.user_id} saved successfully`);

      return;
    }

    if (result.status !== 500) {
      throw new Error(`Stopped on HTTP ${result.status}: ${result.body}`);
    }

    const delay = Math.min(500 * 2 ** (attempt - 1), 5000);

    log(`Retrying in ${delay}ms...`);

    await waitFn(delay);
  }
}

async function cleanupGeneratedFiles(
  progressFilePath = PROGRESS_FILE,
  dataDir = DATA_DIR,
  fileSystem = fs,
) {
  // Get all files from server/data
  let files = [];

  try {
    files = await fileSystem.readdir(dataDir);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  // Delete generated user JSON files
  for (const file of files) {
    if (/^\d+\.json$/.test(file)) {
      await fileSystem.unlink(path.join(dataDir, file));
    }
  }

  // Delete progress.json
  try {
    await fileSystem.unlink(progressFilePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  console.log("Cleanup completed successfully!");
}

async function executeTask({
  users = USERS,
  fetchImpl = fetch,
  waitFn = wait,
  log = console.log,
  fileSystem = fs,
  progressFilePath = PROGRESS_FILE,
  loadProgressFn = loadProgress,
  saveProgressFn = saveProgress,
  cleanupFn = cleanupGeneratedFiles,
} = {}) {
  let progress = await loadProgressFn(progressFilePath, fileSystem, users.length);

  progress.totalUsers = users.length;

  const allUsersSaved =
    users.length > 0 && users.every((user) => progress.savedUsers.includes(user.user_id));

  // Clean up before starting a fresh run
  if (allUsersSaved) {
    log("All users were already processed. Starting a fresh run...");

    await cleanupFn(progressFilePath, DATA_DIR, fileSystem);

    progress = {
      savedUsers: [],
      lastSavedUser: null,
      totalUsers: users.length,
    };
  }

  const pendingUsers = users.filter((user) => !progress.savedUsers.includes(user.user_id));

  for (const user of pendingUsers) {
    log(`Processing user ${user.user_id}`);

    await saveUser(user, {
      progress,
      fetchImpl,
      waitFn,
      saveProgressFn,
      log,
      progressFilePath,
      fileSystem,
    });
  }

  log("All users saved successfully!");
}
module.exports = {
  wait,
  loadProgress,
  saveProgress,
  createUserData,
  saveUser,
  executeTask,
  cleanupGeneratedFiles,
};
