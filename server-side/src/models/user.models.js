import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    userName: {
      required: true,
      unique: true,
      type: String,
    },
    fullName: {
      required: true,
      type: String,
    },
    email: {
      unique: true,
      required: true,
      type: String,
    },
    password: {
      required: true,
      type: String,
    },
   
    refreshToken: {
      type: String,
      default: undefined,
    },
    resetCode: {
    type: String,
    select: false,          
      },
  resetCodeExpires: {
    type: Date,
    select: false,
  },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) next();

  this.password = await bcrypt.hash(this.password, 9);

  next();
});

userSchema.methods.isPasswordCorrect = function (plainTextPassword) {

  return bcrypt.compare(plainTextPassword, this.password);
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      userName: this.userName,
      email: this.email,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIERY  ,
    }
  );
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIERY,
    }
  );
};

export const User = mongoose.model("User", userSchema);
