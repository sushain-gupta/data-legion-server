import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import cron from "node-cron";

const userSchema = new Schema(
	{
		name: {
			type: String,
			required: [true, "Please Enter a Name"],
		},
		mobile: {
			type: Number,
			required: [true, "Please Enter Mobile No."],
		},
		role: {
			type: String,
			enum: [
				"voterAgent",
				"voterAdmin",
				"surveyAdmin",
				"surveyAgent",
				"superAdmin",
				"guestAdmin",
			],
			required: [true, "Please Enter a Role Type"],
		},
		constituencyCode: {
			type: String,
			required: [true, "Please Select a Constituency Code"],
		},
		otpDetails: {
			type: Object,
			select: false,
		},
		// createdAt: { type: Date, default: Date.now },
	},
	{ timestamps: true, discriminatorKey: "role" }
);

userSchema.methods.getJWTToken = function () {
	return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRE,
	});
};

export const User = mongoose.model("User", userSchema);

const adminSchema = Schema({
	assigned: {
		constituencies: {
			type: Array,
			required: [true, "Please Select a Constituency"],
		},
		pollingStations: {
			type: Array,
		},
	},
});

const voterSurveyAgentSchema = Schema({
	assigned: {
		pollingStations: {
			type: Array,
			required: [true, "Please Select a Polling Station"],
		},
		sections: {
			type: Array,
			required: [true, "Please Select a Section"],
		},
	},
});

const basicSurveyAgentSchema = Schema({
	assigned: {
		pollingStations: {
			type: Array,
			required: [true, "Please Select a Polling Station"],
		},
	},
});

const superAdminSchema = Schema({
	surveyType: {
		type: String,
		enum: ["basic", "voter"],
		required: [true, "Please Enter a Survey Type"],
	},
});

// Adding discriminators to the base model
export const SuperAdmin = User.discriminator("superAdmin", superAdminSchema);

export const VoterAdmin = User.discriminator("voterAdmin", adminSchema);

export const SurveyAdmin = User.discriminator("surveyAdmin", adminSchema);

export const VoterSurveyAgent = User.discriminator(
	"voterAgent",
	voterSurveyAgentSchema
);

export const BasicSurveyAgent = User.discriminator(
	"surveyAgent",
	basicSurveyAgentSchema
);

// Define a cron job to remove the OTP field every 5 minutes
cron.schedule("*/30 * * * *", async () => {
	try {
		// Update documents to remove the OTP field
		const now = Date.now();

		// Update documents by removing expired otpDetails
		await User.updateMany(
			{ "otpDetails.expiry": { $lte: now } },
			{ $unset: { otpDetails: "" } }
		);
	} catch (error) {
		console.error("Error updating documents with cron:", error);
	}
});
