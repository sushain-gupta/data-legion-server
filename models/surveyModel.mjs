import mongoose, { Schema } from "mongoose";
import mongoosePaginated from "mongoose-paginate-v2"

const surveySchema = new Schema({
	name: {
		type: String,
		required: [true, "Please Enter Name"],
	},
	contact: {
		type: Number,
		required: [true, "Please Enter Phone Number"],
		unique: true,
	},
	epic: {
		type: String,
	},
	isVoterLocal: {
		type: String,
	},
	stayingIn: {
		type: String,
	},
	boothNumber: {
		type: String,
		required: [true, "Please Enter Booth Number"],
	},
	gender: {
		type: String,
		required: [true, "Please select gender"],
	},
	ageGroup: {
		type: String,
		required: [true, "Please select an age group from the given options"],
	},
	caste: {
		type: String,
		// required: [true, "Please select caste"],
	},
	subCaste: {
		type: String,
		// required: [true, "Please select Sub Caste"],
	},
	occupation: {
		type: String,
		// required: [true, "Please select an occupation"],
	},
	MLAperfomance: {
		type: String,
		// required: [true, "Please select MLAperfomance"],
	},
	support: {
		type: String,
		required: [true, "Please select support"],
	},
	whichCandidateWillWin: {
		type: String,
		// required: [true, "Please select a candidate"],
	},
	eduQualification: {
		type: String,
		// required: [true, "Please select qualification"],
	},
	reason: {
		type: String,
		// required: [true, "Please select a reason"],
	},
	whoWillWin: {
		type: String,
		// required: [true, "Please select a party"],
	},
	demand: String,
	whichPartyWillWin: {
		type: String,
		// required: [true, "Please select which Party Will Win"],
	},
	voted2019: {
		type: String,
		// required: [true, "Select the party voted in 2019"],
	},
	mandal: {
		type: String,
		required: [true, "Please select mandal"],
	},
	village: {
		type: String,
		// required: [true, "Please select vilage"],
	},
	location: {
		type: Object,
	},
	addedBy: {
		type: mongoose.Schema.ObjectId,
		ref: "User",
		required: true,
	},
	constituencyCode: String,
	recording: String,
	createdAt: { type: Date, default: Date.now },
});

surveySchema.plugin(mongoosePaginated);

export const Survey = mongoose.model("Survey", surveySchema);
