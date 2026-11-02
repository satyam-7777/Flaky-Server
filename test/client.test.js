import { describe, it, expect, vi } from "vitest";

import {
  loadProgress,
  saveProgress,
  createUserData,
  saveUser,
  executeTask,
} from "../client/client.cjs";

function createMockFileSystem() {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
}

describe("loadProgress", () => {
  it("should load existing progress successfully", async () => {
    const mockFileSystem = createMockFileSystem();

    const existingProgress = {
      savedUsers: [1, 2, 3],
      lastSavedUser: 3,
      totalUsers: 10,
    };

    mockFileSystem.readFile.mockResolvedValue(JSON.stringify(existingProgress));

    const result = await loadProgress("mock-progress.json", mockFileSystem, 10);

    expect(result).toEqual(existingProgress);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith("mock-progress.json", "utf8");
  });

  it("should return empty progress when file does not exist", async () => {
    const mockFileSystem = createMockFileSystem();

    const fileNotFoundError = new Error("File not found");
    fileNotFoundError.code = "ENOENT";

    mockFileSystem.readFile.mockRejectedValue(fileNotFoundError);

    const result = await loadProgress("mock-progress.json", mockFileSystem, 10);

    expect(result).toEqual({
      savedUsers: [],
      lastSavedUser: null,
      totalUsers: 10,
    });
  });
});

