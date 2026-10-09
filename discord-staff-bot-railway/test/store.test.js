import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore } from "../src/store.js";

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bot-state-"));
  try {
    run(new StateStore(path.join(directory, "state.json")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("new state starts with applications open and no panels", () => {
  withStore((store) => {
    assert.equal(store.get().applicationsOpen, true);
    assert.deepEqual(store.get().panels, {
      applications: null,
      tickets: null,
    });
  });
});

test("application setting and panel message IDs persist after reload", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bot-state-"));
  const filePath = path.join(directory, "state.json");
  try {
    const first = new StateStore(filePath);
    first.setApplicationsOpen(false);
    first.setPanel("applications", "application-message");
    const second = new StateStore(filePath);
    assert.equal(second.get().applicationsOpen, false);
    assert.equal(second.get().panels.applications, "application-message");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a denied applicant is blocked for seven days, then may apply", () => {
  withStore((store) => {
    const deniedAt = 1_800_000_000_000;
    store.createApplication({
      id: "application-1",
      userId: "user-1",
      status: "pending",
      answers: { ign: "Player" },
      createdAt: deniedAt - 1000,
    });
    store.denyApplication("application-1", "Try again later", deniedAt);
    assert.equal(
      store.getCooldownRemaining("user-1", deniedAt + 6 * 24 * 60 * 60 * 1000),
      24 * 60 * 60 * 1000,
    );
    assert.equal(
      store.getCooldownRemaining("user-1", deniedAt + 7 * 24 * 60 * 60 * 1000),
      0,
    );
    assert.equal(store.get().applications["application-1"].answers, null);
  });
});

test("active application lookup excludes completed applications", () => {
  withStore((store) => {
    store.createApplication({
      id: "draft",
      userId: "user-1",
      status: "secondStage",
      answers: {},
    });
    assert.equal(store.findActiveApplication("user-1").id, "draft");
    store.updateApplication("draft", { status: "accepted" });
    assert.equal(store.findActiveApplication("user-1"), undefined);
  });
});
