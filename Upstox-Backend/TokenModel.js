import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  access_token: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export const Token = mongoose.model("Token", tokenSchema);