describe("saveProgress", () => {
  it("should save progress successfully", async () => {
    const mockFileSystem = createMockFileSystem();

    mockFileSystem.writeFile.mockResolvedValue(undefined);

    const progress = {
      savedUsers: [1, 2, 3],
      lastSavedUser: 3,
      totalUsers: 10,
    };

    await saveProgress(progress, "mock-progress.json", mockFileSystem);

    expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
      "mock-progress.json",
      JSON.stringify(progress, null, 2),
      "utf8",
    );

    expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe("createUserData", () => {
  it("should send user data using POST request", async () => {
    const user = {
      user_id: 1,
      name: "John",
      email: "john@example.com",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => "User saved successfully",
    });

    const result = await createUserData(user, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockFetch).toHaveBeenCalledWith("http://127.0.0.1:7676/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });

    expect(result).toEqual({
      status: 200,
      body: "User saved successfully",
    });
  });

  it("should return HTTP 500 response details", async () => {
    const user = {
      user_id: 1,
      name: "John",
      email: "john@example.com",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      status: 500,
      text: async () => "Flaky server - request failed",
    });

    const result = await createUserData(user, mockFetch);

    expect(result).toEqual({
      status: 500,
      body: "Flaky server - request failed",
    });
  });
});

describe("saveUser", () => {
  const user = {
    user_id: 1,
    name: "John",
    email: "john@example.com",
  };

  function createResponse(status, body) {
    return {
      status,
      text: async () => body,
    };
  }

  function createProgress() {
    return {
      savedUsers: [],
      lastSavedUser: null,
      totalUsers: 10,
    };
  }

  it("should save user and update progress when server returns 200", async () => {
    const progress = createProgress();

    const mockFetch = vi.fn().mockResolvedValue(createResponse(200, "User saved successfully"));

    const mockWait = vi.fn();
    const mockSaveProgress = vi.fn().mockResolvedValue(undefined);
    const mockLog = vi.fn();

    await saveUser(user, {
      progress,
      fetchImpl: mockFetch,
      waitFn: mockWait,
      saveProgressFn: mockSaveProgress,
      log: mockLog,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(progress).toEqual({
      savedUsers: [1],
      lastSavedUser: 1,
      totalUsers: 10,
    });

    expect(mockSaveProgress).toHaveBeenCalledTimes(1);
    expect(mockWait).not.toHaveBeenCalled();

    expect(mockLog).toHaveBeenCalledWith("User 1 saved successfully");
  });

  it("should retry when server returns 500 and then succeed", async () => {
    const progress = createProgress();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createResponse(500, "Flaky server - request failed"))
      .mockResolvedValueOnce(createResponse(200, "User saved successfully"));

    const mockWait = vi.fn().mockResolvedValue(undefined);
    const mockSaveProgress = vi.fn().mockResolvedValue(undefined);

    await saveUser(user, {
      progress,
      fetchImpl: mockFetch,
      waitFn: mockWait,
      saveProgressFn: mockSaveProgress,
      log: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(mockWait).toHaveBeenCalledWith(500);

    expect(progress.savedUsers).toEqual([1]);

    expect(mockSaveProgress).toHaveBeenCalledTimes(1);
  });

  it("should continue retrying beyond five attempts until user is saved", async () => {
    const progress = createProgress();

    const mockFetch = vi.fn();

    for (let i = 0; i < 6; i++) {
      mockFetch.mockResolvedValueOnce(createResponse(500, "Flaky server - request failed"));
    }

    mockFetch.mockResolvedValueOnce(createResponse(200, "User saved successfully"));

    const mockWait = vi.fn().mockResolvedValue(undefined);
    const mockSaveProgress = vi.fn().mockResolvedValue(undefined);

    await saveUser(user, {
      progress,
      fetchImpl: mockFetch,
      waitFn: mockWait,
      saveProgressFn: mockSaveProgress,
      log: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(7);

    expect(mockWait).toHaveBeenCalledTimes(6);

    expect(progress.savedUsers).toEqual([1]);

    expect(mockSaveProgress).toHaveBeenCalledTimes(1);
  });

  it("should use exponential backoff when retrying", async () => {
    const progress = createProgress();

    const mockFetch = vi.fn();

    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(createResponse(500, "Flaky server - request failed"));
    }

    mockFetch.mockResolvedValueOnce(createResponse(200, "User saved successfully"));

    const mockWait = vi.fn().mockResolvedValue(undefined);

    await saveUser(user, {
      progress,
      fetchImpl: mockFetch,
      waitFn: mockWait,
      saveProgressFn: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
    });

    expect(mockWait.mock.calls).toEqual([[500], [1000], [2000], [4000], [5000]]);
  });

  it("should stop immediately when server returns 400", async () => {
    const progress = createProgress();

    const mockFetch = vi.fn().mockResolvedValue(createResponse(400, "Invalid JSON"));

    const mockWait = vi.fn();
    const mockSaveProgress = vi.fn();

    await expect(
      saveUser(user, {
        progress,
        fetchImpl: mockFetch,
        waitFn: mockWait,
        saveProgressFn: mockSaveProgress,
        log: vi.fn(),
      }),
    ).rejects.toThrow("Stopped on HTTP 400: Invalid JSON");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockWait).not.toHaveBeenCalled();

    expect(mockSaveProgress).not.toHaveBeenCalled();

    expect(progress.savedUsers).toEqual([]);
  });

  it("should stop immediately when server returns 404", async () => {
    const progress = createProgress();

    const mockFetch = vi.fn().mockResolvedValue(createResponse(404, "Not found"));

    const mockWait = vi.fn();

    await expect(
      saveUser(user, {
        progress,
        fetchImpl: mockFetch,
        waitFn: mockWait,
        saveProgressFn: vi.fn(),
        log: vi.fn(),
      }),
    ).rejects.toThrow("Stopped on HTTP 404: Not found");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockWait).not.toHaveBeenCalled();
  });
});

describe("executeTask", () => {
  const users = [
    {
      user_id: 1,
      name: "John",
      email: "john@example.com",
    },
    {
      user_id: 2,
      name: "Jane",
      email: "jane@example.com",
    },
    {
      user_id: 3,
      name: "Alex",
      email: "alex@example.com",
    },
  ];

  it("should process all users sequentially", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: async () => "User 1 saved",
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => "User 2 saved",
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => "User 3 saved",
      });

    const mockSaveProgress = vi.fn().mockResolvedValue(undefined);

    const progress = {
      savedUsers: [],
      lastSavedUser: null,
      totalUsers: 3,
    };

    const mockLoadProgress = vi.fn().mockResolvedValue(progress);

    await executeTask({
      users,
      fetchImpl: mockFetch,
      waitFn: vi.fn(),
      log: vi.fn(),
      loadProgressFn: mockLoadProgress,
      saveProgressFn: mockSaveProgress,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);

    expect(JSON.parse(mockFetch.mock.calls[0][1].body).user_id).toBe(1);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).user_id).toBe(2);
    expect(JSON.parse(mockFetch.mock.calls[2][1].body).user_id).toBe(3);

    expect(progress.savedUsers).toEqual([1, 2, 3]);

    expect(mockSaveProgress).toHaveBeenCalledTimes(3);
  });

  it("should skip users that are already saved", async () => {
    const progress = {
      savedUsers: [1],
      lastSavedUser: 1,
      totalUsers: 3,
    };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        text: async () => "User 2 saved",
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => "User 3 saved",
      });

    const mockLoadProgress = vi.fn().mockResolvedValue(progress);
    const mockSaveProgress = vi.fn().mockResolvedValue(undefined);

    await executeTask({
      users,
      fetchImpl: mockFetch,
      waitFn: vi.fn(),
      log: vi.fn(),
      loadProgressFn: mockLoadProgress,
      saveProgressFn: mockSaveProgress,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstUser = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondUser = JSON.parse(mockFetch.mock.calls[1][1].body);

    expect(firstUser.user_id).toBe(2);
    expect(secondUser.user_id).toBe(3);

    expect(progress.savedUsers).toEqual([1, 2, 3]);
  });

  it("should stop processing remaining users when a user receives HTTP 400", async () => {
    const progress = {
      savedUsers: [],
      lastSavedUser: null,
      totalUsers: 3,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      status: 400,
      text: async () => "Invalid JSON",
    });

    const mockWait = vi.fn();
    const mockSaveProgress = vi.fn();

    await expect(
      executeTask({
        users,
        fetchImpl: mockFetch,
        waitFn: mockWait,
        log: vi.fn(),
        loadProgressFn: vi.fn().mockResolvedValue(progress),
        saveProgressFn: mockSaveProgress,
      }),
    ).rejects.toThrow("Stopped on HTTP 400: Invalid JSON");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockWait).not.toHaveBeenCalled();

    expect(mockSaveProgress).not.toHaveBeenCalled();

    expect(progress.savedUsers).toEqual([]);
  });

  it("should retry the current user before processing the next user", async () => {
    const progress = {
      savedUsers: [],
      lastSavedUser: null,
      totalUsers: 3,
    };

    const events = [];

    const mockFetch = vi
      .fn()
      .mockImplementationOnce(async (url, options) => {
        const user = JSON.parse(options.body);

        events.push(`request-${user.user_id}`);

        return {
          status: 500,
          text: async () => "Flaky server - request failed",
        };
      })
      .mockImplementationOnce(async (url, options) => {
        const user = JSON.parse(options.body);

        events.push(`request-${user.user_id}`);

        return {
          status: 200,
          text: async () => "User saved successfully",
        };
      })
      .mockImplementationOnce(async (url, options) => {
        const user = JSON.parse(options.body);

        events.push(`request-${user.user_id}`);

        return {
          status: 200,
          text: async () => "User saved successfully",
        };
      });

    const mockSaveProgress = vi.fn().mockImplementation(async () => {
      events.push(`progress-${progress.lastSavedUser}`);
    });

    await executeTask({
      users: users.slice(0, 2),
      fetchImpl: mockFetch,
      waitFn: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      loadProgressFn: vi.fn().mockResolvedValue(progress),
      saveProgressFn: mockSaveProgress,
    });

    expect(events).toEqual(["request-1", "request-1", "progress-1", "request-2", "progress-2"]);

    expect(progress.savedUsers).toEqual([1, 2]);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
