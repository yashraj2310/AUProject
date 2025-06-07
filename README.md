# Cohort - Online Competitive Programming Judge

Cohort is a full-stack online judge platform designed for competitive programmers to practice, learn, and compete. It enables users to solve algorithmic problems by submitting solutions in multiple programming languages (C++, Java, Python, JavaScript) and receive instant, automated feedback on their code's correctness and performance. The platform aims to provide a comprehensive learning and competitive environment with features like contests, progress tracking, and AI-powered coding assistance.

## Features Implemented

*   **User Authentication:** Secure signup, login, and session management (JWTs via httpOnly cookies).
*   **Problem Solving:**
    *   Browse problem statements with descriptions, difficulty, time/memory limits, and sample cases.
    *   Submit solutions in C++, Java, Python, and JavaScript using an integrated Monaco code editor.
*   **Automated Judging:**
    *   Asynchronous code execution using a BullMQ job queue powered by Redis.
    *   Secure and isolated execution environments via language-specific Docker containers.
    *   Real-time verdicts: Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Compilation Error, Runtime Error.
    *   "Run Code" functionality for testing against sample cases.
*   **User Progress Tracking:** View status (Solved, Attempted, Not Attempted) for all problems.
*   **Contest System (MVP):**
    *   List and view details of contests (Upcoming, Running, Ended).
    *   Participate in running contests by submitting solutions to contest problems.
    *   Basic leaderboard display based on points per problem.
*   **AI-Powered Coding Assistance:**
    *   "AI, Help Me!" feature 
    *   Integration with LLM APIs (OpenAI/Gemini) to provide contextual feedback on user's code, problem approach, and recent errors.
    *   Suggestions displayed in a modal overlay.
*   **Complexity Estimation (Experimental):** For "Accepted" submissions, attempts to estimate Time and Space Complexity based on performance across test cases.

## Tech Stack

*   **Frontend:** React (Vite), Tailwind CSS, Redux Toolkit, Monaco Editor
*   **Backend:** Node.js, Express.js.
*   **Database:** MongoDB (with Mongoose ODM).
*   **Job Queue:** BullMQ, Redis.
*   **Execution Engine:** Docker.
*   **AI Integration:** OpenAI API / Google Gemini API.
*   **Deployment:**
    *   Frontend: Netlify (Planned/Actual)
    *   Backend/Workers: AWS (EC2/ECS, ECR) (Planned/Actual)
    *   DB/Cache: MongoDB Atlas, Managed Redis (Planned/Actual)

## Architecture Overview

Cohort utilizes a decoupled-inspired architecture to handle code submissions asynchronously and ensure scalability.

### Code Execution Flow

1.  **Submission:** The React client sends the user's code, language, problem ID, and contest ID (if applicable) to the Express.js API server.
2.  **Queuing:** The API server validates the request, creates a `Submission` record in MongoDB (status: "Queued"), and places a job containing the `submissionId` onto a BullMQ queue (backed by Redis). It then immediately responds to the client.
3.  **Worker Processing:** A separate Node.js `submissionWorker.js` process picks up the job from the queue.
4.  **Execution Environment Setup:** The worker fetches submission and problem details (including test cases) from MongoDB. It creates a temporary directory on the host, writing the user's code and the current test case's input into files.
5.  **Dockerized Execution:** The worker invokes `docker run` with the appropriate pre-built language-specific image (e.g., `execution-engine/java:latest`). The host's temporary directory is volume-mounted into the container's `/sandbox`. Resource limits (CPU, memory) and security constraints (no network, non-root user, dropped capabilities) are applied.
6.  **In-Container Script:** An entrypoint shell script (e.g., `execute_java.sh`) inside the container copies files from `/sandbox`, compiles (if needed), executes the user's code against the input, measures time/memory using system utilities (`/usr/bin/time`, `timeout`), and captures `stdout`/`stderr`. It then prints a structured result (STATUS, TIME, MEMORY, PROGRAM_OUTPUT/ERROR_DETAILS) to its own standard output.
7.  **Result Aggregation & Update:** The worker captures the script's output, compares it against the expected output, and determines the verdict for the test case. This is repeated for all test cases. If the submission is part of an active contest, the worker updates the user's `ContestScore`. Finally, it updates the main `Submission` document in MongoDB with the overall verdict, detailed results, and any estimated complexities.
8.  **Client Update:** The React frontend polls an API endpoint for the submission status until a final verdict is received and then updates the UI.

## Project Structure Highlights

*   **`client/`**: Contains the Vite-based React frontend, including pages, components, services, and Redux state management.
*   **`server-side/`**: Contains the Node.js/Express backend.
    *   `data/`: JSON files for database seeding (`problems.json`, `contests.json`).
    *   `dockerfiles/<language>/`: Contains the `Dockerfile` and `execute_<language>.sh` script for each supported programming language.
    *   `src/models/`: Mongoose schemas for all database collections.
    *   `src/routes/`: Express route definitions.
    *   `src/controllers/`: Request handling logic for routes.
    *   `src/workers/`: BullMQ worker scripts (`submissionWorker.js`).
    *   `src/queues/`: BullMQ queue initialization.
    *   `src/services/`: Backend services (e.g., AI feedback service).
    *   `seed.js`: Script to populate the database with initial data.
    *   `main.js`: Main entry point for the Express API server.

## Local Development Setup

### Prerequisites
*   Node.js (v18+) & npm/yarn
*   MongoDB (local or Atlas)
*   Redis (local or via Docker)
*   Docker Desktop (with WSL 2 enabled on Windows)
*   OpenAI or Google Gemini API Key (optional, for AI feature) in `server-side/.env`

### Environment Configuration
1.  **Backend (`server-side/.env`):** Copy `.env.example` (if provided) or create `.env` with `MONGO_URI`, `DB_NAME`, `REDIS_HOST`, `REDIS_PORT`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `CLIENT_SIDE_ENDPOINT`, `DOCKER_CONTAINER_UID`, `OPENAI_API_KEY`/`GOOGLE_API_KEY`.
2.  **Frontend (`client/.env`):** Set `VITE_SERVER_ENDPOINT` to your backend API URL (e.g., `http://localhost:5000`).

### Building Docker Images
For each language in `server-side/dockerfiles/`:
```bash
cd server-side/dockerfiles/<language_directory>
docker build -t execution-engine/<language_tag>:latest .
