import mongoose, { Schema } from 'mongoose';

const testCaseSchema = new Schema({
  input: { type: String },
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
  tags: [{ type: String, trim: true }],
  testCases: [testCaseSchema],
  cpuTimeLimit: { type: Number, default: 2 }, 
 
  memoryLimit: { type: Number, default: 128000 }, 
}, { timestamps: true });
problemSchema.index({ tags: 1 });

export const Problem = mongoose.model('Problem', problemSchema);