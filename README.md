# Cohort - Online Competitive Programming Judge

Cohort is a full-stack online judge platform designed for competitive programmers to practice, learn, and compete. It enables users to solve algorithmic problems by submitting solutions in multiple programming languages (C++, Java, Python, JavaScript) and receive instant, automated feedback on their code's correctness and performance. The platform aims to provide a comprehensive learning and competitive environment with features like contests, progress tracking, and AI-powered coding assistance.

## Features Implemented

* **User Authentication:** Secure signup, login, and session management (JWTs via httpOnly cookies).  
* **Problem Solving:**  
  * Browse problem statements with descriptions, difficulty, time/memory limits, and sample cases.  
  * Submit solutions in C++, Java, Python, and JavaScript using an integrated Monaco code editor.  
* **Automated Judging:**  
  * Asynchronous code execution using a BullMQ job queue backed by Redis.  
  * Secure and isolated execution environments within a dedicated worker container (built via `Dockerfile.worker`).  
  * Real-time verdicts: Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Compilation Error, Runtime Error.  
  * “Run Code” functionality for testing against sample cases.  
* **User Progress Tracking:** View status (Solved, Attempted, Not Attempted) for all problems.  
* **Contest System (MVP):**  
  * List and view details of contests (Upcoming, Running, Ended).  
  * Participate in running contests by submitting solutions to contest problems.  
  * Basic leaderboard display based on points per problem.  
* **AI-Powered Coding Assistance:**  
  * “AI, Help Me!” feature.  
  * Integration with LLM APIs (OpenAI/Gemini) to provide contextual feedback on user's code, problem approach, and recent errors.  
  * Suggestions displayed in a modal overlay.  
* **Complexity Estimation (Experimental):** For “Accepted” submissions, attempts to estimate Time and Space Complexity based on performance across test cases.

## Tech Stack

* **Frontend:** React (Vite), Tailwind CSS, Redux Toolkit, Monaco Editor  
* **Backend:** Node.js, Express.js (containerized via `Dockerfile.api`)  
* **Database:** MongoDB (with Mongoose ODM)  
* **Job Queue:** BullMQ, Redis  
* **Execution Engine:** Docker (two images):  
  * **API Server Image** – runs the Express endpoint (`Dockerfile.api`)  
  * **Worker Image** – runs the submission processor with all language runtimes (`Dockerfile.worker`)  
* **AI Integration:** OpenAI API / Google Gemini API  
* **Deployment:**  
  * Frontend: Netlify (Planned/Actual)  
  * Backend/Workers: AWS EC2/ECS (using the two container images)  
  * DB/Cache: MongoDB Atlas, Managed Redis

## Architecture Overview

Cohort utilizes a decoupled-inspired architecture to handle code submissions asynchronously and ensure scalability.

### Code Execution Flow

1. **Submission:** The React client sends the user's code, language, problem ID, and contest ID (if applicable) to the Express.js API server.  
2. **Queuing:** The API server validates the request, creates a `Submission` record in MongoDB (status: "Queued"), and places a job onto the BullMQ queue. It then immediately responds to the client.  
3. **Worker Processing:** A separate Node.js process runs inside the **Worker container**, picking up jobs from the queue.  
4. **Execution Environment Setup:**  
   * The Worker container (built via `Dockerfile.worker`) includes all necessary compilers, interpreters, and the entrypoint script.  
   * It creates a temporary directory on the container filesystem, writing the user's code and the current test case's input into files.  
5. **Code Execution:**  
   * The entrypoint script inside the Worker container compiles (if needed) and executes the user's code against each test case.  
   * It uses system utilities (`/usr/bin/time`, `timeout`) to measure time and memory, capturing `stdout` and `stderr` for each run.  
   * Script outputs a structured result (STATUS, TIME, MEMORY, OUTPUT/ERROR) to standard output.  
6. **Result Aggregation & Update:**  
   * The Worker process reads the script output, compares it against expected outputs, and determines the verdict for each test case.  
   * Updates the `Submission` document in MongoDB with overall verdict, detailed test results, and any complexity estimates.  
7. **Client Update:** The React frontend polls an API endpoint for the submission status until a final verdict is received and then updates the UI.

## Project Structure Highlights

* **`client/`**: Contains the Vite-based React frontend, including pages, components, services, and Redux state management.  
* **`server-side/`**:  
  * **Dockerfile.api** — Dockerfile for building the API server image  
  * **Dockerfile.worker** — Dockerfile for building the Worker processor image  
  * `src/models/`: Mongoose schemas for all database collections.  
  * `src/controllers/`: Request handling logic for routes.  
  * `src/workers/`: Worker script (`submissionWorker.js`).  
  * `src/queues/`: BullMQ queue initialization.  
  * `src/services/`: Backend services (e.g., AI feedback service).  
  * `main.js`: Entry point for the Express API server.

## Local Development Setup

### Prerequisites

* Node.js (v18+) & npm/yarn  
* MongoDB (local or Atlas)  
* Redis (local or via Docker)  
* Docker Desktop (with WSL2 enabled on Windows)  
* OpenAI or Google Gemini API Key (optional) in `server-side/.env`

### Environment Configuration

1. **Backend (`server-side/.env`):** Create a `.env` file in `server-side/` with the following placeholders:

   ```env
   MONGO_URI=<your MongoDB connection string>
   DB_NAME=<your database name>
   JWT_SECRET=<your JWT secret>
   REFRESH_TOKEN_SECRET=<your refresh token secret>
   CLIENT_SIDE_ENDPOINT=<your client URL>
   GOOGLE_API_KEY=<your Google API key>
   SMTP_HOST=<your SMTP host>
   SMTP_PORT=<your SMTP port>
   SMTP_USER=<your SMTP username>
   SMTP_PASS=<your SMTP password>
   SMTP_FROM=<your SMTP from address>
   REDIS_HOST=<your Redis host>
   REDIS_PORT=<your Redis port>
   DOCKER_CONTAINER_UID=<container user ID>
   WORKER_CONCURRENCY=<number of worker threads>
   PORT=<server port>
   NODE_ENV=<environment>
VITE_SERVER_ENDPOINT=<your API server URL>
# Build the API server image
docker build -t cohort-api:latest -f server-side/Dockerfile.api server-side

# Build the Worker processor image
docker build -t cohort-worker:latest -f server-side/Dockerfile.worker server-side
