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

    await Problem.deleteMany({});
    console.log("🗑️  Cleared `problems` collection");
    await Contest.deleteMany({});
    console.log("🗑️  Cleared `contests` collection");
  
    const problemsFilePath = path.resolve(__dirname, "data", "problems.json");
    let seededProblems = []; 
    if (fs.existsSync(problemsFilePath)) {
      const problemsRaw = fs.readFileSync(problemsFilePath, "utf-8");
      const problemDocsToSeed = JSON.parse(problemsRaw);
      if (problemDocsToSeed && problemDocsToSeed.length > 0) {
       
        seededProblems = await Problem.insertMany(problemDocsToSeed);
        console.log(`🌱 Seeded ${seededProblems.length} problems`);
      } else {
        console.log("ℹ️ No problems found in problems.json to insert.");
      }
    } else {
      console.warn(`⚠️ Problems data file not found at: ${problemsFilePath}. Cannot seed problems.`);
    }

   
    const problemTitleToIdMap = new Map();
    seededProblems.forEach(p => {
      problemTitleToIdMap.set(p.title, p._id);
    });
    console.log("ℹ️ Created problem title-to-ID map for linking contests.");

   
    const contestsFilePath = path.resolve(__dirname, "data", "contests.json");
    if (fs.existsSync(contestsFilePath)) {
      const contestsRaw = fs.readFileSync(contestsFilePath, "utf-8");
      const contestTemplates = JSON.parse(contestsRaw);
      const contestsToInsert = [];

      if (contestTemplates && contestTemplates.length > 0) {
        for (const template of contestTemplates) {
          const creator = await User.findOne({ userName: template.creatorUsername });
          if (!creator) {
            console.warn(`⚠️ Creator user "${template.creatorUsername}" for contest "${template.title}" not found. Skipping this contest.`);
            continue;
          }

          const problemLinksForContest = [];
          if (template.problemTitles && template.problemTitles.length > 0) {
            for (const problemTitle of template.problemTitles) {
              const problemId = problemTitleToIdMap.get(problemTitle);
              if (problemId) {
                problemLinksForContest.push({ problemId: problemId }); 
              } else {
                console.warn(`⚠️ Problem with title "${problemTitle}" (referenced in contest "${template.title}") not found in recently seeded problems. Skipping this problem for the contest.`);
              }
            }
          }

          if (!template.title || !template.startTime || !template.endTime) {
            console.warn(`⚠️ Contest template "${template.title || 'Untitled'}" is missing required fields (title, startTime, endTime). Skipping.`);
            continue;
          }
          
          
          if (!template.problemTitles || template.problemTitles.length === 0 || problemLinksForContest.length > 0) {
              contestsToInsert.push({
                title: template.title,
                description: template.description || "",
                startTime: new Date(template.startTime),
                endTime: new Date(template.endTime),
                problems: problemLinksForContest, 
                createdBy: creator._id,
                visibility: template.visibility || 'public',
                participants: [],
              });
          } else {
              console.warn(`⚠️ Contest "${template.title}" ended up with no valid problems after lookup. Skipping.`);
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
  if (mongoose.connection && (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2)) {
    mongoose.disconnect().finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});