// server/src/models/contest.model.js
import mongoose, { Schema } from 'mongoose';

const contestProblemSchema = new Schema({
    problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
}, { _id: false });

const contestSchema = new Schema({
    title: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    problems: [contestProblemSchema],
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

contestSchema.virtual('status').get(function() {
    const now = new Date();
    if (now < this.startTime) return 'Upcoming';
    if (now <= this.endTime) return 'Running';
    return 'Ended';
});
contestSchema.index({ startTime: 1, endTime: 1 });

export const Contest = mongoose.model('Contest', contestSchema);