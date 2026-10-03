// Side-effect module: runs the environment check at import time (imported right after dotenv in index.ts).
import { assertEnv } from "./env.js";
assertEnv();
