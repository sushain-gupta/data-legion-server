import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

const voterSchema = new Schema(
	{
		acNumber: {
			type: String,
			required: [true, "AC Number is required"],
		},
		acName: {
			type: String,
			// required: [true, "AC Name is required"],
		},
		part: {
			type: String,
			// required: [true, "AC Name is required"],
		},
		ward: {
			type: String,
			// required: [true, "AC Name is required"],
		},
		pollingStation: {
			type: String,
			required: [true, "Polling Station is required"],
		},
		pollingStationAddress: {
			type: String,
			// required: [true, "Polling Station Address is required"],
		},
		sectionNumber: {
			type: String,
			required: [true, "Section Number is required"],
		},
		sectionName: {
			type: String,
			required: [true, "Section Name is required"],
		},
		pageNumber: {
			type: String,
			// required: [true, "Page Number is required"],
		},
		serialNumber: {
			type: Number,
			// required: [true, "Serial Number is required"],
		},
		slNo: {
			type: Number,
			// required: [true, "Serial Number is required"],
		},
		name: {
			type: String,
			required: [true, "Name is required"],
		},
		fathersName: {
			type: String,
			default: null,
		},
		mothersName: {
			type: String,
			default: null,
		},
		husbandsName: {
			type: String,
			default: null,
		},
		wifesName: {
			type: String,
			default: null,
		},
		others: {
			type: String,
			default: null,
		},
		age: {
			type: String,
			// required: [true, "Age is required"],
		},
		gender: {
			type: String,
			// required: [true, "Gender is required"],
		},
		voterId: {
			type: String,
			unique: true,
			index: true,
			// required: [true, "Voter ID is required"],
		},
		houseNumber: {
			type: String,
			// required: [true, "House Number is required"],
		},
		mobile: {
			type: Number,
			// unique: true,
			sparse: true, // Allows multiple null values
			default: null, // Set default to null or remove this line if null is not a valid default
		},
		surveyTaken: {
			type: Boolean,
			default: false, // Set default to null or remove this line if null is not a valid default
		},
		survey: {
			type: Object,
			default: {},
		},
		recording: {
			type: String,
		},
		isAddition: {
			type: Boolean,
			default: false,
		},
		location: {
			type: Object,
			default: { lat: "", lng: "" },
		},
		assignedTo: {
			type: Array,
			default: [],
		},
		surveyedBy: {
			type: mongoose.Schema.ObjectId,
			ref: "User",
			default: null,
		},
		surveyedAt: { type: Date },
	},
	{ timestamps: true }
);

voterSchema.plugin(mongoosePaginate);
voterSchema.plugin(mongooseAggregatePaginate);

export const Voter = mongoose.model("Voter", voterSchema);
