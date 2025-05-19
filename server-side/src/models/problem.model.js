import mongoose, { Schema } from 'mongoose';

const testCaseSchema = new Schema({
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
  isSample: { type: Boolean, default: false }, 
 
});

const problemSchema = new Schema({
  title: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    required: true,
  },
  defaultLanguage: {
    type: String,
    enum: ['javascript', 'python', 'java', 'cpp'],
    default: 'javascript'
  },
  starterCode: { 
     type: String,
     default: '// Start coding here...'
  
},
  testCases: [testCaseSchema],
  cpuTimeLimit: { type: Number, default: 2 }, // e.g., 2 seconds
 
  memoryLimit: { type: Number, default: 128000 }, // e.g., 128 MB (128 * 1024)
}, { timestamps: true });

export const Problem = mongoose.model('Problem', problemSchema);