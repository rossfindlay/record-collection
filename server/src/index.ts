import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { userRouter } from "./routes/user.js";
import { collectionRouter } from "./routes/collection.js";
import { wantlistRouter } from "./routes/wantlist.js";
import { playlistsRouter } from "./routes/playlists.js";
import { spotifyUserRouter } from "./routes/spotify-user.js";
import { discogsRouter } from "./routes/discogs.js";
import { spotifyRouter } from "./routes/spotify.js";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// Allowed frontend origins (comma-separated in env, or localhost in dev).
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true, // required for cross-site cookies
  })
);

app.use(express.json({ limit: "50mb" })); // large collections can exceed default 100kb
app.use(cookieParser());

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "record-collection-api" });
});

// Routes
app.use("/api/user/collection", collectionRouter);
app.use("/api/user/wantlist", wantlistRouter);
app.use("/api/user/playlists", playlistsRouter);
app.use("/api/user/spotify", spotifyUserRouter);
app.use("/api/user", userRouter);
app.use("/api/discogs", discogsRouter);
app.use("/api/spotify", spotifyRouter);

// Fallback 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`[record-collection-api] listening on :${PORT}`);
  console.log(`[record-collection-api] CORS allowed origins: ${allowedOrigins.join(", ")}`);
});
