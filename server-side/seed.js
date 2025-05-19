// server-side/seed.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Problem } from "./src/models/problem.model.js"; 

dotenv.config();

async function main() {
  // 1. connect
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "OJ",
  });
  console.log("✅ MongoDB connected");

  // 2. clear out old problems
  await Problem.deleteMany({});
  console.log("🗑  Cleared `problems` collection");

  // 3. load the JSON file
  const file = path.resolve("data", "problems.json");
  const raw = fs.readFileSync(file, "utf-8");
  const docs = JSON.parse(raw);

  // 4. insert
  await Problem.insertMany(docs);
  console.log(`🚀 Inserted ${docs.length} sample problems`);

  // 5. clean up
  await mongoose.disconnect();
  console.log("👋 Disconnected");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
