import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../server/app.js";
import state from "../server/state/companionState.js";

function resetState() {
  state.pendingCommand = null;
  state.commandAt = 0;
  state.tally = [];
  state.commandSeq = 0;
}

describe("Companion API", () => {
  let app;

  beforeEach(() => {
    resetState();
    app = createApp();
  });

  describe("POST /api/companion/select/:cueNumber", () => {
    it("selects a valid cue", async () => {
      const res = await request(app).post("/api/companion/select/3");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        command: { type: "select", cueNumber: 3 },
        seq: 1,
      });
    });

    it("rejects cue number 0", async () => {
      const res = await request(app).post("/api/companion/select/0");
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it("rejects non-numeric cue number", async () => {
      const res = await request(app).post("/api/companion/select/abc");
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it("rejects negative cue number", async () => {
      const res = await request(app).post("/api/companion/select/-1");
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe("POST /api/companion/play", () => {
    it("dispatches play command", async () => {
      const res = await request(app).post("/api/companion/play");
      expect(res.status).toBe(200);
      expect(res.body.command).toEqual({ type: "play" });
    });
  });

  describe("POST /api/companion/reset", () => {
    it("dispatches reset command", async () => {
      const res = await request(app).post("/api/companion/reset");
      expect(res.status).toBe(200);
      expect(res.body.command).toEqual({ type: "reset" });
    });
  });

  describe("POST /api/companion/clear-status", () => {
    it("dispatches clear_status command", async () => {
      const res = await request(app).post("/api/companion/clear-status");
      expect(res.status).toBe(200);
      expect(res.body.command).toEqual({ type: "clear_status" });
    });
  });

  describe("POST /api/companion/select-play/:cueNumber", () => {
    it("selects and plays a valid cue", async () => {
      const res = await request(app).post("/api/companion/select-play/5");
      expect(res.status).toBe(200);
      expect(res.body.command).toEqual({
        type: "select_and_play",
        cueNumber: 5,
      });
    });

    it("rejects invalid cue number", async () => {
      const res = await request(app).post("/api/companion/select-play/0");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/companion/next and /prev", () => {
    it("dispatches next_cue command", async () => {
      const res = await request(app).post("/api/companion/next");
      expect(res.status).toBe(200);
      expect(res.body.command).toEqual({ type: "next_cue" });
    });

    it("dispatches prev_cue command", async () => {
      const res = await request(app).post("/api/companion/prev");
      expect(res.status).toBe(200);
      expect(res.body.command).toEqual({ type: "prev_cue" });
    });
  });

  describe("GET /api/companion/poll", () => {
    it("returns null when no pending command", async () => {
      const res = await request(app).get("/api/companion/poll");
      expect(res.status).toBe(200);
      expect(res.body.pendingCommand).toBeNull();
      expect(res.body.commandSeq).toBe(0);
    });

    it("returns pending command after dispatch", async () => {
      await request(app).post("/api/companion/play");
      const res = await request(app).get("/api/companion/poll");
      expect(res.body.pendingCommand).toEqual({ type: "play" });
      expect(res.body.commandSeq).toBe(1);
    });
  });

  describe("POST /api/companion/ack", () => {
    it("clears pending command when seq matches", async () => {
      await request(app).post("/api/companion/play");
      await request(app)
        .post("/api/companion/ack")
        .send({ seq: 1 });

      const poll = await request(app).get("/api/companion/poll");
      expect(poll.body.pendingCommand).toBeNull();
    });

    it("does not clear when seq does not match", async () => {
      await request(app).post("/api/companion/play");
      await request(app)
        .post("/api/companion/ack")
        .send({ seq: 999 });

      const poll = await request(app).get("/api/companion/poll");
      expect(poll.body.pendingCommand).toEqual({ type: "play" });
    });

    it("rejects non-integer seq gracefully", async () => {
      const res = await request(app)
        .post("/api/companion/ack")
        .send({ seq: "not_a_number" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("POST /api/companion/tally", () => {
    it("accepts valid tally data", async () => {
      const tally = [
        { cueNumber: 1, tally: "live" },
        { cueNumber: 2, tally: "selected" },
      ];
      const res = await request(app)
        .post("/api/companion/tally")
        .send({ tally });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("rejects non-array tally", async () => {
      const res = await request(app)
        .post("/api/companion/tally")
        .send({ tally: "not_array" });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it("rejects tally with invalid entry shape", async () => {
      const res = await request(app)
        .post("/api/companion/tally")
        .send({ tally: [{ bad: "data" }] });
      expect(res.status).toBe(400);
    });

    it("rejects tally with invalid tally value", async () => {
      const res = await request(app)
        .post("/api/companion/tally")
        .send({ tally: [{ cueNumber: 1, tally: "invalid_state" }] });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/companion/tally", () => {
    it("returns empty tally initially", async () => {
      const res = await request(app).get("/api/companion/tally");
      expect(res.status).toBe(200);
      expect(res.body.tally).toEqual([]);
      expect(res.body.anyLive).toBe(false);
    });

    it("returns set tally data", async () => {
      await request(app)
        .post("/api/companion/tally")
        .send({ tally: [{ cueNumber: 1, tally: "live" }] });

      const res = await request(app).get("/api/companion/tally");
      expect(res.body.tally).toHaveLength(1);
      expect(res.body.anyLive).toBe(true);
      expect(res.body.tallyByNumber["1"]).toBe("live");
    });
  });

  describe("GET /api/companion/tally/:cueNumber", () => {
    it("returns 'off' for unknown cue", async () => {
      const res = await request(app).get("/api/companion/tally/1");
      expect(res.status).toBe(200);
      expect(res.text).toBe("off");
    });

    it("returns tally state for known cue", async () => {
      await request(app)
        .post("/api/companion/tally")
        .send({ tally: [{ cueNumber: 2, tally: "selected" }] });

      const res = await request(app).get("/api/companion/tally/2");
      expect(res.text).toBe("selected");
    });

    it("rejects invalid cue number", async () => {
      const res = await request(app).get("/api/companion/tally/abc");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/companion/status", () => {
    it("returns status summary", async () => {
      await request(app)
        .post("/api/companion/tally")
        .send({
          tally: [
            { cueNumber: 1, tally: "live" },
            { cueNumber: 2, tally: "selected" },
            { cueNumber: 3, tally: "played" },
            { cueNumber: 4, tally: "off" },
          ],
        });

      const res = await request(app).get("/api/companion/status");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        app: "Lower Thirds Generator",
        totalCues: 4,
        live: 1,
        selected: 1,
        played: 1,
      });
    });
  });

  describe("Command sequence lifecycle", () => {
    it("increments seq across multiple commands", async () => {
      const r1 = await request(app).post("/api/companion/play");
      expect(r1.body.seq).toBe(1);

      const r2 = await request(app).post("/api/companion/next");
      expect(r2.body.seq).toBe(2);

      const r3 = await request(app).post("/api/companion/select/1");
      expect(r3.body.seq).toBe(3);
    });

    it("full poll-ack cycle", async () => {
      await request(app).post("/api/companion/select/2");

      const poll1 = await request(app).get("/api/companion/poll");
      expect(poll1.body.pendingCommand.type).toBe("select");
      expect(poll1.body.commandSeq).toBe(1);

      await request(app)
        .post("/api/companion/ack")
        .send({ seq: 1 });

      const poll2 = await request(app).get("/api/companion/poll");
      expect(poll2.body.pendingCommand).toBeNull();
      expect(poll2.body.commandSeq).toBe(1);
    });
  });

  describe("CORS headers", () => {
    it("sets CORS headers on companion routes", async () => {
      const res = await request(app).get("/api/companion/status");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });

    it("handles OPTIONS preflight", async () => {
      const res = await request(app).options("/api/companion/play");
      expect(res.status).toBe(204);
    });
  });
});
