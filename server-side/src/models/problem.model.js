import mongoose, { Schema } from 'mongoose';

const testCaseSchema = new Schema({
  input: { type: String }, 
  expectedOutput: { type: String, required: true },
  isSample: { type: Boolean, default: false },
});
 const minimalStarters = {
  javascript: `// Write your solution here
console.log("Hello, World!");`,

  python: `# Write your solution here
if __name__ == "__main__":
    print("Hello, World!")`,

  java: `// Write your solution here
public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, World!");
  }
}`,

  cpp: `// Write your solution here
#include <iostream>
int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}`,

  c: `// Write your solution here
#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}`
};


const problemSchema = new Schema({
  title: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    required: true,
  },
  defaultLanguage: {
    type: String,
    enum: ['javascript', 'python', 'java', 'cpp', 'c'], 
    default: 'javascript',
    trim: true,
  },
  starterCode: { 
    type: Map,
    of: String,
    default: () => minimalStarters
  },
  tags: [{ type: String, trim: true }],
  testCases: [testCaseSchema],
  cpuTimeLimit: { type: Number, default: 2, min: 1 }, 
  memoryLimit: { type: Number, default: 131072, min: 32768 }, 
}, { timestamps: true });

problemSchema.index({ tags: 1 });


export const Problem = mongoose.model('Problem', problemSchema);