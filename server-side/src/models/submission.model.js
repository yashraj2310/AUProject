import mongoose, { Schema } from 'mongoose';

const testCaseResultSchema = new Schema({
  testCaseId: { type: Schema.Types.ObjectId }, 
  input: { type: String }, 
  expectedOutput: { type: String },
  actualOutput: { type: String },
  status: { type: String, enum: ['Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Memory Limit Exceeded', 'Runtime Error', 'Skipped'], required: true },
  time: { type: Number }, // seconds
  memory: { type: Number }, // KB
   inputSize: { type: Number, default: 0 },
  isSample: { type: Boolean }
}, { _id: false });

const submissionSchema = new Schema(
  {
    problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    code: { type: String, required: true },
    language: { type: String, required: true }, 
    
  
    verdict: {
      type: String,
      enum: [
        'Queued', 'Compiling', 'Running', 'Accepted', 'Wrong Answer',
        'Time Limit Exceeded', 'Memory Limit Exceeded', 'Compilation Error',
        'Runtime Error', 'Internal SystemError', 'Partial - Sample Run' // For "Run" button
      ],
      default: 'Queued',
    },
    
    testCaseResults: [testCaseResultSchema],

   
    compileOutput: { type: String },
    executionTime: { type: Number }, 
    memoryUsed: { type: Number },
    
    submissionType: { type: String, enum: ['run', 'submit'], required: true, default: 'submit' },
    estimatedTimeComplexity: { type: String },
    estimatedSpaceComplexity: { type: String },
    contestId: { type: Schema.Types.ObjectId, ref: 'Contest', required: false }
  },
  { timestamps: true }
);

export const Submission = mongoose.model('Submission', submissionSchema);