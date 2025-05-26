// server/src/main.js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import connectDB from './database/db.js';

import userRouter from './routes/user.routes.js';
import verifyJwt from './middlewares/verifyJwt.js';
import problemRouter from './routes/problem.routes.js';
import submissionRouter from './routes/submission.routes.js'; 
import contestRouter from './routes/contest.routes.js'; 
dotenv.config();

async function startServer() {
  try {
    await connectDB();
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  const app = express();

  // CORS
  app.use(cors({
    origin: process.env.CLIENT_SIDE_ENDPOINT,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Public
  app.use('/user', userRouter);
  app.use('/problems', problemRouter);
  app.use('/contests', contestRouter);


  // Protected
  app.use('/submissions', verifyJwt, submissionRouter);


  // 404
  app.use((req, res) => res.status(404).json({ message: 'Not Found' }));

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ message: err.message });
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server listening on port:${PORT}`);
  });
}

startServer();
