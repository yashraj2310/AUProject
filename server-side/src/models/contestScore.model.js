import mongoose, { Schema } from 'mongoose';

 const problemScoreDetailSchema = new Schema({
     problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
     points: { type: Number, default: 0 },
     penaltyTime: { type: Number, default: 0 }, // Penalty in minutes or seconds
     acceptedAt: { type: Date }, // Timestamp of first accepted submission
     attempts: { type: Number, default: 0 } // Number of 'submit' attempts before AC
 }, { _id: false });

 const contestScoreSchema = new Schema({
     contestId: { type: Schema.Types.ObjectId, ref: 'Contest', required: true },
     userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
     totalPoints: { type: Number, default: 0, index: true },
     totalPenalty: { type: Number, default: 0, index: true }, // Lower is better
     problemsBreakdown: [problemScoreDetailSchema], // Score details per problem
     lastAcceptedSubmissionTime: { type: Date } // For tie-breaking
 }, { timestamps: true });

 contestScoreSchema.index({ contestId: 1, userId: 1 }, { unique: true });
 contestScoreSchema.index({ contestId: 1, totalPoints: -1, totalPenalty: 1 }); 

 export const ContestScore = mongoose.model('ContestScore', contestScoreSchema);