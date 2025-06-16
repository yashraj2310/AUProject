import mongoose, { Schema } from 'mongoose';

const testCaseSchema = new Schema({
  input: { type: String }, 
  expectedOutput: { type: String, required: true },
  isSample: { type: Boolean, default: false },
});

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
     default: () => ({ 
        cpp: "#include <iostream>\n\nint main() {\n    // Your C++ code here\n    std::cout << \"Hello from C++ starter!\" << std::endl;\n    return 0;\n}",
        java: "public class Main {\n    public static void main(String[] args) {\n        // Your Java code here\n        System.out.println(\"Hello from Java starter!\");\n    }\n}",
        python: "# Your Python code here\nif __name__ == \"__main__\":\n    print(\"Hello from Python starter!\")",
        javascript: "// Your JavaScript code here\nfunction main() {\n    console.log(\"Hello from JS starter!\");\n}\nmain();",
        c: '#include <stdio.h>\n\nint main() {\n    printf("Hello from C starter!\\n");\n    return 0;\n}'
     })
  },
  tags: [{ type: String, trim: true }],
  testCases: [testCaseSchema],
  cpuTimeLimit: { type: Number, default: 2, min: 1 }, 
  memoryLimit: { type: Number, default: 131072, min: 32768 }, 
}, { timestamps: true });

problemSchema.index({ tags: 1 });


export const Problem = mongoose.model('Problem', problemSchema);