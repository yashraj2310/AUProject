import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

import { Problem } from "./src/models/problem.model.js";
import { Contest } from "./src/models/contest.model.js";
import { User } from "./src/models/user.models.js"; // Ensure this path is correct

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not defined in your .env file! Please check server-side/.env");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.DB_NAME || "OJ",
    });
    console.log("✅ MongoDB connected for seeding");

    // Clear existing collections
    await Problem.deleteMany({});
    console.log("🗑️  Cleared `problems` collection");
    await Contest.deleteMany({});
    console.log("🗑️  Cleared `contests` collection");

    // --- Problems seeding ---
    const problemsFilePath = path.resolve(__dirname, "data", "problems.json");
    let seededProblems = [];
    if (fs.existsSync(problemsFilePath)) {
      const problemsRaw = fs.readFileSync(problemsFilePath, "utf-8");
      const problemDocsToSeed = JSON.parse(problemsRaw);

      if (Array.isArray(problemDocsToSeed) && problemDocsToSeed.length > 0) {
        // Strip out starterCode so users start with only model defaults
        const docsWithoutStarter = problemDocsToSeed.map(({ starterCode, ...rest }) => rest);

        seededProblems = await Problem.insertMany(docsWithoutStarter);
        console.log(`🌱 Seeded ${seededProblems.length} problems (without starterCode)`);
      } else {
        console.log("ℹ️ No problems found in problems.json to insert.");
      }
    } else {
      console.warn(`⚠️ Problems data file not found at: ${problemsFilePath}. Cannot seed problems.`);
    }

    // Build title → ID map for contest linking
    const problemTitleToIdMap = new Map();
    seededProblems.forEach(p => {
      problemTitleToIdMap.set(p.title, p._id);
    });
    console.log("ℹ️ Created problem title-to-ID map for linking contests.");

    // --- Contests seeding ---
    const contestsFilePath = path.resolve(__dirname, "data", "contests.json");
    if (fs.existsSync(contestsFilePath)) {
      const contestsRaw = fs.readFileSync(contestsFilePath, "utf-8");
      const contestTemplates = JSON.parse(contestsRaw);
      const contestsToInsert = [];

      if (Array.isArray(contestTemplates) && contestTemplates.length > 0) {
        for (const template of contestTemplates) {
          const creator = await User.findOne({ userName: template.creatorUsername });
          if (!creator) {
            console.warn(`⚠️ Creator "${template.creatorUsername}" not found. Skipping contest "${template.title}".`);
            continue;
          }

          const linkedProblems = [];
          if (Array.isArray(template.problemTitles)) {
            for (const title of template.problemTitles) {
              const pid = problemTitleToIdMap.get(title);
              if (pid) linkedProblems.push({ problemId: pid });
              else console.warn(`⚠️ Problem "${title}" not found for contest "${template.title}".`);
            }
          }

          if (!template.title || !template.startTime || !template.endTime) {
            console.warn(`⚠️ Contest "${template.title || 'Untitled'}" missing required fields. Skipping.`);
            continue;
          }

          if (linkedProblems.length > 0) {
            contestsToInsert.push({
              title: template.title,
              description: template.description || "",
              startTime: new Date(template.startTime),
              endTime: new Date(template.endTime),
              problems: linkedProblems,
              createdBy: creator._id,
              visibility: template.visibility || 'public',
              participants: [],
            });
          } else {
            console.warn(`⚠️ Contest "${template.title}" has no valid problems after lookup. Skipping.`);
          }
        }

        if (contestsToInsert.length > 0) {
          await Contest.insertMany(contestsToInsert);
          console.log(`🌱 Seeded ${contestsToInsert.length} contests`);
        } else {
          console.log("ℹ️ No valid contests to insert after processing templates.");
        }
      } else {
        console.log("ℹ️ No contest templates found in contests.json to insert.");
      }
    } else {
      console.warn(`⚠️ Contests data file not found at: ${contestsFilePath}. Skipping contest seeding.`);
    }

    console.log('✅ Database seeded successfully!');
  } catch (error) {
    console.error("❌ Error during seeding process:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB after seeding");
  }
}

main().catch(err => {
  console.error("❌ Unhandled error in seed script execution:", err);
  if (mongoose.connection && [1,2].includes(mongoose.connection.readyState)) {
    mongoose.disconnect().finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
